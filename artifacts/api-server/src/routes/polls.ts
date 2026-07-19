import { Router, type IRouter } from "express";
import { db, vaultUsersTable, pollsTable, pollVotesTable } from "@workspace/db";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import { getSessionTelegramId } from "../lib/session";
import { isAdminSession } from "../lib/session";
import { rateLimit } from "../lib/rateLimit";
import { z } from "zod/v4";

const router: IRouter = Router();

// ─── GET /api/poll/active ──────────────────────────────────────────────────────
// Returns the most recent non-distributed poll + user's vote + per-option counts.

router.get("/poll/active", rateLimit("poll_read", 60, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);

  const [poll] = await db
    .select()
    .from(pollsTable)
    .where(sql`${pollsTable.status} != 'distributed' OR ${pollsTable.status} = 'distributed'`)
    .orderBy(desc(pollsTable.createdAt))
    .limit(1);

  if (!poll) {
    res.json({ poll: null });
    return;
  }

  // Vote counts per option
  const counts = await db
    .select({ optionId: pollVotesTable.optionId, count: sql<number>`count(*)::int` })
    .from(pollVotesTable)
    .where(eq(pollVotesTable.pollId, poll.id))
    .groupBy(pollVotesTable.optionId);

  const voteCounts: Record<string, number> = {};
  for (const c of counts) voteCounts[c.optionId] = c.count;

  // Current user's vote
  let userVote: { optionId: string; rewardSkx: number | null } | null = null;
  if (telegramId) {
    const [v] = await db
      .select()
      .from(pollVotesTable)
      .where(and(eq(pollVotesTable.pollId, poll.id), eq(pollVotesTable.telegramId, telegramId)));
    if (v) userVote = { optionId: v.optionId, rewardSkx: v.rewardSkx };
  }

  res.json({ poll, voteCounts, userVote });
});

// ─── POST /api/poll/vote ───────────────────────────────────────────────────────
// Deduct entryFeeSkx from skx_balance + insert vote, both in one transaction.

router.post("/poll/vote", rateLimit("poll_vote", 5, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const parsed = z.object({ pollId: z.number().int(), optionId: z.string().min(1) }).safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "pollId and optionId required" }); return; }
  const { pollId, optionId } = parsed.data;

  // Load poll
  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, pollId));
  if (!poll)                    { res.status(404).json({ error: "Poll not found" }); return; }
  if (poll.status !== "active") { res.status(400).json({ error: "Poll is no longer active" }); return; }
  const opts = poll.options as { id: string }[];
  if (!opts.find(o => o.id === optionId)) { res.status(400).json({ error: "Invalid option" }); return; }

  const fee = poll.entryFeeSkx;

  try {
    await db.transaction(async (tx) => {
      // Atomic deduction — guard: skx_balance >= fee
      const [user] = await tx
        .update(vaultUsersTable)
        .set({ skxBalance: sql`${vaultUsersTable.skxBalance} - ${fee}::bigint` })
        .where(and(
          eq(vaultUsersTable.telegramId, telegramId),
          sql`${vaultUsersTable.skxBalance} >= ${fee}::bigint`,
          eq(vaultUsersTable.isBanned, false),
        ))
        .returning({ skxBalance: vaultUsersTable.skxBalance });

      if (!user) throw Object.assign(new Error("insufficient"), { code: "INSUFFICIENT" });

      // Insert vote — unique constraint prevents double-vote
      await tx.insert(pollVotesTable).values({
        pollId,
        telegramId,
        optionId,
        skxPaid: fee,
      });

      // Update poll total pool
      await tx
        .update(pollsTable)
        .set({ totalPool: sql`${pollsTable.totalPool} + ${fee}::bigint` })
        .where(eq(pollsTable.id, pollId));
    });
  } catch (err: unknown) {
    const e = err as { code?: string; constraint?: string; message?: string };
    if (e.code === "INSUFFICIENT")       { res.status(400).json({ error: "Insufficient SKX balance" }); return; }
    if (e.constraint === "one_vote_per_poll_user") { res.status(409).json({ error: "Already voted" }); return; }
    req.log.error(err, "poll vote failed");
    res.status(500).json({ error: "Vote failed" });
    return;
  }

  res.json({ ok: true });
});

// ─── Admin: list polls ─────────────────────────────────────────────────────────

router.get("/admin/polls", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const polls = await db.select().from(pollsTable).orderBy(desc(pollsTable.createdAt));

  // Attach vote counts per poll
  const withStats = await Promise.all(polls.map(async (p) => {
    const counts = await db
      .select({ optionId: pollVotesTable.optionId, count: sql<number>`count(*)::int` })
      .from(pollVotesTable)
      .where(eq(pollVotesTable.pollId, p.id))
      .groupBy(pollVotesTable.optionId);
    const voteCounts: Record<string, number> = {};
    for (const c of counts) voteCounts[c.optionId] = c.count;
    return { ...p, voteCounts };
  }));

  res.json({ polls: withStats });
});

// ─── Admin: create poll ────────────────────────────────────────────────────────

router.post("/admin/polls", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = z.object({
    question:    z.string().min(1),
    options:     z.array(z.object({ id: z.string(), label: z.string(), emoji: z.string() })).min(2),
    entryFeeSkx: z.number().int().positive().optional(),
    closesAt:    z.string().optional(),
  }).safeParse(req.body ?? {});

  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { question, options, entryFeeSkx, closesAt } = parsed.data;

  const [poll] = await db.insert(pollsTable).values({
    question,
    options,
    entryFeeSkx: entryFeeSkx ?? 5000,
    closesAt: closesAt ? new Date(closesAt) : null,
  }).returning();

  res.json({ poll });
});

// ─── Admin: close + distribute ────────────────────────────────────────────────

router.post("/admin/polls/:id/distribute", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const pollId = Number(req.params.id);
  const parsed = z.object({ correctOptionId: z.string().min(1) }).safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "correctOptionId required" }); return; }
  const { correctOptionId } = parsed.data;

  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, pollId));
  if (!poll)                         { res.status(404).json({ error: "Poll not found" }); return; }
  if (poll.status === "distributed") { res.status(400).json({ error: "Already distributed" }); return; }

  // Find winners
  const winners = await db
    .select({ telegramId: pollVotesTable.telegramId })
    .from(pollVotesTable)
    .where(and(eq(pollVotesTable.pollId, pollId), eq(pollVotesTable.optionId, correctOptionId)));

  const winnerCount = winners.length;
  const totalPool   = Number(poll.totalPool);
  const rewardEach  = winnerCount > 0 ? Math.floor(totalPool / winnerCount) : 0;
  const winnerIds   = winners.map(w => w.telegramId);

  await db.transaction(async (tx) => {
    // Credit each winner — use inArray (not ANY) so Drizzle binds the array correctly
    if (rewardEach > 0 && winnerIds.length > 0) {
      await tx
        .update(vaultUsersTable)
        .set({ skxBalance: sql`${vaultUsersTable.skxBalance} + ${String(rewardEach)}::bigint` })
        .where(inArray(vaultUsersTable.telegramId, winnerIds));

      await tx
        .update(pollVotesTable)
        .set({ rewardSkx: rewardEach })
        .where(and(eq(pollVotesTable.pollId, pollId), eq(pollVotesTable.optionId, correctOptionId)));
    }

    // Mark poll as distributed
    await tx
      .update(pollsTable)
      .set({ status: "distributed", correctOptionId, distributedAt: new Date() })
      .where(eq(pollsTable.id, pollId));
  });

  req.log.info({ pollId, correctOptionId, winnerCount, rewardEach }, "poll distributed");
  res.json({ ok: true, winnerCount, rewardEach });
});

// ─── Admin: close poll (without distributing yet) ────────────────────────────

router.patch("/admin/polls/:id/close", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const pollId = Number(req.params.id);
  const [poll] = await db.update(pollsTable).set({ status: "closed" }).where(eq(pollsTable.id, pollId)).returning();
  res.json({ poll });
});

export default router;
