import { Router, type IRouter } from "express";
import { Transaction } from "../models/Transaction";
import { EdiDocument } from "../models/EdiDocument";
import { Company } from "../models/Company";
import { AuditLog } from "../models/AuditLog";
import { PartnerEndpoint } from "../models/PartnerEndpoint";
import { generateX12 } from "../lib/x12";

const router: IRouter = Router();

let cnCounter = Math.floor(Math.random() * 900000) + 100000;
function nextCN() { return String(++cnCounter).padStart(9, "0"); }

function toCoInfo(c: { name?: string; ediId?: string; addressLine1?: string; addressLine2?: string; city?: string; state?: string; zip?: string; country?: string } | null, fallback = "UNKNOWN") {
  if (!c) return { ediId: fallback, name: fallback };
  return { ediId: (c.ediId as string) ?? fallback, name: (c.name as string) ?? fallback, addressLine1: c.addressLine1, addressLine2: c.addressLine2, city: c.city, state: c.state, zip: c.zip, country: c.country };
}

async function fmtTx(tx: InstanceType<typeof Transaction>, includeDocs = false) {
  const o = tx.toObject();
  const initiator = await Company.findById(o.initiatorId).lean();
  const base = {
    id: o._id.toString(),
    referenceNumber: o.referenceNumber,
    status: o.status,
    initiatorId: o.initiatorId.toString(),
    initiatorName: initiator?.name ?? null,
    description: o.description ?? null,
    totalValue: o.totalValue != null ? Number(o.totalValue) : null,
    skippedSteps: (o.skippedSteps as number[] | undefined) ?? [],
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    documents: [] as unknown[],
  };
  if (includeDocs) {
    const docs = await EdiDocument.find({ transactionId: o._id }).sort({ createdAt: 1 });
    const fmtDoc = async (doc: InstanceType<typeof EdiDocument>) => {
      const d = doc.toObject();
      const [s, r] = await Promise.all([Company.findById(d.senderId).lean(), Company.findById(d.receiverId).lean()]);
      return { id: d._id.toString(), documentType: d.documentType, direction: d.direction, status: d.status, senderId: d.senderId.toString(), senderName: s?.name ?? null, receiverId: d.receiverId.toString(), receiverName: r?.name ?? null, controlNumber: d.controlNumber, referenceNumber: d.referenceNumber ?? null, poNumber: d.poNumber ?? null, shipDate: d.shipDate ?? null, deliveryDate: d.deliveryDate ?? null, totalAmount: d.totalAmount != null ? Number(d.totalAmount) : null, lineItems: d.lineItems ?? null, paymentTerms: d.paymentTerms ?? null, shippingDetails: d.shippingDetails ?? null, x12Content: d.x12Content ?? null, notes: d.notes ?? null, currencyCode: d.currencyCode ?? null, retryCount: d.retryCount, lastResponseCode: d.lastResponseCode ?? null, lastResponseBody: d.lastResponseBody ?? null, sentAt: d.sentAt?.toISOString() ?? null, deliveredAt: d.deliveredAt?.toISOString() ?? null, transactionId: d.transactionId?.toString() ?? null, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() };
    };
    base.documents = await Promise.all(docs.map(fmtDoc));
  }
  return base;
}

router.get("/transactions", async (req, res): Promise<void> => {
  const { status, companyId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (companyId) filter.initiatorId = companyId;
  const txs = await Transaction.find(filter).sort({ createdAt: -1 }).limit(100);
  res.json(await Promise.all(txs.map(t => fmtTx(t, false))));
});

router.get("/transactions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tx = await Transaction.findById(raw);
  if (!tx) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await fmtTx(tx, true));
});

router.post("/transactions", async (req, res): Promise<void> => {
  const { referenceNumber, initiatorId, description, totalValue, status } = req.body;
  if (!referenceNumber || !initiatorId) {
    res.status(400).json({ error: "referenceNumber and initiatorId are required" });
    return;
  }
  const existing = await Transaction.findOne({ referenceNumber });
  if (existing) {
    res.status(409).json({ error: "A transaction with this reference number already exists" });
    return;
  }
  const tx = await Transaction.create({ referenceNumber, initiatorId, description, totalValue, status: status ?? "open" });
  res.status(201).json(await fmtTx(tx, false));
});

router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tx = await Transaction.findById(raw);
  if (!tx) { res.status(404).json({ error: "Not found" }); return; }
  const { status, description, totalValue, skippedSteps } = req.body;
  if (status !== undefined) tx.status = status;
  if (description !== undefined) tx.description = description;
  if (totalValue !== undefined) tx.totalValue = totalValue;
  if (skippedSteps !== undefined) tx.skippedSteps = skippedSteps;
  await tx.save();
  res.json(await fmtTx(tx, true));
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tx = await Transaction.findByIdAndDelete(raw);
  if (!tx) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

// ─── Advance an O2C step ──────────────────────────────────────────────────────

router.post("/transactions/:id/advance-step", async (req, res): Promise<void> => {
  const txId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tx = await Transaction.findById(txId);
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }

  const {
    step,
    ackStatus,
    logisticsCompanyId, equipmentType, specialInstructions,
    shipDate, carrierName, proNumber, trackingNumber, packageCount, weight, weightUOM,
    invoiceNumber, invoiceDueDate, paymentTerms,
  } = req.body as {
    step: number;
    ackStatus?: string;
    logisticsCompanyId?: string; equipmentType?: string; specialInstructions?: string;
    shipDate?: string; carrierName?: string; proNumber?: string; trackingNumber?: string;
    packageCount?: number; weight?: number; weightUOM?: string;
    invoiceNumber?: string; invoiceDueDate?: string; paymentTerms?: string;
  };

  const docs = await EdiDocument.find({ transactionId: tx._id }).sort({ createdAt: 1 });
  const step1 = docs.find(d => d.documentType === "850" && d.direction === "inbound");

  const sermacrops = await Company.findOne({ name: { $regex: /sermacrops/i } }).lean();
  if (!sermacrops) { res.status(400).json({ error: "SERMACROPS company not found in system" }); return; }

  const smId = sermacrops._id.toString();
  const po = step1?.poNumber ?? step1?.referenceNumber ?? tx.referenceNumber;

  type DocFields = Record<string, unknown>;
  let fields: DocFields;

  switch (step) {
    case 2: {
      if (!step1) { res.status(400).json({ error: "Inbound 850 not found — receive the customer PO first" }); return; }
      fields = {
        documentType: "855", direction: "outbound",
        senderId: smId, receiverId: step1.senderId.toString(),
        poNumber: po, referenceNumber: po,
        shipDate: step1.shipDate,
        ackStatus: ackStatus ?? "AC",
        lineItems: step1.lineItems,
        totalAmount: step1.totalAmount,
        currencyCode: step1.currencyCode ?? "PHP",
      };
      break;
    }
    case 3: {
      if (!step1) { res.status(400).json({ error: "Inbound 850 not found" }); return; }
      if (!logisticsCompanyId) { res.status(400).json({ error: "logisticsCompanyId is required for step 3" }); return; }
      fields = {
        documentType: "204", direction: "outbound",
        senderId: smId, receiverId: logisticsCompanyId,
        poNumber: po, referenceNumber: po,
        shipDate: step1.shipDate, deliveryDate: step1.deliveryDate,
        equipmentType, specialInstructions,
        totalAmount: step1.totalAmount,
      };
      break;
    }
    case 9: {
      if (!step1) { res.status(400).json({ error: "Inbound 850 not found" }); return; }
      const step3 = docs.find(d => d.documentType === "204" && d.direction === "outbound");
      fields = {
        documentType: "856", direction: "outbound",
        senderId: smId, receiverId: step1.senderId.toString(),
        poNumber: po, referenceNumber: po,
        lineItems: step1.lineItems,
        shipDate: shipDate ?? step1.shipDate,
        deliveryDate: step1.deliveryDate,
        carrierName: carrierName ?? step3?.equipmentType,
        proNumber,
        trackingNumber,
        packageCount,
        weight,
        weightUOM: weightUOM ?? "KG",
        totalAmount: step1.totalAmount,
        equipmentType: step3?.equipmentType,
        specialInstructions: step3?.specialInstructions,
      };
      break;
    }
    case 10: {
      if (!step1) { res.status(400).json({ error: "Inbound 850 not found" }); return; }
      fields = {
        documentType: "810", direction: "outbound",
        senderId: smId, receiverId: step1.senderId.toString(),
        poNumber: po, referenceNumber: po,
        lineItems: step1.lineItems,
        totalAmount: step1.totalAmount,
        currencyCode: step1.currencyCode ?? "PHP",
        invoiceNumber: invoiceNumber || `INV-${Date.now()}`,
        invoiceDueDate,
        paymentTerms: paymentTerms ?? step1.paymentTerms,
      };
      break;
    }
    default:
      res.status(400).json({ error: `Step ${step} is not an actionable outbound step` });
      return;
  }

  // For 204 (Load Tender), the consignee is the customer who placed the original PO,
  // not the logistics company (which is the envelope receiver).
  const consigneeId = fields.documentType === "204" && step1
    ? step1.senderId.toString()
    : undefined;

  const [senderCo, receiverCo, consigneeCo] = await Promise.all([
    Company.findById(fields.senderId as string).lean(),
    Company.findById(fields.receiverId as string).lean(),
    consigneeId ? Company.findById(consigneeId).lean() : Promise.resolve(null),
  ]);
  if (!senderCo || !receiverCo) { res.status(400).json({ error: "Sender or receiver company not found" }); return; }

  const cn = nextCN();
  const doc = await EdiDocument.create({ ...fields, controlNumber: cn, transactionId: tx._id, status: "ready" });

  const x12Options = consigneeCo ? { consignee: toCoInfo(consigneeCo) } : {};
  const x12 = generateX12(doc as never, toCoInfo(senderCo), toCoInfo(receiverCo), x12Options);
  await EdiDocument.findByIdAndUpdate(doc._id, { x12Content: x12 });

  await AuditLog.create({
    action: "created", entityType: "EdiDocument", entityId: doc._id.toString(),
    details: JSON.stringify({ documentType: fields.documentType, direction: fields.direction, step, autoAdvanced: true }),
  });

  // Try to deliver to partner endpoint
  const endpoint = await PartnerEndpoint.findOne({ companyId: fields.receiverId as string, isActive: true }).lean();
  let sendResult: { success: boolean; message: string; responseCode?: number | null } = {
    success: false, message: "No active endpoint configured — document saved as ready",
  };

  if (endpoint) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/EDI-X12" };
      if (endpoint.authType === "api_key" && endpoint.apiKey) headers["X-Api-Key"] = endpoint.apiKey;
      if (endpoint.authType === "bearer_token" && endpoint.bearerToken) headers["Authorization"] = `Bearer ${endpoint.bearerToken}`;

      const resp = await fetch(endpoint.url, { method: "POST", headers, body: x12, signal: AbortSignal.timeout(10000) });
      const respBody = await resp.text().catch(() => "");
      const now = new Date();
      const isOk = resp.status >= 200 && resp.status < 300;

      await EdiDocument.findByIdAndUpdate(doc._id, {
        status: isOk ? "delivered" : "failed",
        lastResponseCode: resp.status,
        lastResponseBody: respBody.slice(0, 2000),
        sentAt: now, retryCount: 1,
        ...(isOk ? { deliveredAt: now } : {}),
      });

      await AuditLog.create({ action: isOk ? "delivered" : "send_failed", entityType: "EdiDocument", entityId: doc._id.toString(), details: JSON.stringify({ step, status: resp.status }) });
      sendResult = { success: isOk, message: isOk ? "Delivered to partner" : `HTTP ${resp.status}`, responseCode: resp.status };
    } catch (err) {
      await EdiDocument.findByIdAndUpdate(doc._id, { status: "retry_pending", retryCount: 1, lastResponseBody: String(err) });
      sendResult = { success: false, message: "Network error — queued for retry" };
    }
  }

  // Auto-advance transaction status
  if (fields.documentType === "855" && fields.direction === "outbound" && tx.status === "open") {
    await Transaction.findByIdAndUpdate(tx._id, { status: "in_progress" });
  }
  if (fields.documentType === "810" && fields.direction === "outbound") {
    await Transaction.findByIdAndUpdate(tx._id, { status: "completed" });
  }

  const updatedTx = await Transaction.findById(txId);
  res.json({
    success: true,
    documentId: doc._id.toString(),
    sendResult,
    transaction: updatedTx ? await fmtTx(updatedTx, true) : null,
  });
});

export default router;
