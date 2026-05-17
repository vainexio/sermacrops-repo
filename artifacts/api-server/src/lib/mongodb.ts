import mongoose from "mongoose";
import { logger } from "./logger";

const MONGODB_URI = process.env["MONGODB_URI"];

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is required");
}

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;
  await mongoose.connect(MONGODB_URI!);
  isConnected = true;
  logger.info("Connected to MongoDB");
}

export default mongoose;
