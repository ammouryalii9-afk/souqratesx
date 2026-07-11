import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import vaultRouter from "./vault";
import adminRouter from "./admin";
import configRouter from "./config";
import earnRouter from "./earn";
import starsRouter from "./stars";
import telegramWebhookRouter from "./telegramWebhook";
import adsRouter from "./ads";
import partnerTasksRouter from "./partnerTasks";
import achievementsRouter from "./achievements";
import announcementsRouter from "./announcements";
import withdrawRouter from "./withdraw";
import engageRouter from "./engage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(vaultRouter);
router.use(adminRouter);
router.use(configRouter);
router.use(earnRouter);
router.use(starsRouter);
router.use(telegramWebhookRouter);
router.use(adsRouter);
router.use(partnerTasksRouter);
router.use(achievementsRouter);
router.use(announcementsRouter);
router.use(withdrawRouter);
router.use(engageRouter);

export default router;
