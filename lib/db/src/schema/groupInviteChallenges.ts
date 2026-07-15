import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Group invite challenges — reward users who invite N friends.
 * Progress is tracked via vault_users.referral_count.
 * The bot verifies the count server-side before crediting.
 */
export const groupInviteChallengesTable = pgTable("group_invite_challenges", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  channelUrl: text("channel_url").notNull().default(""),
  requiredInvites: integer("required_invites").notNull().default(20),
  rewardSkp: integer("reward_skp").notNull().default(50000),
  iconEmoji: text("icon_emoji").notNull().default("👥"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGroupInviteChallengeSchema = createInsertSchema(groupInviteChallengesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGroupInviteChallenge = z.infer<typeof insertGroupInviteChallengeSchema>;
export type GroupInviteChallenge = typeof groupInviteChallengesTable.$inferSelect;

/**
 * One row per (user, challenge) — inserted when the claim is verified.
 * Unique constraint prevents double-crediting.
 */
export const groupInviteCompletionsTable = pgTable(
  "group_invite_completions",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id").notNull(),
    telegramId: text("telegram_id").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("group_invite_completions_unique").on(t.challengeId, t.telegramId)],
);

export type GroupInviteCompletion = typeof groupInviteCompletionsTable.$inferSelect;
