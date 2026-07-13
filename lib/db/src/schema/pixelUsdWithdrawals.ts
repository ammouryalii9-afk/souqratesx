import { pgTable, serial, text, bigint, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const pixelUsdWithdrawalStatusEnum = pgEnum("pixel_usd_withdrawal_status", ["pending", "approved", "rejected"]);

/**
 * Pixel USD withdrawal requests — tracks requests to withdraw the accumulated
 * `pixel_usd_cents` balance. Points are deducted immediately on submit and
 * refunded on rejection. Admin approves and pays out manually.
 */
export const pixelUsdWithdrawalsTable = pgTable("pixel_usd_withdrawals", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  usdCents: bigint("usd_cents", { mode: "number" }).notNull(),
  status: pixelUsdWithdrawalStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("one_pending_pixel_usd_withdrawal_per_user")
    .on(table.telegramId)
    .where(sql`${table.status} = 'pending'`),
]);

export type PixelUsdWithdrawal = typeof pixelUsdWithdrawalsTable.$inferSelect;
