import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { InboundMessage } from "../models/InboundMessage";
import { Company } from "../models/Company";
import { PartnerEndpoint } from "../models/PartnerEndpoint";
import { parseX12Type, parseX12ControlNumber, parseX12SenderReceiver } from "../lib/x12";

const router: IRouter = Router();

async function checkInboundAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sermacrops = await Company.findOne({ name: { $regex: /sermacrops/i } }).lean();
  if (!sermacrops) { next(); return; }

  const endpoint = await PartnerEndpoint.findOne({ companyId: sermacrops._id, isActive: true }).lean();
  if (!endpoint || endpoint.authType === "none") { next(); return; }

  if (endpoint.authType === "api_key") {
    const provided = req.headers["x-api-key"];
    if (!provided || provided !== endpoint.apiKey) {
      res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
      return;
    }
  } else if (endpoint.authType === "bearer_token") {
    const authHeader = req.headers["authorization"] ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token || token !== endpoint.bearerToken) {
      res.status(401).json({ error: "Unauthorized: invalid or missing bearer token" });
      return;
    }
  } else if (endpoint.authType === "basic") {
    const authHeader = req.headers["authorization"] ?? "";
    if (!authHeader.startsWith("Basic ") || authHeader.slice(6) !== endpoint.apiKey) {
      res.status(401).json({ error: "Unauthorized: invalid or missing basic auth" });
      return;
    }
  }

  next();
}

router.use("/edi/inbound", checkInboundAuth);

async function fmtMsg(m: InstanceType<typeof InboundMessage>) {
  const o = m.toObject();
  const [sender, receiver] = await Promise.all([
    o.senderId ? Company.findById(o.senderId).lean() : null,
    o.receiverId ? Company.findById(o.receiverId).lean() : null,
  ]);
  // Fall back to ISA IDs when company lookup fails (e.g. unregistered partner)
  const { sender: isaSender, receiver: isaReceiver } = parseX12SenderReceiver(o.rawPayload ?? "");
  return {
    id: o._id.toString(),
    documentType: o.documentType ?? null,
    senderId: o.senderId?.toString() ?? null,
    senderName: sender?.name ?? isaSender ?? null,
    receiverId: o.receiverId?.toString() ?? null,
    receiverName: receiver?.name ?? isaReceiver ?? null,
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
  // Accept raw EDI-X12 body (text/plain, application/EDI-X12) or JSON { x12Content }
  const contentType = req.headers["content-type"] ?? "";
  let x12Content: string;
  if (contentType.includes("application/json")) {
    x12Content = req.body?.x12Content;
  } else {
    // raw body — express.text() not loaded, so read from req as buffer
    x12Content = typeof req.body === "string" ? req.body : req.body?.toString?.() ?? "";
  }
  if (!x12Content || !x12Content.trim()) { res.status(400).json({ error: "x12Content required" }); return; }

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

router.delete("/inbound-messages/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const msg = await InboundMessage.findByIdAndDelete(raw);
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

export default router;
