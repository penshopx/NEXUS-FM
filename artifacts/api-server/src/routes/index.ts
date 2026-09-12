import { Router, type IRouter } from "express";
import healthRouter from "./health";
import foundationRouter from "./foundation";
import authorizationRouter from "./authorization";
import facilitiesRouter from "./facilities";

const router: IRouter = Router();

router.use(healthRouter);
router.use(foundationRouter);
router.use(authorizationRouter);
router.use(facilitiesRouter);

export default router;
