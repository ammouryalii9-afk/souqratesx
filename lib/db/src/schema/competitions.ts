import { pgTable, serial, text, integer, timestamp, bigint, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * type = 'points'  → classic paid competition (Stars entry fee, ranked by lifetime points gained)
 * type = 'referral' → free referral race (first to hit requiredInvites new referrals wins)
 */
export const competitionsTable = pgTable("competitions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  prizePoints: bigint("prize_points", { mode: "number" }).notNull().default(0),
  entryFeeStars: integer("entry_fee_stars").notNull().default(5),
  maxEntries: integer("max_entries"),
  status: text("status").notNull().default("active"),   // active | closed
  type: text("type").notNull().default("points"),        // points | referral
  requiredInvites: integer("required_invites"),          // referral race target
  winnerTelegramId: text("winner_telegram_id"),          // set when referral race ends
  startAt: timestamp("start_at", { withTimezone: true }).notNull().defaultNow(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competitionEntriesTable = pgTable(
  "competition_entries",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id").notNull(),
    telegramId: text("telegram_id").notNull(),
    pointsAtEntry: bigint("points_at_entry", { mode: "number" }).notNull().default(0),
    pointsAtEnd: bigint("points_at_end", { mode: "number" }),
    referralsAtEntry: integer("referrals_at_entry").notNull().default(0),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("competition_entries_comp_user_unique").on(table.competitionId, table.telegramId),
  ],
);

export const insertCompetitionSchema = createInsertSchema(competitionsTable).omit({ id: true, createdAt: true });
export type InsertCompetition = z.infer<typeof insertCompetitionSchema>;
export type Competition = typeof competitionsTable.$inferSelect;
export type CompetitionEntry = typeof competitionEntriesTable.$inferSelect;
