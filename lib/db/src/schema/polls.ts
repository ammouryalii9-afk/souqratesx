import { pgTable, serial, text, integer, bigint, jsonb, timestamp, index, unique } from "drizzle-orm/pg-core";

export const pollsTable = pgTable("polls", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  options: jsonb("options").notNull().$type<{ id: string; label: string; emoji: string }[]>(),
  entryFeeSkx: integer("entry_fee_skx").notNull().default(5000),
  status: text("status").notNull().default("active"), // active | closed | distributed
  correctOptionId: text("correct_option_id"),
  totalPool: bigint("total_pool", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  distributedAt: timestamp("distributed_at", { withTimezone: true }),
});

export const pollVotesTable = pgTable(
  "poll_votes",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id").notNull(),
    telegramId: text("telegram_id").notNull(),
    optionId: text("option_id").notNull(),
    skxPaid: integer("skx_paid").notNull(),
    rewardSkx: bigint("reward_skx", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("one_vote_per_poll_user").on(t.pollId, t.telegramId),
    index("pv_poll_id_idx").on(t.pollId),
  ],
);

export type Poll     = typeof pollsTable.$inferSelect;
export type PollVote = typeof pollVotesTable.$inferSelect;
