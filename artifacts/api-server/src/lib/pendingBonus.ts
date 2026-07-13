import { and, eq, gt, sql } from "drizzle-orm";
import { db, vaultUsersTable, type VaultUser } from "@workspace/db";

/**
 * Legacy safety net. Server-granted bonuses (weekly prizes, referral
 * milestones) are now credited DIRECTLY to the server-authoritative
 * `skx_balance` column, so nothing new ever lands in `pending_bonus_points`.
 * This fold remains only to catch any stragglers written by an old code path
 * mid-deploy: it moves them into skx_balance atomically (guard-in-WHERE —
 * concurrent calls redeem exactly once). Safe to call at any time since the
 * client never writes skx_balance.
 *
 * Returns the updated row when something was redeemed, else null.
 */
export async function redeemPendingBonus(telegramId: string): Promise<VaultUser | null> {
  const [redeemed] = await db
    .update(vaultUsersTable)
    .set({
      skxBalance: sql`${vaultUsersTable.skxBalance} + ${vaultUsersTable.pendingBonusPoints}`,
      pendingBonusPoints: 0,
    })
    .where(and(eq(vaultUsersTable.telegramId, telegramId), gt(vaultUsersTable.pendingBonusPoints, 0)))
    .returning();
  return redeemed ?? null;
}
