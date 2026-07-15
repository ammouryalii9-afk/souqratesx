import { sql } from "drizzle-orm";
import { db, vaultUsersTable, pixelCyclesTable } from "@workspace/db";
import { creditedStateSql } from "./weeklyCredit";
import { logger } from "./logger";

/**
 * SKX — the hard/withdrawable currency — is credited ONLY by verified server
 * paths (ad rewards, offerwall postbacks, sponsored ad claims, partner tasks,
 * referral bonuses, weekly prizes, pixel dividends, SKP→SKX conversion).
 *
 * This helper builds the standard `.set()` fields for an SKX credit:
 *  - skx_balance += amount        (the spendable/withdrawable balance)
 *  - lifetime_points += amount    (leaderboard-only total)
 *  - state.weeklyPoints += amount (weekly race, via creditedStateSql — with
 *    toSpendable:false so nothing touches the client-synced tempMiningPoints)
 *
 * skx_balance is a real column the client NEVER writes, so any server path can
 * credit it directly — no pendingBonusPoints dance needed (that mechanism
 * existed only because the old spendable balance lived inside the
 * client-synced state JSONB).
 *
 * Callers keep their own WHERE guards (banned check, cooldowns, idempotency).
 */
export function skxCreditFields(amount: number, statePatches: Record<string, string | number> = {}) {
  return {
    skxBalance: sql`${vaultUsersTable.skxBalance} + ${amount}::bigint`,
    lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${amount}`,
    state: creditedStateSql(amount, statePatches, { toSpendable: false }),
  };
}

/**
 * SKP reward credit — ALL platform rewards (ad views, offerwall tasks, partner
 * tasks, referral bonuses/milestones, squad bonuses/milestones, weekly prizes)
 * are soft-currency SKP, never directly withdrawable.
 *
 * Because state.tempMiningPoints is client-synced (an online client's debounced
 * PUT /vault/me would erase a direct write), the reward lands in the
 * server-only `pending_bonus_points` column; redeemPendingBonus() folds it into
 * state.tempMiningPoints atomically at the next hydration (auth / GET
 * /vault/me) with a claimSeq bump so stale in-flight syncs are dropped.
 *
 *  - pending_bonus_points += amount (delivered as SKP at hydration)
 *  - lifetime_points += amount      (leaderboard-only total)
 *  - state.weeklyPoints += amount   (weekly race, toSpendable:false — the SKP
 *    itself arrives via the pending redemption, not here)
 *
 * Callers keep their own WHERE guards (banned check, cooldowns, idempotency).
 */
export function skpRewardFields(amount: number, statePatches: Record<string, string | number> = {}) {
  return {
    pendingBonusPoints: sql`${vaultUsersTable.pendingBonusPoints} + ${amount}`,
    lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${amount}`,
    state: creditedStateSql(amount, statePatches, { toSpendable: false }),
  };
}

/**
 * Adds a verified ad/offerwall SKX credit to the ACTIVE pixel cycle's running
 * ad-revenue counter. The dividend pool at cycle close = this counter ×
 * pixelDividendPercent / 100. Fire-and-forget: a missing active cycle (or a
 * transient error) must never block the user's reward.
 */
export async function bumpCycleAdRevenue(amountSkx: number): Promise<void> {
  if (!Number.isFinite(amountSkx) || amountSkx <= 0) return;
  try {
    await db
      .update(pixelCyclesTable)
      .set({ totalAdRevenueSkx: sql`${pixelCyclesTable.totalAdRevenueSkx} + ${amountSkx}::bigint` })
      .where(sql`${pixelCyclesTable.status} = 'active'`);
  } catch (err) {
    logger.warn({ err, amountSkx }, "bumpCycleAdRevenue failed (non-critical)");
  }
}
