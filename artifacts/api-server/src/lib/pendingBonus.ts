import { and, eq, gt, sql } from "drizzle-orm";
import { db, vaultUsersTable, type VaultUser } from "@workspace/db";

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
 * Returns the updated row when something was redeemed, else null.
 */
export async function redeemPendingBonus(telegramId: string): Promise<VaultUser | null> {
  const [redeemed] = await db
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
    .returning();
  return redeemed ?? null;
}
