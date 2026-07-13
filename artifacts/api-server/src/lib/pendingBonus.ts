import { and, eq, gt, sql } from "drizzle-orm";
import { db, vaultUsersTable, type VaultUser } from "@workspace/db";

/**
 * Folds any server-granted bonus (weekly prize, referral milestone) sitting in
 * `pending_bonus_points` into the spendable `state.tempMiningPoints`, atomically
 * (single UPDATE, guard-in-WHERE — concurrent calls redeem exactly once).
 *
 * MUST only be called at hydration moments (auth login, GET /vault/me): those are
 * the only points where the client is about to overwrite its local state with the
 * server's, so the folded-in bonus survives. Folding it in at any other time races
 * with the debounced client PUT /vault/me, which sends stale tempMiningPoints
 * verbatim and would erase the credit.
 *
 * Returns the updated row when something was redeemed, else null.
 */
export async function redeemPendingBonus(telegramId: string): Promise<VaultUser | null> {
  const S = vaultUsersTable.state;
  const [redeemed] = await db
    .update(vaultUsersTable)
    .set({
      state: sql`jsonb_set(coalesce(${S}, '{}'::jsonb), '{tempMiningPoints}', to_jsonb(COALESCE((${S}->>'tempMiningPoints')::numeric, 0) + ${vaultUsersTable.pendingBonusPoints}::numeric))`,
      pendingBonusPoints: 0,
    })
    .where(and(eq(vaultUsersTable.telegramId, telegramId), gt(vaultUsersTable.pendingBonusPoints, 0)))
    .returning();
  return redeemed ?? null;
}
