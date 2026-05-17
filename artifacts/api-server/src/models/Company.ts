import mongoose, { Schema, Document } from "mongoose";

export interface ICompany extends Document {
  name: string;
  ediId: string;
  type: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true },
    ediId: { type: String, required: true, unique: true },
    type: { type: String, required: true }, // manufacturer, buyer, supplier, logistics
    address: { type: String },
    contactEmail: { type: String },
    contactPhone: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Company = mongoose.model<ICompany>("Company", CompanySchema);
