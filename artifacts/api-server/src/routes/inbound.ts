import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { InboundMessage } from "../models/InboundMessage";
import { EdiDocument } from "../models/EdiDocument";
import { Transaction } from "../models/Transaction";
import { Company } from "../models/Company";
import { PartnerEndpoint } from "../models/PartnerEndpoint";
import { AuditLog } from "../models/AuditLog";
import { ProcurementOrder } from "../models/ProcurementOrder";
import { InventoryItem } from "../models/InventoryItem";
import { parseX12Type, parseX12ControlNumber, parseX12SenderReceiver, parseX12Fields } from "../lib/x12";
import { broadcast } from "../lib/sse";

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
  broadcast("inbound-message");

  // ── Auto-create EdiDocument from the inbound message ──────────────────────
  let documentId: string | null = null;
  let transactionId: string | null = null;

  if (docType && senderCo && receiverCo) {
    try {
      const fields = parseX12Fields(x12Content, docType);
      const refKey = fields.poNumber || fields.referenceNumber;

      const doc = await EdiDocument.create({
        documentType: docType,
        direction: "inbound",
        status: "delivered",
        senderId: senderCo._id,
        receiverId: receiverCo._id,
        controlNumber: controlNumber ?? String(Date.now()),
        referenceNumber: fields.referenceNumber,
        poNumber: fields.poNumber,
        shipDate: fields.shipDate,
        deliveryDate: fields.deliveryDate,
        totalAmount: fields.totalAmount,
        lineItems: fields.lineItems,
        currencyCode: fields.currencyCode,
        ackStatus: fields.ackStatus,
        carrierName: fields.carrierName,
        proNumber: fields.proNumber,
        trackingNumber: fields.trackingNumber,
        packageCount: fields.packageCount,
        weight: fields.weight,
        weightUOM: fields.weightUOM,
        invoiceNumber: fields.invoiceNumber,
        invoiceDueDate: fields.invoiceDueDate,
        loadResponseCode: fields.loadResponseCode,
        x12Content,
        sentAt: new Date(),
        deliveredAt: new Date(),
      });

      documentId = doc._id.toString();
      broadcast("edi-document");

      await AuditLog.create({
        action: "received",
        entityType: "EdiDocument",
        entityId: documentId,
        details: JSON.stringify({ documentType: docType, direction: "inbound", source: "inbound_endpoint" }),
      });

      // Auto-link to (or create) transaction
      if (refKey) {
        let tx = await Transaction.findOne({ referenceNumber: refKey });

        if (!tx && docType === "850") {
          // New inbound 850 from a customer → auto-create transaction
          tx = await Transaction.create({
            referenceNumber: refKey,
            initiatorId: senderCo._id,
            description: `Order from ${senderCo.name ?? "Customer"}`,
            status: "open",
          });
        }

        if (tx) {
          await EdiDocument.findByIdAndUpdate(doc._id, { transactionId: tx._id });
          transactionId = tx._id.toString();

          // Auto-advance transaction status
          if (docType === "855" && tx.status === "open") {
            await Transaction.findByIdAndUpdate(tx._id, { status: "in_progress" });
          }
          if (docType === "810") {
            await Transaction.findByIdAndUpdate(tx._id, { status: "in_progress" });
          }
          if (docType === "861") {
            await Transaction.findByIdAndUpdate(tx._id, { status: "completed" });
          }
        }
      }

      // Auto-advance procurement order when inbound 855/856/810 arrives
      if (refKey && (docType === "855" || docType === "856" || docType === "810")) {
        const procOrder = await ProcurementOrder.findOne({ referenceNumber: refKey });
        if (procOrder) {
          if (docType === "855" && procOrder.currentStep === 2) {
            procOrder.currentStep = 3;
            procOrder.status = "acknowledged";
            await procOrder.save();
            await AuditLog.create({
              action: "step_advanced",
              entityType: "ProcurementOrder",
              entityId: procOrder._id.toString(),
              details: JSON.stringify({ step: 3, trigger: "inbound_855", referenceNumber: refKey }),
            });
          } else if (docType === "856" && procOrder.currentStep === 3) {
            procOrder.currentStep = 4;
            procOrder.status = "received";
            await procOrder.save();
            await AuditLog.create({
              action: "step_advanced",
              entityType: "ProcurementOrder",
              entityId: procOrder._id.toString(),
              details: JSON.stringify({ step: 4, trigger: "inbound_856", referenceNumber: refKey }),
            });
          } else if (docType === "810" && procOrder.currentStep >= 2 && !["billing", "completed"].includes(procOrder.status)) {
            procOrder.currentStep = 5;
            procOrder.status = "billing";
            await procOrder.save();
            broadcast("procurement");
            broadcast("inventory");
            await AuditLog.create({
              action: "step_advanced",
              entityType: "ProcurementOrder",
              entityId: procOrder._id.toString(),
              details: JSON.stringify({ step: 5, trigger: "inbound_810", referenceNumber: refKey }),
            });
          }
        }
      }
    } catch (err) {
      // non-fatal — InboundMessage was still stored
      console.error("Auto EdiDocument creation failed:", err);
    }
  }

  res.json({
    success: errors.length === 0,
    messageId: msg._id.toString(),
    documentId,
    transactionId,
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
  const msgs = await InboundMessage.find(filter).sort({ createdAt: -1 }).limit(200).lean();

  // Batch company lookups — one query instead of 2×N
  const companyIds = [...new Set([
    ...msgs.map(m => m.senderId?.toString()),
    ...msgs.map(m => m.receiverId?.toString()),
  ].filter(Boolean) as string[])];
  const companies = companyIds.length ? await Company.find({ _id: { $in: companyIds } }).lean() : [];
  const companyMap = new Map(companies.map(c => [c._id.toString(), c]));

  res.json(msgs.map(m => {
    const { sender: isaSender, receiver: isaReceiver } = parseX12SenderReceiver(m.rawPayload ?? "");
    return {
      id: m._id.toString(),
      documentType: m.documentType ?? null,
      senderId: m.senderId?.toString() ?? null,
      senderName: (m.senderId ? companyMap.get(m.senderId.toString())?.name : null) ?? isaSender ?? null,
      receiverId: m.receiverId?.toString() ?? null,
      receiverName: (m.receiverId ? companyMap.get(m.receiverId.toString())?.name : null) ?? isaReceiver ?? null,
      rawPayload: m.rawPayload,
      parsedData: m.parsedData ?? null,
      status: m.status,
      validationErrors: m.validationErrors ?? null,
      controlNumber: m.controlNumber ?? null,
      createdAt: m.createdAt.toISOString(),
      processedAt: m.processedAt?.toISOString() ?? null,
    };
  }));
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
