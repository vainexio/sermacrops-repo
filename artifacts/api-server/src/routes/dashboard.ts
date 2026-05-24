import { Router, type IRouter } from "express";
import { EdiDocument } from "../models/EdiDocument";
import { Transaction } from "../models/Transaction";
import { Company } from "../models/Company";
import { AuditLog } from "../models/AuditLog";
import { ProcurementOrder } from "../models/ProcurementOrder";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [totalDocuments, outboundCount, inboundCount, deliveredCount, failedCount, draftCount, pendingCount, activeTransactions, companiesCount] = await Promise.all([
    EdiDocument.countDocuments(),
    EdiDocument.countDocuments({ direction: "outbound" }),
    EdiDocument.countDocuments({ direction: "inbound" }),
    EdiDocument.countDocuments({ status: "delivered" }),
    EdiDocument.countDocuments({ status: "failed" }),
    EdiDocument.countDocuments({ status: "draft" }),
    EdiDocument.countDocuments({ status: { $in: ["ready", "sent", "retry_pending"] } }),
    Transaction.countDocuments({ status: { $in: ["open", "in_progress"] } }),
    Company.countDocuments(),
  ]);
  res.json({ totalDocuments, outboundCount, inboundCount, deliveredCount, failedCount, draftCount, pendingCount, activeTransactions, companiesCount });
});

router.get("/dashboard/flow", async (_req, res): Promise<void> => {
  const flowDefinition = [
    { step: "PO Received", documentType: "850", sender: "Coffee Shop", receiver: "SERMACROPS", sequenceOrder: 1 },
    { step: "PO Acknowledged", documentType: "855", sender: "SERMACROPS", receiver: "Coffee Shop", sequenceOrder: 2 },
    { step: "Load Tender", documentType: "204", sender: "SERMACROPS", receiver: "Logistics", sequenceOrder: 3 },
    { step: "Load Accepted", documentType: "990", sender: "Logistics", receiver: "SERMACROPS", sequenceOrder: 4 },
    { step: "Raw Materials PO", documentType: "850", sender: "SERMACROPS", receiver: "Raw Materials Supplier", sequenceOrder: 5 },
    { step: "Supplier Ack", documentType: "855", sender: "Raw Materials Supplier", receiver: "SERMACROPS", sequenceOrder: 6 },
    { step: "Advance Ship Notice", documentType: "856", sender: "SERMACROPS", receiver: "Coffee Shop", sequenceOrder: 7 },
    { step: "Invoice Sent", documentType: "810", sender: "SERMACROPS", receiver: "Coffee Shop", sequenceOrder: 8 },
  ];

  const recentDocs = await EdiDocument.find().sort({ createdAt: -1 }).limit(50).lean();

  const steps = await Promise.all(flowDefinition.map(async (def) => {
    const [senderCo, receiverCo] = await Promise.all([
      Company.findOne({ name: { $regex: new RegExp(def.sender, "i") } }).lean(),
      Company.findOne({ name: { $regex: new RegExp(def.receiver, "i") } }).lean(),
    ]);
    const match = recentDocs.find(d =>
      d.documentType === def.documentType &&
      (senderCo ? d.senderId.toString() === senderCo._id.toString() : true) &&
      (receiverCo ? d.receiverId.toString() === receiverCo._id.toString() : true)
    );
    let status = "pending";
    if (match) {
      if (match.status === "delivered") status = "completed";
      else if (["sent", "ready"].includes(match.status)) status = "in_progress";
      else if (match.status === "failed") status = "failed";
      else status = "pending";
    }
    return { ...def, status, documentId: match?._id.toString() ?? null, timestamp: match?.createdAt?.toISOString() ?? null };
  }));

  res.json(steps);
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const docs = await EdiDocument.find().sort({ createdAt: -1 }).limit(20).lean();
  const items = await Promise.all(docs.map(async (d) => {
    const [s, r] = await Promise.all([Company.findById(d.senderId).lean(), Company.findById(d.receiverId).lean()]);
    return {
      id: d._id.toString(),
      type: "edi_document",
      documentType: d.documentType,
      direction: d.direction,
      status: d.status,
      senderName: s?.name ?? "Unknown",
      receiverName: r?.name ?? "Unknown",
      referenceNumber: d.referenceNumber ?? null,
      totalAmount: d.totalAmount != null ? Number(d.totalAmount) : null,
      createdAt: d.createdAt.toISOString(),
    };
  }));
  res.json(items);
});

router.get("/dashboard/document-stats", async (_req, res): Promise<void> => {
  const types = ["850", "855", "856", "810", "204", "990"];
  const stats = await Promise.all(types.map(async (docType) => {
    const [total, delivered, failed, draft, sent] = await Promise.all([
      EdiDocument.countDocuments({ documentType: docType }),
      EdiDocument.countDocuments({ documentType: docType, status: "delivered" }),
      EdiDocument.countDocuments({ documentType: docType, status: "failed" }),
      EdiDocument.countDocuments({ documentType: docType, status: "draft" }),
      EdiDocument.countDocuments({ documentType: docType, status: "sent" }),
    ]);
    return { documentType: docType, total, delivered, failed, draft, sent };
  }));
  res.json(stats);
});

router.get("/dashboard/transaction-stats", async (_req, res): Promise<void> => {
  const statuses = ["open", "in_progress", "completed", "cancelled"];
  const counts = await Promise.all(statuses.map(s => Transaction.countDocuments({ status: s })));
  const result = statuses.map((s, i) => ({ status: s, count: counts[i] }));
  const total = counts.reduce((a, b) => a + b, 0);
  res.json({ breakdown: result, total });
});

router.get("/dashboard/procurement-stats", async (_req, res): Promise<void> => {
  const statuses = ["open", "acknowledged", "received", "billing", "completed"];
  const counts = await Promise.all(statuses.map(s => ProcurementOrder.countDocuments({ status: s })));
  const result = statuses.map((s, i) => ({ status: s, count: counts[i] }));
  const total = counts.reduce((a, b) => a + b, 0);
  res.json({ breakdown: result, total });
});

router.get("/dashboard/doc-timeline", async (_req, res): Promise<void> => {
  const days = 7;
  const result: { date: string; inbound: number; outbound: number; total: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const [inbound, outbound] = await Promise.all([
      EdiDocument.countDocuments({ direction: "inbound", createdAt: { $gte: start, $lt: end } }),
      EdiDocument.countDocuments({ direction: "outbound", createdAt: { $gte: start, $lt: end } }),
    ]);
    result.push({
      date: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      inbound,
      outbound,
      total: inbound + outbound,
    });
  }
  res.json(result);
});

router.get("/audit-logs", async (req, res): Promise<void> => {
  const { entityType, entityId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = entityId;
  const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json(logs.map(l => {
    const o = l.toObject();
    return { id: o._id.toString(), action: o.action, entityType: o.entityType, entityId: o.entityId, details: o.details ?? null, createdAt: o.createdAt.toISOString() };
  }));
});

export default router;
