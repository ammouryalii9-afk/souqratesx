import { db, providerLogsTable, rewardTransactionsTable, providerStatisticsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { logUserActivity } from "../lib/activityLog";
import { awardReferralBonus } from "../lib/referral";
import type { EarnProvider, RewardResult, RewardVerifyInput } from "./types";

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

async function bumpStats(providerKey: string, patch: { totalRequests?: number; totalRewards?: number; dailyRevenueCents?: number }) {
  try {
    const date = todayStr();
    await db
      .insert(providerStatisticsTable)
      .values({
        providerKey,
        date,
        totalRequests: patch.totalRequests ?? 0,
        totalRewards: patch.totalRewards ?? 0,
        dailyRevenueCents: patch.dailyRevenueCents ?? 0,
      })
      .onConflictDoUpdate({
        target: [providerStatisticsTable.providerKey, providerStatisticsTable.date],
        set: {
          totalRequests: sql`${providerStatisticsTable.totalRequests} + ${patch.totalRequests ?? 0}`,
          totalRewards: sql`${providerStatisticsTable.totalRewards} + ${patch.totalRewards ?? 0}`,
          dailyRevenueCents: sql`${providerStatisticsTable.dailyRevenueCents} + ${patch.dailyRevenueCents ?? 0}`,
        },
      });
  } catch (err) {
    logger.warn({ err, providerKey }, "bumpStats failed (non-critical)");
  }
}

/**
 * Provider-independent reward crediting pipeline: verifies the claim/callback
 * against the provider, de-dupes on (providerKey, txId), credits the user,
 * logs everything, and awards referral bonuses. This is the ONLY place that
 * should write to `reward_transactions`/`provider_logs`.
 */
export async function processReward(
  provider: EarnProvider,
  input: RewardVerifyInput,
): Promise<RewardResult> {
  const start = Date.now();

  // ── 1. Verify the reward claim ─────────────────────────────────────────────
  let verification: Awaited<ReturnType<EarnProvider["verifyReward"]>>;
  try {
    verification = await provider.verifyReward(input);
  } catch (err) {
    logger.error({ err, provider: provider.key }, "verifyReward threw");
    return { ok: false, creditedPoints: 0, lifetimePoints: 0, reason: "Provider verification error" };
  }

  await bumpStats(provider.key, { totalRequests: 1 });

  if (!verification.verified) {
    try {
      await db.insert(providerLogsTable).values({
        providerKey: provider.key,
        event: "verify",
        telegramId: input.telegramId,
        success: false,
        latencyMs: Date.now() - start,
        message: verification.reason ?? "Verification failed",
        payload: input.raw,
      });
    } catch (err) {
      logger.warn({ err }, "providerLog insert failed (non-critical)");
    }
    return { ok: false, creditedPoints: 0, lifetimePoints: 0, reason: verification.reason ?? "Verification failed" };
  }

  // ── 2. Idempotency: (providerKey, txId) can only be claimed once ───────────
  let claimed: typeof rewardTransactionsTable.$inferSelect | undefined;
  try {
    const [row] = await db
      .insert(rewardTransactionsTable)
      .values({
        providerKey: provider.key,
        telegramId: input.telegramId,
        txId: verification.txId,
        amount: verification.amount,
        status: "credited",
      })
      .onConflictDoNothing()
      .returning();
    claimed = row;
  } catch (err) {
    logger.error({ err, provider: provider.key, txId: verification.txId }, "reward_transactions insert failed");
    return { ok: false, creditedPoints: 0, lifetimePoints: 0, reason: "Internal error recording transaction" };
  }

  if (!claimed) {
    logger.info({ provider: provider.key, txId: verification.txId }, "Skipped duplicate reward claim");
    return { ok: true, creditedPoints: 0, lifetimePoints: 0 };
  }

  // ── 3. Credit the user ─────────────────────────────────────────────────────
  let result: RewardResult;
  try {
    result = await provider.rewardUser(input.telegramId, verification.amount, verification.txId);
  } catch (err) {
    logger.error({ err, provider: provider.key, telegramId: input.telegramId }, "rewardUser threw");
    try {
      await db
        .update(rewardTransactionsTable)
        .set({ status: "failed" })
        .where(and(eq(rewardTransactionsTable.providerKey, provider.key), eq(rewardTransactionsTable.txId, verification.txId)));
    } catch { /* best-effort */ }
    return { ok: false, creditedPoints: 0, lifetimePoints: 0, reason: "Error crediting user" };
  }

  if (!result.ok) {
    try {
      await db
        .update(rewardTransactionsTable)
        .set({ status: "failed" })
        .where(and(eq(rewardTransactionsTable.providerKey, provider.key), eq(rewardTransactionsTable.txId, verification.txId)));
      await db.insert(providerLogsTable).values({
        providerKey: provider.key,
        event: "reward",
        telegramId: input.telegramId,
        success: false,
        latencyMs: Date.now() - start,
        message: result.reason ?? "Reward crediting failed",
        payload: input.raw,
      });
    } catch (err) {
      logger.warn({ err }, "providerLog/txn update failed (non-critical)");
    }
    return result;
  }

  // ── 4. Fire-and-forget logging + referral bonus (non-critical) ────────────
  try {
    await db.insert(providerLogsTable).values({
      providerKey: provider.key,
      event: "reward",
      telegramId: input.telegramId,
      success: true,
      latencyMs: Date.now() - start,
      payload: { creditedPoints: result.creditedPoints },
    });
  } catch (err) {
    logger.warn({ err }, "providerLog insert failed (non-critical)");
  }

  await bumpStats(provider.key, { totalRewards: 1, dailyRevenueCents: result.creditedPoints });

  try {
    await logUserActivity(input.telegramId, `${provider.key}_reward`, { creditedPoints: result.creditedPoints, lifetimePoints: result.lifetimePoints });
  } catch (err) {
    logger.warn({ err }, "logUserActivity failed (non-critical)");
  }

  try {
    await awardReferralBonus(input.telegramId, result.creditedPoints, provider.type === "rewarded_ad" ? "adsgram" : "offerwall", {
      provider: provider.key,
    });
  } catch (err) {
    logger.warn({ err }, "awardReferralBonus failed (non-critical)");
  }

  return result;
}
