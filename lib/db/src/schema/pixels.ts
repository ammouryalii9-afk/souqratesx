import { pgTable, text, serial, integer, bigint, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────────
// Pixels — the 15-day investment cycle system. Users buy Pixels with SKX at
// tiered prices; at cycle end, a percentage of the cycle's ad revenue is
// distributed proportionally to holders, then ALL pixels expire and a new
// cycle begins. All parameters (supply, tier prices, dividend %, cycle days)
// live in admin_settings.
// ─────────────────────────────────────────────────────────────────────────────

export const pixelCyclesTable = pgTable("pixel_cycles", {
  id: serial("id").primaryKey(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  // Running counter of SKX credited from verified ad/offerwall rewards during
  // this cycle — incremented atomically by the reward engine. The dividend pool
  // = totalAdRevenueSkx * pixelDividendPercent / 100 at close time.
  totalAdRevenueSkx: bigint("total_ad_revenue_skx", { mode: "number" }).notNull().default(0),
  // Snapshot taken at close: the SKX amount actually distributed.
  distributionAmountSkx: bigint("distribution_amount_skx", { mode: "number" }).notNull().default(0),
  // Snapshot of pixels sold at close (denormalized for history display).
  totalPixelsSold: integer("total_pixels_sold").notNull().default(0),
  // active → distributing → completed. Exactly one 'active' cycle at a time.
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pixelsTable = pgTable(
  "pixels",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    cycleId: integer("cycle_id").notNull(),
    quantity: integer("quantity").notNull(),
    // Total SKX paid for this purchase (blended across tiers when spanning).
    pricePaidSkx: bigint("price_paid_skx", { mode: "number" }).notNull(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pixels_cycle_idx").on(t.cycleId),
    index("pixels_user_cycle_idx").on(t.telegramId, t.cycleId),
  ],
);

export const pixelDividendsTable = pgTable(
  "pixel_dividends",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id").notNull(),
    telegramId: text("telegram_id").notNull(),
    pixelsHeld: integer("pixels_held").notNull(),
    dividendSkx: bigint("dividend_skx", { mode: "number" }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotency ledger: one payout per (cycle, user) EVER — the distribution
    // job inserts with ON CONFLICT DO NOTHING and only credits when the insert wins.
    uniqueIndex("pixel_dividends_cycle_user_unique").on(t.cycleId, t.telegramId),
  ],
);

export const insertPixelCycleSchema = createInsertSchema(pixelCyclesTable).omit({ id: true, createdAt: true });
export type InsertPixelCycle = z.infer<typeof insertPixelCycleSchema>;
export type PixelCycle = typeof pixelCyclesTable.$inferSelect;

export const insertPixelSchema = createInsertSchema(pixelsTable).omit({ id: true, purchasedAt: true });
export type InsertPixel = z.infer<typeof insertPixelSchema>;
export type Pixel = typeof pixelsTable.$inferSelect;

export const insertPixelDividendSchema = createInsertSchema(pixelDividendsTable).omit({ id: true, paidAt: true });
export type InsertPixelDividend = z.infer<typeof insertPixelDividendSchema>;
export type PixelDividend = typeof pixelDividendsTable.$inferSelect;
