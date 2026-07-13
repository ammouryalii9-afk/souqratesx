import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
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
import { redeemPendingBonus } from "../lib/pendingBonus";

const router: IRouter = Router();

// Generous ceiling covering tap-mining + all passive cards at high levels + mini-games.
// Anything above this per-sync window is treated as implausible and clamped server-side,
// closing the "client just sends a huge lifetimePoints number" exploit while still letting
// legitimate fast progression through (admin-tunable via admin_settings.maxPointsPerHourCap).
const DEFAULT_MAX_POINTS_PER_HOUR = 3_000_000;

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
  "prevWeekKey",
  "prevWeekPoints",
  // The withdrawable balance: only POST /vault/claim (server-side two-rate
  // conversion) may change it — never the client-authoritative PUT sync.
  "claimedPoints",
  // Bumped by every /vault/claim; the PUT sync's UPDATE is guarded on it so a
  // stale in-flight sync (read before a claim, written after) can never restore
  // the pre-claim Mined buffer (which would allow double-claiming).
  "claimSeq",
];

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

async function computeMaxAllowedDelta(lastSyncAt: Date | null): Promise<number> {
  const settings = await getSettingsMap();
  const capPerHour = asNumber(settings.maxPointsPerHourCap, DEFAULT_MAX_POINTS_PER_HOUR);
  const capPerSecond = capPerHour / 3600;
  // Real elapsed time only — no per-sync minimum grace. A minimum floor here is
  // exploitable: 60 syncs/min × a 5s floor would grant 5× the hourly cap. With
  // real elapsed time, rapid syncs get tiny budgets that sum to exactly the cap,
  // and any legitimately clamped points are recovered on later syncs (the client
  // always sends its running total, so the delta re-includes them).
  const elapsedSeconds = lastSyncAt
    ? Math.max(0, (Date.now() - lastSyncAt.getTime()) / 1000)
    : 60 * 60; // no prior sync on record: allow up to one hour worth as a one-time grace amount
  return Math.floor(capPerSecond * elapsedSeconds);
}

router.get("/vault/me", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Hydration moment: fold any server-granted bonus (weekly prize, referral
  // milestone) into the spendable balance NOW — the client is about to replace
  // its local state with this response, so the credit can't be clobbered.
  const user =
    (await redeemPendingBonus(telegramId)) ??
    (await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId)))[0];
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
        withdrawnPoints: user.withdrawnPoints,
        referralCount: user.referralCount,
        referralEarnings: user.referralEarnings,
      },
      state: user.state,
    }),
  );
});

// Manual Claim: converts the Mined buffer (tempMiningPoints) into the withdrawable
// claimedPoints balance, atomically, entirely server-side (tamper-proof):
//   ad-earned portion (adMiningPoints, capped to the buffer) → 100%
//   game/tap remainder → gameToSpendablePercent% (admin-tunable, default 0; rest burned)
// Then zeroes both buffer counters. claimedPoints is a PROTECTED state key, so the
// debounced PUT sync can never fake or clobber it.
router.post("/vault/claim", rateLimit("vault-claim", 30, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const settings = await getSettingsMap();
  const ratePct = Math.min(100, Math.max(0, asNumber(settings.gameToSpendablePercent, 0)));

  const st = sql`COALESCE(${vaultUsersTable.state}, '{}'::jsonb)`;
  const temp = sql`GREATEST(COALESCE((${st}->>'tempMiningPoints')::numeric, 0), 0)`;
  const adPts = sql`LEAST(GREATEST(COALESCE((${st}->>'adMiningPoints')::numeric, 0), 0), ${temp})`;
  const credit = sql`FLOOR(${adPts} + (${temp} - ${adPts}) * ${ratePct}::numeric / 100)`;

  const [user] = await db
    .update(vaultUsersTable)
    .set({
      state: sql`jsonb_set(jsonb_set(jsonb_set(jsonb_set(
        ${st},
        '{claimedPoints}',
        to_jsonb(GREATEST(COALESCE((${st}->>'claimedPoints')::numeric, 0), 0) + ${credit})
      ), '{tempMiningPoints}', '0'::jsonb), '{adMiningPoints}', '0'::jsonb),
      '{claimSeq}', to_jsonb(COALESCE((${st}->>'claimSeq')::numeric, 0) + 1))`,
    })
    .where(and(eq(vaultUsersTable.telegramId, telegramId), eq(vaultUsersTable.isBanned, false)))
    .returning();

  if (!user) {
    res.status(403).json({ error: "User not found or banned" });
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
        withdrawnPoints: user.withdrawnPoints,
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

  // Mined buffer (tempMiningPoints) cap: tap/game-sourced increases are allowed
  // up to the full creditedDelta. The conversion rate (gameToSpendablePercent)
  // is applied client-side at Claim time. Spending (decrease) is always allowed.
  const settings = await getSettingsMap();
  const creditedDelta = Math.max(0, finalLifetimePoints - existing.lifetimePoints);
  const existingTemp = num(existingState["tempMiningPoints"]);
  const requestedTemp = num(mergedState["tempMiningPoints"]);
  if (requestedTemp > existingTemp) {
    mergedState["tempMiningPoints"] = existingTemp + Math.min(requestedTemp - existingTemp, creditedDelta);
  }
  // (If requestedTemp <= existingTemp the user is spending points; allow.)

  // adMiningPoints: only server ad-reward routes can increase this sub-counter.
  // If the client tries to inflate it, clamp it back to the server value.
  // Decreases (spending reducing the pool) are allowed.
  const existingAdMining = num(existingState["adMiningPoints"]);
  const requestedAdMining = num(mergedState["adMiningPoints"]);
  if (requestedAdMining > existingAdMining) {
    mergedState["adMiningPoints"] = existingAdMining;
  }

  // Weekly leaderboard accumulator (server-authoritative, resets each ISO week).
  // On rollover, ARCHIVE last week's score first — the weekly-prize job pays
  // winners from prevWeekKey/prevWeekPoints, so a score lazily reset by an
  // early-Monday sync is never lost before prizes go out.
  const wk = weekKey();
  if (typeof existingState["weekKey"] === "string" && existingState["weekKey"] !== wk) {
    mergedState["prevWeekKey"] = existingState["weekKey"];
    mergedState["prevWeekPoints"] = num(existingState["weeklyPoints"]);
  }
  const prevWeekly = existingState["weekKey"] === wk ? num(existingState["weeklyPoints"]) : 0;
  mergedState["weeklyPoints"] = prevWeekly + creditedDelta;
  mergedState["weekKey"] = wk;
  finalState = mergedState;

  // Optimistic-concurrency guard against /vault/claim: this UPDATE only lands if
  // no claim happened between our pre-read and this write (claimSeq unchanged).
  // Otherwise the stale merged state would resurrect the pre-claim Mined buffer
  // and revert claimedPoints — enabling double-claims.
  const preReadClaimSeq = num(existingState["claimSeq"]);
  let [user] = await db
    .update(vaultUsersTable)
    .set({
      state: finalState,
      lifetimePoints: finalLifetimePoints,
      lastPointsSyncAt: new Date(),
    })
    .where(
      and(
        eq(vaultUsersTable.telegramId, telegramId),
        sql`COALESCE((${vaultUsersTable.state}->>'claimSeq')::numeric, 0) = ${preReadClaimSeq}::numeric`,
      ),
    )
    .returning();

  if (!user) {
    // A claim raced this sync — drop the stale write and return the current
    // server row. The client keeps its running totals, so nothing is lost:
    // the next debounced sync re-applies against the fresh state.
    const [current] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
    if (!current) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    req.log.info({ telegramId }, "vault sync skipped: claim raced the sync (claimSeq changed)");
    user = current;
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
        withdrawnPoints: user.withdrawnPoints,
        referralCount: user.referralCount,
        referralEarnings: user.referralEarnings,
      },
      state: user.state,
    }),
  );
});

// 30s leaderboard caches — these endpoints are hit by every user opening the
// Friends/leaderboard tabs; the underlying data doesn't need per-request freshness.
// Per-cluster-worker caches (same tradeoff as the settings cache).
const LEADERBOARD_CACHE_TTL_MS = 30_000;
let leaderboardCache: { data: unknown; expiresAt: number } | null = null;
let weeklyLeaderboardCache: { data: unknown; expiresAt: number; weekKey: string } | null = null;

router.get("/vault/leaderboard", async (_req, res): Promise<void> => {
  if (leaderboardCache && leaderboardCache.expiresAt > Date.now()) {
    res.json(leaderboardCache.data);
    return;
  }
  const users = await db
    .select()
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.isBanned, false))
    .orderBy(desc(vaultUsersTable.lifetimePoints))
    .limit(50);

  const payload = GetVaultLeaderboardResponse.parse(
    users.map((user) => ({
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      photoUrl: user.photoUrl,
      lifetimePoints: user.lifetimePoints,
    })),
  );
  leaderboardCache = { data: payload, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS };
  res.json(payload);
});

router.get("/vault/leaderboard/weekly", async (_req, res): Promise<void> => {
  const wk = weekKey();
  if (weeklyLeaderboardCache && weeklyLeaderboardCache.expiresAt > Date.now() && weeklyLeaderboardCache.weekKey === wk) {
    res.json(weeklyLeaderboardCache.data);
    return;
  }

  // Filter + sort + limit in SQL — the old implementation loaded EVERY user row
  // (full JSONB blobs) into JS on each request, which does not scale past a few
  // thousand users. weeklyPoints lives inside the state JSONB, so we extract it
  // with ->> and cast (::numeric handles both int and float values safely).
  const weeklyPointsSql = sql<number>`COALESCE((${vaultUsersTable.state}->>'weeklyPoints')::numeric, 0)`;
  const users = await db
    .select({
      telegramId: vaultUsersTable.telegramId,
      username: vaultUsersTable.username,
      firstName: vaultUsersTable.firstName,
      photoUrl: vaultUsersTable.photoUrl,
      points: weeklyPointsSql,
    })
    .from(vaultUsersTable)
    .where(
      and(
        eq(vaultUsersTable.isBanned, false),
        sql`${vaultUsersTable.state}->>'weekKey' = ${wk}`,
        sql`COALESCE((${vaultUsersTable.state}->>'weeklyPoints')::numeric, 0) > 0`,
      ),
    )
    .orderBy(sql`COALESCE((${vaultUsersTable.state}->>'weeklyPoints')::numeric, 0) DESC`)
    .limit(50);

  const payload = {
    weekKey: wk,
    entries: users.map((u) => ({
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      photoUrl: u.photoUrl,
      points: num(u.points),
    })),
  };
  weeklyLeaderboardCache = { data: payload, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS, weekKey: wk };
  res.json(payload);
});

export default router;
