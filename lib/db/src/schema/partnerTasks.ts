import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Partner tasks — Telegram channels / groups that users can join for points.
 * The bot must be an admin of the channel to verify membership via getChatMember.
 * channel_username should be the @username WITHOUT the @ prefix (e.g. "SouqrateXOfficial"),
 * OR a numeric chat_id (e.g. "-1001234567890") for private channels/groups.
 */
export const partnerTasksTable = pgTable("partner_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  channelUsername: text("channel_username").notNull(),
  channelUrl: text("channel_url").notNull(),
  iconEmoji: text("icon_emoji").notNull().default("📢"),
  rewardPoints: integer("reward_points").notNull().default(5000),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartnerTaskSchema = createInsertSchema(partnerTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerTask = z.infer<typeof insertPartnerTaskSchema>;
export type PartnerTask = typeof partnerTasksTable.$inferSelect;

/**
 * One row per (user, task) — inserted once the server verifies the user is a member.
 * The unique constraint prevents double-crediting.
 */
export const partnerTaskCompletionsTable = pgTable(
  "partner_task_completions",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").notNull(),
    telegramId: text("telegram_id").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("partner_task_completions_unique").on(t.taskId, t.telegramId)],
);

export type PartnerTaskCompletion = typeof partnerTaskCompletionsTable.$inferSelect;
