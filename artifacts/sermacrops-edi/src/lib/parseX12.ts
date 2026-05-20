import type { EdiDocumentData } from "@/components/EdiDocumentCard";

function splitSegs(payload: string): string[][] {
  return payload
    .split(/~[\s\r\n]*/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.split("*"));
}

function findSeg(segs: string[][], id: string): string[] | undefined {
  return segs.find(s => s[0] === id);
}

function findAllSegs(segs: string[][], id: string): string[][] {
  return segs.filter(s => s[0] === id);
}

function parseIsaIds(segs: string[][]): { senderId?: string; receiverId?: string } {
  const isa = segs.find(s => s[0] === "ISA");
  if (!isa) return {};
  // ISA fields (0-indexed): [0]=ISA [1]=authQual [2]=authInfo [3]=secQual [4]=secInfo
  // [5]=senderQual [6]=senderId [7]=receiverQual [8]=receiverId
  const senderId = isa[6]?.trim() || undefined;
  const receiverId = isa[8]?.trim() || undefined;
  return { senderId, receiverId };
}

function findN1Loop(segs: string[][], qualifier: string): {
  name?: string; addr1?: string; addr2?: string;
  city?: string; state?: string; zip?: string;
} | null {
  const idx = segs.findIndex(s => s[0] === "N1" && s[1] === qualifier);
  if (idx < 0) return null;
  const name = segs[idx][2];
  let addr1: string | undefined, addr2: string | undefined;
  let city: string | undefined, state: string | undefined, zip: string | undefined;
  const stopSegs = new Set(["N1", "PO1", "IT1", "LIN", "HL", "CTT", "SE", "GE", "IEA"]);
  for (let i = idx + 1; i < segs.length && !stopSegs.has(segs[i][0]); i++) {
    if (segs[i][0] === "N3") { addr1 = segs[i][1]; addr2 = segs[i][2]; }
    if (segs[i][0] === "N4") { city = segs[i][1]; state = segs[i][2]; zip = segs[i][3]; }
  }
  return { name, addr1, addr2, city, state, zip };
}

function fmtDate(d?: string): string | null {
  if (!d) return null;
  const s = d.replace(/-/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (s.length === 6) return `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
  return d;
}

export function parseX12ToDocumentData(
  rawPayload: string,
  opts: {
    documentType?: string | null;
    controlNumber?: string | null;
    senderName?: string | null;
    receiverName?: string | null;
    status: string;
    createdAt: string;
  }
): EdiDocumentData {
  const segs = splitSegs(rawPayload);
  const docType = opts.documentType ?? findSeg(segs, "ST")?.[1] ?? "unknown";
  const controlNumber = opts.controlNumber ?? findSeg(segs, "ISA")?.[13] ?? null;

  let poNumber: string | null = null;
  let invoiceNumber: string | null = null;
  let invoiceDueDate: string | null = null;
  let shipDate: string | null = null;
  let deliveryDate: string | null = null;
  let currencyCode: string | null = null;
  let referenceNumber: string | null = null;
  let paymentTerms: string | null = null;
  let ackStatus: string | null = null;
  let loadResponseCode: string | null = null;
  let carrierName: string | null = null;
  let proNumber: string | null = null;
  let weight: number | null = null;
  let weightUOM: string | null = null;
  let packageCount: number | null = null;
  let equipmentType: string | null = null;
  let specialInstructions: string | null = null;
  let totalAmount: number | null = null;
  const lineItems: Array<{ description: string; quantity: number; uom?: string; unitPrice: number }> = [];

  switch (docType) {
    case "850": {
      const beg = findSeg(segs, "BEG");
      poNumber = beg?.[3] ?? null;
      shipDate = fmtDate(beg?.[5]);
      currencyCode = findSeg(segs, "CUR")?.[2] ?? null;
      referenceNumber = findSeg(segs, "REF")?.[2] ?? null;
      const itd = findSeg(segs, "ITD");
      if (itd?.[6]) paymentTerms = `Net ${itd[6]}`;
      for (const po1 of findAllSegs(segs, "PO1")) {
        lineItems.push({
          quantity: parseFloat(po1[2]) || 1,
          uom: po1[3] || "EA",
          unitPrice: parseFloat(po1[4]) || 0,
          description: po1[7] || po1[6] || "Item",
        });
      }
      break;
    }
    case "855": {
      const bak = findSeg(segs, "BAK");
      ackStatus = bak?.[2] ?? null;
      poNumber = bak?.[3] ?? null;
      shipDate = fmtDate(bak?.[4]);
      referenceNumber = findSeg(segs, "REF")?.[2] ?? null;
      break;
    }
    case "856": {
      const bsn = findSeg(segs, "BSN");
      proNumber = bsn?.[2] ?? null;
      shipDate = fmtDate(bsn?.[3]);
      carrierName = findSeg(segs, "TD5")?.[6] ?? null;
      const dtm011 = findAllSegs(segs, "DTM").find(s => s[1] === "011");
      if (dtm011) deliveryDate = fmtDate(dtm011[2]);
      const w12 = findSeg(segs, "W12");
      if (w12) { weightUOM = w12[1]; weight = parseFloat(w12[2]) || null; }
      const pkg = findSeg(segs, "PKG");
      if (pkg?.[2]) packageCount = parseInt(pkg[2]) || null;
      poNumber = findSeg(segs, "PRF")?.[1] ?? null;
      const linList = findAllSegs(segs, "LIN");
      for (const lin of linList) {
        const desc = lin[3] || lin[2] || "Item";
        const linIdx = segs.indexOf(lin);
        let qty = 1, uom = "EA";
        for (let j = linIdx + 1; j < segs.length && segs[j][0] !== "LIN"; j++) {
          if (segs[j][0] === "SN1") { qty = parseFloat(segs[j][2]) || 1; uom = segs[j][3] || "EA"; break; }
        }
        lineItems.push({ description: desc, quantity: qty, uom, unitPrice: 0 });
      }
      break;
    }
    case "810": {
      const big = findSeg(segs, "BIG");
      shipDate = fmtDate(big?.[1]);
      invoiceNumber = big?.[2] ?? null;
      invoiceDueDate = fmtDate(big?.[3]);
      poNumber = big?.[4] ?? null;
      currencyCode = findSeg(segs, "CUR")?.[2] ?? null;
      referenceNumber = findSeg(segs, "REF")?.[2] ?? null;
      const itd = findSeg(segs, "ITD");
      if (itd?.[6]) paymentTerms = `Net ${itd[6]}`;
      for (const it1 of findAllSegs(segs, "IT1")) {
        lineItems.push({
          quantity: parseFloat(it1[2]) || 1,
          uom: it1[3] || "EA",
          unitPrice: parseFloat(it1[4]) || 0,
          description: it1[7] || it1[6] || "Item",
        });
      }
      const tds = findSeg(segs, "TDS");
      if (tds?.[1]) totalAmount = (parseInt(tds[1]) || 0) / 100;
      break;
    }
    case "204": {
      poNumber = findSeg(segs, "L11")?.[1] ?? null;
      const g62All = findAllSegs(segs, "G62");
      shipDate = fmtDate(g62All.find(s => s[1] === "37")?.[2]);
      deliveryDate = fmtDate(g62All.find(s => s[1] === "38")?.[2]);
      referenceNumber = findSeg(segs, "B2")?.[4] ?? null;
      equipmentType = findSeg(segs, "L3")?.[3] ?? null;
      const at8 = findSeg(segs, "AT8");
      if (at8) { weightUOM = at8[2]; weight = parseFloat(at8[3]) || null; }
      specialInstructions = findSeg(segs, "NTE")?.[2] ?? null;
      break;
    }
    case "990": {
      loadResponseCode = findSeg(segs, "B1A")?.[1] ?? null;
      referenceNumber = findSeg(segs, "B1")?.[2] ?? null;
      break;
    }
  }

  // Use ISA IDs as last-resort fallback — never use N1 business-role qualifiers (SE/BY/BT/etc.)
  // for sender/receiver, because those represent transaction roles (seller/buyer), not EDI
  // communication direction. The API values (opts) are authoritative; ISA IDs are the fallback.
  const { senderId: isaSenderId, receiverId: isaReceiverId } = parseIsaIds(segs);

  const senderName = opts.senderName || isaSenderId || null;
  const receiverName = opts.receiverName || isaReceiverId || null;

  if (totalAmount == null && lineItems.length > 0 && lineItems.some(li => li.unitPrice > 0)) {
    totalAmount = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  }

  return {
    documentType: docType,
    controlNumber,
    referenceNumber,
    poNumber,
    invoiceNumber,
    invoiceDueDate,
    senderName,
    receiverName,
    shipDate,
    deliveryDate,
    paymentTerms,
    currencyCode: currencyCode ?? "PHP",
    carrierName,
    proNumber,
    packageCount,
    weight,
    weightUOM,
    equipmentType,
    specialInstructions,
    ackStatus,
    loadResponseCode,
    lineItems: lineItems.length > 0 ? JSON.stringify(lineItems) : null,
    totalAmount,
    createdAt: opts.createdAt,
    status: opts.status,
    direction: "inbound",
  };
}
