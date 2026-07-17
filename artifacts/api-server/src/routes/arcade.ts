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
import { getSettingsMap, asString } from "../lib/settings";

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
  6: 20_000,
  12: 50_000,
  24: 100_000,
};

const VALID_ROOMS = ["easy", "tactical", "hardcore"];
const VALID_DURATIONS = [6, 12, 24];
const ADS_NEEDED = 5;
const STARS_FOR_TICKET = 100;

// Resolve all expired-but-still-"active" sessions lazily when a user queries
async function settleExpiredSessions(): Promise<void> {
  const now = new Date();
  await db
    .update(arcadeSessionsTable)
    .set({ status: "won", completedAt: now })
    .where(
      and(
        eq(arcadeSessionsTable.status, "active"),
        sql`${arcadeSessionsTable.expiresAt} <= now()`,
      ),
    );
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
    // Award points — background credit → pendingBonusPoints (toSpendable: false)
    if (totalWonPoints > 0) {
      await db
        .update(vaultUsersTable)
        .set({
          pendingBonusPoints: sql`${vaultUsersTable.pendingBonusPoints} + ${totalWonPoints}::bigint`,
          lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${totalWonPoints}::bigint`,
          state: creditedStateSql(totalWonPoints, {}, { toSpendable: false }),
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      await logUserActivity(telegramId, "arcade_won", { totalWonPoints });
    }
  }

  const ticket = await getTodayTicket(telegramId);
  const activeSessions = await getUserActiveSessions(telegramId);

  // Fetch user row for starsBalance + extraCellCredits from state JSONB
  const [userRow] = await db
    .select({ starsBalance: vaultUsersTable.starsBalance, state: vaultUsersTable.state })
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.telegramId, telegramId))
    .limit(1);

  const extraCellCredits = (userRow?.state as Record<string, unknown> | null)?.extraCellCredits as number ?? 0;

  res.json({
    hasTicket: ticket?.ticketGranted ?? false,
    adsWatched: ticket?.adsWatched ?? 0,
    adsNeeded: ADS_NEEDED,
    starsBalance: userRow?.starsBalance ?? 0,
    extraCellCredits,
    todayKey: todayKey(),
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

// ── POST /arcade/shop/invoice ────────────────────────────────────────────────────
// Creates a REAL Telegram Stars invoice for a shop item.
// The webhook (successful_payment) applies the item effect after payment.
const ARCADE_SHOP_CATALOG: Record<string, { stars: number; label: string; desc: string }> = {
  shield_3h:    { stars: 20,  label: "🛡️ Shield 3h",        desc: "Protect your cell for 3 hours" },
  shield_full:  { stars: 80,  label: "🔰 Full Shield",       desc: "Shield lasts the entire session" },
  decoy:        { stars: 50,  label: "💥 Decoy Trap",        desc: "Next attacker gets penalised" },
  radar:        { stars: 15,  label: "📡 Radar Scan",        desc: "Reveal enemies in a 3×3 area" },
  multi_strike: { stars: 30,  label: "⚡ Multi-Strike ×5",   desc: "Claim 5 cells simultaneously" },
  extra_cells:  { stars: 500, label: "🗺️ Extra Cells ×3",    desc: "Unlock 3 additional cell slots permanently" },
};

router.post(
  "/arcade/shop/invoice",
  rateLimit("arcade:shop-invoice", 10, 60_000),
  async (req, res): Promise<void> => {
    const telegramId = getSessionTelegramId(req);
    if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { itemType, sessionId } = req.body as { itemType: string; sessionId?: number };
    const item = ARCADE_SHOP_CATALOG[itemType];
    if (!item) { res.status(400).json({ error: "Unknown item" }); return; }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) { res.status(503).json({ error: "Bot not configured" }); return; }

    const payload = JSON.stringify({ effect: "arcade_shop", telegramId, itemType, sessionId: sessionId ?? null });
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.label,
        description: item.desc,
        payload,
        currency: "XTR",
        prices: [{ label: item.label, amount: item.stars }],
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

  res.json({
    room,
    gridSize: ROOM_GRID_SIZE[room],
    totalActive: activeCells.length,
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

    // Must have a ticket today
    const ticket = await getTodayTicket(telegramId);
    if (!ticket?.ticketGranted) {
      res.status(403).json({ error: "No daily ticket — watch 5 ads or pay 100 Stars" });
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

    await logUserActivity(telegramId, "arcade_claim", { room, x, y, durationHours, finalPoints });
    res.json({
      session: {
        id: session.id,
        roomType: session.roomType,
        gridX: session.gridX,
        gridY: session.gridY,
        durationHours: session.durationHours,
        finalPoints: session.finalPoints,
        expiresAt: session.expiresAt.toISOString(),
        hasShield: false,
        isDecoy: false,
      },
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

    const ticket = await getTodayTicket(telegramId);
    if (!ticket?.ticketGranted) {
      res.status(403).json({ error: "No daily ticket" });
      return;
    }

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

    // Normal strike: destroy session, striker gets 10% of victim's points
    const strikerReward = Math.round(target.finalPoints * 0.1);

    await db
      .update(arcadeSessionsTable)
      .set({ status: "destroyed", destroyedBy: telegramId, completedAt: now })
      .where(eq(arcadeSessionsTable.id, target.id));

    if (strikerReward > 0) {
      await db
        .update(vaultUsersTable)
        .set({
          pendingBonusPoints: sql`${vaultUsersTable.pendingBonusPoints} + ${strikerReward}::bigint`,
          lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${strikerReward}::bigint`,
          state: creditedStateSql(strikerReward, {}, { toSpendable: false }),
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
    }

    await logUserActivity(telegramId, "arcade_strike", { room, x, y, strikerReward, victimId: target.telegramId });
    res.json({ result: "struck", strikerReward, message: `💥 Strike! +${strikerReward.toLocaleString()} pts` });
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

export default router;
