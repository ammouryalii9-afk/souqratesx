import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  vaultUsersTable,
  arcadeTicketsTable,
  arcadeSessionsTable,
  arcadePurchasesTable,
} from "@workspace/db";
import { getSessionTelegramId, isAdminSession } from "../lib/session";
import { rateLimit } from "../lib/rateLimit";
import { logUserActivity } from "../lib/activityLog";
import { logger } from "../lib/logger";
import { creditedStateSql } from "../lib/weeklyCredit";
import { getSettingsMap, asString, asNumber } from "../lib/settings";
import { sendReminderToUser } from "../lib/telegramBot";

/** Send a fire-and-forget arcade notification via bot */
async function arcadeNotify(telegramId: string, text: string): Promise<void> {
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  const webAppUrl = domains[0] ? `https://${domains[0]}` : "";
  if (!webAppUrl) return;
  try {
    await sendReminderToUser(telegramId, text, webAppUrl);
  } catch {
    // non-critical
  }
}

/** Returns true if the arcade is open for this telegramId */
async function isArcadeAccessible(telegramId: string): Promise<boolean> {
  const settings = await getSettingsMap();
  const enabled = settings.arcadeEnabled === true || settings.arcadeEnabled === "true";
  if (enabled) return true;
  const whitelist = asString(settings.arcadeWhitelist ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return whitelist.includes(telegramId);
}

const router: IRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

const ROOM_GRID_SIZE: Record<string, number> = {
  easy: 100,
  tactical: 50,
  hardcore: 20,
};

const ROOM_MULTIPLIER: Record<string, number> = {
  easy: 100,
  tactical: 150,
  hardcore: 300,
};

const DURATION_BASE_POINTS: Record<number, number> = {
  1:  8_000,
  3:  18_000,
  6:  40_000,
  12: 90_000,
  24: 200_000,
};

const VALID_ROOMS = ["easy", "tactical", "hardcore"];
const VALID_DURATIONS = [1, 3, 6, 12, 24];
const ADS_NEEDED = 5;
const STARS_FOR_TICKET = 100;

// Deterministic pseudo-random (LCG) — stable seed = same sequence every call
function seededRnd(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000;
  };
}

// Resolve all expired-but-still-"active" sessions lazily when a user queries
// Also fires a "you won!" Telegram notification per session.
async function settleExpiredSessions(): Promise<void> {
  const settled = await db
    .update(arcadeSessionsTable)
    .set({ status: "won", completedAt: new Date() })
    .where(
      and(
        eq(arcadeSessionsTable.status, "active"),
        sql`${arcadeSessionsTable.expiresAt} <= now()`,
      ),
    )
    .returning({
      telegramId: arcadeSessionsTable.telegramId,
      finalPoints: arcadeSessionsTable.finalPoints,
      roomType: arcadeSessionsTable.roomType,
    });

  // Fire-and-forget notifications
  for (const s of settled) {
    void arcadeNotify(
      s.telegramId,
      `🏆 Your arcade session in ${s.roomType} just ended — you held your cell!\n+${s.finalPoints.toLocaleString()} SKX will be added to your balance next time you open the app.`,
    );
  }
}

// Get user's today ticket
async function getTodayTicket(telegramId: string) {
  const [ticket] = await db
    .select()
    .from(arcadeTicketsTable)
    .where(
      and(
        eq(arcadeTicketsTable.telegramId, telegramId),
        eq(arcadeTicketsTable.dayKey, todayKey()),
      ),
    )
    .limit(1);
  return ticket ?? null;
}

// Get user's active sessions (also award won ones)
async function getUserActiveSessions(telegramId: string) {
  await settleExpiredSessions();
  return db
    .select()
    .from(arcadeSessionsTable)
    .where(
      and(
        eq(arcadeSessionsTable.telegramId, telegramId),
        eq(arcadeSessionsTable.status, "active"),
      ),
    )
    .orderBy(desc(arcadeSessionsTable.createdAt));
}

// ── GET /arcade/status ─────────────────────────────────────────────────────────
router.get("/arcade/status", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  // Access control — game may be disabled or whitelisted only
  if (!(await isArcadeAccessible(telegramId))) {
    res.json({ enabled: false, activeSessions: [], ticket: null, wonSessionsAwarded: 0 });
    return;
  }

  await settleExpiredSessions();

  // Credit any "won" sessions for this user into pending_bonus_points
  const wonSessions = await db
    .select()
    .from(arcadeSessionsTable)
    .where(
      and(
        eq(arcadeSessionsTable.telegramId, telegramId),
        eq(arcadeSessionsTable.status, "won"),
      ),
    );

  let totalWonPoints = 0;
  if (wonSessions.length > 0) {
    for (const s of wonSessions) {
      totalWonPoints += s.finalPoints;
    }
    const wonIds = wonSessions.map((s) => s.id);
    // Mark as credited before awarding to prevent double-credit
    await db
      .update(arcadeSessionsTable)
      .set({ status: "credited" })
      .where(inArray(arcadeSessionsTable.id, wonIds));
    // Award full prize as SKX directly (stake was already paid — this is the gross win)
    if (totalWonPoints > 0) {
      await db
        .update(vaultUsersTable)
        .set({
          skxBalance: sql`${vaultUsersTable.skxBalance} + ${totalWonPoints}::bigint`,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      await logUserActivity(telegramId, "arcade_won", { totalWonPoints });
    }
  }

  const ticket = await getTodayTicket(telegramId);
  const activeSessions = await getUserActiveSessions(telegramId);

  // Fetch user row for starsBalance, skxBalance + extraCellCredits from state JSONB
  const [userRow] = await db
    .select({ starsBalance: vaultUsersTable.starsBalance, skxBalance: vaultUsersTable.skxBalance, state: vaultUsersTable.state })
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.telegramId, telegramId))
    .limit(1);

  const stateObj = (userRow?.state as Record<string, unknown> | null) ?? {};
  const extraCellCredits = stateObj.extraCellCredits as number ?? 0;
  const adRaw = stateObj.arcadeAdRewards as { date?: string; shield15m?: number; radarFree?: number; extraSlot?: number } | undefined;
  const todayStr = todayKey();
  const adRewardsToday = adRaw?.date === todayStr
    ? { shield15m: adRaw.shield15m ?? 0, radarFree: adRaw.radarFree ?? 0, extraSlot: adRaw.extraSlot ?? 0 }
    : { shield15m: 0, radarFree: 0, extraSlot: 0 };

  res.json({
    hasTicket: ticket?.ticketGranted ?? false,
    adsWatched: ticket?.adsWatched ?? 0,
    adsNeeded: ADS_NEEDED,
    starsBalance: userRow?.starsBalance ?? 0,
    skxBalance: userRow?.skxBalance ?? 0,
    extraCellCredits,
    adRewardsToday,
    todayKey: todayStr,
    activeSessions: activeSessions.map((s) => ({
      id: s.id,
      roomType: s.roomType,
      gridX: s.gridX,
      gridY: s.gridY,
      durationHours: s.durationHours,
      finalPoints: s.finalPoints,
      expiresAt: s.expiresAt.toISOString(),
      hasShield: s.shieldExpiresAt ? new Date(s.shieldExpiresAt) > new Date() : false,
      shieldExpiresAt: s.shieldExpiresAt?.toISOString() ?? null,
      isDecoy: s.isDecoy,
      createdAt: s.createdAt.toISOString(),
    })),
    wonSessionsAwarded: totalWonPoints,
  });
});

// ── POST /arcade/ticket/watch-ad ────────────────────────────────────────────────
router.post(
  "/arcade/ticket/watch-ad",
  rateLimit("arcade:watch-ad", 10, 60_000),
  async (req, res): Promise<void> => {
    const telegramId = getSessionTelegramId(req);
    if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const day = todayKey();

    // Upsert the ticket row
    await db
      .insert(arcadeTicketsTable)
      .values({
        telegramId,
        dayKey: day,
        entryMethod: "ads",
        adsWatched: 1,
        ticketGranted: false,
      })
      .onConflictDoNothing();

    // Fetch current state
    const ticket = await getTodayTicket(telegramId);
    if (!ticket) { res.status(500).json({ error: "Failed to create ticket record" }); return; }

    if (ticket.ticketGranted) {
      res.json({ granted: true, adsWatched: ticket.adsWatched });
      return;
    }

    const newCount = ticket.adsWatched + 1;
    const granted = newCount >= ADS_NEEDED;
    const now = new Date();

    await db
      .update(arcadeTicketsTable)
      .set({
        adsWatched: newCount,
        ticketGranted: granted,
        grantedAt: granted ? now : null,
        entryMethod: "ads",
      })
      .where(
        and(
          eq(arcadeTicketsTable.telegramId, telegramId),
          eq(arcadeTicketsTable.dayKey, day),
        ),
      );

    await logUserActivity(telegramId, "arcade_ad_watched", { count: newCount, granted });
    res.json({ granted, adsWatched: newCount, adsNeeded: ADS_NEEDED });
  },
);

// ── Arcade Shop defaults (overridable via admin_settings) ────────────────────────
const SHOP_DEFAULTS = {
  skxPerStar:         2_000,
  skxCustomMin:       2_000,
  skxCustomMax:       10_000_000,
  shield3hStars:      20,
  shieldFullStars:    80,
  decoyStars:         50,
  radarStars:         15,
  multiStrikeStars:   30,
  extraCellsStars:    500,
};

async function getShopConfig() {
  const s = await getSettingsMap();
  return {
    skxPerStar:       asNumber(s["arcadeSkxPerStar"],       SHOP_DEFAULTS.skxPerStar),
    skxCustomMin:     asNumber(s["arcadeSkxCustomMin"],     SHOP_DEFAULTS.skxCustomMin),
    skxCustomMax:     asNumber(s["arcadeSkxCustomMax"],     SHOP_DEFAULTS.skxCustomMax),
    shield3hStars:    asNumber(s["arcadeShield3hStars"],    SHOP_DEFAULTS.shield3hStars),
    shieldFullStars:  asNumber(s["arcadeShieldFullStars"],  SHOP_DEFAULTS.shieldFullStars),
    decoyStars:       asNumber(s["arcadeDecoyStars"],       SHOP_DEFAULTS.decoyStars),
    radarStars:       asNumber(s["arcadeRadarStars"],       SHOP_DEFAULTS.radarStars),
    multiStrikeStars: asNumber(s["arcadeMultiStrikeStars"], SHOP_DEFAULTS.multiStrikeStars),
    extraCellsStars:  asNumber(s["arcadeExtraCellsStars"],  SHOP_DEFAULTS.extraCellsStars),
  };
}

// ── GET /arcade/shop/config ───────────────────────────────────────────────────────
// Returns current shop prices so the frontend can display accurate star costs.
router.get(
  "/arcade/shop/config",
  async (_req, res): Promise<void> => {
    const cfg = await getShopConfig();
    res.json(cfg);
  },
);

// ── POST /arcade/shop/invoice ────────────────────────────────────────────────────
// Creates a REAL Telegram Stars invoice for a shop item.
// Prices are read from admin_settings (with fallback to SHOP_DEFAULTS).
router.post(
  "/arcade/shop/invoice",
  rateLimit("arcade:shop-invoice", 10, 60_000),
  async (req, res): Promise<void> => {
    const telegramId = getSessionTelegramId(req);
    if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { itemType, sessionId, skxAmount: rawSkxAmount } = req.body as { itemType: string; sessionId?: number; skxAmount?: number };

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) { res.status(503).json({ error: "Bot not configured" }); return; }

    const cfg = await getShopConfig();

    const CATALOG: Record<string, { stars: number; label: string; desc: string }> = {
      shield_3h:    { stars: cfg.shield3hStars,    label: "🛡️ Shield 3h",       desc: "Protect your cell for 3 hours" },
      shield_full:  { stars: cfg.shieldFullStars,  label: "🔰 Full Shield",      desc: "Shield lasts the entire session" },
      decoy:        { stars: cfg.decoyStars,        label: "💥 Decoy Trap",       desc: "Next attacker gets penalised" },
      radar:        { stars: cfg.radarStars,        label: "📡 Radar Scan",       desc: "Reveal enemies in a 3×3 area" },
      multi_strike: { stars: cfg.multiStrikeStars,  label: "⚡ Multi-Strike ×5",  desc: "Claim 5 cells simultaneously" },
      extra_cells:  { stars: cfg.extraCellsStars,   label: "🗺️ Extra Cells ×3",   desc: "Unlock 3 additional cell slots permanently" },
    };

    let stars: number;
    let label: string;
    let desc: string;
    let payload: string;

    if (itemType === "skx_custom") {
      const skxAmt = Math.floor(Number(rawSkxAmount) || 0);
      if (!skxAmt || skxAmt < cfg.skxCustomMin || skxAmt > cfg.skxCustomMax) {
        res.status(400).json({ error: `SKX amount must be between ${cfg.skxCustomMin} and ${cfg.skxCustomMax}` });
        return;
      }
      stars = Math.ceil(skxAmt / cfg.skxPerStar);
      label = `💎 ${skxAmt.toLocaleString()} SKX`;
      desc = `${skxAmt.toLocaleString()} SKX added to your balance instantly`;
      payload = JSON.stringify({ effect: "arcade_shop", telegramId, itemType: "skx_custom", skxAmount: skxAmt, sessionId: null });
    } else {
      const item = CATALOG[itemType];
      if (!item) { res.status(400).json({ error: "Unknown item" }); return; }
      stars = item.stars;
      label = item.label;
      desc = item.desc;
      payload = JSON.stringify({ effect: "arcade_shop", telegramId, itemType, sessionId: sessionId ?? null });
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: label,
        description: desc,
        payload,
        currency: "XTR",
        prices: [{ label, amount: stars }],
      }),
    });
    const tgData = await tgRes.json() as { ok: boolean; result?: string; description?: string };
    if (!tgData.ok) {
      logger.error({ tgData }, "Failed to create arcade shop invoice link");
      res.status(503).json({ error: "Failed to create invoice" });
      return;
    }
    res.json({ invoiceUrl: tgData.result });
  },
);

// ── POST /arcade/ticket/stars ────────────────────────────────────────────────────
// Called by frontend after Stars payment confirmed via Telegram openInvoice callback
// The webhook will grant the ticket; this endpoint just creates the invoice link
router.post(
  "/arcade/ticket/stars",
  rateLimit("arcade:ticket-stars", 5, 60_000),
  async (req, res): Promise<void> => {
    const telegramId = getSessionTelegramId(req);
    if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) { res.status(503).json({ error: "Bot not configured" }); return; }

    const payload = JSON.stringify({ effect: "arcade_ticket", telegramId });
    const body = {
      title: "🎮 SKX Arcade Daily Ticket",
      description: `Unlocks SKX Arcade for 24 hours. Claim grid cells and earn Game Points!`,
      payload,
      currency: "XTR",
      prices: [{ label: "Daily Ticket", amount: STARS_FOR_TICKET }],
    };

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const tgData = await tgRes.json() as { ok: boolean; result?: string; description?: string };
    if (!tgData.ok) {
      logger.error({ tgData }, "Failed to create arcade invoice link");
      res.status(503).json({ error: "Failed to create invoice" });
      return;
    }

    res.json({ invoiceUrl: tgData.result });
  },
);

// ── GET /arcade/grid/:room ──────────────────────────────────────────────────────
router.get("/arcade/grid/:room", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const room = req.params.room;
  if (!VALID_ROOMS.includes(room)) { res.status(400).json({ error: "Invalid room" }); return; }

  await settleExpiredSessions();

  const activeCells = await db
    .select({
      id: arcadeSessionsTable.id,
      telegramId: arcadeSessionsTable.telegramId,
      gridX: arcadeSessionsTable.gridX,
      gridY: arcadeSessionsTable.gridY,
      durationHours: arcadeSessionsTable.durationHours,
      finalPoints: arcadeSessionsTable.finalPoints,
      expiresAt: arcadeSessionsTable.expiresAt,
      shieldExpiresAt: arcadeSessionsTable.shieldExpiresAt,
      isDecoy: arcadeSessionsTable.isDecoy,
    })
    .from(arcadeSessionsTable)
    .where(
      and(
        eq(arcadeSessionsTable.roomType, room),
        eq(arcadeSessionsTable.status, "active"),
      ),
    );

  const now = new Date();
  const cells = activeCells.map((c) => {
    const isMe = c.telegramId === telegramId;
    const shielded = c.shieldExpiresAt ? new Date(c.shieldExpiresAt) > now : false;
    return {
      x: c.gridX,
      y: c.gridY,
      owner: isMe ? "me" : "other",
      sessionId: isMe ? c.id : undefined,
      durationHours: isMe ? c.durationHours : undefined,
      finalPoints: isMe ? c.finalPoints : undefined,
      expiresAt: isMe ? c.expiresAt.toISOString() : undefined,
      hasShield: isMe ? shielded : shielded, // show shield status to all so strikers know
      isDecoy: isMe ? c.isDecoy : false, // decoy hidden from others
    };
  });

  // ── Phantom player injection ──────────────────────────────────────────────
  const phSettings = await getSettingsMap();
  const phantomEnabled =
    phSettings.arcadePhantomEnabled === true ||
    phSettings.arcadePhantomEnabled === "true";
  const phantomDensity = asNumber(phSettings.arcadePhantomDensity, 15);
  const phantomMinReal = asNumber(phSettings.arcadePhantomMinRealPlayers, 30);

  let phantomInjected = 0;
  if (phantomEnabled && activeCells.length < phantomMinReal) {
    const gSize = ROOM_GRID_SIZE[room];
    const totalCells = gSize * gSize;
    const want = Math.min(
      Math.round((phantomDensity / 100) * totalCells),
      Math.floor(totalCells * 0.65),
    );
    if (want > 0) {
      // Daily seed per room — stable throughout the day so grid doesn't flicker
      const today = new Date().toISOString().slice(0, 10);
      let seedNum = 0;
      const seedStr = `${room}:${today}`;
      for (let i = 0; i < seedStr.length; i++) {
        seedNum = (Math.imul(31, seedNum) + seedStr.charCodeAt(i)) | 0;
      }
      const rnd = seededRnd(seedNum >>> 0);
      const occupied = new Set<string>(activeCells.map((c) => `${c.gridX},${c.gridY}`));
      for (let attempt = 0; attempt < want * 8 && phantomInjected < want; attempt++) {
        const px = Math.floor(rnd() * gSize);
        const py = Math.floor(rnd() * gSize);
        const key = `${px},${py}`;
        if (!occupied.has(key)) {
          occupied.add(key);
          cells.push({ x: px, y: py, owner: "other", sessionId: undefined, durationHours: undefined, finalPoints: undefined, expiresAt: undefined, hasShield: false, isDecoy: false });
          phantomInjected++;
        }
      }
    }
  }

  // ── Fake counter injection (social-proof display only) ─────────────────────
  const fakeBase    = asNumber(phSettings.arcadeFakeCountBase,     0);
  const fakeVariance = asNumber(phSettings.arcadeFakeCountVariance, 0);
  let fakeExtra = 0;
  if (fakeBase > 0 || fakeVariance > 0) {
    // Stable per-room-per-hour so the displayed number drifts slowly, not every request
    const hour = new Date().toISOString().slice(0, 13);
    const seedStr = `fake:${room}:${hour}`;
    let seedNum = 0;
    for (let i = 0; i < seedStr.length; i++) {
      seedNum = (Math.imul(31, seedNum) + seedStr.charCodeAt(i)) | 0;
    }
    const rnd = seededRnd(seedNum >>> 0);
    const lo = Math.max(0, fakeBase - fakeVariance);
    const hi = fakeBase + fakeVariance;
    fakeExtra = Math.round(lo + rnd() * (hi - lo));
  }

  res.json({
    room,
    gridSize: ROOM_GRID_SIZE[room],
    totalActive: activeCells.length + phantomInjected + fakeExtra,
    cells,
  });
});

// ── POST /arcade/grid/claim ─────────────────────────────────────────────────────
router.post(
  "/arcade/grid/claim",
  rateLimit("arcade:claim", 10, 60_000),
  async (req, res): Promise<void> => {
    const telegramId = getSessionTelegramId(req);
    if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

    if (!(await isArcadeAccessible(telegramId))) {
      res.status(403).json({ error: "اللعبة غير مفعّلة حالياً" });
      return;
    }

    const { room, x, y, durationHours } = req.body as {
      room: string;
      x: number;
      y: number;
      durationHours: number;
    };

    if (!VALID_ROOMS.includes(room)) { res.status(400).json({ error: "Invalid room" }); return; }
    if (!VALID_DURATIONS.includes(durationHours)) { res.status(400).json({ error: "Invalid duration" }); return; }

    const gridSize = ROOM_GRID_SIZE[room];
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) {
      res.status(400).json({ error: "Cell out of bounds" });
      return;
    }

    // User can have at most 3 + extraCellCredits active sessions total
    await settleExpiredSessions();
    const [claimUser] = await db
      .select({ state: vaultUsersTable.state })
      .from(vaultUsersTable)
      .where(eq(vaultUsersTable.telegramId, telegramId))
      .limit(1);
    const claimExtraSlots = (claimUser?.state as Record<string, unknown> | null)?.extraCellCredits as number ?? 0;
    const maxSessions = 3 + Math.min(claimExtraSlots, 9);

    const myActive = await db
      .select({ id: arcadeSessionsTable.id })
      .from(arcadeSessionsTable)
      .where(
        and(
          eq(arcadeSessionsTable.telegramId, telegramId),
          eq(arcadeSessionsTable.status, "active"),
        ),
      );
    if (myActive.length >= maxSessions) {
      res.status(409).json({ error: `Max ${maxSessions} active sessions at a time` });
      return;
    }

    // Check cell not already claimed
    const [existing] = await db
      .select({ id: arcadeSessionsTable.id })
      .from(arcadeSessionsTable)
      .where(
        and(
          eq(arcadeSessionsTable.roomType, room),
          eq(arcadeSessionsTable.gridX, x),
          eq(arcadeSessionsTable.gridY, y),
          eq(arcadeSessionsTable.status, "active"),
        ),
      )
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Cell already claimed" });
      return;
    }

    const basePoints = DURATION_BASE_POINTS[durationHours];
    const multiplierPct = ROOM_MULTIPLIER[room];
    const finalPoints = Math.round((basePoints * multiplierPct) / 100);
    const stakeAmount = Math.round(finalPoints * 0.25); // 25% upfront stake

    // Must have enough SKX to cover the stake for the chosen duration
    const [balanceRow] = await db
      .select({ skxBalance: vaultUsersTable.skxBalance })
      .from(vaultUsersTable)
      .where(eq(vaultUsersTable.telegramId, telegramId))
      .limit(1);

    const currentSkx = balanceRow?.skxBalance ?? 0;
    if (currentSkx < stakeAmount) {
      res.status(402).json({ error: `Not enough SKX — need ${stakeAmount.toLocaleString()} to stake` });
      return;
    }

    // Deduct 25% stake atomically (guard: balance must still be sufficient)
    const deducted = await db
      .update(vaultUsersTable)
      .set({ skxBalance: sql`${vaultUsersTable.skxBalance} - ${stakeAmount}::bigint` })
      .where(
        and(
          eq(vaultUsersTable.telegramId, telegramId),
          sql`${vaultUsersTable.skxBalance} >= ${stakeAmount}::bigint`,
        ),
      )
      .returning({ skxBalance: vaultUsersTable.skxBalance });

    if (deducted.length === 0) {
      res.status(402).json({ error: "Insufficient SKX balance" });
      return;
    }

    const expiresAt = new Date(Date.now() + durationHours * 3_600_000);

    const [session] = await db
      .insert(arcadeSessionsTable)
      .values({
        telegramId,
        roomType: room,
        gridX: x,
        gridY: y,
        durationHours,
        basePoints,
        multiplierPct,
        finalPoints,
        status: "active",
        expiresAt,
      })
      .returning();

    await logUserActivity(telegramId, "arcade_claim", { room, x, y, durationHours, finalPoints, stakeAmount });
    res.json({
      session: {
        id: session.id,
        roomType: session.roomType,
        gridX: session.gridX,
        gridY: session.gridY,
        durationHours: session.durationHours,
        finalPoints: session.finalPoints,
        stakeAmount,
        expiresAt: session.expiresAt.toISOString(),
        hasShield: false,
        isDecoy: false,
      },
      newSkxBalance: deducted[0].skxBalance,
    });
  },
);

// ── POST /arcade/grid/strike ────────────────────────────────────────────────────
router.post(
  "/arcade/grid/strike",
  rateLimit("arcade:strike", 20, 60_000),
  async (req, res): Promise<void> => {
    const telegramId = getSessionTelegramId(req);
    if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { room, x, y } = req.body as { room: string; x: number; y: number };
    if (!VALID_ROOMS.includes(room)) { res.status(400).json({ error: "Invalid room" }); return; }

    await settleExpiredSessions();

    const [target] = await db
      .select()
      .from(arcadeSessionsTable)
      .where(
        and(
          eq(arcadeSessionsTable.roomType, room),
          eq(arcadeSessionsTable.gridX, x),
          eq(arcadeSessionsTable.gridY, y),
          eq(arcadeSessionsTable.status, "active"),
        ),
      )
      .limit(1);

    if (!target) {
      // Phantom mode: the cell was visual-only (no DB row) — return "evaded" instead of 404
      const phCheck = await getSettingsMap();
      const phEnabled =
        phCheck.arcadePhantomEnabled === true ||
        phCheck.arcadePhantomEnabled === "true";
      if (phEnabled) {
        res.json({ result: "phantom_evaded", strikerReward: 0, message: "👻 اختفى العدو!" });
        return;
      }
      res.status(404).json({ error: "No active cell at this position" });
      return;
    }

    if (target.telegramId === telegramId) {
      res.status(400).json({ error: "Cannot strike your own cell" });
      return;
    }

    const now = new Date();

    // Check shield
    const isShielded = target.shieldExpiresAt && new Date(target.shieldExpiresAt) > now;
    if (isShielded) {
      res.json({ result: "shielded", message: "Cell is protected by a shield" });
      return;
    }

    // Decoy trap: penalise striker
    if (target.isDecoy) {
      const penalty = Math.round(target.finalPoints * 0.15);
      // Take 15% from striker's pending/state, give to victim
      await db
        .update(vaultUsersTable)
        .set({
          pendingBonusPoints: sql`GREATEST(0, ${vaultUsersTable.pendingBonusPoints} - ${penalty}::bigint)`,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));

      // Give penalty as bonus to decoy owner
      await db
        .update(vaultUsersTable)
        .set({
          pendingBonusPoints: sql`${vaultUsersTable.pendingBonusPoints} + ${penalty}::bigint`,
          lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${penalty}::bigint`,
          state: creditedStateSql(penalty, {}, { toSpendable: false }),
        })
        .where(eq(vaultUsersTable.telegramId, target.telegramId));

      // Mark the decoy as destroyed (it already served its purpose)
      await db
        .update(arcadeSessionsTable)
        .set({ status: "destroyed", destroyedBy: telegramId, completedAt: now })
        .where(eq(arcadeSessionsTable.id, target.id));

      await logUserActivity(telegramId, "arcade_decoy_trapped", { room, x, y, penalty });
      res.json({ result: "decoy_trap", penalty, message: "💥 DECOY! You were penalised!" });
      return;
    }

    // Normal strike: victim loses remaining 75% of prize from SKX balance; striker gets it
    const remainingStake = Math.round(target.finalPoints * 0.75);

    await db
      .update(arcadeSessionsTable)
      .set({ status: "destroyed", destroyedBy: telegramId, completedAt: now })
      .where(eq(arcadeSessionsTable.id, target.id));

    // Deduct 75% from victim's SKX balance (floor at 0)
    let actualPenalty = remainingStake;
    if (remainingStake > 0) {
      const [victimRow] = await db
        .select({ skxBalance: vaultUsersTable.skxBalance })
        .from(vaultUsersTable)
        .where(eq(vaultUsersTable.telegramId, target.telegramId))
        .limit(1);
      actualPenalty = Math.min(remainingStake, victimRow?.skxBalance ?? 0);
      if (actualPenalty > 0) {
        await db
          .update(vaultUsersTable)
          .set({ skxBalance: sql`GREATEST(0, ${vaultUsersTable.skxBalance} - ${actualPenalty}::bigint)` })
          .where(eq(vaultUsersTable.telegramId, target.telegramId));
      }
    }

    // Striker earns the penalty amount as SKX
    if (actualPenalty > 0) {
      await db
        .update(vaultUsersTable)
        .set({ skxBalance: sql`${vaultUsersTable.skxBalance} + ${actualPenalty}::bigint` })
        .where(eq(vaultUsersTable.telegramId, telegramId));
    }

    await logUserActivity(telegramId, "arcade_strike", { room, x, y, strikerReward: actualPenalty, victimId: target.telegramId });

    // Notify victim
    void arcadeNotify(
      target.telegramId,
      `⚔️ Your cell at (${x},${y}) in ${room} was destroyed!\nYou lost ${actualPenalty.toLocaleString()} SKX.\n🛡 Buy a shield next time to protect your earnings.`,
    );

    // Look up attacker username for response
    const [strikerRow] = await db
      .select({ firstName: vaultUsersTable.firstName, username: vaultUsersTable.username })
      .from(vaultUsersTable)
      .where(eq(vaultUsersTable.telegramId, telegramId))
      .limit(1);
    const [victimRow2] = await db
      .select({ firstName: vaultUsersTable.firstName, username: vaultUsersTable.username })
      .from(vaultUsersTable)
      .where(eq(vaultUsersTable.telegramId, target.telegramId))
      .limit(1);

    res.json({
      result: "struck",
      strikerReward: actualPenalty,
      message: `💥 Strike! +${actualPenalty.toLocaleString()} SKX`,
      victim: {
        telegramId: target.telegramId,
        firstName: victimRow2?.firstName ?? null,
        username: victimRow2?.username ?? null,
      },
      striker: {
        telegramId,
        firstName: strikerRow?.firstName ?? null,
        username: strikerRow?.username ?? null,
      },
    });
  },
);

// ── POST /arcade/shop/buy ───────────────────────────────────────────────────────
router.post(
  "/arcade/shop/buy",
  rateLimit("arcade:shop-buy", 10, 60_000),
  async (req, res): Promise<void> => {
    const telegramId = getSessionTelegramId(req);
    if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { itemType, sessionId } = req.body as { itemType: string; sessionId?: number };

    const SHOP_ITEMS: Record<string, { stars: number; label: string }> = {
      shield_3h: { stars: 20, label: "Shield 3h" },
      shield_full: { stars: 80, label: "Shield Full" },
      decoy: { stars: 50, label: "Decoy Trap" },
      radar: { stars: 15, label: "Radar 3×3" },
      multi_strike: { stars: 30, label: "Multi-Strike ×5" },
    };

    const item = SHOP_ITEMS[itemType];
    if (!item) { res.status(400).json({ error: "Unknown item" }); return; }

    // Check user has enough stars
    const [user] = await db
      .select({ starsBalance: vaultUsersTable.starsBalance })
      .from(vaultUsersTable)
      .where(eq(vaultUsersTable.telegramId, telegramId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if ((user.starsBalance ?? 0) < item.stars) {
      res.status(402).json({ error: `Need ${item.stars} Stars, you have ${user.starsBalance ?? 0}` });
      return;
    }

    // Deduct stars
    await db
      .update(vaultUsersTable)
      .set({ starsBalance: sql`${vaultUsersTable.starsBalance} - ${item.stars}::int` })
      .where(
        and(
          eq(vaultUsersTable.telegramId, telegramId),
          gte(vaultUsersTable.starsBalance, item.stars),
        ),
      );

    // Apply item effect
    const now = new Date();
    if (itemType === "shield_3h" || itemType === "shield_full") {
      if (!sessionId) { res.status(400).json({ error: "sessionId required for shields" }); return; }
      const [session] = await db
        .select()
        .from(arcadeSessionsTable)
        .where(
          and(
            eq(arcadeSessionsTable.id, sessionId),
            eq(arcadeSessionsTable.telegramId, telegramId),
            eq(arcadeSessionsTable.status, "active"),
          ),
        )
        .limit(1);
      if (!session) { res.status(404).json({ error: "Active session not found" }); return; }
      const duration = itemType === "shield_3h" ? 3 * 3_600_000 : session.durationHours * 3_600_000;
      await db
        .update(arcadeSessionsTable)
        .set({ shieldExpiresAt: new Date(now.getTime() + duration) })
        .where(eq(arcadeSessionsTable.id, sessionId));
    } else if (itemType === "decoy") {
      if (!sessionId) { res.status(400).json({ error: "sessionId required for decoy" }); return; }
      await db
        .update(arcadeSessionsTable)
        .set({ isDecoy: true })
        .where(
          and(
            eq(arcadeSessionsTable.id, sessionId),
            eq(arcadeSessionsTable.telegramId, telegramId),
          ),
        );
    }
    // radar and multi_strike are handled client-side; we just log the purchase
    await db.insert(arcadePurchasesTable).values({
      telegramId,
      sessionId: sessionId ?? null,
      itemType,
      starsSpent: item.stars,
    });

    await logUserActivity(telegramId, "arcade_shop_buy", { itemType, starsSpent: item.stars, sessionId });
    res.json({ ok: true, itemType, starsSpent: item.stars });
  },
);

// ── GET /arcade/grid/:room/radar ───────────────────────────────────────────────
// Returns count of active cells in a 3×3 area around (cx,cy)
router.post(
  "/arcade/grid/radar",
  rateLimit("arcade:radar", 20, 60_000),
  async (req, res): Promise<void> => {
    const telegramId = getSessionTelegramId(req);
    if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { room, cx, cy } = req.body as { room: string; cx: number; cy: number };
    if (!VALID_ROOMS.includes(room)) { res.status(400).json({ error: "Invalid room" }); return; }

    await settleExpiredSessions();

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(arcadeSessionsTable)
      .where(
        and(
          eq(arcadeSessionsTable.roomType, room),
          eq(arcadeSessionsTable.status, "active"),
          gte(arcadeSessionsTable.gridX, cx - 1),
          sql`${arcadeSessionsTable.gridX} <= ${cx + 1}`,
          gte(arcadeSessionsTable.gridY, cy - 1),
          sql`${arcadeSessionsTable.gridY} <= ${cy + 1}`,
        ),
      );

    res.json({ room, cx, cy, activeCount: row?.count ?? 0 });
  },
);

// ── POST /arcade/ad/reward ─────────────────────────────────────────────────────
// Called after a user successfully watches a rewarded ad. Validates the daily
// limit then applies the chosen reward (shield 15 min / free radar enable /
// extra cell slot). Counters live in state.arcadeAdRewards (PROTECTED_STATE_KEY).
router.post(
  "/arcade/ad/reward",
  rateLimit("arcade:ad-reward", 15, 60_000),
  async (req, res): Promise<void> => {
    const telegramId = getSessionTelegramId(req);
    if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

    if (!(await isArcadeAccessible(telegramId))) {
      res.status(403).json({ error: "Arcade not accessible" }); return;
    }

    const { itemType, sessionId } = req.body as {
      itemType: string;
      sessionId?: number;
    };

    const VALID_TYPES = ["shield_15m", "radar_free", "extra_slot"];
    if (!VALID_TYPES.includes(itemType)) {
      res.status(400).json({ error: "Invalid itemType" }); return;
    }

    const DAILY_LIMITS: Record<string, number> = { shield_15m: 3, radar_free: 3, extra_slot: 2 };
    const STATE_KEY: Record<string, "shield15m" | "radarFree" | "extraSlot"> = {
      shield_15m: "shield15m",
      radar_free: "radarFree",
      extra_slot: "extraSlot",
    };
    const limit = DAILY_LIMITS[itemType];
    const stateKey = STATE_KEY[itemType];
    const day = todayKey();

    const [userRow] = await db
      .select({ state: vaultUsersTable.state })
      .from(vaultUsersTable)
      .where(eq(vaultUsersTable.telegramId, telegramId))
      .limit(1);
    if (!userRow) { res.status(404).json({ error: "User not found" }); return; }

    const uState = (userRow.state as Record<string, unknown>) ?? {};
    const adRaw = uState.arcadeAdRewards as { date?: string; shield15m?: number; radarFree?: number; extraSlot?: number } | undefined;
    const todayUsage: { date: string; shield15m: number; radarFree: number; extraSlot: number } =
      adRaw?.date === day
        ? { date: day, shield15m: adRaw.shield15m ?? 0, radarFree: adRaw.radarFree ?? 0, extraSlot: adRaw.extraSlot ?? 0 }
        : { date: day, shield15m: 0, radarFree: 0, extraSlot: 0 };

    const currentCount = todayUsage[stateKey];
    if (currentCount >= limit) {
      res.status(429).json({ error: "Daily limit reached", limitReached: true, limit, usedToday: currentCount });
      return;
    }

    // Apply the reward
    let extra: Record<string, unknown> = {};

    if (itemType === "shield_15m") {
      if (!sessionId) { res.status(400).json({ error: "sessionId required for shield_15m" }); return; }
      const shieldUntil = new Date(Date.now() + 15 * 60_000);
      const [updated] = await db
        .update(arcadeSessionsTable)
        .set({ shieldExpiresAt: shieldUntil })
        .where(and(
          eq(arcadeSessionsTable.id, sessionId),
          eq(arcadeSessionsTable.telegramId, telegramId),
          eq(arcadeSessionsTable.status, "active"),
        ))
        .returning({ id: arcadeSessionsTable.id, shieldExpiresAt: arcadeSessionsTable.shieldExpiresAt });
      if (!updated) { res.status(404).json({ error: "Session not found or not yours" }); return; }
      extra = { shieldExpiresAt: updated.shieldExpiresAt?.toISOString() };
    } else if (itemType === "extra_slot") {
      await db.execute(
        sql`UPDATE vault_users
            SET state = jsonb_set(
              COALESCE(state, '{}'),
              '{extraCellCredits}',
              to_jsonb(COALESCE((state->>'extraCellCredits')::int, 0) + 1)
            )
            WHERE telegram_id = ${telegramId}`,
      );
      extra = { extraCellCredits: (uState.extraCellCredits as number ?? 0) + 1 };
    }
    // radar_free: no server action needed — caller activates radar mode locally

    // Bump daily counter
    const newUsage = { ...todayUsage, [stateKey]: currentCount + 1 };
    await db.execute(
      sql`UPDATE vault_users
          SET state = jsonb_set(COALESCE(state, '{}'), '{arcadeAdRewards}', ${JSON.stringify(newUsage)}::jsonb)
          WHERE telegram_id = ${telegramId}`,
    );

    await logUserActivity(telegramId, "arcade_ad_reward", { itemType, ...extra });
    res.json({ ok: true, ...extra, usedToday: currentCount + 1, limit });
  },
);

// ── GET /arcade/admin/stats ─────────────────────────────────────────────────────
router.get("/arcade/admin/stats", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Admin only" }); return; }

  await settleExpiredSessions();

  const [totals] = await db
    .select({
      totalActive: sql<number>`count(*) filter (where status='active')::int`,
      totalWon: sql<number>`count(*) filter (where status='won' or status='credited')::int`,
      totalDestroyed: sql<number>`count(*) filter (where status='destroyed')::int`,
    })
    .from(arcadeSessionsTable);

  const roomStats = await db
    .select({
      roomType: arcadeSessionsTable.roomType,
      active: sql<number>`count(*) filter (where status='active')::int`,
    })
    .from(arcadeSessionsTable)
    .groupBy(arcadeSessionsTable.roomType);

  const todayTickets = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(arcadeTicketsTable)
    .where(and(eq(arcadeTicketsTable.dayKey, todayKey()), eq(arcadeTicketsTable.ticketGranted, true)));

  res.json({
    totalActive: totals?.totalActive ?? 0,
    totalWon: totals?.totalWon ?? 0,
    totalDestroyed: totals?.totalDestroyed ?? 0,
    ticketsToday: todayTickets[0]?.count ?? 0,
    roomStats: roomStats.reduce(
      (acc, r) => ({ ...acc, [r.roomType]: r.active }),
      {} as Record<string, number>,
    ),
  });
});

// ── GET /arcade/admin/sessions ──────────────────────────────────────────────────
router.get("/arcade/admin/sessions", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Admin only" }); return; }

  await settleExpiredSessions();

  const status = (req.query.status as string) || "active";
  const room = req.query.room as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);

  const conditions = [eq(arcadeSessionsTable.status, status)];
  if (room && VALID_ROOMS.includes(room)) {
    conditions.push(eq(arcadeSessionsTable.roomType, room));
  }

  const sessions = await db
    .select()
    .from(arcadeSessionsTable)
    .where(and(...conditions))
    .orderBy(desc(arcadeSessionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(arcadeSessionsTable)
    .where(and(...conditions));

  res.json({
    sessions: sessions.map((s) => ({
      ...s,
      expiresAt: s.expiresAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
      shieldExpiresAt: s.shieldExpiresAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  });
});

// ── DELETE /arcade/admin/sessions/:id ──────────────────────────────────────────
router.delete("/arcade/admin/sessions/:id", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Admin only" }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [session] = await db
    .update(arcadeSessionsTable)
    .set({ status: "destroyed", destroyedBy: "admin", completedAt: new Date() })
    .where(and(eq(arcadeSessionsTable.id, id), eq(arcadeSessionsTable.status, "active")))
    .returning();

  if (!session) { res.status(404).json({ error: "Session not found or not active" }); return; }
  res.json({ ok: true });
});

// ── Stack Tower: credit score ─────────────────────────────────────────────────
const STACK_PTS_PER_BLOCK = 18;
const STACK_MAX_SCORE     = 120; // clamp to prevent abuse

router.post("/games/stack/credit", rateLimit("stack-credit", 10, 30_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const score   = Math.max(0, Math.min(STACK_MAX_SCORE, Number((req.body as { score?: unknown }).score) | 0));
  const pts     = score * STACK_PTS_PER_BLOCK;

  if (pts > 0) {
    await db
      .update(vaultUsersTable)
      .set({
        lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${pts}::bigint`,
        state: creditedStateSql(pts, {}),
      })
      .where(eq(vaultUsersTable.telegramId, telegramId));

    await logUserActivity(telegramId, "stack_tower_credit", { score, pts });
  }

  res.json({ credited: pts });
});

// ── Zigzag Driver: credit score ───────────────────────────────────────────────
const ZIGZAG_PTS_PER_TILE = 4;
const ZIGZAG_MAX_SCORE    = 500;

router.post("/games/zigzag/credit", rateLimit("zigzag-credit", 10, 30_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const score = Math.max(0, Math.min(ZIGZAG_MAX_SCORE, Number((req.body as { score?: unknown }).score) | 0));
  const pts   = score * ZIGZAG_PTS_PER_TILE;

  if (pts > 0) {
    await db
      .update(vaultUsersTable)
      .set({
        lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${pts}::bigint`,
        state: creditedStateSql(pts, {}),
      })
      .where(eq(vaultUsersTable.telegramId, telegramId));

    await logUserActivity(telegramId, "zigzag_credit", { score, pts });
  }

  res.json({ credited: pts });
});

export default router;
