import { Router, type IRouter } from "express";
import { EdiDocument } from "../models/EdiDocument";
import { InventoryItem } from "../models/InventoryItem";
import { Company } from "../models/Company";

const router: IRouter = Router();

function parse846Items(x12: string): Array<{ sku: string; quantity: number; uom: string }> {
  const segments = x12.split("~").map(s => s.trim()).filter(Boolean);
  const items: Array<{ sku: string; quantity: number; uom: string }> = [];

  for (let i = 0; i < segments.length; i++) {
    const parts = segments[i].split("*");
    if (parts[0] !== "LIN") continue;

    let sku: string | null = null;
    for (let j = 1; j < parts.length - 1; j++) {
      if (parts[j] === "VN") {
        sku = parts[j + 1]?.trim() ?? null;
        break;
      }
    }
    if (!sku) continue;

    let quantity = 0;
    let uom = "EA";
    for (let k = i + 1; k < segments.length && k < i + 6; k++) {
      const qp = segments[k].split("*");
      if (qp[0] === "QTY") {
        quantity = Number(qp[2]) || 0;
        uom = qp[3]?.trim() || "EA";
        break;
      }
    }

    items.push({ sku, quantity, uom });
  }

  return items;
}

router.get("/supplier-stock", async (_req, res): Promise<void> => {
  const docs = await EdiDocument.find({ documentType: "846", direction: "inbound" })
    .sort({ createdAt: -1 })
    .lean();

  if (docs.length === 0) {
    res.json([]);
    return;
  }

  const rawMaterials = await InventoryItem.find({ category: "raw_material" }).lean();
  const skuMap = new Map(rawMaterials.map(item => [item.sku.toUpperCase(), item]));

  const senderIds = [...new Set(docs.map(d => d.senderId?.toString()).filter(Boolean))];
  const companies = senderIds.length
    ? await Company.find({ _id: { $in: senderIds } }).lean()
    : [];
  const companyMap = new Map(companies.map(c => [c._id.toString(), c]));

  const result = docs.map(doc => {
    const supplier = doc.senderId ? companyMap.get(doc.senderId.toString()) ?? null : null;
    const rawItems = doc.x12Content ? parse846Items(doc.x12Content) : [];

    const items = rawItems.map(({ sku, quantity, uom }) => {
      const inv = skuMap.get(sku.toUpperCase());
      return {
        sku,
        name: inv?.name ?? null,
        inventoryItemId: inv ? (inv._id as { toString(): string }).toString() : null,
        supplierQuantity: quantity,
        ourQuantity: inv?.quantity ?? null,
        uom: uom || inv?.unit || "EA",
        matched: !!inv,
      };
    });

    return {
      documentId: doc._id.toString(),
      controlNumber: doc.controlNumber ?? null,
      supplierId: doc.senderId?.toString() ?? null,
      supplierName: supplier?.name ?? null,
      receivedAt: (doc.deliveredAt ?? doc.createdAt).toISOString(),
      referenceNumber: doc.referenceNumber ?? null,
      items,
    };
  });

  res.json(result);
});

export default router;
