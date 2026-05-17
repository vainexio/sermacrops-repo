import { Router, type IRouter } from "express";
import { PartnerEndpoint } from "../models/PartnerEndpoint";
import { Company } from "../models/Company";

const router: IRouter = Router();

async function fmt(ep: InstanceType<typeof PartnerEndpoint>) {
  const o = ep.toObject();
  const company = await Company.findById(o.companyId).lean();
  return {
    id: o._id.toString(),
    companyId: o.companyId.toString(),
    companyName: company?.name ?? null,
    name: o.name,
    url: o.url,
    authType: o.authType,
    apiKey: o.apiKey ?? null,
    bearerToken: o.bearerToken ?? null,
    customHeaders: o.customHeaders ?? null,
    isActive: o.isActive,
    createdAt: o.createdAt.toISOString(),
  };
}

router.get("/partner-endpoints", async (_req, res): Promise<void> => {
  const eps = await PartnerEndpoint.find().sort({ name: 1 });
  res.json(await Promise.all(eps.map(fmt)));
});

router.post("/partner-endpoints", async (req, res): Promise<void> => {
  const { companyId, name, url, authType, apiKey, bearerToken, customHeaders, isActive } = req.body;
  if (!companyId || !name || !url || !authType) { res.status(400).json({ error: "companyId, name, url, authType required" }); return; }
  const ep = await PartnerEndpoint.create({ companyId, name, url, authType, apiKey, bearerToken, customHeaders, isActive: isActive !== false });
  res.status(201).json(await fmt(ep));
});

router.get("/partner-endpoints/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const ep = await PartnerEndpoint.findById(raw);
  if (!ep) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await fmt(ep));
});

router.patch("/partner-endpoints/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const ep = await PartnerEndpoint.findByIdAndUpdate(raw, { $set: req.body }, { new: true });
  if (!ep) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await fmt(ep));
});

router.delete("/partner-endpoints/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await PartnerEndpoint.findByIdAndDelete(raw);
  res.sendStatus(204);
});

export default router;
