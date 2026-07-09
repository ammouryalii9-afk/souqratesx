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
  state: jsonb("state").notNull().default({}),
  isBanned: boolean("is_banned").notNull().default(false),
  isPremium: boolean("is_premium").notNull().default(false),
  premiumExpiresAt: timestamp("premium_expires_at", { withTimezone: true }),
  starsBalance: integer("stars_balance").notNull().default(0),
  adsWatchedToday: integer("ads_watched_today").notNull().default(0),
  adsWatchedDate: text("ads_watched_date"),
  lastAdRewardAt: timestamp("last_ad_reward_at", { withTimezone: true }),
  lastPointsSyncAt: timestamp("last_points_sync_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVaultUserSchema = createInsertSchema(vaultUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVaultUser = z.infer<typeof insertVaultUserSchema>;
export type VaultUser = typeof vaultUsersTable.$inferSelect;
