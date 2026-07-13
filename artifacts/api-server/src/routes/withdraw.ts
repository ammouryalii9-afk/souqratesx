import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, vaultUsersTable, withdrawalRequestsTable } from "@workspace/db";
import { getSessionTelegramId, isAdminSession } from "../lib/session";
import { getSettingsMap, asNumber } from "../lib/settings";

const router: IRouter = Router();

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_POINTS_PER_USD = 2_000_000; // must match config/public default
const MIN_WITHDRAWAL_USD = 0.5; // minimum withdrawal in dollars, points derived from the live rate

async function getPointsPerUsd(): Promise<number> {
  const settings = await getSettingsMap();
  const v = asNumber(settings.pointsPerDollar, DEFAULT_POINTS_PER_USD);
  return v > 0 ? v : DEFAULT_POINTS_PER_USD;
}

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

  const pointsPerUsd = await getPointsPerUsd();
  const minWithdrawalPoints = Math.round(MIN_WITHDRAWAL_USD * pointsPerUsd);

  if (typeof pointsAmount !== "number" || !Number.isInteger(pointsAmount) || pointsAmount < minWithdrawalPoints) {
    res.status(400).json({ error: `Minimum withdrawal is ${minWithdrawalPoints.toLocaleString()} points` });
    return;
  }
  if (typeof walletAddress !== "string" || !isValidTonWallet(walletAddress)) {
    res.status(400).json({ error: "Invalid TON wallet address. Use EQ... / UQ... format." });
    return;
  }

  // Fetch user
  const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!user || user.isBanned) { res.status(403).json({ error: "User not found or banned" }); return; }

  // Withdrawals draw down the AVAILABLE balance = lifetimePoints - withdrawnPoints.
  // lifetimePoints itself is never decremented: the client-authoritative PUT /vault/me
  // sync treats any client value above the server's as new earnings, so decrementing
  // here would let a stale/replayed sync re-mint the withdrawn points. The
  // withdrawnPoints ledger makes withdrawals permanent regardless of client state.
  const lifetimePoints = typeof user.lifetimePoints === "number" ? user.lifetimePoints : 0;
  const withdrawnPoints = typeof user.withdrawnPoints === "number" ? user.withdrawnPoints : 0;
  const availablePoints = lifetimePoints - withdrawnPoints;

  if (availablePoints < pointsAmount) {
    res.status(400).json({ error: `Insufficient balance. You have ${Math.max(0, Math.floor(availablePoints)).toLocaleString()} pts available.` });
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
  const usdAmount = pointsAmount / pointsPerUsd;
  const tonAmount = usdAmount / tonPriceUsd;

  // Lock points + create the request in ONE transaction — either both happen
  // or neither does. The guard-in-WHERE prevents overdraw under concurrency, and
  // the partial unique index (one pending request per user) makes a concurrent
  // duplicate request abort the whole transaction (the lock rolls back too —
  // no manual refund needed, so a transient DB error can never mint points).
  let result: { request: typeof withdrawalRequestsTable.$inferSelect; lifetimePoints: number; withdrawnPoints: number };
  try {
    result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(vaultUsersTable)
        .set({
          withdrawnPoints: sql`${vaultUsersTable.withdrawnPoints} + ${pointsAmount}`,
        })
        .where(
          and(
            eq(vaultUsersTable.telegramId, telegramId),
            sql`${vaultUsersTable.lifetimePoints} - ${vaultUsersTable.withdrawnPoints} >= ${pointsAmount}`,
          ),
        )
        .returning({ lifetimePoints: vaultUsersTable.lifetimePoints, withdrawnPoints: vaultUsersTable.withdrawnPoints });

      if (!updated) {
        throw Object.assign(new Error("insufficient_points"), { appCode: "insufficient_points" });
      }

      const [request] = await tx
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

      return { request, lifetimePoints: updated.lifetimePoints, withdrawnPoints: updated.withdrawnPoints };
    });
  } catch (err) {
    const e = err as { appCode?: string; code?: string; cause?: { code?: string } };
    if (e.appCode === "insufficient_points") {
      res.status(400).json({ error: "Insufficient points (balance changed). Please refresh and try again." });
      return;
    }
    // Postgres unique_violation (23505) from the one-pending-per-user index.
    const pgCode = e.code ?? e.cause?.code;
    if (pgCode === "23505") {
      req.log.warn({ telegramId }, "Concurrent pending withdrawal blocked by unique index — transaction rolled back");
      res.status(409).json({ error: "You already have a pending withdrawal request. Wait for it to be processed." });
      return;
    }
    req.log.error({ telegramId, err }, "Withdrawal request transaction failed");
    res.status(500).json({ error: "Withdrawal request failed. Please try again." });
    return;
  }

  res.json({ ok: true, request: result.request, lifetimePoints: result.lifetimePoints, withdrawnPoints: result.withdrawnPoints });
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

  // Atomic gate: only a still-pending request can transition to approved.
  // Two admins racing → exactly one wins; the loser gets 409.
  const [updated] = await db
    .update(withdrawalRequestsTable)
    .set({ status: "approved", adminNote: adminNote?.trim() ?? null, processedAt: new Date() })
    .where(and(eq(withdrawalRequestsTable.id, id), eq(withdrawalRequestsTable.status, "pending")))
    .returning();

  if (!updated) {
    const [exists] = await db.select({ id: withdrawalRequestsTable.id }).from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.id, id));
    res.status(exists ? 409 : 404).json({ error: exists ? "Request already processed" : "Request not found" });
    return;
  }

  res.json({ ok: true, request: updated });
});

/** POST /api/admin/withdrawals/:id/reject */
router.post("/admin/withdrawals/:id/reject", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }

  const id = Number(req.params.id);
  const { adminNote } = (req.body ?? {}) as { adminNote?: string };

  // Atomic gate FIRST: only a still-pending request can transition to rejected.
  // The refund happens only after winning this gate — two racing rejects (or a
  // reject racing an approve) can never double-refund or clobber an approval.
  const [updated] = await db
    .update(withdrawalRequestsTable)
    .set({ status: "rejected", adminNote: adminNote?.trim() ?? null, processedAt: new Date() })
    .where(and(eq(withdrawalRequestsTable.id, id), eq(withdrawalRequestsTable.status, "pending")))
    .returning();

  if (!updated) {
    const [exists] = await db.select({ id: withdrawalRequestsTable.id }).from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.id, id));
    res.status(exists ? 409 : 404).json({ error: exists ? "Request already processed" : "Request not found" });
    return;
  }

  // Unlock the points by reducing the withdrawnPoints ledger (never below 0) —
  // available balance = lifetimePoints - withdrawnPoints goes back up automatically.
  await db
    .update(vaultUsersTable)
    .set({
      withdrawnPoints: sql`GREATEST(${vaultUsersTable.withdrawnPoints} - ${updated.pointsAmount}, 0)`,
    })
    .where(eq(vaultUsersTable.telegramId, updated.telegramId));

  res.json({ ok: true, request: updated });
});

export default router;
