import mongoose, { Schema, Document, Types } from "mongoose";

export interface IProcurementLineItem {
  inventoryItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
}

export interface IProcurementOrder extends Document {
  referenceNumber: string;
  status: "open" | "acknowledged" | "received" | "completed";
  supplierId: Types.ObjectId;
  currentStep: number;
  skippedSteps: number[];
  lineItems: IProcurementLineItem[];
  totalValue?: number;
  notes?: string;
  ediDocumentId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProcurementLineItemSchema = new Schema<IProcurementLineItem>(
  {
    inventoryItemId: { type: String },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    unitPrice: { type: Number },
  },
  { _id: false }
);

const ProcurementOrderSchema = new Schema<IProcurementOrder>(
  {
    referenceNumber: { type: String, required: true, unique: true },
    status: { type: String, default: "open", enum: ["open", "acknowledged", "received", "completed"] },
    supplierId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    currentStep: { type: Number, default: 1 },
    skippedSteps: { type: [Number], default: [] },
    lineItems: { type: [ProcurementLineItemSchema], default: [] },
    totalValue: { type: Number },
    notes: { type: String },
    ediDocumentId: { type: Schema.Types.ObjectId, ref: "EdiDocument" },
  },
  { timestamps: true }
);

export const ProcurementOrder = mongoose.model<IProcurementOrder>("ProcurementOrder", ProcurementOrderSchema);
