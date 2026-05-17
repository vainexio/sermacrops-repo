import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const partnerEndpointsTable = pgTable("partner_endpoints", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  authType: text("auth_type").notNull().default("none"), // none, api_key, bearer_token, basic
  apiKey: text("api_key"),
  bearerToken: text("bearer_token"),
  customHeaders: text("custom_headers"), // JSON string
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerEndpointSchema = createInsertSchema(partnerEndpointsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerEndpoint = z.infer<typeof insertPartnerEndpointSchema>;
export type PartnerEndpoint = typeof partnerEndpointsTable.$inferSelect;
