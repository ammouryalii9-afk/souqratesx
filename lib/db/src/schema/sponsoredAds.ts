import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Paid/sponsored ads created by the admin. Shown to users as a broadcast
 * notification (optional, one-off) and as a claimable task in the Tasks tab.
 */
export const sponsoredAdsTable = pgTable("sponsored_ads", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  linkUrl: text("link_url").notNull(),
  rewardPoints: integer("reward_points").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSponsoredAdSchema = createInsertSchema(sponsoredAdsTable).omit({ id: true, createdAt: true });
export type InsertSponsoredAd = z.infer<typeof insertSponsoredAdSchema>;
export type SponsoredAd = typeof sponsoredAdsTable.$inferSelect;

/**
 * Idempotent one-time-per-user claim ledger for sponsored ads — mirrors the
 * unique-constraint pattern used by processed_transactions.
 *
 * A row is first inserted when the user starts viewing the ad (`startedAt` set,
 * `claimedAt` null). The claim endpoint only credits points and stamps
 * `claimedAt` once the admin-configured minimum watch time has elapsed since
 * `startedAt` — this "watch condition" is enforced server-side for every ad,
 * including ones created later, since it's not per-ad logic.
 */
export const adClaimsTable = pgTable(
  "ad_claims",
  {
    id: serial("id").primaryKey(),
    adId: integer("ad_id").notNull(),
    telegramId: text("telegram_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (t) => [unique("ad_claims_ad_telegram_unique").on(t.adId, t.telegramId)],
);

export type AdClaim = typeof adClaimsTable.$inferSelect;
