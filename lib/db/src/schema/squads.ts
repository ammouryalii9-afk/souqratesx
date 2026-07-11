import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const squadsTable = pgTable("squads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🛡️"),
  ownerId: text("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSquadSchema = createInsertSchema(squadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSquad = z.infer<typeof insertSquadSchema>;
export type Squad = typeof squadsTable.$inferSelect;
