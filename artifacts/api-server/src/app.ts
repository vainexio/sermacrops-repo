import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { connectDB } from "./lib/mongodb";
import { EdiDocument } from "./models/EdiDocument";
import { ProcurementOrder } from "./models/ProcurementOrder";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: allowedOrigins.length > 0
      ? (origin, cb) => {
          if (!origin || allowedOrigins.includes(origin)) cb(null, true);
          else cb(new Error(`CORS: origin not allowed — ${origin}`));
        }
      : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.text({ type: ["text/plain", "application/EDI-X12", "application/edi-x12"], limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

connectDB()
  .then(async () => {
    // Backfill procurementOrderId on legacy EdiDocuments that predate the field
    try {
      const orders = await ProcurementOrder.find().lean();
      for (const order of orders) {
        await EdiDocument.updateMany(
          { referenceNumber: order.referenceNumber, procurementOrderId: { $exists: false } },
          { $set: { procurementOrderId: order._id } }
        );
      }
    } catch (err) {
      logger.warn({ err }, "procurementOrderId backfill failed (non-fatal)");
    }
  })
  .catch((err) => {
    logger.error({ err }, "Failed to connect to MongoDB");
    process.exit(1);
  });

app.use("/api", router);

export default app;
