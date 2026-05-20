import mongoose, { Schema, Document, Types } from "mongoose";

export interface IInventoryItem extends Document {
  name: string;
  category: "manufactured" | "raw_material";
  sku: string;
  quantity: number;
  unit: string;
  reorderPoint?: number;
  supplierId?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryItemSchema = new Schema<IInventoryItem>(
  {
    name: { type: String, required: true },
    category: { type: String, required: true, enum: ["manufactured", "raw_material"] },
    sku: { type: String, required: true, unique: true },
    quantity: { type: Number, required: true, default: 0 },
    unit: { type: String, required: true },
    reorderPoint: { type: Number },
    supplierId: { type: Schema.Types.ObjectId, ref: "Company" },
    notes: { type: String },
  },
  { timestamps: true }
);

export const InventoryItem = mongoose.model<IInventoryItem>("InventoryItem", InventoryItemSchema);
