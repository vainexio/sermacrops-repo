import type { IEdiDocument } from "../models/EdiDocument";

function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
}

function timeNow(): string {
  const d = new Date();
  return `${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}`;
}

function parseLineItems(raw?: string | null): Array<{ description: string; quantity: number; unitPrice: number; uom?: string }> {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function generateISAEnvelope(senderId: string, receiverId: string, icn: string, content: string): string {
  const date = today();
  const time = timeNow();
  const sId = senderId.padEnd(15, " ");
  const rId = receiverId.padEnd(15, " ");
  return [
    `ISA*00*          *00*          *ZZ*${sId}*ZZ*${rId}*${date.slice(2)}*${time}*^*00501*${icn.padStart(9, "0")}*0*P*:~`,
    `GS*${getGSFunctionId(content)}*${senderId}*${receiverId}*${date}*${time}*1*X*005010~`,
    content,
    `GE*1*1~`,
    `IEA*1*${icn.padStart(9, "0")}~`,
  ].join("\n");
}

function getGSFunctionId(content: string): string {
  if (content.includes("ST*850")) return "PO";
  if (content.includes("ST*855")) return "PR";
  if (content.includes("ST*856")) return "SH";
  if (content.includes("ST*810")) return "IN";
  if (content.includes("ST*204")) return "QO";
  if (content.includes("ST*990")) return "GF";
  return "XX";
}

export function generateX12(doc: IEdiDocument, senderEdiId: string, receiverEdiId: string): string {
  const items = parseLineItems(doc.lineItems);
  const icn = doc.controlNumber ?? "000000001";
  const stNum = icn.padStart(4, "0");
  const poNum = doc.poNumber ?? doc.referenceNumber ?? "PO00001";
  const shipDate = (doc.shipDate ?? today()).replace(/-/g, "");
  const delivDate = (doc.deliveryDate ?? today()).replace(/-/g, "");

  let body = "";

  switch (doc.documentType) {
    case "850": {
      const lines = items.map((it, i) =>
        `PO1*${i + 1}*${it.quantity}*${it.uom ?? "EA"}*${it.unitPrice}**VN*${it.description}~`
      ).join("\n");
      body = [
        `ST*850*${stNum}~`,
        `BEG*00*SA*${poNum}**${shipDate}~`,
        `CUR*BY*USD~`,
        `REF*DP*${doc.referenceNumber ?? "REF001"}~`,
        `ITD*01*3*2**10*30~`,
        lines || `PO1*1*1*EA*0.00**VN*ITEM001~`,
        `CTT*${items.length || 1}~`,
        `SE*${6 + (items.length || 1)}*${stNum}~`,
      ].join("\n");
      break;
    }
    case "855": {
      body = [
        `ST*855*${stNum}~`,
        `BAK*00*AC*${poNum}*${shipDate}~`,
        `REF*CO*${doc.referenceNumber ?? "AC001"}~`,
        `SE*3*${stNum}~`,
      ].join("\n");
      break;
    }
    case "856": {
      const lines = items.map((it, i) =>
        `LIN*${i + 1}*VN*${it.description}~\nSN1**${it.quantity}*${it.uom ?? "EA"}~`
      ).join("\n");
      body = [
        `ST*856*${stNum}~`,
        `BSN*00*${doc.referenceNumber ?? "ASN001"}*${shipDate}*${timeNow()}~`,
        `HL*1**S~`,
        `TD5****ZZ*${receiverEdiId}~`,
        `DTM*011*${shipDate}~`,
        `HL*2*1*O~`,
        `PRF*${poNum}~`,
        lines || `LIN*1*VN*ITEM001~\nSN1**1*EA~`,
        `CTT*${items.length || 1}~`,
        `SE*${8 + (items.length || 1) * 2}*${stNum}~`,
      ].join("\n");
      break;
    }
    case "810": {
      const total = doc.totalAmount ?? items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
      const lines = items.map((it, i) =>
        `IT1*${i + 1}*${it.quantity}*${it.uom ?? "EA"}*${it.unitPrice}**VN*${it.description}~`
      ).join("\n");
      body = [
        `ST*810*${stNum}~`,
        `BIG*${shipDate}*INV${poNum}*${delivDate}*${poNum}~`,
        `REF*DP*${doc.referenceNumber ?? "REF001"}~`,
        `ITD*01*3*2**10*30~`,
        lines || `IT1*1*1*EA*0.00**VN*ITEM001~`,
        `TDS*${Math.round(total * 100)}~`,
        `SE*${6 + (items.length || 1)}*${stNum}~`,
      ].join("\n");
      break;
    }
    case "204": {
      body = [
        `ST*204*${stNum}~`,
        `B2**${senderEdiId}**${doc.referenceNumber ?? "LOAD001"}**PP~`,
        `B2A*00*LT~`,
        `L11*${poNum}*PO~`,
        `G62*37*${shipDate}~`,
        `G62*38*${delivDate}~`,
        `MS3*${receiverEdiId}*H*ZZ~`,
        `AT5*AB~`,
        `SE*8*${stNum}~`,
      ].join("\n");
      break;
    }
    case "990": {
      body = [
        `ST*990*${stNum}~`,
        `B1*${senderEdiId}*${doc.referenceNumber ?? "LOAD001"}**PP~`,
        `B1A*A~`,
        `SE*3*${stNum}~`,
      ].join("\n");
      break;
    }
    default:
      body = `ST*${doc.documentType}*${stNum}~\nSE*1*${stNum}~`;
  }

  return generateISAEnvelope(senderEdiId, receiverEdiId, icn, body);
}

export function parseX12Type(payload: string): string | null {
  const match = payload.match(/ST\*(\d{3})/);
  return match ? match[1] : null;
}

export function parseX12ControlNumber(payload: string): string | null {
  const match = payload.match(/ISA\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*(\d+)/);
  return match ? match[1] : null;
}

export function parseX12SenderReceiver(payload: string): { sender?: string; receiver?: string } {
  const match = payload.match(/ISA\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[A-Z0-9]{2}\*([^*]+)\*[A-Z0-9]{2}\*([^*]+)\*/);
  if (!match) return {};
  return { sender: match[1].trim(), receiver: match[2].trim() };
}
