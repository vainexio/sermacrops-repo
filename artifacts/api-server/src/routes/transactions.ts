import { Router, type IRouter } from "express";
import { Transaction } from "../models/Transaction";
import { EdiDocument } from "../models/EdiDocument";
import { Company } from "../models/Company";

const router: IRouter = Router();

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
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    documents: [] as unknown[],
  };
  if (includeDocs) {
    const docs = await EdiDocument.find({ transactionId: o._id }).sort({ createdAt: 1 });
    const fmtDoc = async (doc: InstanceType<typeof EdiDocument>) => {
      const d = doc.toObject();
      const [s, r] = await Promise.all([Company.findById(d.senderId).lean(), Company.findById(d.receiverId).lean()]);
      return { id: d._id.toString(), documentType: d.documentType, direction: d.direction, status: d.status, senderId: d.senderId.toString(), senderName: s?.name ?? null, receiverId: d.receiverId.toString(), receiverName: r?.name ?? null, controlNumber: d.controlNumber, referenceNumber: d.referenceNumber ?? null, poNumber: d.poNumber ?? null, shipDate: d.shipDate ?? null, deliveryDate: d.deliveryDate ?? null, totalAmount: d.totalAmount != null ? Number(d.totalAmount) : null, lineItems: d.lineItems ?? null, paymentTerms: d.paymentTerms ?? null, shippingDetails: d.shippingDetails ?? null, x12Content: d.x12Content ?? null, notes: d.notes ?? null, retryCount: d.retryCount, lastResponseCode: d.lastResponseCode ?? null, lastResponseBody: d.lastResponseBody ?? null, sentAt: d.sentAt?.toISOString() ?? null, deliveredAt: d.deliveredAt?.toISOString() ?? null, transactionId: d.transactionId?.toString() ?? null, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() };
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

export default router;
