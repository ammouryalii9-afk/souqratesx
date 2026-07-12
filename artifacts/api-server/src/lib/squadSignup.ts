import { and, eq, isNull } from "drizzle-orm";
import { db, vaultUsersTable, squadsTable } from "@workspace/db";
import { logUserActivity } from "./activityLog";
import { linkReferrer } from "./referral";

/**
 * Handles a squad invite deep link (`start_param` = `squad_<squadId>`):
 * auto-joins the user to the squad AND credits the squad owner as their referrer,
 * so sharing a squad link grows both the squad's ranking and the owner's referral
 * earnings — the "lightning" viral loop. Safe to call on EVERY login: the squad
 * join only applies if the user is not already in a squad (guard-in-WHERE on
 * `squadId IS NULL` — an invite link never yanks someone out of their current
 * squad), and referrer attribution is idempotent inside `linkReferrer`.
 * No-ops on unknown squads.
 */
export async function joinSquadOnSignup(newTelegramId: string, startParam: string | null | undefined): Promise<void> {
  if (!startParam || !startParam.startsWith("squad_")) return;

  const squadId = Number(startParam.slice(6).trim());
  if (!Number.isInteger(squadId) || squadId <= 0) return;

  const [squad] = await db.select().from(squadsTable).where(eq(squadsTable.id, squadId));
  if (!squad) return;

  const joined = await db
    .update(vaultUsersTable)
    .set({ squadId })
    .where(and(eq(vaultUsersTable.telegramId, newTelegramId), isNull(vaultUsersTable.squadId)))
    .returning({ telegramId: vaultUsersTable.telegramId });

  // Only credit the squad owner as referrer when the user ACTUALLY joined via
  // this invite — a user already in another squad must not get attributed to
  // an unrelated squad's owner just by clicking the link.
  if (joined.length > 0) {
    await logUserActivity(newTelegramId, "squad_joined_via_invite", { squadId });

    // Reuse the referral machinery so the squad owner also gets referral credit/count.
    // Idempotent — no-ops if the user already has a referrer.
    if (squad.ownerId && squad.ownerId !== newTelegramId) {
      await linkReferrer(newTelegramId, `ref_${squad.ownerId}`);
    }
  }
}
