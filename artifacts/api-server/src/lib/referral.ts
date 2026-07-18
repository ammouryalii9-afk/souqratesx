import { and, eq, isNull, sql } from "drizzle-orm";
import { db, vaultUsersTable, competitionsTable, competitionEntriesTable } from "@workspace/db";
import { getSettingsMap, asNumber } from "./settings";
import { logUserActivity } from "./activityLog";
import { logger } from "./logger";
import { skpRewardFields } from "./skxCredit";

const DEFAULT_REFERRAL_RATE_PERCENT = 10;

const REFERRAL_MILESTONES: Record<number, number> = {
  5: 25_000,
  10: 75_000,
  25: 250_000,
  50: 750_000,
  100: 2_000_000,
};

/**
 * Links a user to their referrer. Idempotent — safe to call on every login.
 * After bumping the referrer's count, also checks active referral-race
 * competitions to auto-award if the target is reached.
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
    .set({
      referralCount: sql`${vaultUsersTable.referralCount} + 1`,
      // $0.02 flat USD credit per verified new referral (stored as cents)
      referralUsdCents: sql`${vaultUsersTable.referralUsdCents} + 2`,
    })
    .where(eq(vaultUsersTable.telegramId, referrerTelegramId))
    .returning({ referralCount: vaultUsersTable.referralCount });

  await logUserActivity(referrerTelegramId, "referral_joined", { referredTelegramId: newTelegramId });

  const newCount = bumped?.referralCount ?? 0;

  // ── Referral milestones ────────────────────────────────────────────────────
  const milestoneBonus = REFERRAL_MILESTONES[newCount];
  if (milestoneBonus) {
    const settings = await getSettingsMap();
    if (settings.referralMilestonesEnabled) {
      await awardReferralMilestone(referrerTelegramId, newCount, milestoneBonus);
    }
  }

  // ── Referral-race competitions: check if referrer just hit the target ──────
  await checkReferralRaceWin(referrerTelegramId, newCount);
}

/**
 * Called after each referral count bump. Checks if the referrer is participating
 * in any active referral-race competition AND has now reached the required invite
 * count. First caller to do so wins — the competition is closed atomically.
 */
async function checkReferralRaceWin(referrerTelegramId: string, currentReferralCount: number): Promise<void> {
  try {
    // Find active referral-race competitions where this user has an entry
    const entries = await db
      .select({
        competitionId: competitionEntriesTable.competitionId,
        referralsAtEntry: competitionEntriesTable.referralsAtEntry,
      })
      .from(competitionEntriesTable)
      .innerJoin(
        competitionsTable,
        and(
          eq(competitionEntriesTable.competitionId, competitionsTable.id),
          eq(competitionsTable.status, "active"),
          eq(competitionsTable.type, "referral"),
        ),
      )
      .where(eq(competitionEntriesTable.telegramId, referrerTelegramId));

    for (const entry of entries) {
      // Fetch the competition's target
      const [comp] = await db
        .select()
        .from(competitionsTable)
        .where(
          and(
            eq(competitionsTable.id, entry.competitionId),
            eq(competitionsTable.status, "active"),
          ),
        );

      if (!comp || !comp.requiredInvites) continue;

      const gained = Math.max(0, currentReferralCount - (entry.referralsAtEntry ?? 0));
      if (gained < comp.requiredInvites) continue;

      // Close competition atomically — only first winner succeeds
      const [closed] = await db
        .update(competitionsTable)
        .set({ status: "closed", winnerTelegramId: referrerTelegramId })
        .where(
          and(
            eq(competitionsTable.id, comp.id),
            eq(competitionsTable.status, "active"), // guard: only one winner
          ),
        )
        .returning();

      if (!closed) continue; // another request already closed it

      // Award prize
      if (comp.prizePoints > 0) {
        await db
          .update(vaultUsersTable)
          .set(skpRewardFields(comp.prizePoints))
          .where(eq(vaultUsersTable.telegramId, referrerTelegramId));
      }

      logger.info(
        { competitionId: comp.id, winner: referrerTelegramId, prize: comp.prizePoints, gained },
        "Referral race won — competition closed",
      );

      // DM the winner
      try {
        const { isTelegramBotConfigured, sendPlainTelegramMessage } = await import("./telegramBot");
        if (isTelegramBotConfigured()) {
          await sendPlainTelegramMessage(
            referrerTelegramId,
            `🏆 مبروك! أنت الفائز بمسابقة "${comp.title}"!\n` +
            `وصلت إلى ${gained} دعوة وحصلت على ${comp.prizePoints.toLocaleString()} SKP 🎉\n\n` +
            `🏆 Congratulations! You won "${comp.title}"!\n` +
            `You reached ${gained} referrals and earned ${comp.prizePoints.toLocaleString()} SKP 🎉`,
          );
        }
      } catch {
        // DM failure never blocks the award
      }
    }
  } catch (err) {
    logger.warn({ err, referrerTelegramId }, "checkReferralRaceWin failed — non-fatal");
  }
}

export async function awardReferralMilestone(referrerTelegramId: string, milestone: number, bonus: number): Promise<void> {
  const [credited] = await db
    .update(vaultUsersTable)
    .set({
      ...skpRewardFields(bonus),
      referralEarnings: sql`${vaultUsersTable.referralEarnings} + ${bonus}`,
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
        `🎉 مبروك! وصلت إلى ${milestone} إحالة وحصلت على مكافأة ${bonus.toLocaleString("en-US")} نقطة SKP! افتح التطبيق لاستلامها.\n\n` +
        `🎉 Congratulations! You reached ${milestone} referrals and earned a ${bonus.toLocaleString("en-US")} SKP bonus! Open the app to claim it.`,
      );
    }
  } catch {
    // DM failure must never block the credit itself.
  }
}

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
      ...skpRewardFields(bonus),
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
