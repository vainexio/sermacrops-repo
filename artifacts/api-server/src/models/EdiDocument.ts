import mongoose, { Schema, Document, Types } from "mongoose";

export interface IEdiDocument extends Document {
  documentType: string;
  direction: string;
  status: string;
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  controlNumber: string;
  referenceNumber?: string;
  poNumber?: string;
  shipDate?: string;
  deliveryDate?: string;
  totalAmount?: number;
  lineItems?: string;
  paymentTerms?: string;
  shippingDetails?: string;
  notes?: string;
  x12Content?: string;
  // 850 / 810
  currencyCode?: string;
  // 810
  invoiceNumber?: string;
  invoiceDueDate?: string;
  // 855
  ackStatus?: string;
  // 856
  carrierName?: string;
  proNumber?: string;
  trackingNumber?: string;
  packageCount?: number;
  weight?: number;
  weightUOM?: string;
  // 204
  equipmentType?: string;
  specialInstructions?: string;
  // 990
  loadResponseCode?: string;
  retryCount: number;
  lastResponseCode?: number;
  lastResponseBody?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  transactionId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EdiDocumentSchema = new Schema<IEdiDocument>(
  {
    documentType: { type: String, required: true },
    direction: { type: String, required: true },
    status: { type: String, default: "draft" },
    senderId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    controlNumber: { type: String, required: true },
    referenceNumber: { type: String },
    poNumber: { type: String },
    shipDate: { type: String },
    deliveryDate: { type: String },
    totalAmount: { type: Number },
    lineItems: { type: String },
    paymentTerms: { type: String },
    shippingDetails: { type: String },
    notes: { type: String },
    x12Content: { type: String },
    currencyCode: { type: String },
    invoiceNumber: { type: String },
    invoiceDueDate: { type: String },
    ackStatus: { type: String },
    carrierName: { type: String },
    proNumber: { type: String },
    trackingNumber: { type: String },
    packageCount: { type: Number },
    weight: { type: Number },
    weightUOM: { type: String },
    equipmentType: { type: String },
    specialInstructions: { type: String },
    loadResponseCode: { type: String },
    retryCount: { type: Number, default: 0 },
    lastResponseCode: { type: Number },
    lastResponseBody: { type: String },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction" },
  },
  { timestamps: true }
);

export const EdiDocument = mongoose.model<IEdiDocument>("EdiDocument", EdiDocumentSchema);
