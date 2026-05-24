import type { IEdiDocument } from "../models/EdiDocument";

export interface CompanyInfo {
  ediId: string;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

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

function parseLineItems(raw?: string | null): Array<{ description: string; sku?: string; quantity: number; unitPrice: number; uom?: string }> {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// Philippine province / region → 2-letter postal code
const PH_PROVINCE_CODES: Record<string, string> = {
  "laguna": "LA",
  "south cotabato": "SC",
  "metro manila": "MM",
  "national capital region": "MM",
  "ncr": "MM",
  "cebu": "CEB",
  "davao del sur": "DVO",
  "batangas": "BTG",
  "pampanga": "PAM",
  "bulacan": "BUL",
  "rizal": "RIZ",
  "cavite": "CAV",
  "quezon": "QUE",
  "nueva ecija": "NUE",
  "pangasinan": "PAN",
  "iloilo": "ILO",
  "negros occidental": "NEC",
};

function resolveStateCode(state?: string): string | undefined {
  if (!state) return state;
  return PH_PROVINCE_CODES[state.toLowerCase()] ?? state;
}

function n1Loop(qualifier: string, co: CompanyInfo): string[] {
  const segs: string[] = [`N1*${qualifier}*${co.name}~`];
  if (co.addressLine1) {
    segs.push(co.addressLine2 ? `N3*${co.addressLine1}*${co.addressLine2}~` : `N3*${co.addressLine1}~`);
  }
  if (co.city || co.state || co.zip) {
    const stateCode = resolveStateCode(co.state);
    const country = co.country && co.country !== "US" ? `*${co.country}` : "";
    segs.push(`N4*${co.city ?? ""}*${stateCode ?? ""}*${co.zip ?? ""}${country}~`);
  }
  return segs;
}

function segCount(segs: string[]): number {
  return segs.length + 1; // +1 for SE itself
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
  if (content.includes("ST*861")) return "RC";
  return "XX";
}

export interface GenerateX12Options {
  /** When true, the sender is the buyer (e.g. SERMACROPS issuing a PO to a supplier). */
  senderIsBuyer?: boolean;
  /**
   * 204 only — the actual consignee (delivery recipient).
   * The envelope receiver is the carrier/logistics company, but CN in the body
   * should be the party receiving the goods (e.g. the customer who placed the PO).
   */
  consignee?: CompanyInfo;
}

export function generateX12(doc: IEdiDocument, sender: CompanyInfo, receiver: CompanyInfo, options: GenerateX12Options = {}): string {
  const items = parseLineItems(doc.lineItems);
  const icn = doc.controlNumber ?? "000000001";
  const stNum = icn.padStart(4, "0");
  const poNum = doc.poNumber ?? doc.referenceNumber ?? "PO00001";
  const shipDate = (doc.shipDate ?? today()).replace(/-/g, "");
  const delivDate = (doc.deliveryDate ?? today()).replace(/-/g, "");
  const currency = doc.currencyCode ?? "USD";

  let segs: string[] = [];

  const { senderIsBuyer = false } = options;

  switch (doc.documentType) {
    case "850": {
      // When senderIsBuyer (e.g. SERMACROPS issuing a PO to a supplier),
      // sender = BY and receiver = SE. Otherwise (PO to a customer), receiver = BY and sender = SE.
      const [buyerInfo, sellerInfo] = senderIsBuyer
        ? [sender, receiver]
        : [receiver, sender];
      const lineSegs = items.flatMap((it, i) => [
        `PO1*${i + 1}*${it.quantity}*${(it.uom ?? "EA").toUpperCase()}*${it.unitPrice}*PE*VN*${it.sku ?? it.description}~`,
        `PID*F****${it.description}~`,
      ]);
      segs = [
        `ST*850*${stNum}~`,
        `BEG*00*SA*${poNum}**${shipDate}~`,
        `CUR*BY*${currency}~`,
        `REF*DP*${doc.referenceNumber ?? "REF001"}~`,
        `ITD*01*3*2**10*30~`,
        `DTM*002*${delivDate}~`,
        ...n1Loop("BY", buyerInfo),
        ...n1Loop("SE", sellerInfo),
        ...(lineSegs.length ? lineSegs : [`PO1*1*1*EA*0.00*PE*VN*ITEM001~`, `PID*F****Item~`]),
        `CTT*${items.length || 1}~`,
      ];
      segs.push(`SE*${segCount(segs)}*${stNum}~`);
      break;
    }
    case "855": {
      const ackCode = doc.ackStatus ?? "AC";
      const ackDate = today();
      // Line-level ACK code: IA = Item Accepted, IR = Item Rejected
      const lineAckCode = (ackCode === "RJ" || ackCode === "RD") ? "IR" : "IA";
      // PO1/ACK pair for each line item
      const lineSegs = items.flatMap((it, i) => [
        `PO1*${i + 1}*${it.quantity}*${it.uom ?? "EA"}*${it.unitPrice ?? ""}**VN*${it.description}~`,
        `ACK*${lineAckCode}*${it.quantity}*${it.uom ?? "EA"}~`,
      ]);
      segs = [
        `ST*855*${stNum}~`,
        // BAK: purpose=00 (Original), ack type, original PO#, date ack is issued
        `BAK*00*${ackCode}*${poNum}*${ackDate}~`,
        `REF*CO*${doc.referenceNumber ?? poNum}~`,
        // SE = seller (SERMACROPS, sender of the ack); BY = buyer (customer)
        ...n1Loop("SE", sender),
        ...n1Loop("BY", receiver),
        // Line-level acknowledgments
        ...lineSegs,
        // CTT: transaction totals — only when line items are present
        ...(lineSegs.length > 0 ? [`CTT*${items.length}~`] : []),
      ];
      segs.push(`SE*${segCount(segs)}*${stNum}~`);
      break;
    }
    case "856": {
      const carrier = doc.carrierName ?? receiver.ediId;
      const pro = doc.proNumber ?? doc.referenceNumber ?? "ASN001";
      const lineSegs = items.flatMap((it, i) => [
        `LIN*${i + 1}*VN*${it.description}~`,
        `SN1**${it.quantity}*${it.uom ?? "EA"}~`,
      ]);
      const weightSeg = doc.weight ? [`W12*${doc.weightUOM ?? "LB"}*${doc.weight}~`] : [];
      const pkgSeg = doc.packageCount ? [`PKG*F*${doc.packageCount}~`] : [];
      segs = [
        `ST*856*${stNum}~`,
        `BSN*00*${pro}*${shipDate}*${timeNow()}~`,
        `HL*1**S~`,
        `TD5****ZZ*${carrier}~`,
        `DTM*011*${shipDate}~`,
        ...weightSeg,
        ...pkgSeg,
        ...n1Loop("SF", sender),
        ...n1Loop("ST", receiver),
        `HL*2*1*O~`,
        `PRF*${poNum}~`,
        ...(lineSegs.length ? lineSegs : [`LIN*1*VN*ITEM001~`, `SN1**1*EA~`]),
        `CTT*${items.length || 1}~`,
      ];
      segs.push(`SE*${segCount(segs)}*${stNum}~`);
      break;
    }
    case "810": {
      const total = doc.totalAmount ?? items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
      const invNum = doc.invoiceNumber ?? `INV${poNum}`;
      const dueDate = (doc.invoiceDueDate ?? delivDate).replace(/-/g, "");
      const lineSegs = items.map((it, i) =>
        `IT1*${i + 1}*${it.quantity}*${it.uom ?? "EA"}*${it.unitPrice}**VN*${it.description}~`
      );
      segs = [
        `ST*810*${stNum}~`,
        `BIG*${shipDate}*${invNum}*${dueDate}*${poNum}~`,
        `CUR*SE*${currency}~`,
        `REF*DP*${doc.referenceNumber ?? "REF001"}~`,
        `ITD*01*3*2**10*30~`,
        ...n1Loop("SE", sender),
        ...n1Loop("BT", receiver),
        ...(lineSegs.length ? lineSegs : [`IT1*1*1*EA*0.00**VN*ITEM001~`]),
        `TDS*${Math.round(total * 100)}~`,
      ];
      segs.push(`SE*${segCount(segs)}*${stNum}~`);
      break;
    }
    case "204": {
      const equip = doc.equipmentType ?? "53";
      const specialInstr = doc.specialInstructions;
      const weightSegs = doc.weight ? [`AT8*G*${doc.weightUOM ?? "LB"}*${doc.weight}~`] : [];
      const noteSegs = specialInstr ? [`NTE**${specialInstr}~`] : [];
      // CN = consignee (the actual delivery recipient, e.g. the customer).
      // Falls back to receiver (carrier) only when no consignee is supplied.
      const consigneeInfo = options.consignee ?? receiver;
      segs = [
        `ST*204*${stNum}~`,
        `B2**${sender.ediId}**${doc.referenceNumber ?? "LOAD001"}**PP~`,
        `B2A*00*LT~`,
        `L11*${poNum}*PO~`,
        `G62*37*${shipDate}~`,
        `G62*38*${delivDate}~`,
        `MS3*${receiver.ediId}*H*ZZ~`,
        `AT5*AB~`,
        `L3***${equip}~`,
        ...weightSegs,
        ...n1Loop("SH", sender),
        ...n1Loop("CN", consigneeInfo),
        ...noteSegs,
      ];
      segs.push(`SE*${segCount(segs)}*${stNum}~`);
      break;
    }
    case "990": {
      const resp = doc.loadResponseCode ?? "A";
      segs = [
        `ST*990*${stNum}~`,
        `B1*${sender.ediId}*${doc.referenceNumber ?? "LOAD001"}**PP~`,
        `B1A*${resp}~`,
        ...n1Loop("SH", sender),
        ...n1Loop("CN", receiver),
      ];
      segs.push(`SE*${segCount(segs)}*${stNum}~`);
      break;
    }
    case "861": {
      // Receiving Advice — SERMACROPS (buyer) sends back to supplier (vendor)
      // senderIsBuyer: sender=SERMACROPS, receiver=supplier
      const [vendorInfo, buyerInfo] = senderIsBuyer
        ? [receiver, sender]
        : [sender, receiver];
      const raNum = `RA${icn.padStart(9, "0")}`;
      const receiveDate = today();
      const lineSegs = items.map((it, i) =>
        `RCD*${i + 1}*${it.quantity}*${(it.uom ?? "EA").toUpperCase()}**VN*${it.sku ?? it.description}~`
      );
      segs = [
        `ST*861*${stNum}~`,
        `BRA*${raNum}*${poNum}*${receiveDate}*00~`,
        `REF*PO*${poNum}~`,
        `DTM*002*${receiveDate}~`,
        ...n1Loop("VN", vendorInfo),
        ...n1Loop("BY", buyerInfo),
        ...(lineSegs.length ? lineSegs : [`RCD*1*1*EA**VN*ITEM001~`]),
        `CTT*${items.length || 1}~`,
      ];
      segs.push(`SE*${segCount(segs)}*${stNum}~`);
      break;
    }
    default:
      segs = [`ST*${doc.documentType}*${stNum}~`, `SE*2*${stNum}~`];
  }

  const body = segs.join("\n");
  return generateISAEnvelope(sender.ediId, receiver.ediId, icn, body);
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

export interface ParsedX12Fields {
  poNumber?: string;
  referenceNumber?: string;
  shipDate?: string;
  deliveryDate?: string;
  ackStatus?: string;
  carrierName?: string;
  proNumber?: string;
  trackingNumber?: string;
  packageCount?: number;
  weight?: number;
  weightUOM?: string;
  currencyCode?: string;
  invoiceNumber?: string;
  invoiceDueDate?: string;
  totalAmount?: number;
  loadResponseCode?: string;
  lineItems?: string;
}

/** Extract business fields from a raw X12 payload for a given document type. */
export function parseX12Fields(payload: string, docType: string): ParsedX12Fields {
  // Return the elements of the first matching segment (split on * within the segment)
  function seg(id: string): string[] | null {
    const re = new RegExp(`(?:^|~\\s*)${id}\\*([^~]+)`, "m");
    const m = payload.match(re);
    return m ? m[1].split("*") : null;
  }

  function allSegs(id: string): string[][] {
    const results: string[][] = [];
    const re = new RegExp(`(?:^|~\\s*)${id}\\*([^~]+)`, "gm");
    let m: RegExpExecArray | null;
    while ((m = re.exec(payload)) !== null) results.push(m[1].split("*"));
    return results;
  }

  function toDate(raw?: string): string | undefined {
    if (!raw || raw.length < 8) return undefined;
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  const f: ParsedX12Fields = {};

  switch (docType) {
    case "850": {
      // BEG*00*SA*<poNumber>**<shipDate>
      const beg = seg("BEG");
      if (beg) {
        f.poNumber = beg[2]?.trim() || undefined;
        f.referenceNumber = f.poNumber;
        if (beg[4]) f.shipDate = toDate(beg[4].trim());
      }
      // CUR*BY*<currencyCode>
      const cur = seg("CUR");
      if (cur) f.currencyCode = cur[1]?.trim() || undefined;
      // PO1*<lineNum>*<qty>*<uom>*<unitPrice>**VN*<desc>
      const po1s = allSegs("PO1");
      if (po1s.length > 0) {
        const items = po1s.map(p => ({
          description: p[6]?.trim() ?? p[7]?.trim() ?? "Item",
          quantity: Number(p[1]) || 1,
          unitPrice: Number(p[3]) || 0,
          uom: p[2]?.trim() ?? "EA",
        }));
        f.lineItems = JSON.stringify(items);
        f.totalAmount = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
      }
      break;
    }

    case "855": {
      // BAK*00*<ackStatus>*<poNumber>*<shipDate> — standard 855 beginning segment
      // Some partners incorrectly use BEG (850 segment) with the same field layout; fall back to it.
      const bak = seg("BAK") ?? seg("BEG");
      if (bak) {
        f.ackStatus = bak[1]?.trim() || undefined;
        f.poNumber = bak[2]?.trim() || undefined;
        f.referenceNumber = f.poNumber;
        if (bak[3]) f.shipDate = toDate(bak[3].trim());
      }
      break;
    }

    case "856": {
      // BSN*00*<proNumber>*<shipDate>*<time>
      const bsn = seg("BSN");
      if (bsn) {
        f.proNumber = bsn[1]?.trim() || undefined;
        if (bsn[2]) f.shipDate = toDate(bsn[2].trim());
      }
      // PRF*<poNumber>
      const prf = seg("PRF");
      if (prf) {
        f.poNumber = prf[0]?.trim() || undefined;
        f.referenceNumber = f.poNumber;
      }
      // TD5****ZZ*<carrierName>
      const td5 = seg("TD5");
      if (td5) f.carrierName = td5[4]?.trim() || undefined;
      // W12*<weightUOM>*<weight>
      const w12 = seg("W12");
      if (w12) {
        f.weightUOM = w12[0]?.trim() || undefined;
        const wt = Number(w12[1]);
        if (!isNaN(wt) && wt > 0) f.weight = wt;
      }
      // PKG*F*<packageCount>
      const pkg = seg("PKG");
      if (pkg) {
        const cnt = Number(pkg[1]);
        if (!isNaN(cnt) && cnt > 0) f.packageCount = cnt;
      }
      break;
    }

    case "810": {
      // BIG*<invoiceDate>*<invoiceNumber>*<dueDate>*<poNumber>
      const big = seg("BIG");
      if (big) {
        if (big[0]) f.shipDate = toDate(big[0].trim());
        f.invoiceNumber = big[1]?.trim() || undefined;
        if (big[2]) f.invoiceDueDate = toDate(big[2].trim());
        f.poNumber = big[3]?.trim() || undefined;
        f.referenceNumber = f.poNumber;
      }
      const cur2 = seg("CUR");
      if (cur2) f.currencyCode = cur2[1]?.trim() || undefined;
      // TDS*<totalCents>
      const tds = seg("TDS");
      if (tds) {
        const raw = Number(tds[0]);
        if (!isNaN(raw)) f.totalAmount = raw / 100;
      }
      break;
    }

    case "861": {
      // BRA*<raNumber>*<poNumber>*<receiveDate>*<purpose>
      const bra = seg("BRA");
      if (bra) {
        f.poNumber = bra[1]?.trim() || undefined;
        f.referenceNumber = f.poNumber;
        if (bra[2]) f.deliveryDate = toDate(bra[2].trim());
      }
      // REF*PO*<poNumber> — fallback if BRA didn't have it
      if (!f.poNumber) {
        const ref = seg("REF");
        if (ref && ref[0]?.trim() === "PO") f.poNumber = f.referenceNumber = ref[1]?.trim() || undefined;
      }
      // RCD line items: RCD*<lineNum>*<qty>*<uom>**VN*<desc>
      const rcds = allSegs("RCD");
      if (rcds.length > 0) {
        const items = rcds.map(r => ({
          description: r[5]?.trim() ?? r[4]?.trim() ?? "Item",
          quantity: Number(r[1]) || 1,
          unitPrice: 0,
          uom: r[2]?.trim() ?? "EA",
        }));
        f.lineItems = JSON.stringify(items);
      }
      break;
    }

    case "990": {
      // B1A*<responseCode>
      const b1a = seg("B1A");
      if (b1a) f.loadResponseCode = b1a[0]?.trim() || undefined;
      // B1*<senderEdiId>*<referenceNumber>
      const b1 = seg("B1");
      if (b1) f.referenceNumber = b1[1]?.trim() || undefined;
      break;
    }
  }

  return f;
}
