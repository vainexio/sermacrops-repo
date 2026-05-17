import { Router, type IRouter } from "express";
import { InboundMessage } from "../models/InboundMessage";
import { Company } from "../models/Company";
import { parseX12Type, parseX12ControlNumber, parseX12SenderReceiver } from "../lib/x12";

const router: IRouter = Router();

async function fmtMsg(m: InstanceType<typeof InboundMessage>) {
  const o = m.toObject();
  const [sender, receiver] = await Promise.all([
    o.senderId ? Company.findById(o.senderId).lean() : null,
    o.receiverId ? Company.findById(o.receiverId).lean() : null,
  ]);
  return {
    id: o._id.toString(),
    documentType: o.documentType ?? null,
    senderId: o.senderId?.toString() ?? null,
    senderName: sender?.name ?? null,
    receiverId: o.receiverId?.toString() ?? null,
    receiverName: receiver?.name ?? null,
    rawPayload: o.rawPayload,
    parsedData: o.parsedData ?? null,
    status: o.status,
    validationErrors: o.validationErrors ?? null,
    controlNumber: o.controlNumber ?? null,
    createdAt: o.createdAt.toISOString(),
    processedAt: o.processedAt?.toISOString() ?? null,
  };
}

router.post("/edi/inbound", async (req, res): Promise<void> => {
  const { x12Content } = req.body;
  if (!x12Content) { res.status(400).json({ error: "x12Content required" }); return; }

  const docType = parseX12Type(x12Content);
  const controlNumber = parseX12ControlNumber(x12Content);
  const { sender, receiver } = parseX12SenderReceiver(x12Content);

  const senderCo = sender ? await Company.findOne({ ediId: { $regex: new RegExp(`^${sender.trim()}$`, "i") } }).lean() : null;
  const receiverCo = receiver ? await Company.findOne({ ediId: { $regex: new RegExp(`^${receiver.trim()}$`, "i") } }).lean() : null;

  const errors: string[] = [];
  if (!docType) errors.push("Could not determine document type from ISA/ST segments");
  if (!senderCo) errors.push(`Unknown sender EDI ID: ${sender ?? "?"}`);
  if (!receiverCo) errors.push(`Unknown receiver EDI ID: ${receiver ?? "?"}`);

  const msg = await InboundMessage.create({
    documentType: docType ?? undefined,
    senderId: senderCo?._id,
    receiverId: receiverCo?._id,
    rawPayload: x12Content,
    parsedData: JSON.stringify({ docType, controlNumber, sender, receiver }),
    status: errors.length > 0 ? "error" : "processed",
    validationErrors: errors.length > 0 ? JSON.stringify(errors) : undefined,
    controlNumber: controlNumber ?? undefined,
    processedAt: new Date(),
  });

  res.json({
    success: errors.length === 0,
    messageId: msg._id.toString(),
    documentType: docType ?? null,
    sender: senderCo?.name ?? sender ?? null,
    receiver: receiverCo?.name ?? receiver ?? null,
    errors,
  });
});

router.get("/inbound-messages", async (req, res): Promise<void> => {
  const { status, documentType } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (documentType) filter.documentType = documentType;
  const msgs = await InboundMessage.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json(await Promise.all(msgs.map(fmtMsg)));
});

router.get("/inbound-messages/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const msg = await InboundMessage.findById(raw);
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await fmtMsg(msg));
});

export default router;
