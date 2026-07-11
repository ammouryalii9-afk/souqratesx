import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import { getSessionTelegramId } from "../lib/session";
import { creditedStateSql } from "../lib/weeklyCredit";

const router: IRouter = Router();

// Achievement definitions — conditions checked server-side against real DB values
const ACHIEVEMENT_REWARDS: Record<string, number> = {
  first_tap: 500,
  rookie: 2000,
  silver: 5000,
  gold: 15000,
  millionaire: 50000,
  level5: 10000,
  passive10k: 20000,
  first_referral: 5000,
  five_referrals: 25000,
  ten_referrals: 75000,
  premium: 10000,
  trader: 1000,
  farmer: 3000,
  billionaire: 500000,
};

type UserRow = typeof vaultUsersTable.$inferSelect;

function checkCondition(id: string, user: UserRow, state: Record<string, unknown>): boolean {
  const pts = user.lifetimePoints;
  switch (id) {
    case "first_tap":       return pts > 0;
    case "rookie":          return pts >= 5000;
    case "silver":          return pts >= 25000;
    case "gold":            return pts >= 100000;
    case "millionaire":     return pts >= 1000000;
    case "billionaire":     return pts >= 1000000000;
    case "level5":          return Number(state["miningLevel"]) >= 5;
    case "passive10k": {
      const cards = (state["passiveCards"] as { ptsPerHour?: number }[]) ?? [];
      return cards.reduce((a, c) => a + (c.ptsPerHour ?? 0), 0) >= 10000;
    }
    case "first_referral":  return user.referralCount >= 1;
    case "five_referrals":  return user.referralCount >= 5;
    case "ten_referrals":   return user.referralCount >= 10;
    case "premium":         return user.isPremium && (user.premiumExpiresAt ? user.premiumExpiresAt > new Date() : false);
    case "trader":          return typeof state["selectedExchange"] === "string" && state["selectedExchange"].length > 0;
    case "farmer":          return state["farmState"] === "ready" || Number(state["farmStartTime"]) > 0;
    default:                return false;
  }
}

router.post("/achievements/claim", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { achievementId } = req.body as { achievementId?: string };
  if (!achievementId || !(achievementId in ACHIEVEMENT_REWARDS)) {
    res.status(400).json({ error: "Invalid achievement" });
    return;
  }

  const reward = ACHIEVEMENT_REWARDS[achievementId]!;

  const [user] = await db
    .select()
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.telegramId, telegramId));

  if (!user || user.isBanned) {
    res.status(403).json({ error: "User not found or banned" });
    return;
  }

  const state = (user.state ?? {}) as Record<string, unknown>;
  const claimed: string[] = Array.isArray(state["claimedAchievements"]) ? (state["claimedAchievements"] as string[]) : [];

  if (claimed.includes(achievementId)) {
    res.status(409).json({ error: "Already claimed" });
    return;
  }

  if (!checkCondition(achievementId, user, state)) {
    res.status(403).json({ error: "Condition not met" });
    return;
  }

  const idJson = JSON.stringify([achievementId]);
  // Atomic guard: append the id and credit only if it isn't already present. The second
  // concurrent writer re-evaluates the WHERE against the committed row and updates 0 rows.
  const appended = sql`COALESCE(${vaultUsersTable.state}->'claimedAchievements', '[]'::jsonb) || ${idJson}::jsonb`;
  const updated = await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${reward}`,
      state: creditedStateSql(reward, { claimedAchievements: appended }),
    })
    .where(and(
      eq(vaultUsersTable.telegramId, telegramId),
      sql`NOT (COALESCE(${vaultUsersTable.state}->'claimedAchievements', '[]'::jsonb) @> ${idJson}::jsonb)`,
    ))
    .returning({ lifetimePoints: vaultUsersTable.lifetimePoints });

  if (updated.length === 0) { res.status(409).json({ error: "Already claimed" }); return; }

  res.json({ ok: true, reward, lifetimePoints: updated[0]!.lifetimePoints });
});

export default router;
