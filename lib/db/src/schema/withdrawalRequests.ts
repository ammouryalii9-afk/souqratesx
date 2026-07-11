import { pgTable, serial, text, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const withdrawalStatusEnum = pgEnum("withdrawal_status", ["pending", "approved", "rejected"]);

/**
 * User withdrawal requests — admin approves and manually sends TON to the user's wallet.
 * Points are deducted from the user immediately on submit (held), restored on rejection.
 */
export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  pointsAmount: integer("points_amount").notNull(),   // points to withdraw
  usdAmount: real("usd_amount").notNull(),             // USD at request time
  tonAmount: real("ton_amount").notNull(),             // TON at request time
  tonPriceUsd: real("ton_price_usd").notNull(),        // TON/USD rate at request time
  walletAddress: text("wallet_address").notNull(),     // user's TON wallet (EQ.../UQ...)
  status: withdrawalStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export type WithdrawalRequest = typeof withdrawalRequestsTable.$inferSelect;
