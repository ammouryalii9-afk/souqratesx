import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const broadcastJobsTable = pgTable("broadcast_jobs", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  audience: text("audience").notNull().default("all"),
  status: text("status").notNull().default("pending"),
  totalUsers: integer("total_users").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  langFilter: text("lang_filter"),
  sponsorName: text("sponsor_name"),
  sponsorUrl: text("sponsor_url"),
  isSponsored: integer("is_sponsored").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertBroadcastJobSchema = createInsertSchema(broadcastJobsTable).omit({ id: true, createdAt: true });
export type InsertBroadcastJob = z.infer<typeof insertBroadcastJobSchema>;
export type BroadcastJob = typeof broadcastJobsTable.$inferSelect;
