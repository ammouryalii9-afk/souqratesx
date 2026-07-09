import { Router, type IRouter } from "express";
import { and, eq, lt, isNull, or, sql } from "drizzle-orm";
import { db, vaultUsersTable, processedTransactionsTable } from "@workspace/db";
import { ClaimAdsgramRewardResponse, OfferwallPostbackResponse } from "@workspace/api-zod";
import { getSessionTelegramId } from "../lib/session";
import { getSettingsMap, asNumber, asString } from "../lib/settings";
import { rateLimit } from "../lib/rateLimit";
import { logUserActivity } from "../lib/activityLog";
import { awardReferralBonus } from "../lib/referral";

const router: IRouter = Router();

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

router.post("/earn/adsgram/reward", rateLimit("adsgram", 30, 60_000), async (req, res): Promise<void> => {
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

  if (user.isBanned) {
    res.status(403).json({ error: "This account has been banned" });
    return;
  }

  const now = new Date();
  const today = todayStr();
  const cooldownCutoff = new Date(now.getTime() - cooldownSeconds * 1000);

  // Atomic conditional update: the cooldown + daily-cap checks are re-applied inside
  // the WHERE clause so two concurrent requests can never both be credited.
  const [updated] = await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${rewardPoints}`,
      adsWatchedToday: sql`case when ${vaultUsersTable.adsWatchedDate} = ${today} then ${vaultUsersTable.adsWatchedToday} + 1 else 1 end`,
      adsWatchedDate: today,
      lastAdRewardAt: now,
    })
    .where(
      and(
        eq(vaultUsersTable.telegramId, telegramId),
        eq(vaultUsersTable.isBanned, false),
        or(isNull(vaultUsersTable.lastAdRewardAt), lt(vaultUsersTable.lastAdRewardAt, cooldownCutoff)),
        or(
          sql`${vaultUsersTable.adsWatchedDate} is distinct from ${today}`,
          lt(vaultUsersTable.adsWatchedToday, dailyCap),
        ),
      ),
    )
    .returning();

  if (!updated) {
    res.status(429).json({ error: "Ad reward not available yet (cooldown or daily limit)" });
    return;
  }

  await logUserActivity(telegramId, "adsgram_reward", { creditedPoints: rewardPoints, lifetimePoints: updated.lifetimePoints });
  await awardReferralBonus(telegramId, rewardPoints, "adsgram");

  res.json(
    ClaimAdsgramRewardResponse.parse({
      creditedPoints: rewardPoints,
      lifetimePoints: updated.lifetimePoints,
    }),
  );
});

router.get("/earn/adsgram/postback", rateLimit("postback", 60, 60_000), async (req, res): Promise<void> => {
  const telegramId = typeof req.query.userId === "string" ? req.query.userId : "";
  const secret = typeof req.query.secret === "string" ? req.query.secret : "";

  if (!telegramId) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  const settings = await getSettingsMap();
  const expectedSecret = asString(settings.adsgramPostbackSecret);
  if (!expectedSecret || expectedSecret !== secret) {
    req.log.warn("Rejected Adsgram postback with invalid secret");
    res.status(403).json({ error: "Invalid postback secret" });
    return;
  }

  const txIdRaw = req.query.txId;
  const txId = typeof txIdRaw === "string" && txIdRaw.length > 0 ? txIdRaw : null;
  if (txId) {
    const [claimed] = await db
      .insert(processedTransactionsTable)
      .values({ provider: "adsgram", txId, telegramId })
      .onConflictDoNothing()
      .returning();
    if (!claimed) {
      req.log.info({ txId }, "Skipped duplicate Adsgram postback");
      res.json(ClaimAdsgramRewardResponse.parse({ creditedPoints: 0, lifetimePoints: 0 }));
      return;
    }
  } else {
    req.log.warn("Adsgram postback without transaction id — cannot dedupe replays");
  }

  const rewardPoints = asNumber(settings.adsgramRewardPoints, 100);
  const cooldownSeconds = asNumber(settings.adsgramCooldownSeconds, 30);
  const dailyCap = asNumber(settings.adsgramDailyCap, 20);
  const now = new Date();
  const today = todayStr();
  const cooldownCutoff = new Date(now.getTime() - cooldownSeconds * 1000);

  const [updated] = await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${rewardPoints}`,
      adsWatchedToday: sql`case when ${vaultUsersTable.adsWatchedDate} = ${today} then ${vaultUsersTable.adsWatchedToday} + 1 else 1 end`,
      adsWatchedDate: today,
      lastAdRewardAt: now,
    })
    .where(
      and(
        eq(vaultUsersTable.telegramId, telegramId),
        eq(vaultUsersTable.isBanned, false),
        or(isNull(vaultUsersTable.lastAdRewardAt), lt(vaultUsersTable.lastAdRewardAt, cooldownCutoff)),
        or(
          sql`${vaultUsersTable.adsWatchedDate} is distinct from ${today}`,
          lt(vaultUsersTable.adsWatchedToday, dailyCap),
        ),
      ),
    )
    .returning();

  if (!updated) {
    res.status(400).json({ error: "Unknown/banned user or cooldown/daily cap reached" });
    return;
  }

  req.log.info({ telegramId, rewardPoints }, "Adsgram postback credited");
  await logUserActivity(telegramId, "adsgram_reward", { creditedPoints: rewardPoints, lifetimePoints: updated.lifetimePoints, viaPostback: true });
  await awardReferralBonus(telegramId, rewardPoints, "adsgram", { viaPostback: true });

  res.json(
    ClaimAdsgramRewardResponse.parse({
      creditedPoints: rewardPoints,
      lifetimePoints: updated.lifetimePoints,
    }),
  );
});

const PROVIDER_SETTINGS_KEY: Record<string, string> = {
  cpa: "cpaPostbackSecret",
  monlix: "monlixPostbackSecret",
  bitlabs: "bitlabsPostbackSecret",
};

const MAX_OFFERWALL_CREDIT = 1_000_000; // sanity ceiling per postback

router.get("/earn/offerwall/postback", rateLimit("postback", 60, 60_000), async (req, res): Promise<void> => {
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

  // Idempotency: providers retry postbacks. Dedupe on the provider transaction id
  // when supplied (txId/transId/tx query param); replays are acknowledged but not re-credited.
  const txIdRaw = req.query.txId ?? req.query.transId ?? req.query.tx;
  const txId = typeof txIdRaw === "string" && txIdRaw.length > 0 ? txIdRaw : null;
  if (txId) {
    const [claimed] = await db
      .insert(processedTransactionsTable)
      .values({ provider, txId, telegramId })
      .onConflictDoNothing()
      .returning();
    if (!claimed) {
      req.log.info({ provider, txId }, "Skipped duplicate offerwall postback");
      res.json(OfferwallPostbackResponse.parse({ creditedPoints: 0, lifetimePoints: 0 }));
      return;
    }
  } else {
    req.log.warn({ provider }, "Offerwall postback without transaction id — cannot dedupe replays");
  }

  const creditedPoints = Math.min(Math.round(amount), MAX_OFFERWALL_CREDIT);
  const [updated] = await db
    .update(vaultUsersTable)
    .set({ lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${creditedPoints}` })
    .where(and(eq(vaultUsersTable.telegramId, telegramId), eq(vaultUsersTable.isBanned, false)))
    .returning();

  if (!updated) {
    res.status(400).json({ error: "Unknown or banned user" });
    return;
  }

  req.log.info({ provider, telegramId, creditedPoints }, "Offerwall postback credited");
  await logUserActivity(telegramId, "offerwall_credit", { provider, creditedPoints, lifetimePoints: updated.lifetimePoints });
  await awardReferralBonus(telegramId, creditedPoints, "offerwall", { provider });

  res.json(
    OfferwallPostbackResponse.parse({
      creditedPoints,
      lifetimePoints: updated.lifetimePoints,
    }),
  );
});

export default router;
