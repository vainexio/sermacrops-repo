import { Router, type IRouter } from "express";
import { Company } from "../models/Company";

const router: IRouter = Router();

function fmt(c: InstanceType<typeof Company>) {
  const o = c.toObject();
  return { id: o._id.toString(), name: o.name, ediId: o.ediId, type: o.type, address: o.address ?? null, contactEmail: o.contactEmail ?? null, contactPhone: o.contactPhone ?? null, isActive: o.isActive, createdAt: o.createdAt.toISOString() };
}

router.get("/companies", async (_req, res): Promise<void> => {
  const companies = await Company.find().sort({ name: 1 });
  res.json(companies.map(fmt));
});

router.post("/companies", async (req, res): Promise<void> => {
  const { name, ediId, type, address, contactEmail, contactPhone, isActive } = req.body;
  if (!name || !ediId || !type) { res.status(400).json({ error: "name, ediId, type required" }); return; }
  const company = await Company.create({ name, ediId, type, address, contactEmail, contactPhone, isActive: isActive !== false });
  res.status(201).json(fmt(company));
});

router.get("/companies/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const company = await Company.findById(raw);
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }
  res.json(fmt(company));
});

router.patch("/companies/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const company = await Company.findByIdAndUpdate(raw, { $set: req.body }, { new: true });
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }
  res.json(fmt(company));
});

router.delete("/companies/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await Company.findByIdAndDelete(raw);
  res.sendStatus(204);
});

export default router;
