import { db, providerLogsTable, rewardTransactionsTable, providerStatisticsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { logUserActivity } from "../lib/activityLog";
import { awardReferralBonus } from "../lib/referral";
import { bumpCycleAdRevenue } from "../lib/skxCredit";
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

  // Feed the active pixel cycle's ad-revenue pool (dividends are a % of this).
  await bumpCycleAdRevenue(result.creditedPoints);

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

  // ── Squad rank bonus: top-squad members earn a % bonus on verified rewards ─
  void awardSquadRankBonus(input.telegramId, result.creditedPoints);

  return result;
}

// 5-min cache of top squad IDs to avoid a leaderboard query on every ad reward.
let _topSquadCache: { ids: number[]; expiry: number } | null = null;

async function getTopSquadIds(): Promise<number[]> {
  if (_topSquadCache && _topSquadCache.expiry > Date.now()) return _topSquadCache.ids;
  try {
    const { db, squadsTable, vaultUsersTable } = await import("@workspace/db");
    const { desc, sql: drizzleSql, and, eq } = await import("drizzle-orm");
    const rows = await db
      .select({ id: squadsTable.id })
      .from(squadsTable)
      .leftJoin(vaultUsersTable, and(eq(vaultUsersTable.squadId, squadsTable.id), eq(vaultUsersTable.isBanned, false)))
      .groupBy(squadsTable.id)
      .having(drizzleSql`count(${vaultUsersTable.id}) > 0`)
      .orderBy(desc(drizzleSql`coalesce(sum(${vaultUsersTable.lifetimePoints}), 0)`))
      .limit(3);
    const ids = rows.map((r) => r.id);
    _topSquadCache = { ids, expiry: Date.now() + 5 * 60 * 1000 };
    return ids;
  } catch {
    return [];
  }
}

async function awardSquadRankBonus(telegramId: string, basePoints: number): Promise<void> {
  try {
    const { getSettingsMap, asNumber } = await import("../lib/settings");
    const settings = await getSettingsMap();
    if (!settings.squadRankBonusEnabled) return;
    const bonusPct = asNumber(settings.squadRankBonusPercent, 20);
    if (bonusPct <= 0) return;

    const { db, vaultUsersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select({ squadId: vaultUsersTable.squadId }).from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
    if (!user?.squadId) return;

    const topIds = await getTopSquadIds();
    if (!topIds.includes(user.squadId)) return;

    const bonus = Math.floor(basePoints * bonusPct / 100);
    if (bonus <= 0) return;

    const { sql } = await import("drizzle-orm");
    await db.update(vaultUsersTable)
      .set({
        pendingBonusPoints: sql`${vaultUsersTable.pendingBonusPoints} + ${bonus}`,
        lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${bonus}`,
      })
      .where(eq(vaultUsersTable.telegramId, telegramId));
    logger.info({ telegramId, bonus, bonusPct }, "Squad rank bonus awarded");
  } catch (err) {
    logger.warn({ err }, "awardSquadRankBonus failed (non-critical)");
  }
}
