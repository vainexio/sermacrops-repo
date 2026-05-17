import { Router, type IRouter } from "express";
import { EdiDocument } from "../models/EdiDocument";
import { Company } from "../models/Company";
import { AuditLog } from "../models/AuditLog";
import { generateX12 } from "../lib/x12";

const router: IRouter = Router();

let controlCounter = Math.floor(Math.random() * 900000) + 100000;
function nextControlNumber(): string {
  return String(++controlCounter).padStart(9, "0");
}

async function fmtDoc(doc: InstanceType<typeof EdiDocument>) {
  const o = doc.toObject();
  const [sender, receiver] = await Promise.all([
    Company.findById(o.senderId).lean(),
    Company.findById(o.receiverId).lean(),
  ]);
  return {
    id: o._id.toString(),
    documentType: o.documentType,
    direction: o.direction,
    status: o.status,
    senderId: o.senderId.toString(),
    senderName: sender?.name ?? null,
    receiverId: o.receiverId.toString(),
    receiverName: receiver?.name ?? null,
    controlNumber: o.controlNumber,
    referenceNumber: o.referenceNumber ?? null,
    poNumber: o.poNumber ?? null,
    shipDate: o.shipDate ?? null,
    deliveryDate: o.deliveryDate ?? null,
    totalAmount: o.totalAmount != null ? Number(o.totalAmount) : null,
    lineItems: o.lineItems ?? null,
    paymentTerms: o.paymentTerms ?? null,
    shippingDetails: o.shippingDetails ?? null,
    x12Content: o.x12Content ?? null,
    notes: o.notes ?? null,
    retryCount: o.retryCount,
    lastResponseCode: o.lastResponseCode ?? null,
    lastResponseBody: o.lastResponseBody ?? null,
    sentAt: o.sentAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    transactionId: o.transactionId?.toString() ?? null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

router.get("/edi-documents", async (req, res): Promise<void> => {
  const { status, direction, documentType, companyId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (direction) filter.direction = direction;
  if (documentType) filter.documentType = documentType;
  if (companyId) filter.$or = [{ senderId: companyId }, { receiverId: companyId }];
  const docs = await EdiDocument.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json(await Promise.all(docs.map(fmtDoc)));
});

router.post("/edi-documents", async (req, res): Promise<void> => {
  const { documentType, direction, senderId, receiverId, referenceNumber, poNumber, shipDate, deliveryDate, totalAmount, lineItems, paymentTerms, shippingDetails, notes, transactionId, status } = req.body;
  if (!documentType || !direction || !senderId || !receiverId) {
    res.status(400).json({ error: "documentType, direction, senderId, receiverId required" });
    return;
  }
  const cn = nextControlNumber();
  const doc = await EdiDocument.create({ documentType, direction, senderId, receiverId, controlNumber: cn, referenceNumber, poNumber, shipDate, deliveryDate, totalAmount, lineItems, paymentTerms, shippingDetails, notes, transactionId, status: status ?? "draft" });
  // Generate X12 content
  const [senderCo, receiverCo] = await Promise.all([Company.findById(senderId).lean(), Company.findById(receiverId).lean()]);
  if (senderCo && receiverCo) {
    const x12 = generateX12(doc as never, senderCo.ediId, receiverCo.ediId);
    await EdiDocument.findByIdAndUpdate(doc._id, { x12Content: x12 });
    doc.x12Content = x12;
  }
  await AuditLog.create({ action: "created", entityType: "EdiDocument", entityId: doc._id.toString(), details: JSON.stringify({ documentType, direction, status: doc.status }) });
  res.status(201).json(await fmtDoc(doc));
});

router.get("/edi-documents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const doc = await EdiDocument.findById(raw);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await fmtDoc(doc));
});

router.patch("/edi-documents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await EdiDocument.findById(raw);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  Object.assign(existing, req.body);
  // Regenerate X12 if content fields changed
  const [senderCo, receiverCo] = await Promise.all([Company.findById(existing.senderId).lean(), Company.findById(existing.receiverId).lean()]);
  if (senderCo && receiverCo) {
    existing.x12Content = generateX12(existing as never, senderCo.ediId, receiverCo.ediId);
  }
  await existing.save();
  await AuditLog.create({ action: "updated", entityType: "EdiDocument", entityId: raw, details: JSON.stringify(req.body) });
  res.json(await fmtDoc(existing));
});

router.delete("/edi-documents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await EdiDocument.findByIdAndDelete(raw);
  res.sendStatus(204);
});

router.post("/edi-documents/:id/send", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const doc = await EdiDocument.findById(raw);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  if (doc.status === "delivered") { res.json({ success: true, message: "Already delivered", responseCode: 200, sentAt: doc.sentAt?.toISOString() }); return; }

  // Attempt delivery to partner endpoint
  const { PartnerEndpoint } = await import("../models/PartnerEndpoint");
  const endpoint = await PartnerEndpoint.findOne({ companyId: doc.receiverId, isActive: true }).lean();

  if (!endpoint) {
    doc.status = "failed";
    doc.lastResponseCode = null;
    doc.lastResponseBody = "No active endpoint configured for receiver";
    await doc.save();
    await AuditLog.create({ action: "send_failed", entityType: "EdiDocument", entityId: raw, details: "No endpoint" });
    res.json({ success: false, message: "No active endpoint configured for this partner", responseCode: null, responseBody: "No endpoint" });
    return;
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/EDI-X12" };
    if (endpoint.authType === "api_key" && endpoint.apiKey) headers["X-Api-Key"] = endpoint.apiKey;
    if (endpoint.authType === "bearer_token" && endpoint.bearerToken) headers["Authorization"] = `Bearer ${endpoint.bearerToken}`;
    if (endpoint.customHeaders) {
      try { Object.assign(headers, JSON.parse(endpoint.customHeaders)); } catch {}
    }

    const resp = await fetch(endpoint.url, { method: "POST", headers, body: doc.x12Content ?? "", signal: AbortSignal.timeout(10000) });
    const body = await resp.text().catch(() => "");
    const now = new Date();
    doc.retryCount = (doc.retryCount ?? 0) + 1;
    doc.lastResponseCode = resp.status;
    doc.lastResponseBody = body.slice(0, 2000);
    doc.sentAt = now;
    if (resp.status === 200) { doc.status = "delivered"; doc.deliveredAt = now; } else { doc.status = "failed"; }
    await doc.save();
    await AuditLog.create({ action: resp.status === 200 ? "delivered" : "send_failed", entityType: "EdiDocument", entityId: raw, details: JSON.stringify({ status: resp.status }) });
    res.json({ success: resp.status === 200, message: resp.status === 200 ? "Delivered successfully" : `HTTP ${resp.status}`, responseCode: resp.status, responseBody: body.slice(0, 500), sentAt: now.toISOString() });
  } catch (err) {
    doc.status = "retry_pending";
    doc.retryCount = (doc.retryCount ?? 0) + 1;
    doc.lastResponseBody = String(err);
    await doc.save();
    await AuditLog.create({ action: "send_error", entityType: "EdiDocument", entityId: raw, details: String(err) });
    res.json({ success: false, message: "Network error — queued for retry", responseCode: null, responseBody: String(err) });
  }
});

router.get("/edi-documents/:id/preview", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const doc = await EdiDocument.findById(raw);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  if (!doc.x12Content) {
    const [senderCo, receiverCo] = await Promise.all([Company.findById(doc.senderId).lean(), Company.findById(doc.receiverId).lean()]);
    const content = generateX12(doc as never, senderCo?.ediId ?? "SENDER", receiverCo?.ediId ?? "RECEIVER");
    res.json({ content, documentType: doc.documentType });
    return;
  }
  res.json({ content: doc.x12Content, documentType: doc.documentType });
});

export default router;
