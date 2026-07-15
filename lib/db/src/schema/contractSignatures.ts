import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const contractSignaturesTable = pgTable("contract_signatures", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id"),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  country: text("country").notNull(),
  signatureDataUrl: text("signature_data_url").notNull(),
  contractVersion: text("contract_version").notNull(),
  ipAddress: text("ip_address"),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContractSignature = typeof contractSignaturesTable.$inferSelect;
