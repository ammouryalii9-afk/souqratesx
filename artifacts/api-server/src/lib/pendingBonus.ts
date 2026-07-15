import { and, eq, getTableColumns, gt, sql } from "drizzle-orm";
import { db, vaultUsersTable, type VaultUser } from "@workspace/db";

export interface RedeemedBonus {
  user: VaultUser;
  /** The SKP amount folded into state.tempMiningPoints by this call. */
  amount: number;
}

/**
 * Folds `pending_bonus_points` into `state.tempMiningPoints` (SKP — spendable,
 * non-withdrawable). Called at every hydration point (auth + GET /vault/me) so
 * the client always receives the updated state before its next PUT /vault/me.
 *
 * Atomic guard-in-WHERE (pending_bonus_points > 0) ensures exactly-once
 * delivery even under concurrent calls. `claimSeq` is bumped so any in-flight
 * PUT /vault/me carrying stale tempMiningPoints is rejected and the client
 * re-syncs with the correct value.
 *
 * The redeemed amount is read via a RETURNING subquery, which evaluates
 * against the statement's pre-update snapshot — i.e. the OLD pending value.
 *
 * Returns the updated row + redeemed amount when something was redeemed, else null.
 */
export async function redeemPendingBonus(telegramId: string): Promise<RedeemedBonus | null> {
  const [row] = await db
    .update(vaultUsersTable)
    .set({
      state: sql`jsonb_set(
        jsonb_set(
          COALESCE(${vaultUsersTable.state}, '{}'::jsonb),
          '{tempMiningPoints}',
          to_jsonb(
            COALESCE((${vaultUsersTable.state}->>'tempMiningPoints')::bigint, 0)
            + ${vaultUsersTable.pendingBonusPoints}
          )
        ),
        '{claimSeq}',
        to_jsonb(COALESCE((${vaultUsersTable.state}->>'claimSeq')::int, 0) + 1)
      )`,
      pendingBonusPoints: 0,
    })
    .where(and(eq(vaultUsersTable.telegramId, telegramId), gt(vaultUsersTable.pendingBonusPoints, 0)))
    .returning({
      ...getTableColumns(vaultUsersTable),
      redeemedAmount: sql<number>`(SELECT vu.pending_bonus_points FROM vault_users vu WHERE vu.telegram_id = ${telegramId})::int`,
    });
  if (!row) return null;
  const { redeemedAmount, ...user } = row;
  return { user: user as VaultUser, amount: Number(redeemedAmount) || 0 };
}
