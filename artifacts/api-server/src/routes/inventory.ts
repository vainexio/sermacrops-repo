import { Router, type IRouter } from "express";
import { InventoryItem } from "../models/InventoryItem";
import { Company } from "../models/Company";
import { broadcast } from "../lib/sse";

const router: IRouter = Router();

async function fmt(item: InstanceType<typeof InventoryItem>) {
  const o = item.toObject();
  let supplierName: string | null = null;
  if (o.supplierId) {
    const s = await Company.findById(o.supplierId).lean();
    supplierName = s?.name ?? null;
  }
  return {
    id: o._id.toString(),
    name: o.name,
    category: o.category,
    sku: o.sku,
    quantity: o.quantity,
    unit: o.unit,
    reorderPoint: o.reorderPoint ?? null,
    unitPrice: o.unitPrice ?? null,
    supplierId: o.supplierId?.toString() ?? null,
    supplierName,
    notes: o.notes ?? null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

router.get("/inventory", async (req, res): Promise<void> => {
  const { category } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;
  const items = await InventoryItem.find(filter).sort({ category: 1, name: 1 });
  res.json(await Promise.all(items.map(fmt)));
});

router.post("/inventory", async (req, res): Promise<void> => {
  const { name, category, sku, quantity, unit, reorderPoint, unitPrice, supplierId, notes } = req.body;
  if (!name || !category || !sku || !unit) {
    res.status(400).json({ error: "name, category, sku, and unit are required" });
    return;
  }
  if (!["manufactured", "raw_material"].includes(category)) {
    res.status(400).json({ error: "category must be 'manufactured' or 'raw_material'" });
    return;
  }
  const existing = await InventoryItem.findOne({ sku });
  if (existing) {
    res.status(409).json({ error: "An item with this SKU already exists" });
    return;
  }
  const item = await InventoryItem.create({
    name, category, sku, quantity: quantity ?? 0, unit,
    reorderPoint, unitPrice: unitPrice ?? undefined, supplierId: supplierId || undefined, notes,
  });
  broadcast("inventory");
  res.status(201).json(await fmt(item));
});

router.get("/inventory/:id", async (req, res): Promise<void> => {
  const item = await InventoryItem.findById(req.params.id);
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await fmt(item));
});

router.patch("/inventory/:id", async (req, res): Promise<void> => {
  const item = await InventoryItem.findById(req.params.id);
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  const { name, category, sku, quantity, unit, reorderPoint, unitPrice, supplierId, notes } = req.body;
  if (name !== undefined) item.name = name;
  if (category !== undefined) item.category = category;
  if (sku !== undefined) item.sku = sku;
  if (quantity !== undefined) item.quantity = quantity;
  if (unit !== undefined) item.unit = unit;
  if (reorderPoint !== undefined) item.reorderPoint = reorderPoint;
  if (unitPrice !== undefined) item.unitPrice = unitPrice ?? undefined;
  if (supplierId !== undefined) item.supplierId = supplierId || undefined;
  if (notes !== undefined) item.notes = notes;
  await item.save();
  broadcast("inventory");
  res.json(await fmt(item));
});

router.delete("/inventory/:id", async (req, res): Promise<void> => {
  const item = await InventoryItem.findByIdAndDelete(req.params.id);
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  broadcast("inventory");
  res.json({ success: true });
});

export default router;
