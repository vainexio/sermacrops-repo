import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPartnerEndpoint extends Document {
  companyId: Types.ObjectId;
  name: string;
  url: string;
  authType: string;
  apiKey?: string;
  bearerToken?: string;
  customHeaders?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PartnerEndpointSchema = new Schema<IPartnerEndpoint>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    authType: { type: String, default: "none" }, // none, api_key, bearer_token, basic
    apiKey: { type: String },
    bearerToken: { type: String },
    customHeaders: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const PartnerEndpoint = mongoose.model<IPartnerEndpoint>("PartnerEndpoint", PartnerEndpointSchema);
