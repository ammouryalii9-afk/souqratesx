import { and, eq, isNull, sql } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import { getSettingsMap, asNumber } from "./settings";
import { logUserActivity } from "./activityLog";
import { logger } from "./logger";
import { creditedStateSql } from "./weeklyCredit";

const DEFAULT_REFERRAL_RATE_PERCENT = 10;

// One-time bonuses when a referrer's TOTAL invite count crosses a milestone.
// Fired exactly once per milestone: referralCount increments atomically by 1,
// so exactly one concurrent linkReferrer call sees the returned count equal
// to a milestone value.
const REFERRAL_MILESTONES: Record<number, number> = {
  5: 25_000,
  10: 75_000,
  25: 250_000,
  50: 750_000,
  100: 2_000_000,
};

/**
 * Links a user to their referrer, parsed from the Telegram `start_param`
 * (format: `ref_<telegramId>`). Idempotent and abuse-safe: the referrer is
 * set at most ONCE per account ever (guard-in-WHERE on `referrerId IS NULL`),
 * so it is safe to call on EVERY login — an existing account clicking a
 * referral link gets attributed on their next open, but an already-attributed
 * account can never switch referrers or double-count. No-ops on
 * self-referral or an unknown/banned referrer.
 */
export async function linkReferrer(newTelegramId: string, startParam: string | null | undefined): Promise<void> {
  if (!startParam || !startParam.startsWith("ref_")) return;

  const referrerTelegramId = startParam.slice(4).trim();
  if (!referrerTelegramId || referrerTelegramId === newTelegramId) return;

  const [referrer] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, referrerTelegramId));
  if (!referrer || referrer.isBanned) return;

  const linked = await db
    .update(vaultUsersTable)
    .set({ referrerId: referrerTelegramId })
    .where(and(eq(vaultUsersTable.telegramId, newTelegramId), isNull(vaultUsersTable.referrerId)))
    .returning({ telegramId: vaultUsersTable.telegramId });

  if (linked.length === 0) return;

  const [bumped] = await db
    .update(vaultUsersTable)
    .set({ referralCount: sql`${vaultUsersTable.referralCount} + 1` })
    .where(eq(vaultUsersTable.telegramId, referrerTelegramId))
    .returning({ referralCount: vaultUsersTable.referralCount });

  await logUserActivity(referrerTelegramId, "referral_joined", { referredTelegramId: newTelegramId });

  const newCount = bumped?.referralCount ?? 0;
  const milestoneBonus = REFERRAL_MILESTONES[newCount];
  if (milestoneBonus) {
    await awardReferralMilestone(referrerTelegramId, newCount, milestoneBonus);
  }
}

/**
 * Credits a one-time referral milestone bonus (lifetime + weekly + pending
 * spendable). The spendable share goes through pendingBonusPoints (redeemed at
 * the referrer's next hydration) instead of state.tempMiningPoints directly —
 * if the referrer is online right now, their debounced PUT /vault/me would
 * silently erase a direct tempMiningPoints write.
 */
async function awardReferralMilestone(referrerTelegramId: string, milestone: number, bonus: number): Promise<void> {
  const [credited] = await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${bonus}`,
      referralEarnings: sql`${vaultUsersTable.referralEarnings} + ${bonus}`,
      pendingBonusPoints: sql`${vaultUsersTable.pendingBonusPoints} + ${bonus}`,
      state: creditedStateSql(bonus, {}, { toSpendable: false }),
    })
    .where(and(eq(vaultUsersTable.telegramId, referrerTelegramId), eq(vaultUsersTable.isBanned, false)))
    .returning({ telegramId: vaultUsersTable.telegramId });

  if (!credited) return;

  await logUserActivity(referrerTelegramId, "referral_milestone", { milestone, bonus });
  logger.info({ referrerTelegramId, milestone, bonus }, "Awarded referral milestone bonus");

  try {
    const { isTelegramBotConfigured, sendPlainTelegramMessage } = await import("./telegramBot");
    if (isTelegramBotConfigured()) {
      await sendPlainTelegramMessage(
        referrerTelegramId,
        `🎉 مبروك! وصلت إلى ${milestone} إحالة وحصلت على مكافأة ${bonus.toLocaleString("en-US")} نقطة!`,
      );
    }
  } catch {
    // DM failure must never block the credit itself.
  }
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
  source: "adsgram" | "offerwall" | "sponsored_ad",
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
