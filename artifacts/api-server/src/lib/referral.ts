import { and, eq, sql } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import { getSettingsMap, asNumber } from "./settings";
import { logUserActivity } from "./activityLog";
import { logger } from "./logger";

const DEFAULT_REFERRAL_RATE_PERCENT = 10;

/**
 * Links a newly-created user to their referrer, parsed from the Telegram
 * `start_param` (format: `ref_<telegramId>`). No-ops on self-referral or an
 * unknown/banned referrer. Safe to call once, right after the referred
 * user's row is inserted.
 */
export async function linkReferrer(newTelegramId: string, startParam: string | null | undefined): Promise<void> {
  if (!startParam || !startParam.startsWith("ref_")) return;

  const referrerTelegramId = startParam.slice(4).trim();
  if (!referrerTelegramId || referrerTelegramId === newTelegramId) return;

  const [referrer] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, referrerTelegramId));
  if (!referrer || referrer.isBanned) return;

  await db.update(vaultUsersTable).set({ referrerId: referrerTelegramId }).where(eq(vaultUsersTable.telegramId, newTelegramId));

  await db
    .update(vaultUsersTable)
    .set({ referralCount: sql`${vaultUsersTable.referralCount} + 1` })
    .where(eq(vaultUsersTable.telegramId, referrerTelegramId));

  await logUserActivity(referrerTelegramId, "referral_joined", { referredTelegramId: newTelegramId });
}

/**
 * Credits the referrer of `earnerTelegramId` (if any) a percentage of a
 * server-verified point credit — real ad views (Adsgram) and completed
 * offerwall tasks (CPA/Monlix/Bitlabs). Not applied to unverified
 * client-side mini-games/daily rewards, which have no real revenue behind
 * them and would otherwise be a trivial multi-account exploit vector.
 */
export async function awardReferralBonus(
  earnerTelegramId: string,
  baseAmount: number,
  source: "adsgram" | "offerwall",
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return;

  const [earner] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, earnerTelegramId));
  if (!earner?.referrerId) return;

  const settings = await getSettingsMap();
  const ratePercent = asNumber(settings.referralRatePercent, DEFAULT_REFERRAL_RATE_PERCENT);
  const bonus = Math.round(baseAmount * (ratePercent / 100));
  if (bonus <= 0) return;

  const [updated] = await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${bonus}`,
      referralEarnings: sql`${vaultUsersTable.referralEarnings} + ${bonus}`,
    })
    .where(and(eq(vaultUsersTable.telegramId, earner.referrerId), eq(vaultUsersTable.isBanned, false)))
    .returning();

  if (!updated) return;

  await logUserActivity(earner.referrerId, "referral_bonus", {
    fromTelegramId: earnerTelegramId,
    source,
    baseAmount,
    bonus,
    ratePercent,
    ...extra,
  });

  logger.info({ referrerId: earner.referrerId, earnerTelegramId, bonus, source }, "Awarded referral bonus");
}
