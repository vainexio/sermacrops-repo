import mongoose, { Schema, Document } from "mongoose";

export interface IAuditLog extends Document {
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    details: { type: String },
  },
  { timestamps: true }
);

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
