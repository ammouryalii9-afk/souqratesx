import { eq } from "drizzle-orm";
import { db, vaultUsersTable, squadsTable } from "@workspace/db";
import { logUserActivity } from "./activityLog";
import { linkReferrer } from "./referral";

/**
 * Handles a squad invite deep link (`start_param` = `squad_<squadId>`) at signup:
 * auto-joins the new user to the squad AND credits the squad owner as their referrer,
 * so sharing a squad link grows both the squad's ranking and the owner's referral
 * earnings — the "lightning" viral loop. No-ops on unknown squads. Safe to call once,
 * right after the referred user's row is inserted.
 */
export async function joinSquadOnSignup(newTelegramId: string, startParam: string | null | undefined): Promise<void> {
  if (!startParam || !startParam.startsWith("squad_")) return;

  const squadId = Number(startParam.slice(6).trim());
  if (!Number.isInteger(squadId) || squadId <= 0) return;

  const [squad] = await db.select().from(squadsTable).where(eq(squadsTable.id, squadId));
  if (!squad) return;

  await db.update(vaultUsersTable).set({ squadId }).where(eq(vaultUsersTable.telegramId, newTelegramId));
  await logUserActivity(newTelegramId, "squad_joined_via_invite", { squadId });

  // Reuse the referral machinery so the squad owner also gets referral credit/count.
  if (squad.ownerId && squad.ownerId !== newTelegramId) {
    await linkReferrer(newTelegramId, `ref_${squad.ownerId}`);
  }
}
