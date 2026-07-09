import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import vaultRouter from "./vault";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(vaultRouter);
router.use(adminRouter);

export default router;
