import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, partnerEndpointsTable, companiesTable } from "@workspace/db";
import {
  CreatePartnerEndpointBody,
  GetPartnerEndpointParams,
  UpdatePartnerEndpointParams,
  UpdatePartnerEndpointBody,
  DeletePartnerEndpointParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function fmt(ep: typeof partnerEndpointsTable.$inferSelect, companyName?: string | null) {
  return {
    ...ep,
    companyName: companyName ?? null,
    createdAt: ep.createdAt.toISOString(),
    updatedAt: ep.updatedAt.toISOString(),
  };
}

router.get("/partner-endpoints", async (req, res): Promise<void> => {
  const rows = await db
    .select({ ep: partnerEndpointsTable, companyName: companiesTable.name })
    .from(partnerEndpointsTable)
    .leftJoin(companiesTable, eq(partnerEndpointsTable.companyId, companiesTable.id))
    .orderBy(partnerEndpointsTable.name);
  res.json(rows.map(r => fmt(r.ep, r.companyName)));
});

router.post("/partner-endpoints", async (req, res): Promise<void> => {
  const parsed = CreatePartnerEndpointBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [ep] = await db.insert(partnerEndpointsTable).values(parsed.data).returning();
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, ep.companyId));
  res.status(201).json(fmt(ep, company?.name));
});

router.get("/partner-endpoints/:id", async (req, res): Promise<void> => {
  const params = GetPartnerEndpointParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({ ep: partnerEndpointsTable, companyName: companiesTable.name })
    .from(partnerEndpointsTable)
    .leftJoin(companiesTable, eq(partnerEndpointsTable.companyId, companiesTable.id))
    .where(eq(partnerEndpointsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Partner endpoint not found" });
    return;
  }
  res.json(fmt(row.ep, row.companyName));
});

router.patch("/partner-endpoints/:id", async (req, res): Promise<void> => {
  const params = UpdatePartnerEndpointParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePartnerEndpointBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [ep] = await db.update(partnerEndpointsTable).set(parsed.data).where(eq(partnerEndpointsTable.id, params.data.id)).returning();
  if (!ep) {
    res.status(404).json({ error: "Partner endpoint not found" });
    return;
  }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, ep.companyId));
  res.json(fmt(ep, company?.name));
});

router.delete("/partner-endpoints/:id", async (req, res): Promise<void> => {
  const params = DeletePartnerEndpointParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(partnerEndpointsTable).where(eq(partnerEndpointsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
