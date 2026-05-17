import mongoose from "mongoose";
import { Company } from "../../artifacts/api-server/src/models/Company";
import { Transaction } from "../../artifacts/api-server/src/models/Transaction";
import { EdiDocument } from "../../artifacts/api-server/src/models/EdiDocument";
import { generateX12 } from "../../artifacts/api-server/src/lib/x12";

const MONGODB_URI = process.env["MONGODB_URI"];
if (!MONGODB_URI) throw new Error("MONGODB_URI required");

async function seed() {
  await mongoose.connect(MONGODB_URI!);
  console.log("Connected to MongoDB");

  // Check if already seeded
  const existing = await Company.countDocuments();
  if (existing >= 4) {
    console.log("Database already seeded with companies — skipping.");
    await mongoose.disconnect();
    return;
  }

  // Clear existing data
  await Promise.all([
    Company.deleteMany({}),
    EdiDocument.deleteMany({}),
    Transaction.deleteMany({}),
  ]);

  // Create companies
  const [coffeeShop, sermacrops, rawMaterials, logistics] = await Promise.all([
    Company.create({ name: "Coffee Shop Co.", ediId: "COFFEESHOP01", type: "buyer", address: "100 Brew Street, Seattle, WA 98101", contactEmail: "edi@coffeeshop.co", contactPhone: "+1 (206) 555-0101", isActive: true }),
    Company.create({ name: "SERMACROPS Manufacturing", ediId: "SERMACROPS01", type: "manufacturer", address: "500 Industrial Blvd, Houston, TX 77001", contactEmail: "edi@sermacrops.com", contactPhone: "+1 (713) 555-0201", isActive: true }),
    Company.create({ name: "Raw Materials Supplier Ltd.", ediId: "RAWMAT001", type: "supplier", address: "200 Supply Chain Dr, Chicago, IL 60601", contactEmail: "edi@rawmaterials.com", contactPhone: "+1 (312) 555-0301", isActive: true }),
    Company.create({ name: "FastFreight Logistics", ediId: "FASTFREIGHT1", type: "logistics", address: "350 Warehouse Way, Memphis, TN 38101", contactEmail: "edi@fastfreight.com", contactPhone: "+1 (901) 555-0401", isActive: true }),
  ]);

  console.log("Created 4 companies");

  // Create a transaction
  const tx = await Transaction.create({
    referenceNumber: "TXN-2025-0001",
    status: "in_progress",
    initiatorId: coffeeShop._id,
    description: "Q2 Coffee Bean Procurement Cycle",
    totalValue: 47500,
  });

  // Generate control numbers
  let cn = 100001;

  // Helper to create docs with X12
  async function makeDoc(data: {
    documentType: string;
    direction: string;
    status: string;
    senderId: typeof coffeeShop;
    receiverId: typeof coffeeShop;
    poNumber?: string;
    referenceNumber?: string;
    shipDate?: string;
    deliveryDate?: string;
    totalAmount?: number;
    lineItems?: string;
    paymentTerms?: string;
    shippingDetails?: string;
    sentAt?: Date;
    deliveredAt?: Date;
    lastResponseCode?: number;
    retryCount?: number;
  }) {
    const controlNumber = String(cn++).padStart(9, "0");
    const doc = new EdiDocument({
      documentType: data.documentType,
      direction: data.direction,
      status: data.status,
      senderId: data.senderId._id,
      receiverId: data.receiverId._id,
      controlNumber,
      referenceNumber: data.referenceNumber,
      poNumber: data.poNumber,
      shipDate: data.shipDate,
      deliveryDate: data.deliveryDate,
      totalAmount: data.totalAmount,
      lineItems: data.lineItems,
      paymentTerms: data.paymentTerms,
      shippingDetails: data.shippingDetails,
      retryCount: data.retryCount ?? 0,
      lastResponseCode: data.lastResponseCode ?? null,
      sentAt: data.sentAt,
      deliveredAt: data.deliveredAt,
      transactionId: tx._id,
    });
    const x12 = generateX12(doc as never, data.senderId.ediId, data.receiverId.ediId);
    doc.x12Content = x12;
    await doc.save();
    return doc;
  }

  const lineItems850 = JSON.stringify([
    { description: "Arabica Coffee Beans 60kg", quantity: 50, unitPrice: 450, uom: "BAG" },
    { description: "Robusta Coffee Beans 60kg", quantity: 30, unitPrice: 380, uom: "BAG" },
    { description: "Specialty Blend Green Bean", quantity: 20, unitPrice: 620, uom: "BAG" },
  ]);

  const lineItemsInv = JSON.stringify([
    { description: "Arabica Coffee Beans 60kg", quantity: 50, unitPrice: 455, uom: "BAG" },
    { description: "Robusta Coffee Beans 60kg", quantity: 30, unitPrice: 385, uom: "BAG" },
    { description: "Specialty Blend Green Bean", quantity: 20, unitPrice: 628, uom: "BAG" },
  ]);

  const shipDate = "2025-05-20";
  const delivDate = "2025-05-27";
  const now = new Date();
  const h1 = new Date(now.getTime() - 6 * 3600000);
  const h2 = new Date(now.getTime() - 5 * 3600000);
  const h3 = new Date(now.getTime() - 4 * 3600000);
  const h4 = new Date(now.getTime() - 3 * 3600000);

  // Full O2C flow
  await makeDoc({ documentType: "850", direction: "inbound", status: "delivered", senderId: coffeeShop, receiverId: sermacrops, poNumber: "PO-CS-2025-0042", shipDate, deliveryDate: delivDate, totalAmount: 47500, lineItems: lineItems850, paymentTerms: "Net 30", sentAt: h1, deliveredAt: h1, lastResponseCode: 200, retryCount: 1 });
  await makeDoc({ documentType: "855", direction: "outbound", status: "delivered", senderId: sermacrops, receiverId: coffeeShop, referenceNumber: "AC-2025-0042", poNumber: "PO-CS-2025-0042", sentAt: h2, deliveredAt: h2, lastResponseCode: 200, retryCount: 1 });
  await makeDoc({ documentType: "204", direction: "outbound", status: "delivered", senderId: sermacrops, receiverId: logistics, referenceNumber: "LOAD-2025-0099", shipDate, deliveryDate: delivDate, shippingDetails: "Temperature controlled, 2°C–8°C", sentAt: h2, deliveredAt: h2, lastResponseCode: 200, retryCount: 1 });
  await makeDoc({ documentType: "990", direction: "inbound", status: "delivered", senderId: logistics, receiverId: sermacrops, referenceNumber: "LOAD-2025-0099", sentAt: h3, deliveredAt: h3, lastResponseCode: 200, retryCount: 1 });
  await makeDoc({ documentType: "850", direction: "outbound", status: "delivered", senderId: sermacrops, receiverId: rawMaterials, poNumber: "PO-SRM-2025-0018", shipDate, deliveryDate: delivDate, totalAmount: 31200, lineItems: lineItems850, paymentTerms: "Net 15", sentAt: h3, deliveredAt: h3, lastResponseCode: 200, retryCount: 1 });
  await makeDoc({ documentType: "855", direction: "inbound", status: "delivered", senderId: rawMaterials, receiverId: sermacrops, referenceNumber: "AC-RM-2025-0018", poNumber: "PO-SRM-2025-0018", sentAt: h3, deliveredAt: h3, lastResponseCode: 200, retryCount: 1 });
  await makeDoc({ documentType: "856", direction: "outbound", status: "sent", senderId: sermacrops, receiverId: coffeeShop, referenceNumber: "ASN-2025-0042", poNumber: "PO-CS-2025-0042", shipDate, shippingDetails: "UPS Freight, PRO# 1234567890", retryCount: 0 });
  await makeDoc({ documentType: "810", direction: "outbound", status: "draft", senderId: sermacrops, receiverId: coffeeShop, referenceNumber: "INV-2025-7841", poNumber: "PO-CS-2025-0042", shipDate, totalAmount: 48100, lineItems: lineItemsInv, paymentTerms: "Net 30", retryCount: 0 });

  // A few extra docs for variety
  await makeDoc({ documentType: "850", direction: "inbound", status: "delivered", senderId: coffeeShop, receiverId: sermacrops, poNumber: "PO-CS-2025-0038", totalAmount: 22000, lineItems: JSON.stringify([{ description: "Espresso Blend 60kg", quantity: 40, unitPrice: 550, uom: "BAG" }]), paymentTerms: "Net 30", retryCount: 1, lastResponseCode: 200 });
  await makeDoc({ documentType: "855", direction: "outbound", status: "failed", senderId: sermacrops, receiverId: coffeeShop, referenceNumber: "AC-2025-0038", retryCount: 3, lastResponseCode: 503 });
  await makeDoc({ documentType: "810", direction: "outbound", status: "delivered", senderId: sermacrops, receiverId: coffeeShop, referenceNumber: "INV-2025-7830", totalAmount: 22100, paymentTerms: "Net 30", retryCount: 1, lastResponseCode: 200, sentAt: h4, deliveredAt: h4 });

  console.log("Created 11 EDI documents");

  await Transaction.findByIdAndUpdate(tx._id, { status: "in_progress" });

  console.log("Seed complete!");
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
