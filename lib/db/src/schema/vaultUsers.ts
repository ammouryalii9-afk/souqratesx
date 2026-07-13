import { pgTable, text, serial, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vaultUsersTable = pgTable("vault_users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  photoUrl: text("photo_url"),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  // Sum of all points locked in pending/approved withdrawals. lifetimePoints is
  // NEVER decremented by withdrawals (the client-authoritative sync would just
  // re-mint the difference) — available balance = lifetimePoints - withdrawnPoints.
  withdrawnPoints: integer("withdrawn_points").notNull().default(0),
  // Server-granted spendable points (weekly prizes, referral milestones) waiting
  // to be folded into state.tempMiningPoints at the next hydration (auth or
  // GET /vault/me). Writing tempMiningPoints directly from background jobs is
  // unsafe: an online client's debounced PUT /vault/me sends its own stale
  // tempMiningPoints verbatim and would silently erase the credit.
  pendingBonusPoints: integer("pending_bonus_points").notNull().default(0),
  state: jsonb("state").notNull().default({}),
  isBanned: boolean("is_banned").notNull().default(false),
  isPremium: boolean("is_premium").notNull().default(false),
  premiumExpiresAt: timestamp("premium_expires_at", { withTimezone: true }),
  starsBalance: integer("stars_balance").notNull().default(0),
  adsWatchedToday: integer("ads_watched_today").notNull().default(0),
  adsWatchedDate: text("ads_watched_date"),
  lastAdRewardAt: timestamp("last_ad_reward_at", { withTimezone: true }),
  lastPointsSyncAt: timestamp("last_points_sync_at", { withTimezone: true }),
  referrerId: text("referrer_id"),
  referralCount: integer("referral_count").notNull().default(0),
  referralEarnings: integer("referral_earnings").notNull().default(0),
  squadId: integer("squad_id"),
  hasClaimedSquadBonus: boolean("has_claimed_squad_bonus").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVaultUserSchema = createInsertSchema(vaultUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVaultUser = z.infer<typeof insertVaultUserSchema>;
export type VaultUser = typeof vaultUsersTable.$inferSelect;
