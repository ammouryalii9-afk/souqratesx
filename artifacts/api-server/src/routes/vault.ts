import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { rateLimit } from "../lib/rateLimit";
import { db, vaultUsersTable } from "@workspace/db";
import {
  UpdateVaultMeBody,
  GetVaultMeResponse,
  UpdateVaultMeResponse,
  GetVaultLeaderboardResponse,
} from "@workspace/api-zod";
import { getSessionTelegramId } from "../lib/session";
import { getSettingsMap, asNumber } from "../lib/settings";
import { weekKey } from "../lib/weeklyCredit";

const router: IRouter = Router();

// Generous ceiling covering tap-mining + all passive cards at high levels + mini-games.
// Anything above this per-sync window is treated as implausible and clamped server-side,
// closing the "client just sends a huge lifetimePoints number" exploit while still letting
// legitimate fast progression through (admin-tunable via admin_settings.maxPointsPerHourCap).
const DEFAULT_MAX_POINTS_PER_HOUR = 3_000_000;
const MIN_SYNC_WINDOW_SECONDS = 5; // first-ever sync / very fast repeats still get a small grace window

// State keys that are credited/tracked server-side only (streak, mystery boxes, daily
// missions, achievements, weekly ranking). The client must NEVER be trusted for these:
// merging them from the stored server value both blocks tampering AND stops the debounced
// PUT /vault/me sync from clobbering a reward the user just claimed via /engage or /achievements.
const PROTECTED_STATE_KEYS = [
  "lastStreakClaimDate",
  "streakCount",
  "lastFreeBoxAt",
  "lastBoxDate",
  "adBoxDate",
  "adBoxesOpenedToday",
  "challengeClaimedDate",
  "claimedAchievements",
  "weeklyPoints",
  "weekKey",
];

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

async function computeMaxAllowedDelta(lastSyncAt: Date | null): Promise<number> {
  const settings = await getSettingsMap();
  const capPerHour = asNumber(settings.maxPointsPerHourCap, DEFAULT_MAX_POINTS_PER_HOUR);
  const capPerSecond = capPerHour / 3600;
  const elapsedSeconds = lastSyncAt
    ? Math.max(MIN_SYNC_WINDOW_SECONDS, (Date.now() - lastSyncAt.getTime()) / 1000)
    : 60 * 60; // no prior sync on record: allow up to one hour worth as a one-time grace amount
  return Math.ceil(capPerSecond * elapsedSeconds);
}

router.get("/vault/me", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(
    GetVaultMeResponse.parse({
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        lifetimePoints: user.lifetimePoints,
        referralCount: user.referralCount,
        referralEarnings: user.referralEarnings,
      },
      state: user.state,
    }),
  );
});

router.put("/vault/me", rateLimit("vault-sync", 60, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = UpdateVaultMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!existing) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (existing.isBanned) {
    res.status(403).json({ error: "This account has been banned" });
    return;
  }

  const requestedLifetimePoints = parsed.data.lifetimePoints;
  const requestedDelta = requestedLifetimePoints - existing.lifetimePoints;

  let finalLifetimePoints = existing.lifetimePoints;
  let finalState = parsed.data.state;

  if (requestedDelta <= 0) {
    // Never let the client decrease lifetimePoints (e.g. a stale/racing sync) — keep the higher server value.
    finalLifetimePoints = existing.lifetimePoints;
  } else {
    const maxAllowedDelta = await computeMaxAllowedDelta(existing.lastPointsSyncAt);
    if (requestedDelta > maxAllowedDelta) {
      req.log.warn(
        { telegramId, requestedDelta, maxAllowedDelta, requestedLifetimePoints, previous: existing.lifetimePoints },
        "clamped implausible lifetimePoints increase from client",
      );
      finalLifetimePoints = existing.lifetimePoints + maxAllowedDelta;
    } else {
      finalLifetimePoints = requestedLifetimePoints;
    }
  }

  // Merge protected (server-authoritative) state keys from the stored value, ignoring the client.
  const existingState = (existing.state ?? {}) as Record<string, unknown>;
  const mergedState = { ...(finalState as Record<string, unknown>) };
  for (const k of PROTECTED_STATE_KEYS) {
    if (existingState[k] !== undefined) mergedState[k] = existingState[k];
    else delete mergedState[k];
  }

  // One-time welcome reward flag is monotonic: once true on the server it can
  // never be flipped back to false by a stale/tampered client, but the first
  // legitimate claim (false -> true) is still accepted. Prevents re-claiming
  // the welcome bonus across devices/sessions.
  if (existingState["hasClaimedWelcome"] === true) {
    mergedState["hasClaimedWelcome"] = true;
  }

  // Progression fields are monotonic: a stale session (second device, old tab,
  // reopened WebView) must never downgrade what the server already recorded —
  // these upgrades cost points that were already spent. tempMiningPoints is
  // intentionally NOT clamped: spending legitimately lowers it.
  for (const k of ["miningLevel", "maxEnergy", "permanentMultiplierPercent"]) {
    const prev = num(existingState[k]);
    if (prev > num(mergedState[k])) mergedState[k] = prev;
  }

  // Purchased cosmetics survive stale syncs: union of client + server lists.
  for (const k of ["ownedSkinIds", "ownedBadgeIds"]) {
    const prev = Array.isArray(existingState[k]) ? (existingState[k] as unknown[]) : [];
    const next = Array.isArray(mergedState[k]) ? (mergedState[k] as unknown[]) : [];
    if (prev.length > 0) mergedState[k] = [...new Set([...next, ...prev])];
  }

  // Passive income cards: per-card, the higher level wins (they only ever go up).
  const prevCards = Array.isArray(existingState["passiveCards"]) ? (existingState["passiveCards"] as Array<Record<string, unknown>>) : [];
  if (prevCards.length > 0) {
    const nextCards = Array.isArray(mergedState["passiveCards"]) ? (mergedState["passiveCards"] as Array<Record<string, unknown>>) : [];
    const byId = new Map<string, Record<string, unknown>>();
    for (const c of nextCards) {
      if (typeof c?.id === "string") byId.set(c.id, c);
    }
    for (const c of prevCards) {
      if (typeof c?.id !== "string") continue;
      const clientCard = byId.get(c.id);
      if (!clientCard || num(c.level) > num(clientCard.level)) byId.set(c.id, c);
    }
    mergedState["passiveCards"] = [...byId.values()];
  }

  // Weekly leaderboard accumulator (server-authoritative, resets each ISO week).
  const wk = weekKey();
  const prevWeekly = existingState["weekKey"] === wk ? num(existingState["weeklyPoints"]) : 0;
  const creditedDelta = Math.max(0, finalLifetimePoints - existing.lifetimePoints);
  mergedState["weeklyPoints"] = prevWeekly + creditedDelta;
  mergedState["weekKey"] = wk;
  finalState = mergedState;

  const [user] = await db
    .update(vaultUsersTable)
    .set({
      state: finalState,
      lifetimePoints: finalLifetimePoints,
      lastPointsSyncAt: new Date(),
    })
    .where(eq(vaultUsersTable.telegramId, telegramId))
    .returning();

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(
    UpdateVaultMeResponse.parse({
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        lifetimePoints: user.lifetimePoints,
        referralCount: user.referralCount,
        referralEarnings: user.referralEarnings,
      },
      state: user.state,
    }),
  );
});

router.get("/vault/leaderboard", async (_req, res): Promise<void> => {
  const users = await db
    .select()
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.isBanned, false))
    .orderBy(desc(vaultUsersTable.lifetimePoints))
    .limit(50);

  res.json(
    GetVaultLeaderboardResponse.parse(
      users.map((user) => ({
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        photoUrl: user.photoUrl,
        lifetimePoints: user.lifetimePoints,
      })),
    ),
  );
});

router.get("/vault/leaderboard/weekly", async (_req, res): Promise<void> => {
  const wk = weekKey();
  const users = await db
    .select()
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.isBanned, false));

  const entries = users
    .map((user) => {
      const s = (user.state ?? {}) as Record<string, unknown>;
      const points = s["weekKey"] === wk ? num(s["weeklyPoints"]) : 0;
      return {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        photoUrl: user.photoUrl,
        points,
      };
    })
    .filter((e) => e.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 50);

  res.json({ weekKey: wk, entries });
});

export default router;
