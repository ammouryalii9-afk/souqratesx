import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, vaultUsersTable, withdrawalRequestsTable } from "@workspace/db";
import { getSessionTelegramId, isAdminSession } from "../lib/session";

const router: IRouter = Router();

// ── Constants ──────────────────────────────────────────────────────────────────

const POINTS_PER_USD = 1_000_000;    // 1M pts = $1
const MIN_WITHDRAWAL_POINTS = 500_000; // 0.50 USD minimum

// ── TON price cache (5-minute TTL) ────────────────────────────────────────────

let cachedTonPrice: number | null = null;
let tonPriceCachedAt = 0;
const TON_PRICE_TTL_MS = 5 * 60 * 1000;

async function getTonPriceUsd(): Promise<number> {
  if (cachedTonPrice && Date.now() - tonPriceCachedAt < TON_PRICE_TTL_MS) {
    return cachedTonPrice;
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd",
      { signal: AbortSignal.timeout(8000) },
    );
    const data = (await res.json()) as { "the-open-network": { usd: number } };
    cachedTonPrice = data["the-open-network"].usd;
    tonPriceCachedAt = Date.now();
    return cachedTonPrice;
  } catch {
    // fall back to cached value or a safe default
    return cachedTonPrice ?? 5;
  }
}

// ── TON wallet basic validation ───────────────────────────────────────────────

function isValidTonWallet(addr: string): boolean {
  const trimmed = addr.trim();
  // Friendly format: EQ... or UQ... (48 base64url chars)
  if (/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(trimmed)) return true;
  // Raw format: 0:<64 hex chars>
  if (/^0:[0-9a-fA-F]{64}$/.test(trimmed)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public endpoints (authenticated user)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/ton-price — current TON/USD rate */
router.get("/ton-price", async (_req, res): Promise<void> => {
  const price = await getTonPriceUsd();
  res.json({ usd: price, cachedAt: new Date(tonPriceCachedAt).toISOString() });
});

/** POST /api/withdraw/request — submit a withdrawal request */
router.post("/withdraw/request", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { pointsAmount, walletAddress } = req.body as { pointsAmount?: unknown; walletAddress?: unknown };

  if (typeof pointsAmount !== "number" || !Number.isInteger(pointsAmount) || pointsAmount < MIN_WITHDRAWAL_POINTS) {
    res.status(400).json({ error: `Minimum withdrawal is ${MIN_WITHDRAWAL_POINTS.toLocaleString()} points` });
    return;
  }
  if (typeof walletAddress !== "string" || !isValidTonWallet(walletAddress)) {
    res.status(400).json({ error: "Invalid TON wallet address. Use EQ... / UQ... format." });
    return;
  }

  // Fetch user
  const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!user || user.isBanned) { res.status(403).json({ error: "User not found or banned" }); return; }

  const state = (user.state ?? {}) as Record<string, unknown>;
  const tempMiningPoints = typeof state["tempMiningPoints"] === "number" ? state["tempMiningPoints"] : 0;

  if (tempMiningPoints < pointsAmount) {
    res.status(400).json({ error: `Insufficient mined balance. You have ${Math.floor(tempMiningPoints).toLocaleString()} pts.` });
    return;
  }

  // Check for existing pending request (1 at a time)
  const [existing] = await db
    .select({ id: withdrawalRequestsTable.id })
    .from(withdrawalRequestsTable)
    .where(and(eq(withdrawalRequestsTable.telegramId, telegramId), eq(withdrawalRequestsTable.status, "pending")));
  if (existing) {
    res.status(409).json({ error: "You already have a pending withdrawal request. Wait for it to be processed." });
    return;
  }

  // Fetch live TON price
  const tonPriceUsd = await getTonPriceUsd();
  const usdAmount = pointsAmount / POINTS_PER_USD;
  const tonAmount = usdAmount / tonPriceUsd;

  // Atomically deduct points from lifetimePoints + state.tempMiningPoints
  const [updated] = await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: sql`GREATEST(0, ${vaultUsersTable.lifetimePoints} - ${pointsAmount})`,
      state: sql`jsonb_set(
        COALESCE(${vaultUsersTable.state}, '{}'::jsonb),
        '{tempMiningPoints}',
        to_jsonb(GREATEST(0, COALESCE((${vaultUsersTable.state}->>'tempMiningPoints')::numeric, 0) - ${pointsAmount}))
      )`,
    })
    .where(
      and(
        eq(vaultUsersTable.telegramId, telegramId),
        sql`${vaultUsersTable.lifetimePoints} >= ${pointsAmount}`,
        sql`COALESCE((${vaultUsersTable.state}->>'tempMiningPoints')::numeric, 0) >= ${pointsAmount}`,
      ),
    )
    .returning({ lifetimePoints: vaultUsersTable.lifetimePoints });

  if (!updated) {
    res.status(400).json({ error: "Insufficient points (balance changed). Please refresh and try again." });
    return;
  }

  // Create the request
  const [request] = await db
    .insert(withdrawalRequestsTable)
    .values({
      telegramId,
      pointsAmount,
      usdAmount,
      tonAmount,
      tonPriceUsd,
      walletAddress: walletAddress.trim(),
    })
    .returning();

  res.json({ ok: true, request, lifetimePoints: updated.lifetimePoints });
});

/** GET /api/withdraw/my-requests — user's withdrawal history */
router.get("/withdraw/my-requests", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const rows = await db
    .select()
    .from(withdrawalRequestsTable)
    .where(eq(withdrawalRequestsTable.telegramId, telegramId))
    .orderBy(desc(withdrawalRequestsTable.createdAt));

  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin endpoints
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/withdrawals */
router.get("/admin/withdrawals", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }

  const rows = await db
    .select({
      id: withdrawalRequestsTable.id,
      telegramId: withdrawalRequestsTable.telegramId,
      pointsAmount: withdrawalRequestsTable.pointsAmount,
      usdAmount: withdrawalRequestsTable.usdAmount,
      tonAmount: withdrawalRequestsTable.tonAmount,
      tonPriceUsd: withdrawalRequestsTable.tonPriceUsd,
      walletAddress: withdrawalRequestsTable.walletAddress,
      status: withdrawalRequestsTable.status,
      adminNote: withdrawalRequestsTable.adminNote,
      createdAt: withdrawalRequestsTable.createdAt,
      processedAt: withdrawalRequestsTable.processedAt,
      username: vaultUsersTable.username,
      firstName: vaultUsersTable.firstName,
    })
    .from(withdrawalRequestsTable)
    .leftJoin(vaultUsersTable, eq(withdrawalRequestsTable.telegramId, vaultUsersTable.telegramId))
    .orderBy(desc(withdrawalRequestsTable.createdAt));

  res.json(rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    processedAt: r.processedAt?.toISOString() ?? null,
  })));
});

/** POST /api/admin/withdrawals/:id/approve */
router.post("/admin/withdrawals/:id/approve", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }

  const id = Number(req.params.id);
  const { adminNote } = (req.body ?? {}) as { adminNote?: string };

  const [request] = await db.select().from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  if (request.status !== "pending") { res.status(409).json({ error: "Request already processed" }); return; }

  const [updated] = await db
    .update(withdrawalRequestsTable)
    .set({ status: "approved", adminNote: adminNote?.trim() ?? null, processedAt: new Date() })
    .where(eq(withdrawalRequestsTable.id, id))
    .returning();

  res.json({ ok: true, request: updated });
});

/** POST /api/admin/withdrawals/:id/reject */
router.post("/admin/withdrawals/:id/reject", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }

  const id = Number(req.params.id);
  const { adminNote } = (req.body ?? {}) as { adminNote?: string };

  const [request] = await db.select().from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  if (request.status !== "pending") { res.status(409).json({ error: "Request already processed" }); return; }

  // Restore deducted points
  await db
    .update(vaultUsersTable)
    .set({
      lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${request.pointsAmount}`,
      state: sql`jsonb_set(
        COALESCE(${vaultUsersTable.state}, '{}'::jsonb),
        '{tempMiningPoints}',
        to_jsonb(COALESCE((${vaultUsersTable.state}->>'tempMiningPoints')::numeric, 0) + ${request.pointsAmount})
      )`,
    })
    .where(eq(vaultUsersTable.telegramId, request.telegramId));

  const [updated] = await db
    .update(withdrawalRequestsTable)
    .set({ status: "rejected", adminNote: adminNote?.trim() ?? null, processedAt: new Date() })
    .where(eq(withdrawalRequestsTable.id, id))
    .returning();

  res.json({ ok: true, request: updated });
});

export default router;
