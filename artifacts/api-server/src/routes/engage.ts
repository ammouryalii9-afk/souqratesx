import { Router, type IRouter } from "express";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import { getSessionTelegramId } from "../lib/session";
import { getSettingsMap, asString, asNumber } from "../lib/settings";
import { rateLimit } from "../lib/rateLimit";
import { creditedStateSql } from "../lib/weeklyCredit";

const router: IRouter = Router();

// ── Date helpers (UTC) ────────────────────────────────────────────────────────

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
function yesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── Daily streak ──────────────────────────────────────────────────────────────
// 7-day escalating cycle; day 7 is the jackpot, then it loops (streak count keeps growing).
const STREAK_REWARDS = [1000, 2000, 3500, 5000, 7500, 12000, 25000];

function streakRewardForCount(count: number): number {
  const idx = (Math.max(1, count) - 1) % STREAK_REWARDS.length;
  return STREAK_REWARDS[idx]!;
}

// ── Mystery boxes ─────────────────────────────────────────────────────────────
const FREE_BOX_COOLDOWN_MS = 8 * 60 * 60 * 1000; // one free box every 8h
const AD_BOX_DAILY_CAP = 5;

type BoxTier = { tier: string; reward: number; weight: number };
const FREE_BOX_TABLE: BoxTier[] = [
  { tier: "common", reward: 500, weight: 40 },
  { tier: "uncommon", reward: 1500, weight: 30 },
  { tier: "rare", reward: 4000, weight: 20 },
  { tier: "epic", reward: 10000, weight: 8 },
  { tier: "legendary", reward: 30000, weight: 2 },
];
const AD_BOX_TABLE: BoxTier[] = [
  { tier: "uncommon", reward: 2000, weight: 30 },
  { tier: "rare", reward: 5000, weight: 30 },
  { tier: "epic", reward: 10000, weight: 25 },
  { tier: "legendary", reward: 25000, weight: 12 },
  { tier: "mythic", reward: 75000, weight: 3 },
];

function rollBox(table: BoxTier[]): { tier: string; reward: number } {
  const total = table.reduce((a, t) => a + t.weight, 0);
  let r = Math.random() * total;
  for (const t of table) {
    r -= t.weight;
    if (r <= 0) return { tier: t.tier, reward: t.reward };
  }
  const last = table[table.length - 1]!;
  return { tier: last.tier, reward: last.reward };
}

// ── Daily challenges ──────────────────────────────────────────────────────────
const CHALLENGE_BONUS = 15000;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function computeChallenges(state: Record<string, unknown>, adsWatchedDate: string | null, adsWatchedToday: number) {
  const today = todayKey();
  return [
    { id: "streak", title: "\u0627\u062d\u0635\u0644 \u0639\u0644\u0649 \u0645\u0643\u0627\u0641\u0623\u0629 \u0627\u0644\u0633\u0644\u0633\u0644\u0629 \u0627\u0644\u064a\u0648\u0645\u064a\u0629", done: state["lastStreakClaimDate"] === today },
    { id: "box", title: "\u0627\u0641\u062a\u062d \u0635\u0646\u062f\u0648\u0642\u0627\u064b \u063a\u0627\u0645\u0636\u0627\u064b", done: state["lastBoxDate"] === today },
    { id: "ad", title: "\u0634\u0627\u0647\u062f \u0625\u0639\u0644\u0627\u0646\u0627\u064b \u0645\u0643\u0627\u0641\u0623\u064b", done: adsWatchedDate === today && adsWatchedToday >= 1 },
  ];
}

// ── Event (admin-configurable via freeform admin_settings) ────────────────────

function readEvent(settings: Record<string, unknown>) {
  const active = asString(settings.eventActive) === "true";
  const endsAt = asString(settings.eventEndsAt);
  const stillLive = active && (!endsAt || new Date(endsAt).getTime() > Date.now());
  return {
    active: stillLive,
    multiplier: asNumber(settings.eventMultiplier, 2),
    title: asString(settings.eventTitle) || "\u0623\u062d\u062f\u0627\u062b \u0645\u062d\u062f\u0648\u062f\u0629",
    endsAt: endsAt || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function loadUser(telegramId: string) {
  const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  return user;
}

/** GET /engage/status — everything the engagement UI needs in one call. */
router.get("/engage/status", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const user = await loadUser(telegramId);
  if (!user || user.isBanned) { res.status(403).json({ error: "User not found or banned" }); return; }

  const state = (user.state ?? {}) as Record<string, unknown>;
  const settings = await getSettingsMap();
  const today = todayKey();

  const streakCount = num(state["streakCount"]);
  const claimedToday = state["lastStreakClaimDate"] === today;
  // next reward = the reward for the day they'd land on when they claim
  const nextCount = claimedToday
    ? streakCount
    : state["lastStreakClaimDate"] === yesterdayKey()
      ? streakCount + 1
      : 1;

  const lastFreeBoxAt = num(state["lastFreeBoxAt"]);
  const freeCooldownEndsAt = lastFreeBoxAt + FREE_BOX_COOLDOWN_MS;
  const freeAvailable = Date.now() >= freeCooldownEndsAt;
  const adBoxesToday = state["adBoxDate"] === today ? num(state["adBoxesOpenedToday"]) : 0;

  const challenges = computeChallenges(state, user.adsWatchedDate, user.adsWatchedToday);
  const allChallengesDone = challenges.every((c) => c.done);
  const challengeClaimed = state["challengeClaimedDate"] === today;

  res.json({
    today,
    streak: {
      count: streakCount,
      claimedToday,
      day: ((nextCount - 1) % STREAK_REWARDS.length) + 1,
      nextReward: streakRewardForCount(nextCount),
      rewards: STREAK_REWARDS,
    },
    mysteryBox: {
      freeAvailable,
      freeCooldownEndsAt,
      adBoxesOpenedToday: adBoxesToday,
      adBoxesRemaining: Math.max(0, AD_BOX_DAILY_CAP - adBoxesToday),
    },
    challenges: {
      list: challenges,
      allDone: allChallengesDone,
      claimed: challengeClaimed,
      bonus: CHALLENGE_BONUS,
    },
    event: readEvent(settings),
  });
});

/** POST /engage/streak/claim — claim today's daily streak reward. */
router.post("/engage/streak/claim", rateLimit("engage", 30, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const user = await loadUser(telegramId);
  if (!user || user.isBanned) { res.status(403).json({ error: "User not found or banned" }); return; }

  const state = (user.state ?? {}) as Record<string, unknown>;
  const today = todayKey();
  if (state["lastStreakClaimDate"] === today) {
    res.status(409).json({ error: "Already claimed today" });
    return;
  }

  const prevCount = num(state["streakCount"]);
  const newCount = state["lastStreakClaimDate"] === yesterdayKey() ? prevCount + 1 : 1;
  const reward = streakRewardForCount(newCount);

  // Atomic guard: only the first concurrent writer wins — the second re-evaluates the
  // WHERE against the committed row (lastStreakClaimDate now = today) and updates 0 rows.
  const updated = await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${reward}`,
      state: creditedStateSql(reward, { lastStreakClaimDate: today, streakCount: newCount }),
    })
    .where(and(
      eq(vaultUsersTable.telegramId, telegramId),
      sql`${vaultUsersTable.state}->>'lastStreakClaimDate' IS DISTINCT FROM ${today}`,
    ))
    .returning({ lifetimePoints: vaultUsersTable.lifetimePoints });

  if (updated.length === 0) { res.status(409).json({ error: "Already claimed today" }); return; }

  res.json({ ok: true, reward, streakCount: newCount, lifetimePoints: updated[0]!.lifetimePoints });
});

/** POST /engage/mysterybox/open — open a free (cooldown) or ad (daily-capped) box. */
router.post("/engage/mysterybox/open", rateLimit("engage", 30, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { source } = req.body as { source?: unknown };
  const isAd = source === "ad";

  const user = await loadUser(telegramId);
  if (!user || user.isBanned) { res.status(403).json({ error: "User not found or banned" }); return; }

  const state = (user.state ?? {}) as Record<string, unknown>;
  const today = todayKey();
  const now = Date.now();
  const S = vaultUsersTable.state;

  let result: { tier: string; reward: number };
  let statePatch: Record<string, string | number | SQL>;
  let guard: SQL;

  if (isAd) {
    const adBoxesToday = state["adBoxDate"] === today ? num(state["adBoxesOpenedToday"]) : 0;
    if (adBoxesToday >= AD_BOX_DAILY_CAP) {
      res.status(429).json({ error: "Daily ad-box limit reached" });
      return;
    }
    result = rollBox(AD_BOX_TABLE);
    // Increment the counter in SQL against the live row so concurrent opens count
    // correctly; guard on the live count so we never exceed the daily cap.
    const liveCount = sql`(CASE WHEN ${S}->>'adBoxDate' = ${today} THEN COALESCE((${S}->>'adBoxesOpenedToday')::int, 0) ELSE 0 END)`;
    statePatch = { adBoxDate: today, adBoxesOpenedToday: sql`${liveCount} + 1`, lastBoxDate: today };
    guard = sql`${liveCount} < ${AD_BOX_DAILY_CAP}`;
  } else {
    const lastFreeBoxAt = num(state["lastFreeBoxAt"]);
    if (now < lastFreeBoxAt + FREE_BOX_COOLDOWN_MS) {
      res.status(429).json({ error: "Free box on cooldown", availableAt: lastFreeBoxAt + FREE_BOX_COOLDOWN_MS });
      return;
    }
    result = rollBox(FREE_BOX_TABLE);
    statePatch = { lastFreeBoxAt: now, lastBoxDate: today };
    guard = sql`COALESCE((${S}->>'lastFreeBoxAt')::bigint, 0) + ${FREE_BOX_COOLDOWN_MS} <= ${now}`;
  }

  const updated = await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${result.reward}`,
      state: creditedStateSql(result.reward, statePatch),
    })
    .where(and(eq(vaultUsersTable.telegramId, telegramId), guard))
    .returning({ lifetimePoints: vaultUsersTable.lifetimePoints });

  if (updated.length === 0) {
    res.status(429).json({ error: isAd ? "Daily ad-box limit reached" : "Free box on cooldown" });
    return;
  }

  res.json({ ok: true, tier: result.tier, reward: result.reward, lifetimePoints: updated[0]!.lifetimePoints });
});

/** POST /engage/challenge/claim — claim the daily-missions bonus once all are done. */
router.post("/engage/challenge/claim", rateLimit("engage", 30, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const user = await loadUser(telegramId);
  if (!user || user.isBanned) { res.status(403).json({ error: "User not found or banned" }); return; }

  const state = (user.state ?? {}) as Record<string, unknown>;
  const today = todayKey();

  if (state["challengeClaimedDate"] === today) {
    res.status(409).json({ error: "Already claimed today" });
    return;
  }

  const challenges = computeChallenges(state, user.adsWatchedDate, user.adsWatchedToday);
  if (!challenges.every((c) => c.done)) {
    res.status(403).json({ error: "Complete all daily missions first" });
    return;
  }

  const updated = await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${CHALLENGE_BONUS}`,
      state: creditedStateSql(CHALLENGE_BONUS, { challengeClaimedDate: today }),
    })
    .where(and(
      eq(vaultUsersTable.telegramId, telegramId),
      sql`${vaultUsersTable.state}->>'challengeClaimedDate' IS DISTINCT FROM ${today}`,
    ))
    .returning({ lifetimePoints: vaultUsersTable.lifetimePoints });

  if (updated.length === 0) { res.status(409).json({ error: "Already claimed today" }); return; }

  res.json({ ok: true, reward: CHALLENGE_BONUS, lifetimePoints: updated[0]!.lifetimePoints });
});

export default router;
