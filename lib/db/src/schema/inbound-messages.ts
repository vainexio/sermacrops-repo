import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const inboundMessagesTable = pgTable("inbound_messages", {
  id: serial("id").primaryKey(),
  documentType: text("document_type"),
  senderId: integer("sender_id").references(() => companiesTable.id),
  receiverId: integer("receiver_id").references(() => companiesTable.id),
  rawPayload: text("raw_payload").notNull(),
  parsedData: text("parsed_data"), // JSON
  status: text("status").notNull().default("received"), // received, processing, processed, error
  validationErrors: text("validation_errors"), // JSON array
  controlNumber: text("control_number"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInboundMessageSchema = createInsertSchema(inboundMessagesTable).omit({ id: true, createdAt: true });
export type InsertInboundMessage = z.infer<typeof insertInboundMessageSchema>;
export type InboundMessage = typeof inboundMessagesTable.$inferSelect;
