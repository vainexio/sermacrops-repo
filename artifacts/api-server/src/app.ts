import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { connectDB } from "./lib/mongodb";

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
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.text({ type: ["text/plain", "application/EDI-X12", "application/edi-x12"], limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

connectDB().catch((err) => {
  logger.error({ err }, "Failed to connect to MongoDB");
  process.exit(1);
});

app.use("/api", router);

export default app;
