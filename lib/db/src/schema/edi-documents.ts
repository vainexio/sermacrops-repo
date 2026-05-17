import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { transactionsTable } from "./transactions";

export const ediDocumentsTable = pgTable("edi_documents", {
  id: serial("id").primaryKey(),
  documentType: text("document_type").notNull(), // 850, 855, 856, 810, 204, 990
  direction: text("direction").notNull(), // outbound, inbound
  status: text("status").notNull().default("draft"), // draft, ready, sent, delivered, failed, retry_pending
  senderId: integer("sender_id").notNull().references(() => companiesTable.id),
  receiverId: integer("receiver_id").notNull().references(() => companiesTable.id),
  controlNumber: text("control_number").notNull(),
  referenceNumber: text("reference_number"),
  poNumber: text("po_number"),
  shipDate: text("ship_date"),
  deliveryDate: text("delivery_date"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
  lineItems: text("line_items"), // JSON array
  paymentTerms: text("payment_terms"),
  shippingDetails: text("shipping_details"), // JSON object
  x12Content: text("x12_content"),
  notes: text("notes"),
  retryCount: integer("retry_count").notNull().default(0),
  lastResponseCode: integer("last_response_code"),
  lastResponseBody: text("last_response_body"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  transactionId: integer("transaction_id").references(() => transactionsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEdiDocumentSchema = createInsertSchema(ediDocumentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEdiDocument = z.infer<typeof insertEdiDocumentSchema>;
export type EdiDocument = typeof ediDocumentsTable.$inferSelect;
