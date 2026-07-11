import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Admin-defined purchasable features paid for with Telegram Stars. `effectType`
 * determines what happens server-side (in the successful_payment webhook) when
 * a purchase completes; `effectValue` is a generic numeric parameter whose
 * meaning depends on `effectType` (see applyStarProductEffect in the API server).
 *
 * `sortOrder` controls display order in the store (lower = first).
 * `benefitsBullets` is a newline-separated list of bullet points shown in the
 * confirmation modal before the user confirms purchase.
 */
export const starProductEffectTypes = [
  "points",
  "energy_refill",
  "turbo_boost",
  "premium_days",
  "permanent_multiplier",
  "badge",
  "skin",
] as const;

export const starProductsTable = pgTable("star_products", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  priceStars: integer("price_stars").notNull(),
  effectType: text("effect_type", { enum: starProductEffectTypes }).notNull(),
  effectValue: integer("effect_value"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  benefitsBullets: text("benefits_bullets"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStarProductSchema = createInsertSchema(starProductsTable).omit({ id: true, createdAt: true });
export type InsertStarProduct = z.infer<typeof insertStarProductSchema>;
export type StarProduct = typeof starProductsTable.$inferSelect;
