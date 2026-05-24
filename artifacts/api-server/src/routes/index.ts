import { Router, type IRouter } from "express";
import healthRouter from "./health";
import companiesRouter from "./companies";
import partnerEndpointsRouter from "./partner-endpoints";
import ediDocumentsRouter from "./edi-documents";
import inboundRouter from "./inbound";
import transactionsRouter from "./transactions";
import dashboardRouter from "./dashboard";
import inventoryRouter from "./inventory";
import procurementRouter from "./procurement";
import eventsRouter from "./events";
import supplierStockRouter from "./supplier-stock";

const router: IRouter = Router();

router.use(healthRouter);
router.use(companiesRouter);
router.use(partnerEndpointsRouter);
router.use(ediDocumentsRouter);
router.use(inboundRouter);
router.use(transactionsRouter);
router.use(dashboardRouter);
router.use(inventoryRouter);
router.use(procurementRouter);
router.use(eventsRouter);
router.use(supplierStockRouter);

export default router;
