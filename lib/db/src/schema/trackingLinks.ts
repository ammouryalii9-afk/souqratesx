import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const trackingLinksTable = pgTable("tracking_links", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  destinationUrl: text("destination_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const linkClickEventsTable = pgTable(
  "link_click_events",
  {
    id: serial("id").primaryKey(),
    linkId: integer("link_id").notNull(),
    ipHash: text("ip_hash").notNull(),
    userAgent: text("user_agent"),
    deviceType: text("device_type"),
    referer: text("referer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("link_click_events_link_id_idx").on(t.linkId),
    index("link_click_events_created_at_idx").on(t.createdAt),
  ],
);

export type TrackingLink = typeof trackingLinksTable.$inferSelect;
export type LinkClickEvent = typeof linkClickEventsTable.$inferSelect;
