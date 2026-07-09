import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, sponsoredAdsTable, adClaimsTable, vaultUsersTable } from "@workspace/db";
import { GetAdsResponse, ClaimAdResponse } from "@workspace/api-zod";
import { getSessionTelegramId } from "../lib/session";
import { rateLimit } from "../lib/rateLimit";
import { logUserActivity } from "../lib/activityLog";
import { awardReferralBonus } from "../lib/referral";

const router: IRouter = Router();

router.get("/ads", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const ads = await db.select().from(sponsoredAdsTable).where(eq(sponsoredAdsTable.isActive, true));
  const claims = await db.select({ adId: adClaimsTable.adId }).from(adClaimsTable).where(eq(adClaimsTable.telegramId, telegramId));
  const claimedIds = new Set(claims.map((c) => c.adId));

  res.json(
    GetAdsResponse.parse(
      ads.map((ad) => ({
        id: ad.id,
        title: ad.title,
        description: ad.description,
        imageUrl: ad.imageUrl,
        linkUrl: ad.linkUrl,
        rewardPoints: ad.rewardPoints,
        claimed: claimedIds.has(ad.id),
      })),
    ),
  );
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

  const [claim] = await db.insert(adClaimsTable).values({ adId, telegramId }).onConflictDoNothing().returning();
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
