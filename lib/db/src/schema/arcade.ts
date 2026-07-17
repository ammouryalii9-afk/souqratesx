import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// arcade_tickets — one row per user per day, tracks entry method progress
export const arcadeTicketsTable = pgTable(
  "arcade_tickets",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    dayKey: text("day_key").notNull(), // YYYY-MM-DD UTC
    entryMethod: text("entry_method").notNull().default("ads"), // 'ads' | 'stars'
    adsWatched: integer("ads_watched").notNull().default(0), // 0-5
    ticketGranted: boolean("ticket_granted").notNull().default(false),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("arcade_tickets_user_day_unique").on(t.telegramId, t.dayKey),
    index("arcade_tickets_day_idx").on(t.dayKey),
  ],
);

// arcade_sessions — each grid cell claim by a user
export const arcadeSessionsTable = pgTable(
  "arcade_sessions",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    roomType: text("room_type").notNull(), // 'easy' | 'tactical' | 'hardcore'
    gridX: integer("grid_x").notNull(),
    gridY: integer("grid_y").notNull(),
    durationHours: integer("duration_hours").notNull(), // 6 | 12 | 24
    basePoints: integer("base_points").notNull(),       // 20000 | 50000 | 100000
    // multiplier stored as integer percent: 100 = 1x, 150 = 1.5x, 300 = 3x
    multiplierPct: integer("multiplier_pct").notNull().default(100),
    finalPoints: integer("final_points").notNull(),
    status: text("status").notNull().default("active"), // 'active' | 'won' | 'destroyed'
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    destroyedBy: text("destroyed_by"),
    // Shield: protects from strikes until shieldExpiresAt
    shieldExpiresAt: timestamp("shield_expires_at", { withTimezone: true }),
    // Decoy: if struck, penalises striker instead of owner losing points
    isDecoy: boolean("is_decoy").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("arcade_sessions_user_idx").on(t.telegramId),
    index("arcade_sessions_room_status_idx").on(t.roomType, t.status),
    index("arcade_sessions_room_cell_idx").on(t.roomType, t.gridX, t.gridY),
    index("arcade_sessions_expires_idx").on(t.expiresAt),
    index("arcade_sessions_status_idx").on(t.status),
  ],
);

// arcade_purchases — star shop purchase log
export const arcadePurchasesTable = pgTable(
  "arcade_purchases",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    sessionId: integer("session_id"),
    itemType: text("item_type").notNull(), // 'shield_3h'|'shield_full'|'decoy'|'radar'|'multi_strike'|'ticket_stars'
    starsSpent: integer("stars_spent").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("arcade_purchases_user_idx").on(t.telegramId),
    index("arcade_purchases_session_idx").on(t.sessionId),
  ],
);

export const insertArcadeTicketSchema = createInsertSchema(arcadeTicketsTable).omit({ id: true, createdAt: true });
export type InsertArcadeTicket = z.infer<typeof insertArcadeTicketSchema>;
export type ArcadeTicket = typeof arcadeTicketsTable.$inferSelect;

export const insertArcadeSessionSchema = createInsertSchema(arcadeSessionsTable).omit({ id: true, createdAt: true });
export type InsertArcadeSession = z.infer<typeof insertArcadeSessionSchema>;
export type ArcadeSession = typeof arcadeSessionsTable.$inferSelect;

export const insertArcadePurchaseSchema = createInsertSchema(arcadePurchasesTable).omit({ id: true, createdAt: true });
export type InsertArcadePurchase = z.infer<typeof insertArcadePurchaseSchema>;
export type ArcadePurchase = typeof arcadePurchasesTable.$inferSelect;
