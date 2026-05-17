import mongoose, { Schema, Document, Types } from "mongoose";

export interface IInboundMessage extends Document {
  documentType?: string;
  senderId?: Types.ObjectId;
  receiverId?: Types.ObjectId;
  rawPayload: string;
  parsedData?: string;
  status: string;
  validationErrors?: string;
  controlNumber?: string;
  processedAt?: Date;
  createdAt: Date;
}

const InboundMessageSchema = new Schema<IInboundMessage>(
  {
    documentType: { type: String },
    senderId: { type: Schema.Types.ObjectId, ref: "Company" },
    receiverId: { type: Schema.Types.ObjectId, ref: "Company" },
    rawPayload: { type: String, required: true },
    parsedData: { type: String },
    status: { type: String, default: "received" },
    validationErrors: { type: String },
    controlNumber: { type: String },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

export const InboundMessage = mongoose.model<IInboundMessage>("InboundMessage", InboundMessageSchema);
