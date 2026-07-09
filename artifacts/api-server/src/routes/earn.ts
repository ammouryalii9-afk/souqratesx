import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import { ClaimAdsgramRewardResponse, OfferwallPostbackResponse } from "@workspace/api-zod";
import { getSessionTelegramId } from "../lib/session";
import { getSettingsMap, asNumber, asString } from "../lib/settings";

const router: IRouter = Router();

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

router.post("/earn/adsgram/reward", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const settings = await getSettingsMap();
  const rewardPoints = asNumber(settings.adsgramRewardPoints, 100);
  const cooldownSeconds = asNumber(settings.adsgramCooldownSeconds, 30);
  const dailyCap = asNumber(settings.adsgramDailyCap, 20);

  const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const now = new Date();
  if (user.lastAdRewardAt) {
    const secondsSince = (now.getTime() - user.lastAdRewardAt.getTime()) / 1000;
    if (secondsSince < cooldownSeconds) {
      res.status(429).json({ error: "Please wait before watching another ad" });
      return;
    }
  }

  const today = todayStr();
  const watchedToday = user.adsWatchedDate === today ? user.adsWatchedToday : 0;
  if (watchedToday >= dailyCap) {
    res.status(429).json({ error: "Daily ad limit reached" });
    return;
  }

  const [updated] = await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: user.lifetimePoints + rewardPoints,
      adsWatchedToday: watchedToday + 1,
      adsWatchedDate: today,
      lastAdRewardAt: now,
    })
    .where(eq(vaultUsersTable.telegramId, telegramId))
    .returning();

  res.json(
    ClaimAdsgramRewardResponse.parse({
      creditedPoints: rewardPoints,
      lifetimePoints: updated?.lifetimePoints ?? user.lifetimePoints + rewardPoints,
    }),
  );
});

const PROVIDER_SETTINGS_KEY: Record<string, string> = {
  cpa: "cpaPostbackSecret",
  monlix: "monlixPostbackSecret",
  bitlabs: "bitlabsPostbackSecret",
};

router.get("/earn/offerwall/postback", async (req, res): Promise<void> => {
  const provider = typeof req.query.provider === "string" ? req.query.provider : "";
  const telegramId = typeof req.query.telegramId === "string" ? req.query.telegramId : "";
  const amount = Number(req.query.amount);
  const secret = typeof req.query.secret === "string" ? req.query.secret : "";

  const secretKey = PROVIDER_SETTINGS_KEY[provider];
  if (!secretKey || !telegramId || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Invalid provider or missing params" });
    return;
  }

  const settings = await getSettingsMap();
  const expectedSecret = asString(settings[secretKey]);
  if (!expectedSecret || expectedSecret !== secret) {
    req.log.warn({ provider }, "Rejected offerwall postback with invalid secret");
    res.status(403).json({ error: "Invalid postback secret" });
    return;
  }

  const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!user) {
    res.status(400).json({ error: "Unknown user" });
    return;
  }

  const creditedPoints = Math.round(amount);
  const [updated] = await db
    .update(vaultUsersTable)
    .set({ lifetimePoints: user.lifetimePoints + creditedPoints })
    .where(eq(vaultUsersTable.telegramId, telegramId))
    .returning();

  req.log.info({ provider, telegramId, creditedPoints }, "Offerwall postback credited");

  res.json(
    OfferwallPostbackResponse.parse({
      creditedPoints,
      lifetimePoints: updated?.lifetimePoints ?? user.lifetimePoints + creditedPoints,
    }),
  );
});

export default router;
