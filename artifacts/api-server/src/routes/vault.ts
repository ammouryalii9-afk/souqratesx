import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { rateLimit } from "../lib/rateLimit";
import { db, vaultUsersTable } from "@workspace/db";
import {
  UpdateVaultMeBody,
  GetVaultMeResponse,
  UpdateVaultMeResponse,
  GetVaultLeaderboardResponse,
  ConvertSkpToSkxBody,
  ConvertSkpToSkxResponse,
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
  // Bumped by every /vault/convert; the PUT sync's UPDATE is guarded on it so a
  // stale in-flight sync (read before a convert, written after) can never
  // restore the pre-convert SKP buffer (which would allow double-converting).
  "claimSeq",
  // Daily arcade ad-reward usage counters (shield, radar, slot) — written
  // server-side only; the frontend debounced PUT must never clobber these.
  "arcadeAdRewards",
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
  const redeemed = await redeemPendingBonus(telegramId);
  const user =
    redeemed?.user ??
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
        skxBalance: user.skxBalance,
        withdrawnPoints: user.withdrawnPoints,
        referralCount: user.referralCount,
        referralEarnings: user.referralEarnings,
        referralUsdCents: user.referralUsdCents,
      },
      state: user.state,
      redeemedBonus: redeemed?.amount ?? 0,
    }),
  );
});

const DEFAULT_SKP_TO_SKX_RATE = 5;

// SKP → SKX conversion: deducts SKP (the client-synced tempMiningPoints buffer)
// and credits floor(amount × rate / 100) into the server-authoritative SKX
// column; the remainder is burned. Entirely one atomic UPDATE (tamper-proof):
//   - the SKP deduction is guarded in the WHERE (buffer must still hold the
//     amount — no overdraft race with a concurrent spend/convert),
//   - claimSeq is bumped so a stale in-flight PUT /vault/me (read before the
//     convert, written after) is dropped instead of resurrecting the burned SKP.
router.post("/vault/convert", rateLimit("vault-convert", 30, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = ConvertSkpToSkxBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const requested = parsed.data.skpAmount; // undefined = convert everything

  const settings = await getSettingsMap();
  const ratePct = Math.min(100, Math.max(0, asNumber(settings.skpToSkxConversionRate, DEFAULT_SKP_TO_SKX_RATE)));

  // Pre-read only to compute the exact amounts for the response/guard; the
  // UPDATE itself re-checks the buffer in its WHERE clause, so a concurrent
  // spend can only make it a no-op (409), never an overdraft.
  const [existing] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!existing) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (existing.isBanned) {
    res.status(403).json({ error: "This account has been banned" });
    return;
  }

  const st0 = (existing.state ?? {}) as Record<string, unknown>;
  const buffer = Math.max(0, Math.floor(num(st0["tempMiningPoints"])));
  const convertAmount = requested !== undefined ? Math.min(Math.floor(requested), buffer) : buffer;
  if (convertAmount <= 0 || (requested !== undefined && Math.floor(requested) > buffer)) {
    res.status(400).json({ error: "Insufficient SKP balance" });
    return;
  }
  const receivedSkx = Math.floor((convertAmount * ratePct) / 100);

  const st = sql`COALESCE(${vaultUsersTable.state}, '{}'::jsonb)`;
  const [user] = await db
    .update(vaultUsersTable)
    .set({
      skxBalance: sql`${vaultUsersTable.skxBalance} + ${receivedSkx}::bigint`,
      state: sql`jsonb_set(jsonb_set(
        ${st},
        '{tempMiningPoints}',
        to_jsonb(COALESCE((${st}->>'tempMiningPoints')::numeric, 0) - ${convertAmount}::numeric)
      ), '{claimSeq}', to_jsonb(COALESCE((${st}->>'claimSeq')::numeric, 0) + 1))`,
    })
    .where(
      and(
        eq(vaultUsersTable.telegramId, telegramId),
        eq(vaultUsersTable.isBanned, false),
        sql`COALESCE((${vaultUsersTable.state}->>'tempMiningPoints')::numeric, 0) >= ${convertAmount}::numeric`,
      ),
    )
    .returning();

  if (!user) {
    // Buffer changed under us (concurrent spend/convert) — client should refresh.
    res.status(409).json({ error: "Balance changed, please try again" });
    return;
  }

  req.log.info({ telegramId, convertAmount, receivedSkx, ratePct }, "SKP converted to SKX");

  res.json(
    ConvertSkpToSkxResponse.parse({
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        lifetimePoints: user.lifetimePoints,
        skxBalance: user.skxBalance,
        withdrawnPoints: user.withdrawnPoints,
        referralCount: user.referralCount,
        referralEarnings: user.referralEarnings,
        referralUsdCents: user.referralUsdCents,
      },
      state: user.state,
      convertedSkp: convertAmount,
      receivedSkx,
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

  // Optimistic-concurrency guard against /vault/convert: this UPDATE only lands
  // if no conversion happened between our pre-read and this write (claimSeq
  // unchanged). Otherwise the stale merged state would resurrect the
  // pre-convert SKP buffer — enabling double-converts.
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
    req.log.info({ telegramId }, "vault sync skipped: convert raced the sync (claimSeq changed)");
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
        skxBalance: user.skxBalance,
        withdrawnPoints: user.withdrawnPoints,
        referralCount: user.referralCount,
        referralEarnings: user.referralEarnings,
        referralUsdCents: user.referralUsdCents,
      },
      state: user.state,
    }),
  );
});

// Transfer referral USD cents → pixel USD cents atomically.
// $0.02 per referral is stored in referral_usd_cents; this moves it all to
// pixel_usd_cents in one UPDATE (no read-modify-write race).
router.post("/vault/referral/transfer", rateLimit("vault-referral-transfer", 10, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [user] = await db
    .select({ referralUsdCents: vaultUsersTable.referralUsdCents, pixelUsdCents: vaultUsersTable.pixelUsdCents })
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.telegramId, telegramId));

  if (!user || user.referralUsdCents <= 0) {
    res.status(400).json({ error: "No referral balance to transfer" });
    return;
  }

  const toTransfer = user.referralUsdCents;

  const [updated] = await db
    .update(vaultUsersTable)
    .set({
      pixelUsdCents: sql`${vaultUsersTable.pixelUsdCents} + ${toTransfer}::bigint`,
      referralUsdCents: sql`0`,
    })
    .where(and(eq(vaultUsersTable.telegramId, telegramId), sql`${vaultUsersTable.referralUsdCents} = ${toTransfer}::bigint`))
    .returning({ pixelUsdCents: vaultUsersTable.pixelUsdCents, referralUsdCents: vaultUsersTable.referralUsdCents });

  if (!updated) {
    res.status(409).json({ error: "Transfer raced — retry" });
    return;
  }

  req.log.info({ telegramId, transferred: toTransfer }, "Referral USD transferred to pixel balance");

  res.json({ transferred: toTransfer, referralUsdCents: 0, pixelUsdCents: updated.pixelUsdCents });
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
  const weeklyPointsSql = sql<number>`COALESCE((${vaultUsersTable.state}->>'weeklyPoints')::numeric, 0)::int`;
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

// Heartbeat — called every 30s while the app is open.
// Updates last_seen_at (presence) and accumulates time-in-app.
// Cap per-ping delta to 120s so a stale/frozen client can't inflate the total.
router.post("/vault/heartbeat", rateLimit("vault-heartbeat", 120, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const rawDelta = Number((req.body as Record<string, unknown>).sessionSeconds ?? 30);
  const delta = Math.min(Math.max(0, Math.floor(rawDelta)), 120);

  await db
    .update(vaultUsersTable)
    .set({
      lastSeenAt: new Date(),
      totalSessionSeconds: sql`${vaultUsersTable.totalSessionSeconds} + ${delta}::bigint`,
    })
    .where(eq(vaultUsersTable.telegramId, telegramId));

  res.json({ ok: true });
});

export default router;
