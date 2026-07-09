import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userActivityLogTable = pgTable("user_activity_log", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  type: text("type").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserActivityLogSchema = createInsertSchema(userActivityLogTable).omit({ id: true, createdAt: true });
export type InsertUserActivityLog = z.infer<typeof insertUserActivityLogSchema>;
export type UserActivityLog = typeof userActivityLogTable.$inferSelect;
