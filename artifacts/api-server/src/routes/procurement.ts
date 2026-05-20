import { Router, type IRouter } from "express";
import { ProcurementOrder } from "../models/ProcurementOrder";
import { InventoryItem } from "../models/InventoryItem";
import { Company } from "../models/Company";
import { EdiDocument } from "../models/EdiDocument";
import { AuditLog } from "../models/AuditLog";
import { PartnerEndpoint } from "../models/PartnerEndpoint";
import { generateX12 } from "../lib/x12";

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
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

router.get("/procurement", async (_req, res): Promise<void> => {
  const orders = await ProcurementOrder.find().sort({ createdAt: -1 }).limit(100);
  res.json(await Promise.all(orders.map(fmtOrder)));
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
      // Send 850 outbound to supplier
      const lineItemsStr = JSON.stringify(order.lineItems.map(li => ({
        description: li.name,
        quantity: li.quantity,
        unitPrice: li.unitPrice ?? 0,
        uom: li.unit,
      })));
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
        status: "ready",
      });

      const x12 = generateX12(doc as never, toCoInfo(sermacrops), toCoInfo(supplier));
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
      // Supplier acknowledged — mark procurement as acknowledged
      order.currentStep = 3;
      order.status = "acknowledged";
      await order.save();
      sendResult = { success: true, message: "Supplier acknowledgment recorded" };
      break;
    }
    case 3: {
      // Goods received — update inventory quantities
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
      order.currentStep = 3;
      order.status = "completed";
      await order.save();

      await AuditLog.create({
        action: "goods_received",
        entityType: "ProcurementOrder",
        entityId: order._id.toString(),
        details: JSON.stringify({ referenceNumber: order.referenceNumber, lineItems: order.lineItems }),
      });

      sendResult = {
        success: updateErrors.length === 0,
        message: updateErrors.length === 0
          ? "Goods received and inventory updated"
          : `Goods received with warnings: ${updateErrors.join(", ")}`,
      };
      break;
    }
    default:
      res.status(400).json({ error: `Step ${step} is not a valid procurement step` });
      return;
  }

  res.json({ success: true, sendResult, order: await fmtOrder(order) });
});

export default router;
