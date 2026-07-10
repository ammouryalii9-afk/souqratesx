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

  const verification = await provider.verifyReward(input);
  await bumpStats(provider.key, { totalRequests: 1 });

  if (!verification.verified) {
    await db.insert(providerLogsTable).values({
      providerKey: provider.key,
      event: "verify",
      telegramId: input.telegramId,
      success: false,
      latencyMs: Date.now() - start,
      message: verification.reason ?? "Verification failed",
      payload: input.raw,
    });
    return { ok: false, creditedPoints: 0, lifetimePoints: 0, reason: verification.reason ?? "Verification failed" };
  }

  // Idempotency: (providerKey, txId) can only be claimed once.
  const [claimed] = await db
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

  if (!claimed) {
    logger.info({ provider: provider.key, txId: verification.txId }, "Skipped duplicate reward claim");
    return { ok: true, creditedPoints: 0, lifetimePoints: 0 };
  }

  const result = await provider.rewardUser(input.telegramId, verification.amount, verification.txId);

  if (!result.ok) {
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
    return result;
  }

  await db.insert(providerLogsTable).values({
    providerKey: provider.key,
    event: "reward",
    telegramId: input.telegramId,
    success: true,
    latencyMs: Date.now() - start,
    payload: { creditedPoints: result.creditedPoints },
  });

  await bumpStats(provider.key, { totalRewards: 1, dailyRevenueCents: result.creditedPoints });
  await logUserActivity(input.telegramId, `${provider.key}_reward`, { creditedPoints: result.creditedPoints, lifetimePoints: result.lifetimePoints });
  await awardReferralBonus(input.telegramId, result.creditedPoints, provider.type === "rewarded_ad" ? "adsgram" : "offerwall", {
    provider: provider.key,
  });

  return result;
}
