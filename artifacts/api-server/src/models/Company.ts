import mongoose, { Schema, Document } from "mongoose";

export interface ICompany extends Document {
  name: string;
  ediId: string;
  type: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
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
    type: { type: String, required: true },
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    country: { type: String, default: "PH" },
    contactEmail: { type: String },
    contactPhone: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Company = mongoose.model<ICompany>("Company", CompanySchema);
