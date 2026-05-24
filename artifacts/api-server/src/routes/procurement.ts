import { Router, type IRouter } from "express";
import { ProcurementOrder } from "../models/ProcurementOrder";
import { InventoryItem } from "../models/InventoryItem";
import { Company } from "../models/Company";
import { EdiDocument } from "../models/EdiDocument";
import { AuditLog } from "../models/AuditLog";
import { PartnerEndpoint } from "../models/PartnerEndpoint";
import { generateX12 } from "../lib/x12";
import { broadcast } from "../lib/sse";

const router: IRouter = Router();

let cnCounter = Math.floor(Math.random() * 900000) + 100000;
function nextCN() { return String(++cnCounter).padStart(9, "0"); }

function toCoInfo(c: { name?: string; ediId?: string; addressLine1?: string; city?: string; state?: string; zip?: string; country?: string } | null, fallback = "UNKNOWN") {
  if (!c) return { ediId: fallback, name: fallback };
  return { ediId: (c.ediId as string) ?? fallback, name: (c.name as string) ?? fallback, addressLine1: c.addressLine1, city: c.city, state: c.state, zip: c.zip, country: c.country };
}

async function fmtOrder(order: InstanceType<typeof ProcurementOrder>) {
  const o = order.toObject();
  const supplier = await Company.findById(o.supplierId).lean();

  // Primary EDI doc (step-1 850) — kept for backwards compat
  let ediDoc = null;
  if (o.ediDocumentId) {
    const doc = await EdiDocument.findById(o.ediDocumentId).lean();
    if (doc) {
      ediDoc = {
        id: doc._id.toString(),
        documentType: doc.documentType,
        status: doc.status,
        controlNumber: doc.controlNumber,
      };
    }
  }

  // Per-step EDI docs keyed by document type (e.g. "850", "855", "856", "810")
  const allDocs = await EdiDocument.find({ referenceNumber: o.referenceNumber }).lean();
  const stepDocs: Record<string, { id: string; documentType: string; status: string; controlNumber: string }> = {};
  for (const doc of allDocs) {
    if (!stepDocs[doc.documentType]) {
      stepDocs[doc.documentType] = {
        id: doc._id.toString(),
        documentType: doc.documentType,
        status: doc.status,
        controlNumber: doc.controlNumber ?? "",
      };
    }
  }

  return {
    id: o._id.toString(),
    referenceNumber: o.referenceNumber,
    status: o.status,
    supplierId: o.supplierId.toString(),
    supplierName: supplier?.name ?? null,
    currentStep: o.currentStep,
    skippedSteps: o.skippedSteps ?? [],
    lineItems: o.lineItems ?? [],
    totalValue: o.totalValue ?? null,
    notes: o.notes ?? null,
    ediDoc,
    stepDocs,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

router.get("/procurement", async (_req, res): Promise<void> => {
  const orders = await ProcurementOrder.find().sort({ createdAt: -1 }).limit(100).lean();
  if (orders.length === 0) { res.json([]); return; }

  // Batch all lookups — 3 queries total regardless of order count
  const supplierIds = [...new Set(orders.map(o => o.supplierId.toString()))];
  const refNums = orders.map(o => o.referenceNumber).filter(Boolean);
  const ediDocIds = orders.map(o => o.ediDocumentId?.toString()).filter(Boolean);

  const [suppliers, allDocs, primaryDocs] = await Promise.all([
    Company.find({ _id: { $in: supplierIds } }).lean(),
    EdiDocument.find({ referenceNumber: { $in: refNums } }).lean(),
    ediDocIds.length ? EdiDocument.find({ _id: { $in: ediDocIds } }).lean() : Promise.resolve([]),
  ]);

  const supplierMap = new Map(suppliers.map(s => [s._id.toString(), s]));
  const primaryDocMap = new Map(primaryDocs.map(d => [d._id.toString(), d]));

  // Group docs by referenceNumber, keeping first per documentType
  const docsByRef = new Map<string, Map<string, typeof allDocs[number]>>();
  for (const doc of allDocs) {
    if (!doc.referenceNumber) continue;
    if (!docsByRef.has(doc.referenceNumber)) docsByRef.set(doc.referenceNumber, new Map());
    const byType = docsByRef.get(doc.referenceNumber)!;
    if (!byType.has(doc.documentType)) byType.set(doc.documentType, doc);
  }

  const result = orders.map(o => {
    const supplier = supplierMap.get(o.supplierId.toString()) ?? null;
    const primary = o.ediDocumentId ? primaryDocMap.get(o.ediDocumentId.toString()) ?? null : null;
    const ediDoc = primary ? {
      id: primary._id.toString(), documentType: primary.documentType,
      status: primary.status, controlNumber: primary.controlNumber ?? "",
    } : null;

    const byType = docsByRef.get(o.referenceNumber) ?? new Map();
    const stepDocs: Record<string, { id: string; documentType: string; status: string; controlNumber: string }> = {};
    for (const [docType, doc] of byType) {
      stepDocs[docType] = { id: doc._id.toString(), documentType: doc.documentType, status: doc.status, controlNumber: doc.controlNumber ?? "" };
    }

    return {
      id: o._id.toString(),
      referenceNumber: o.referenceNumber,
      status: o.status,
      supplierId: o.supplierId.toString(),
      supplierName: supplier?.name ?? null,
      currentStep: o.currentStep,
      skippedSteps: o.skippedSteps ?? [],
      lineItems: o.lineItems ?? [],
      totalValue: o.totalValue ?? null,
      notes: o.notes ?? null,
      ediDoc,
      stepDocs,
      createdAt: (o.createdAt as Date).toISOString(),
      updatedAt: (o.updatedAt as Date).toISOString(),
    };
  });

  res.json(result);
});

router.post("/procurement", async (req, res): Promise<void> => {
  const { supplierId, lineItems, totalValue, notes } = req.body;
  if (!supplierId || !lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    res.status(400).json({ error: "supplierId and lineItems are required" });
    return;
  }
  const supplier = await Company.findById(supplierId).lean();
  if (!supplier) { res.status(400).json({ error: "Supplier company not found" }); return; }

  const refNum = `PO-SUP-${Date.now().toString().slice(-8)}`;
  const existing = await ProcurementOrder.findOne({ referenceNumber: refNum });
  if (existing) {
    res.status(409).json({ error: "Reference number collision, please retry" });
    return;
  }

  const calc = Array.isArray(lineItems)
    ? (lineItems as { quantity: number; unitPrice?: number }[]).reduce((s, it) => s + (it.quantity ?? 0) * (it.unitPrice ?? 0), 0)
    : 0;

  const order = await ProcurementOrder.create({
    referenceNumber: refNum,
    supplierId,
    lineItems,
    totalValue: totalValue ?? (calc > 0 ? calc : undefined),
    notes,
    currentStep: 1,
    status: "open",
  });
  broadcast("procurement");
  res.status(201).json(await fmtOrder(order));
});

router.get("/procurement/:id", async (req, res): Promise<void> => {
  const order = await ProcurementOrder.findById(req.params.id);
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await fmtOrder(order));
});

router.patch("/procurement/:id", async (req, res): Promise<void> => {
  const order = await ProcurementOrder.findById(req.params.id);
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  const { status, notes, skippedSteps } = req.body;
  if (status !== undefined) order.status = status;
  if (notes !== undefined) order.notes = notes;
  if (skippedSteps !== undefined) order.skippedSteps = skippedSteps;
  await order.save();
  broadcast("procurement");
  res.json(await fmtOrder(order));
});

router.delete("/procurement/:id", async (req, res): Promise<void> => {
  const order = await ProcurementOrder.findByIdAndDelete(req.params.id);
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

// ─── Advance a procurement step ───────────────────────────────────────────────

router.post("/procurement/:id/advance-step", async (req, res): Promise<void> => {
  const order = await ProcurementOrder.findById(req.params.id);
  if (!order) { res.status(404).json({ error: "Procurement order not found" }); return; }

  const { step } = req.body as { step: number };

  const sermacrops = await Company.findOne({ name: { $regex: /sermacrops/i } }).lean();
  if (!sermacrops) { res.status(400).json({ error: "SERMACROPS company not found" }); return; }

  const supplier = await Company.findById(order.supplierId).lean();
  if (!supplier) { res.status(400).json({ error: "Supplier company not found" }); return; }

  const smId = sermacrops._id.toString();
  const supId = order.supplierId.toString();

  let sendResult: { success: boolean; message: string } = { success: false, message: "No action taken" };

  switch (step) {
    case 1: {
      // Send 850 outbound to supplier — look up SKU for each line item
      const lineItemsData = await Promise.all(order.lineItems.map(async (li) => {
        let sku: string | undefined;
        if (li.inventoryItemId) {
          const invItem = await InventoryItem.findById(li.inventoryItemId).lean();
          sku = invItem?.sku;
        }
        return {
          description: li.name,
          sku: sku ?? li.name,
          quantity: li.quantity,
          unitPrice: li.unitPrice ?? 0,
          uom: li.unit,
        };
      }));
      const lineItemsStr = JSON.stringify(lineItemsData);

      // Delivery date: 18 days from today
      const delivDate = new Date();
      delivDate.setDate(delivDate.getDate() + 18);
      const deliveryDateStr = `${delivDate.getFullYear()}-${String(delivDate.getMonth() + 1).padStart(2, "0")}-${String(delivDate.getDate()).padStart(2, "0")}`;

      const cn = nextCN();
      const doc = await EdiDocument.create({
        documentType: "850",
        direction: "outbound",
        senderId: smId,
        receiverId: supId,
        controlNumber: cn,
        referenceNumber: order.referenceNumber,
        poNumber: order.referenceNumber,
        lineItems: lineItemsStr,
        totalAmount: order.totalValue,
        currencyCode: "PHP",
        deliveryDate: deliveryDateStr,
        status: "ready",
      });

      const x12 = generateX12(doc as never, toCoInfo(sermacrops), toCoInfo(supplier), { senderIsBuyer: true });
      await EdiDocument.findByIdAndUpdate(doc._id, { x12Content: x12 });

      await AuditLog.create({
        action: "created",
        entityType: "EdiDocument",
        entityId: doc._id.toString(),
        details: JSON.stringify({ documentType: "850", direction: "outbound", step: 1, procurementOrderId: order._id.toString() }),
      });

      // Attempt delivery
      const endpoint = await PartnerEndpoint.findOne({ companyId: supId, isActive: true }).lean();
      if (endpoint) {
        try {
          const headers: Record<string, string> = { "Content-Type": "application/EDI-X12" };
          if (endpoint.authType === "api_key" && endpoint.apiKey) headers["X-Api-Key"] = endpoint.apiKey;
          if (endpoint.authType === "bearer_token" && endpoint.bearerToken) headers["Authorization"] = `Bearer ${endpoint.bearerToken}`;
          const resp = await fetch(endpoint.url, { method: "POST", headers, body: x12, signal: AbortSignal.timeout(10000) });
          const isOk = resp.status >= 200 && resp.status < 300;
          const respBody = await resp.text().catch(() => "");
          const now = new Date();
          await EdiDocument.findByIdAndUpdate(doc._id, {
            status: isOk ? "delivered" : "failed",
            lastResponseCode: resp.status,
            lastResponseBody: respBody.slice(0, 2000),
            sentAt: now, retryCount: 1,
            ...(isOk ? { deliveredAt: now } : {}),
          });
          sendResult = { success: isOk, message: isOk ? "Delivered to supplier" : `HTTP ${resp.status}` };
        } catch (err) {
          await EdiDocument.findByIdAndUpdate(doc._id, { status: "retry_pending", retryCount: 1, lastResponseBody: String(err) });
          sendResult = { success: false, message: "Network error — queued for retry" };
        }
      } else {
        sendResult = { success: false, message: "No active endpoint configured — document saved as ready" };
      }

      order.ediDocumentId = doc._id;
      order.currentStep = 2;
      order.status = "open";
      await order.save();
      break;
    }
    case 2: {
      // Inbound 855 — supplier acknowledged the PO
      order.currentStep = 3;
      order.status = "acknowledged";
      await order.save();
      sendResult = { success: true, message: "Supplier acknowledgment (855) recorded" };
      break;
    }
    case 3: {
      // Inbound 856 — Advance Ship Notice from supplier
      const cn3 = nextCN();
      const asnDoc = await EdiDocument.create({
        documentType: "856",
        direction: "inbound",
        senderId: supId,
        receiverId: smId,
        controlNumber: cn3,
        referenceNumber: order.referenceNumber,
        poNumber: order.referenceNumber,
        status: "delivered",
        sentAt: new Date(),
        deliveredAt: new Date(),
      });

      await AuditLog.create({
        action: "asn_received",
        entityType: "ProcurementOrder",
        entityId: order._id.toString(),
        details: JSON.stringify({ documentType: "856", direction: "inbound", procurementOrderId: order._id.toString(), ediDocumentId: asnDoc._id.toString() }),
      });

      order.currentStep = 4;
      order.status = "received";
      await order.save();
      sendResult = { success: true, message: "Advance Ship Notice (856) received — goods in transit" };
      break;
    }
    case 4: {
      // Inbound 810 — Invoice from supplier; update inventory and start billing
      const cn4 = nextCN();
      const invoiceDoc = await EdiDocument.create({
        documentType: "810",
        direction: "inbound",
        senderId: supId,
        receiverId: smId,
        controlNumber: cn4,
        referenceNumber: order.referenceNumber,
        poNumber: order.referenceNumber,
        totalAmount: order.totalValue,
        currencyCode: "PHP",
        status: "delivered",
        sentAt: new Date(),
        deliveredAt: new Date(),
      });

      // Update inventory quantities on invoice receipt
      const updateErrors: string[] = [];
      for (const li of order.lineItems) {
        if (li.inventoryItemId) {
          const item = await InventoryItem.findById(li.inventoryItemId);
          if (item) {
            item.quantity += li.quantity;
            await item.save();
          } else {
            updateErrors.push(`Item ${li.inventoryItemId} not found`);
          }
        }
      }

      order.currentStep = 5;
      order.status = "billing";
      await order.save();

      await AuditLog.create({
        action: "invoice_received",
        entityType: "ProcurementOrder",
        entityId: order._id.toString(),
        details: JSON.stringify({ documentType: "810", direction: "inbound", procurementOrderId: order._id.toString(), ediDocumentId: invoiceDoc._id.toString(), inventoryErrors: updateErrors }),
      });

      sendResult = {
        success: updateErrors.length === 0,
        message: updateErrors.length === 0
          ? "Invoice (810) received — inventory updated, billing in progress"
          : `Invoice received with warnings: ${updateErrors.join(", ")}`,
      };
      break;
    }
    case 5: {
      // Outbound 861 — Receiving Advice sent back to supplier
      const po850 = await EdiDocument.findOne({ referenceNumber: order.referenceNumber, documentType: "850" }).lean();
      const cn5 = nextCN();
      const raDoc = await EdiDocument.create({
        documentType: "861",
        direction: "outbound",
        senderId: smId,
        receiverId: supId,
        controlNumber: cn5,
        referenceNumber: order.referenceNumber,
        poNumber: order.referenceNumber,
        lineItems: po850?.lineItems ?? null,
        currencyCode: "PHP",
        status: "ready",
      });

      const x12ra = generateX12(raDoc as never, toCoInfo(sermacrops), toCoInfo(supplier), { senderIsBuyer: true });
      await EdiDocument.findByIdAndUpdate(raDoc._id, { x12Content: x12ra });

      await AuditLog.create({
        action: "created",
        entityType: "EdiDocument",
        entityId: raDoc._id.toString(),
        details: JSON.stringify({ documentType: "861", direction: "outbound", step: 5, procurementOrderId: order._id.toString() }),
      });

      // Attempt delivery to supplier endpoint
      const endpoint5 = await PartnerEndpoint.findOne({ companyId: supId, isActive: true }).lean();
      if (endpoint5) {
        try {
          const headers: Record<string, string> = { "Content-Type": "application/EDI-X12" };
          if (endpoint5.authType === "api_key" && endpoint5.apiKey) headers["X-Api-Key"] = endpoint5.apiKey;
          if (endpoint5.authType === "bearer_token" && endpoint5.bearerToken) headers["Authorization"] = `Bearer ${endpoint5.bearerToken}`;
          const resp = await fetch(endpoint5.url, { method: "POST", headers, body: x12ra, signal: AbortSignal.timeout(10000) });
          const isOk = resp.status >= 200 && resp.status < 300;
          const respBody = await resp.text().catch(() => "");
          const now = new Date();
          await EdiDocument.findByIdAndUpdate(raDoc._id, {
            status: isOk ? "delivered" : "failed",
            lastResponseCode: resp.status,
            lastResponseBody: respBody.slice(0, 2000),
            sentAt: now, retryCount: 1,
            ...(isOk ? { deliveredAt: now } : {}),
          });
          sendResult = { success: isOk, message: isOk ? "Receiving Advice (861) delivered to supplier" : `HTTP ${resp.status}` };
        } catch (err) {
          await EdiDocument.findByIdAndUpdate(raDoc._id, { status: "retry_pending", retryCount: 1, lastResponseBody: String(err) });
          sendResult = { success: false, message: "Network error — Receiving Advice queued for retry" };
        }
      } else {
        sendResult = { success: false, message: "No active endpoint — Receiving Advice (861) saved as ready" };
      }

      order.currentStep = 6;
      order.status = "completed";
      await order.save();
      break;
    }
    default:
      res.status(400).json({ error: `Step ${step} is not a valid procurement step` });
      return;
  }

  broadcast("procurement");
  if (step === 4) broadcast("inventory");
  res.json({ success: true, sendResult, order: await fmtOrder(order) });
});

export default router;
