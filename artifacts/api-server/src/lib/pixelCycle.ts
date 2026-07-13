import { sql, eq, and, desc } from "drizzle-orm";
import { db, vaultUsersTable, pixelCyclesTable, pixelsTable, pixelDividendsTable } from "@workspace/db";
import { getSettingsMap, asNumber } from "./settings";
import { skxCreditFields } from "./skxCredit";
import { logger } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Pixels — 15-day investment cycles. Users buy Pixels with SKX at tiered
// prices; at cycle end a percentage of the cycle's verified ad revenue is
// distributed proportionally to holders, then all pixels expire and (if
// auto-start is on) a fresh cycle begins.
// ─────────────────────────────────────────────────────────────────────────────

export interface PixelTier {
  upTo: number;
  price: number;
}

export interface PixelSettings {
  totalSupply: number;
  tiers: PixelTier[];
  dividendPercent: number;
  cycleDays: number;
  autoStart: boolean;
  maxPerPurchase: number;
}

const DEFAULT_TIERS: PixelTier[] = [
  { upTo: 1000, price: 2500 },
  { upTo: 3000, price: 3000 },
  { upTo: 5000, price: 4000 },
  { upTo: 7000, price: 5500 },
  { upTo: 9000, price: 7000 },
  { upTo: 10000, price: 10000 },
];

export async function getPixelSettings(): Promise<PixelSettings> {
  const settings = await getSettingsMap();
  const rawTiers = settings.pixelPriceTiers;
  let tiers: PixelTier[] = DEFAULT_TIERS;
  if (Array.isArray(rawTiers)) {
    const parsed = rawTiers
      .filter(
        (t): t is { upTo: number; price: number } =>
          typeof t === "object" && t !== null &&
          typeof (t as Record<string, unknown>).upTo === "number" &&
          typeof (t as Record<string, unknown>).price === "number",
      )
      .map((t) => ({ upTo: Math.floor(t.upTo), price: Math.floor(t.price) }))
      .filter((t) => t.upTo > 0 && t.price > 0)
      .sort((a, b) => a.upTo - b.upTo);
    if (parsed.length > 0) tiers = parsed;
  }
  return {
    totalSupply: Math.max(1, Math.floor(asNumber(settings.pixelTotalSupply, 10_000))),
    tiers,
    dividendPercent: Math.min(100, Math.max(0, asNumber(settings.pixelDividendPercent, 35))),
    cycleDays: Math.max(1, Math.floor(asNumber(settings.pixelCycleDays, 15))),
    autoStart: settings.pixelCycleAutoStart !== false && settings.pixelCycleAutoStart !== 0,
    maxPerPurchase: Math.max(1, Math.floor(asNumber(settings.maxPixelsPerPurchase, 1000))),
  };
}

/** Price of the NEXT pixel when `sold` have already been sold. Last tier price is the ceiling. */
export function priceAt(tiers: PixelTier[], sold: number): number {
  for (const t of tiers) {
    if (sold < t.upTo) return t.price;
  }
  return tiers[tiers.length - 1]?.price ?? 0;
}

/** Blended cost of buying `quantity` pixels starting from `sold` already sold. */
export function blendedCost(tiers: PixelTier[], sold: number, quantity: number): number {
  let remaining = quantity;
  let cursor = sold;
  let cost = 0;
  for (const t of tiers) {
    if (remaining <= 0) break;
    if (cursor >= t.upTo) continue;
    const inTier = Math.min(t.upTo - cursor, remaining);
    cost += inTier * t.price;
    cursor += inTier;
    remaining -= inTier;
  }
  // Anything past the last tier threshold costs the last tier's price.
  if (remaining > 0) {
    cost += remaining * (tiers[tiers.length - 1]?.price ?? 0);
  }
  return cost;
}

/** Total pixels sold in a cycle. */
export async function cycleSold(cycleId: number): Promise<number> {
  const [row] = await db
    .select({ sold: sql<string>`COALESCE(SUM(${pixelsTable.quantity}), 0)` })
    .from(pixelsTable)
    .where(eq(pixelsTable.cycleId, cycleId));
  return Number(row?.sold ?? 0);
}

/**
 * Hourly job (PRIMARY cluster process only): closes any expired active cycle,
 * distributes dividends, and auto-starts the next cycle.
 *
 * Crash-safe: the active→distributing transition is an atomic claim (only one
 * runner wins), and the per-user dividend insert is an idempotency ledger
 * (unique (cycle,user) + ON CONFLICT DO NOTHING → credit only when the insert
 * wins). A crash mid-distribution leaves the cycle in 'distributing', which is
 * picked up and resumed on the next run without double-paying anyone.
 */
export async function runPixelCycles(): Promise<void> {
  try {
    // 1. Claim any expired active cycle (atomic — restarts/racing runners safe).
    await db
      .update(pixelCyclesTable)
      .set({ status: "distributing" })
      .where(and(eq(pixelCyclesTable.status, "active"), sql`${pixelCyclesTable.endDate} <= now()`));

    // 2. Process every cycle stuck in 'distributing' (normally 0 or 1).
    const pending = await db.select().from(pixelCyclesTable).where(eq(pixelCyclesTable.status, "distributing"));
    for (const cycle of pending) {
      await distributeCycle(cycle.id, cycle.totalAdRevenueSkx);
    }

    // 3. Auto-start a fresh cycle when none is active.
    const settings = await getPixelSettings();
    if (settings.autoStart) {
      const [active] = await db
        .select({ id: pixelCyclesTable.id })
        .from(pixelCyclesTable)
        .where(eq(pixelCyclesTable.status, "active"))
        .limit(1);
      if (!active) {
        const end = new Date(Date.now() + settings.cycleDays * 24 * 60 * 60 * 1000);
        const [created] = await db.insert(pixelCyclesTable).values({ endDate: end }).returning();
        logger.info({ cycleId: created?.id, endDate: end.toISOString() }, "Pixel cycle auto-started");
      }
    }
  } catch (err) {
    logger.error({ err }, "Pixel cycle run failed");
  }
}

async function distributeCycle(cycleId: number, totalAdRevenueSkx: number): Promise<void> {
  const settings = await getPixelSettings();
  const pool = Math.max(0, Math.floor((totalAdRevenueSkx * settings.dividendPercent) / 100));

  // Holder totals for this cycle.
  const holders = await db
    .select({
      telegramId: pixelsTable.telegramId,
      held: sql<string>`SUM(${pixelsTable.quantity})`,
    })
    .from(pixelsTable)
    .where(eq(pixelsTable.cycleId, cycleId))
    .groupBy(pixelsTable.telegramId);

  const totalSold = holders.reduce((acc, h) => acc + Number(h.held), 0);

  let distributed = 0;
  if (pool > 0 && totalSold > 0) {
    for (const holder of holders) {
      const held = Number(holder.held);
      const dividend = Math.floor((pool * held) / totalSold);
      if (dividend <= 0) continue;

      // Idempotency ledger: the insert wins exactly once per (cycle, user) —
      // resume-after-crash can never double-credit.
      const inserted = await db
        .insert(pixelDividendsTable)
        .values({ cycleId, telegramId: holder.telegramId, pixelsHeld: held, dividendSkx: dividend })
        .onConflictDoNothing()
        .returning({ id: pixelDividendsTable.id });
      if (inserted.length === 0) continue; // already paid in a previous (crashed) run

      const res = await db
        .update(vaultUsersTable)
        .set(skxCreditFields(dividend))
        .where(and(eq(vaultUsersTable.telegramId, holder.telegramId), eq(vaultUsersTable.isBanned, false)))
        .returning({ telegramId: vaultUsersTable.telegramId });
      if (res.length > 0) distributed += dividend;
    }
  }

  // Snapshot + complete. All pixels of this cycle are now expired (they simply
  // belong to a completed cycle — holdings/market queries only look at active).
  await db
    .update(pixelCyclesTable)
    .set({ status: "completed", distributionAmountSkx: distributed, totalPixelsSold: totalSold })
    .where(eq(pixelCyclesTable.id, cycleId));

  logger.info({ cycleId, pool, distributed, totalSold, holderCount: holders.length }, "Pixel cycle distributed");
}

/** Admin "close now": pull the end date to the past, then run the normal close pipeline. */
export async function forceCloseActiveCycle(): Promise<boolean> {
  const res = await db
    .update(pixelCyclesTable)
    .set({ endDate: sql`now()` })
    .where(eq(pixelCyclesTable.status, "active"))
    .returning({ id: pixelCyclesTable.id });
  if (res.length === 0) return false;
  await runPixelCycles();
  return true;
}

/** Admin cycle history (most recent first). */
export async function listCycles(limit = 24) {
  return db.select().from(pixelCyclesTable).orderBy(desc(pixelCyclesTable.id)).limit(limit);
}
