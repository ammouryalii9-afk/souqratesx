import { Router, type IRouter } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, sponsoredAdsTable, adClaimsTable, vaultUsersTable } from "@workspace/db";
import { GetAdsResponse, ClaimAdResponse, StartAdResponse } from "@workspace/api-zod";
import { getSessionTelegramId } from "../lib/session";
import { rateLimit } from "../lib/rateLimit";
import { logUserActivity } from "../lib/activityLog";
import { awardReferralBonus } from "../lib/referral";
import { getSettingsMap, asNumber } from "../lib/settings";

const router: IRouter = Router();

const DEFAULT_AD_MIN_WATCH_SECONDS = 15;

async function getAdMinWatchSeconds(): Promise<number> {
  const settings = await getSettingsMap();
  return Math.max(0, asNumber(settings.adMinWatchSeconds, DEFAULT_AD_MIN_WATCH_SECONDS));
}

router.get("/ads", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const minWatchSeconds = await getAdMinWatchSeconds();
  const ads = await db.select().from(sponsoredAdsTable).where(eq(sponsoredAdsTable.isActive, true));
  const claims = await db
    .select({ adId: adClaimsTable.adId, startedAt: adClaimsTable.startedAt, claimedAt: adClaimsTable.claimedAt })
    .from(adClaimsTable)
    .where(eq(adClaimsTable.telegramId, telegramId));
  const claimsByAdId = new Map(claims.map((c) => [c.adId, c]));

  res.json(
    GetAdsResponse.parse(
      ads.map((ad) => {
        const claim = claimsByAdId.get(ad.id);
        return {
          id: ad.id,
          title: ad.title,
          description: ad.description,
          imageUrl: ad.imageUrl,
          linkUrl: ad.linkUrl,
          rewardPoints: ad.rewardPoints,
          claimed: Boolean(claim?.claimedAt),
          minWatchSeconds,
          startedAt: claim && !claim.claimedAt ? claim.startedAt.toISOString() : null,
        };
      }),
    ),
  );
});

// Records that the user opened the ad's link, starting the server-side minimum
// watch-time window. This "condition" applies uniformly to every sponsored ad
// (existing and future) since it lives here rather than per-ad — /claim below
// refuses to credit points until this window has elapsed.
router.post("/ads/:id/start", rateLimit("ads-start", 30, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const adId = Number(req.params.id);
  if (!Number.isFinite(adId)) {
    res.status(400).json({ error: "Invalid ad id" });
    return;
  }

  const [ad] = await db.select().from(sponsoredAdsTable).where(and(eq(sponsoredAdsTable.id, adId), eq(sponsoredAdsTable.isActive, true)));
  if (!ad) {
    res.status(400).json({ error: "Ad not found or inactive" });
    return;
  }

  const minWatchSeconds = await getAdMinWatchSeconds();

  const existing = await db.select().from(adClaimsTable).where(and(eq(adClaimsTable.adId, adId), eq(adClaimsTable.telegramId, telegramId)));
  if (existing[0]) {
    if (existing[0].claimedAt) {
      res.status(400).json({ error: "Ad already claimed" });
      return;
    }
    res.json(StartAdResponse.parse({ startedAt: existing[0].startedAt.toISOString(), minWatchSeconds }));
    return;
  }

  const [started] = await db.insert(adClaimsTable).values({ adId, telegramId }).onConflictDoNothing().returning();
  if (!started) {
    // Lost a race with a concurrent /start call; fetch the row it created.
    const [row] = await db.select().from(adClaimsTable).where(and(eq(adClaimsTable.adId, adId), eq(adClaimsTable.telegramId, telegramId)));
    if (!row) {
      res.status(400).json({ error: "Could not start ad" });
      return;
    }
    res.json(StartAdResponse.parse({ startedAt: row.startedAt.toISOString(), minWatchSeconds }));
    return;
  }

  res.json(StartAdResponse.parse({ startedAt: started.startedAt.toISOString(), minWatchSeconds }));
});

router.post("/ads/:id/claim", rateLimit("ads-claim", 30, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const adId = Number(req.params.id);
  if (!Number.isFinite(adId)) {
    res.status(400).json({ error: "Invalid ad id" });
    return;
  }

  const [ad] = await db.select().from(sponsoredAdsTable).where(and(eq(sponsoredAdsTable.id, adId), eq(sponsoredAdsTable.isActive, true)));
  if (!ad) {
    res.status(400).json({ error: "Ad not found or inactive" });
    return;
  }

  const [view] = await db.select().from(adClaimsTable).where(and(eq(adClaimsTable.adId, adId), eq(adClaimsTable.telegramId, telegramId)));
  if (!view) {
    res.status(429).json({ error: "Open the ad before claiming the reward" });
    return;
  }
  if (view.claimedAt) {
    res.status(400).json({ error: "Ad already claimed" });
    return;
  }

  const minWatchSeconds = await getAdMinWatchSeconds();
  const elapsedSeconds = (Date.now() - view.startedAt.getTime()) / 1000;
  if (elapsedSeconds < minWatchSeconds) {
    res.status(429).json({ error: `Please view the ad for at least ${minWatchSeconds} seconds before claiming` });
    return;
  }

  const [claim] = await db
    .update(adClaimsTable)
    .set({ claimedAt: new Date() })
    .where(and(eq(adClaimsTable.adId, adId), eq(adClaimsTable.telegramId, telegramId), isNull(adClaimsTable.claimedAt)))
    .returning();
  if (!claim) {
    res.status(400).json({ error: "Ad already claimed" });
    return;
  }

  const [updated] = await db
    .update(vaultUsersTable)
    .set({ lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${ad.rewardPoints}` })
    .where(and(eq(vaultUsersTable.telegramId, telegramId), eq(vaultUsersTable.isBanned, false)))
    .returning();

  if (!updated) {
    res.status(403).json({ error: "This account has been banned" });
    return;
  }

  await logUserActivity(telegramId, "sponsored_ad_claim", { adId, creditedPoints: ad.rewardPoints, lifetimePoints: updated.lifetimePoints });
  await awardReferralBonus(telegramId, ad.rewardPoints, "sponsored_ad", { adId });

  res.json(
    ClaimAdResponse.parse({
      creditedPoints: ad.rewardPoints,
      lifetimePoints: updated.lifetimePoints,
    }),
  );
});

export default router;
