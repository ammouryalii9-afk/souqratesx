import { pgTable, text, serial, integer, bigint, jsonb, timestamp, boolean, index } from "drizzle-orm/pg-core";
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
  // SKX — the hard/withdrawable currency. Server-authoritative ONLY: credited by
  // verified server paths (ad rewards, offerwall postbacks, referral bonuses,
  // weekly prizes, pixel dividends, SKP→SKX conversion) and debited by
  // withdrawals + pixel purchases. The client NEVER writes this column, so
  // background jobs can credit it directly (no pendingBonus dance needed).
  // SKP (the soft currency) remains state.tempMiningPoints in the JSONB.
  skxBalance: bigint("skx_balance", { mode: "number" }).notNull().default(0),
  // Accumulated pixel dividend earnings in USD cents (100 = $1.00). Credited
  // server-side when a pixel cycle closes (held × pixelPriceUSD). Deducted
  // when the user submits a withdrawal request (held until admin approval).
  pixelUsdCents: bigint("pixel_usd_cents", { mode: "number" }).notNull().default(0),
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
  // Flat $0.02 USD credit per new referral (in cents). Transferred to
  // pixel_usd_cents on demand — never auto-applied to avoid double-credit.
  referralUsdCents: bigint("referral_usd_cents", { mode: "number" }).notNull().default(0),
  squadId: integer("squad_id"),
  hasClaimedSquadBonus: boolean("has_claimed_squad_bonus").notNull().default(false),
  telegramLangCode: text("telegram_lang_code"),
  notes: text("notes"),
  // Presence tracking: updated on every client heartbeat (every 30s while app is open).
  // "online now" = lastSeenAt > now() - interval '3 minutes'.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // Accumulated time-in-app in seconds (capped per-ping to avoid abuse).
  totalSessionSeconds: bigint("total_session_seconds", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // Leaderboard: ORDER BY lifetime_points DESC WHERE is_banned = false
  index("vu_lifetime_pts_idx").on(t.lifetimePoints),
  // Every auth/sync/earn route filters on is_banned
  index("vu_is_banned_idx").on(t.isBanned),
  // Referral attribution lookup (linkReferrer reads referrerId IS NULL)
  index("vu_referrer_id_idx").on(t.referrerId),
  // Squad membership queries + squad leaderboard GROUP BY
  index("vu_squad_id_idx").on(t.squadId),
  // Daily reminders: WHERE updated_at < cutoff
  index("vu_updated_at_idx").on(t.updatedAt),
]);

export const insertVaultUserSchema = createInsertSchema(vaultUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVaultUser = z.infer<typeof insertVaultUserSchema>;
export type VaultUser = typeof vaultUsersTable.$inferSelect;
