import { pgTable, serial, text, boolean, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * A registered earning provider (adsgram, cpa, monlix, bitlabs, future ones).
 * `config` holds provider-specific settings (block ids, urls, postback secrets,
 * reward amounts, cooldowns, caps) as freeform JSON so new providers never need
 * a schema migration — mirrors the old admin_settings pattern but scoped per provider.
 */
export const providersTable = pgTable("providers", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "rewarded_ad" | "offerwall"
  enabled: boolean("enabled").notNull().default(false),
  priority: integer("priority").notNull().default(0),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProviderSchema = createInsertSchema(providersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providersTable.$inferSelect;

/**
 * Append-only log of every provider interaction (offer fetch, reward verification,
 * callback, health check) for observability and stats aggregation.
 */
export const providerLogsTable = pgTable("provider_logs", {
  id: serial("id").primaryKey(),
  providerKey: text("provider_key").notNull(),
  event: text("event").notNull(), // "offers" | "verify" | "reward" | "health_check" | "error"
  telegramId: text("telegram_id"),
  success: boolean("success").notNull(),
  latencyMs: integer("latency_ms"),
  message: text("message"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProviderLog = typeof providerLogsTable.$inferSelect;

/**
 * Unified reward ledger across all providers, replacing per-provider ad-hoc
 * columns. (provider_key, tx_id) is the idempotency key for de-duped callbacks;
 * synthetic tx ids are used for client-verified flows without a provider txId.
 */
export const rewardTransactionsTable = pgTable(
  "reward_transactions",
  {
    id: serial("id").primaryKey(),
    providerKey: text("provider_key").notNull(),
    telegramId: text("telegram_id").notNull(),
    txId: text("tx_id").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("credited"), // "credited" | "failed" | "retrying"
    retryCount: integer("retry_count").notNull().default(0),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("reward_transactions_provider_tx_unique").on(t.providerKey, t.txId)],
);

export type RewardTransaction = typeof rewardTransactionsTable.$inferSelect;

/**
 * Daily per-provider rollup used by the Revenue Optimizer to rank providers.
 */
export const providerStatisticsTable = pgTable(
  "provider_statistics",
  {
    id: serial("id").primaryKey(),
    providerKey: text("provider_key").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    fillRate: integer("fill_rate_bp").notNull().default(0), // basis points (0-10000)
    successRate: integer("success_rate_bp").notNull().default(0),
    averageReward: integer("average_reward").notNull().default(0),
    averageResponseTimeMs: integer("average_response_time_ms").notNull().default(0),
    ecpmCents: integer("ecpm_cents").notNull().default(0),
    dailyRevenueCents: integer("daily_revenue_cents").notNull().default(0),
    totalRewards: integer("total_rewards").notNull().default(0),
    totalRequests: integer("total_requests").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("provider_statistics_provider_date_unique").on(t.providerKey, t.date)],
);

export type ProviderStatistic = typeof providerStatisticsTable.$inferSelect;
