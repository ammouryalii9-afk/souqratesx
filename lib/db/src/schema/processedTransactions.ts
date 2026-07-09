import { pgTable, text, serial, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Idempotency ledger for external credit events (Telegram Stars payments,
 * offerwall postbacks). A (provider, txId) pair may only ever be credited once —
 * replays/retries hit the unique constraint and are skipped.
 */
export const processedTransactionsTable = pgTable(
  "processed_transactions",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    txId: text("tx_id").notNull(),
    telegramId: text("telegram_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("processed_transactions_provider_tx_unique").on(t.provider, t.txId)],
);

export type ProcessedTransaction = typeof processedTransactionsTable.$inferSelect;
