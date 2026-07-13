import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, vaultUsersTable, pixelCyclesTable, pixelsTable, pixelDividendsTable, pixelUsdWithdrawalsTable } from "@workspace/db";
import { GetPixelMarketResponse, BuyPixelsBody, BuyPixelsResponse, GetMyPixelsResponse } from "@workspace/api-zod";
import { getSessionTelegramId, isAdminSession } from "../lib/session";
import { rateLimit } from "../lib/rateLimit";
import { logUserActivity } from "../lib/activityLog";
import {
  getPixelSettings,
  priceAt,
  blendedCost,
  cycleSold,
  forceCloseActiveCycle,
  listCycles,
} from "../lib/pixelCycle";

const router: IRouter = Router();

async function getActiveCycle() {
  const [cycle] = await db.select().from(pixelCyclesTable).where(eq(pixelCyclesTable.status, "active")).limit(1);
  return cycle;
}

async function userPixelsInCycle(telegramId: string, cycleId: number): Promise<number> {
  const [row] = await db
    .select({ held: sql<string>`COALESCE(SUM(${pixelsTable.quantity}), 0)` })
    .from(pixelsTable)
    .where(and(eq(pixelsTable.cycleId, cycleId), eq(pixelsTable.telegramId, telegramId)));
  return Number(row?.held ?? 0);
}

// ── GET /pixels/market — the active cycle's market snapshot ──────────────────
router.get("/pixels/market", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const cycle = await getActiveCycle();
  if (!cycle) {
    res.status(404).json({ error: "No active pixel cycle" });
    return;
  }

  const settings = await getPixelSettings();
  const [sold, myPixels, [me]] = await Promise.all([
    cycleSold(cycle.id),
    userPixelsInCycle(telegramId, cycle.id),
    db
      .select({ skxBalance: vaultUsersTable.skxBalance })
      .from(vaultUsersTable)
      .where(eq(vaultUsersTable.telegramId, telegramId)),
  ]);

  res.json(
    GetPixelMarketResponse.parse({
      cycleId: cycle.id,
      endDate: cycle.endDate.toISOString(),
      totalSupply: settings.totalSupply,
      sold,
      remaining: Math.max(0, settings.totalSupply - sold),
      tiers: settings.tiers,
      currentPrice: priceAt(settings.tiers, sold),
      dividendPercent: settings.dividendPercent,
      estimatedPoolSkx: Math.floor((cycle.totalAdRevenueSkx * settings.dividendPercent) / 100),
      maxPerPurchase: settings.maxPerPurchase,
      myPixels,
      skxBalance: me?.skxBalance ?? 0,
    }),
  );
});

// ── POST /pixels/buy — buy pixels with SKX (atomic supply + balance checks) ──
router.post("/pixels/buy", rateLimit("pixels-buy", 20, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = BuyPixelsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const quantity = Math.floor(parsed.data.quantity);
  const settings = await getPixelSettings();
  if (quantity <= 0 || quantity > settings.maxPerPurchase) {
    res.status(400).json({ error: `Quantity must be between 1 and ${settings.maxPerPurchase}` });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Row-lock the active cycle: serializes concurrent purchases, so the
      // sold-count check below cannot oversell the supply.
      const [cycle] = await tx
        .select()
        .from(pixelCyclesTable)
        .where(eq(pixelCyclesTable.status, "active"))
        .limit(1)
        .for("update");
      if (!cycle) throw Object.assign(new Error("no_cycle"), { appCode: "no_cycle" });
      if (cycle.endDate.getTime() <= Date.now()) {
        throw Object.assign(new Error("cycle_ended"), { appCode: "cycle_ended" });
      }

      const [soldRow] = await tx
        .select({ sold: sql<string>`COALESCE(SUM(${pixelsTable.quantity}), 0)` })
        .from(pixelsTable)
        .where(eq(pixelsTable.cycleId, cycle.id));
      const sold = Number(soldRow?.sold ?? 0);
      const remaining = settings.totalSupply - sold;
      if (quantity > remaining) {
        throw Object.assign(new Error("supply"), { appCode: "supply", remaining });
      }

      const cost = blendedCost(settings.tiers, sold, quantity);

      // Deduct SKX with a guard-in-WHERE — no overdraft even if another request
      // (outside this cycle lock) is spending concurrently.
      const [updated] = await tx
        .update(vaultUsersTable)
        .set({ skxBalance: sql`${vaultUsersTable.skxBalance} - ${cost}::bigint` })
        .where(
          and(
            eq(vaultUsersTable.telegramId, telegramId),
            eq(vaultUsersTable.isBanned, false),
            sql`${vaultUsersTable.skxBalance} >= ${cost}::bigint`,
          ),
        )
        .returning({ skxBalance: vaultUsersTable.skxBalance });
      if (!updated) throw Object.assign(new Error("insufficient"), { appCode: "insufficient", cost });

      await tx.insert(pixelsTable).values({
        telegramId,
        cycleId: cycle.id,
        quantity,
        pricePaidSkx: cost,
      });

      return {
        cycleId: cycle.id,
        cost,
        skxBalance: updated.skxBalance,
        remaining: remaining - quantity,
      };
    });

    const myPixels = await userPixelsInCycle(telegramId, result.cycleId);
    await logUserActivity(telegramId, "pixels_buy", { cycleId: result.cycleId, quantity, cost: result.cost });
    req.log.info({ telegramId, cycleId: result.cycleId, quantity, cost: result.cost }, "pixels purchased");

    res.json(
      BuyPixelsResponse.parse({
        purchasedQuantity: quantity,
        pricePaidSkx: result.cost,
        skxBalance: result.skxBalance,
        myPixels,
        remaining: result.remaining,
      }),
    );
  } catch (err) {
    const e = err as { appCode?: string; remaining?: number; cost?: number };
    if (e.appCode === "no_cycle") {
      res.status(409).json({ error: "No active pixel cycle" });
      return;
    }
    if (e.appCode === "cycle_ended") {
      res.status(409).json({ error: "Cycle has ended — dividends are being distributed" });
      return;
    }
    if (e.appCode === "supply") {
      res.status(400).json({ error: `Only ${e.remaining ?? 0} pixels left in this cycle` });
      return;
    }
    if (e.appCode === "insufficient") {
      res.status(400).json({ error: "Insufficient SKX balance" });
      return;
    }
    req.log.error({ err, telegramId }, "pixel purchase failed");
    res.status(500).json({ error: "Purchase failed. Please try again." });
  }
});

// ── GET /pixels/me — my holdings + dividend history + USD balance ─────────────
router.get("/pixels/me", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const cycle = await getActiveCycle();
  const [myPixels, dividends, [me]] = await Promise.all([
    cycle ? userPixelsInCycle(telegramId, cycle.id) : Promise.resolve(0),
    db
      .select()
      .from(pixelDividendsTable)
      .where(eq(pixelDividendsTable.telegramId, telegramId))
      .orderBy(desc(pixelDividendsTable.paidAt))
      .limit(24),
    db
      .select({ pixelUsdCents: vaultUsersTable.pixelUsdCents })
      .from(vaultUsersTable)
      .where(eq(vaultUsersTable.telegramId, telegramId)),
  ]);

  res.json(
    GetMyPixelsResponse.parse({
      cycleId: cycle?.id ?? null,
      myPixels,
      pixelUsdCents: me?.pixelUsdCents ?? 0,
      dividends: dividends.map((d) => ({
        cycleId: d.cycleId,
        pixelsHeld: d.pixelsHeld,
        dividendSkx: d.dividendSkx,
        paidAt: d.paidAt.toISOString(),
      })),
    }),
  );
});

// ── POST /pixels/withdraw-usd — request withdrawal of USD pixel balance ───────
// Min withdrawal: $50 (5000 cents). Balance is zeroed immediately on submit;
// refunded to pixelUsdCents if admin rejects via POST /admin/pixels/usd-withdrawals/:id/reject.
const MIN_WITHDRAWAL_CENTS = 5000;
router.post("/pixels/withdraw-usd", rateLimit("pixels-withdraw-usd", 5, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const { id: withdrawalId, usdCents } = await db.transaction(async (tx) => {
      // Lock the row — reads the exact balance before zeroing it out.
      const [row] = await tx
        .select({ pixelUsdCents: vaultUsersTable.pixelUsdCents })
        .from(vaultUsersTable)
        .where(and(eq(vaultUsersTable.telegramId, telegramId), eq(vaultUsersTable.isBanned, false)))
        .for("update");

      if (!row || row.pixelUsdCents < MIN_WITHDRAWAL_CENTS) {
        throw Object.assign(new Error("insufficient"), { appCode: "insufficient", balance: row?.pixelUsdCents ?? 0 });
      }
      const amount = row.pixelUsdCents;

      // Zero out the balance atomically inside the same transaction.
      await tx
        .update(vaultUsersTable)
        .set({ pixelUsdCents: sql`0` })
        .where(eq(vaultUsersTable.telegramId, telegramId));

      // Insert the withdrawal request. The unique partial index on (telegram_id)
      // WHERE status='pending' prevents a second concurrent pending request.
      const [w] = await tx
        .insert(pixelUsdWithdrawalsTable)
        .values({ telegramId, usdCents: amount })
        .onConflictDoNothing()
        .returning({ id: pixelUsdWithdrawalsTable.id, usdCents: pixelUsdWithdrawalsTable.usdCents });

      if (!w) throw Object.assign(new Error("already_pending"), { appCode: "already_pending" });
      return w;
    });

    await logUserActivity(telegramId, "pixel_usd_withdraw_request", { withdrawalId, usdCents });
    req.log.info({ telegramId, withdrawalId, usdCents }, "pixel USD withdrawal requested");
    res.json({ ok: true, id: withdrawalId, usdCents });
  } catch (err) {
    const e = err as { appCode?: string; balance?: number };
    if (e.appCode === "insufficient") {
      res.status(400).json({
        error: `Minimum withdrawal is $${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2)}. Your balance: $${((e.balance ?? 0) / 100).toFixed(2)}`,
      });
      return;
    }
    if (e.appCode === "already_pending") {
      res.status(409).json({ error: "You already have a pending withdrawal request." });
      return;
    }
    req.log.error({ err, telegramId }, "pixel USD withdrawal failed");
    res.status(500).json({ error: "Withdrawal failed. Please try again." });
  }
});

// ── POST /admin/pixels/usd-withdrawals/:id/approve — admin approve ────────────
router.post("/admin/pixels/usd-withdrawals/:id/approve", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }
  const id = parseInt(req.params.id, 10);
  const [updated] = await db
    .update(pixelUsdWithdrawalsTable)
    .set({ status: "approved", processedAt: new Date(), adminNote: req.body?.note ?? null })
    .where(and(eq(pixelUsdWithdrawalsTable.id, id), eq(pixelUsdWithdrawalsTable.status, "pending")))
    .returning({ id: pixelUsdWithdrawalsTable.id });
  if (!updated) { res.status(404).json({ error: "Request not found or already processed" }); return; }
  req.log.info({ id }, "pixel USD withdrawal approved");
  res.json({ ok: true });
});

// ── POST /admin/pixels/usd-withdrawals/:id/reject — admin reject + refund ─────
router.post("/admin/pixels/usd-withdrawals/:id/reject", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }
  const id = parseInt(req.params.id, 10);
  const [w] = await db
    .update(pixelUsdWithdrawalsTable)
    .set({ status: "rejected", processedAt: new Date(), adminNote: req.body?.note ?? null })
    .where(and(eq(pixelUsdWithdrawalsTable.id, id), eq(pixelUsdWithdrawalsTable.status, "pending")))
    .returning({ telegramId: pixelUsdWithdrawalsTable.telegramId, usdCents: pixelUsdWithdrawalsTable.usdCents });
  if (!w) { res.status(404).json({ error: "Request not found or already processed" }); return; }
  // Refund the balance back to the user
  await db
    .update(vaultUsersTable)
    .set({ pixelUsdCents: sql`${vaultUsersTable.pixelUsdCents} + ${w.usdCents}::bigint` })
    .where(eq(vaultUsersTable.telegramId, w.telegramId));
  req.log.info({ id, refundCents: w.usdCents }, "pixel USD withdrawal rejected + refunded");
  res.json({ ok: true });
});

// ── GET /admin/pixels/usd-withdrawals — list all requests ────────────────────
router.get("/admin/pixels/usd-withdrawals", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }
  const rows = await db
    .select()
    .from(pixelUsdWithdrawalsTable)
    .orderBy(desc(pixelUsdWithdrawalsTable.createdAt))
    .limit(200);
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin endpoints (manual-fetch admin panel — not in the OpenAPI spec)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/pixels/cycles — cycle history + live stats for the active one */
router.get("/admin/pixels/cycles", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) {
    res.status(401).json({ error: "Not admin" });
    return;
  }

  const settings = await getPixelSettings();
  const cycles = await listCycles();
  const active = cycles.find((c) => c.status === "active");
  let activeStats: { sold: number; holders: number } | null = null;
  if (active) {
    const [row] = await db
      .select({
        sold: sql<string>`COALESCE(SUM(${pixelsTable.quantity}), 0)`,
        holders: sql<string>`COUNT(DISTINCT ${pixelsTable.telegramId})`,
      })
      .from(pixelsTable)
      .where(eq(pixelsTable.cycleId, active.id));
    activeStats = { sold: Number(row?.sold ?? 0), holders: Number(row?.holders ?? 0) };
  }

  res.json({
    settings,
    activeStats,
    cycles: cycles.map((c) => ({
      id: c.id,
      status: c.status,
      startDate: c.startDate.toISOString(),
      endDate: c.endDate.toISOString(),
      totalAdRevenueSkx: c.totalAdRevenueSkx,
      distributionAmountSkx: c.distributionAmountSkx,
      totalPixelsSold: c.totalPixelsSold,
    })),
  });
});

/** POST /api/admin/pixels/cycles/close — force-close the active cycle and distribute now */
router.post("/admin/pixels/cycles/close", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) {
    res.status(401).json({ error: "Not admin" });
    return;
  }

  const closed = await forceCloseActiveCycle();
  if (!closed) {
    res.status(404).json({ error: "No active cycle to close" });
    return;
  }
  req.log.info("admin force-closed the active pixel cycle");
  res.json({ ok: true });
});

export default router;
