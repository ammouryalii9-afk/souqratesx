// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export * from "./vaultUsers";
export * from "./adminSettings";
export * from "./adminAuditLog";
export * from "./processedTransactions";
export * from "./userActivityLog";
export * from "./broadcastJobs";
export * from "./sponsoredAds";
export * from "./starProducts";
export * from "./providers";
export * from "./partnerTasks";
export * from "./announcements";
export * from "./contractSignatures";
export * from "./withdrawalRequests";
export * from "./squads";
export * from "./competitions";
export * from "./pixels";
export * from "./pixelUsdWithdrawals";
