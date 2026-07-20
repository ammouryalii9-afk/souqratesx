import { pgTable, serial, text, integer, bigint, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";

export const tiktokCampaignsTable = pgTable("tiktok_campaigns", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  minFollowers: integer("min_followers").notNull().default(0),
  minViews: integer("min_views").notNull().default(0),
  prizeSkx: bigint("prize_skx", { mode: "number" }).notNull().default(0),
  perReferralSkx: bigint("per_referral_skx", { mode: "number" }).notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tiktokApplicationsTable = pgTable("tiktok_applications", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  telegramId: text("telegram_id").notNull(),
  tiktokUsername: text("tiktok_username").notNull(),
  videoUrl: text("video_url").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  rejectReason: text("reject_reason"),
  prizeSkxPaid: bigint("prize_skx_paid", { mode: "number" }).notNull().default(0),
  referralCount: integer("referral_count").notNull().default(0),
  totalReferralSkx: bigint("total_referral_skx", { mode: "number" }).notNull().default(0),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("one_app_per_campaign_user").on(t.campaignId, t.telegramId),
  index("ta_campaign_idx").on(t.campaignId),
  index("ta_telegram_idx").on(t.telegramId),
]);

export type TiktokCampaign = typeof tiktokCampaignsTable.$inferSelect;
export type TiktokApplication = typeof tiktokApplicationsTable.$inferSelect;
