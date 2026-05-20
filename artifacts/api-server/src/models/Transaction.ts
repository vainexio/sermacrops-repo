import mongoose, { Schema, Document, Types } from "mongoose";

export interface ITransaction extends Document {
  referenceNumber: string;
  status: string;
  initiatorId: Types.ObjectId;
  description?: string;
  totalValue?: number;
  skippedSteps?: number[];
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    referenceNumber: { type: String, required: true, unique: true },
    status: { type: String, default: "open" }, // open, in_progress, completed, cancelled
    initiatorId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    description: { type: String },
    totalValue: { type: Number },
    skippedSteps: { type: [Number], default: [] },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);
