import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, partnerTasksTable, partnerTaskCompletionsTable, vaultUsersTable } from "@workspace/db";
import { getSessionTelegramId } from "../lib/session";
import { getChatMemberStatus, isTelegramBotConfigured } from "../lib/telegramBot";
import { skxCreditFields } from "../lib/skxCredit";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

// ─── Public: list active tasks with completion status for current user ─────────

router.get("/partner-tasks", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);

  const tasks = await db
    .select()
    .from(partnerTasksTable)
    .where(eq(partnerTasksTable.isActive, true))
    .orderBy(partnerTasksTable.sortOrder, partnerTasksTable.id);

  if (!telegramId) {
    res.json({ tasks: tasks.map((t) => ({ ...t, completed: false })) });
    return;
  }

  const completions = await db
    .select({ taskId: partnerTaskCompletionsTable.taskId })
    .from(partnerTaskCompletionsTable)
    .where(eq(partnerTaskCompletionsTable.telegramId, telegramId));

  const completedIds = new Set(completions.map((c) => c.taskId));
  res.json({
    tasks: tasks.map((t) => ({ ...t, completed: completedIds.has(t.id) })),
  });
});

// ─── Verify membership & award points (rate-limited) ──────────────────────────

router.post("/partner-tasks/:id/verify", rateLimit("partner-verify", 10, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const taskId = Number(req.params.id);
  if (!Number.isFinite(taskId)) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }

  const [task] = await db
    .select()
    .from(partnerTasksTable)
    .where(and(eq(partnerTasksTable.id, taskId), eq(partnerTasksTable.isActive, true)));

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // Check if already completed (idempotency)
  const [existing] = await db
    .select()
    .from(partnerTaskCompletionsTable)
    .where(
      and(
        eq(partnerTaskCompletionsTable.taskId, taskId),
        eq(partnerTaskCompletionsTable.telegramId, telegramId),
      )
    );

  if (existing) {
    res.json({ ok: true, alreadyClaimed: true, creditedPoints: 0, lifetimePoints: 0 });
    return;
  }

  // Banned users cannot claim partner task rewards
  const [me] = await db
    .select({ isBanned: vaultUsersTable.isBanned })
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.telegramId, telegramId));
  if (!me || me.isBanned) {
    res.status(403).json({ error: "User not found or banned" });
    return;
  }

  // Verify Telegram membership if bot is configured
  if (isTelegramBotConfigured()) {
    const { status, error } = await getChatMemberStatus(task.channelUsername, telegramId);
    if (status === null) {
      // API error (bot not in channel, wrong username, misconfigured task, etc.).
      // Fail CLOSED — never credit unverified claims. Granting "benefit of doubt"
      // here would let everyone mass-claim during any bot/channel misconfiguration.
      req.log.warn({ telegramId, taskId, channel: task.channelUsername, error },
        "getChatMember API error — rejecting partner task claim (fail-closed)");
      res.status(503).json({ error: "verification_unavailable", message: "Verification is temporarily unavailable. Please try again in a moment." });
      return;
    } else {
      const isJoined = status === "member" || status === "administrator" || status === "creator" || status === "restricted";
      if (!isJoined) {
        res.status(403).json({ error: "not_joined", message: "Please join the channel first, then verify." });
        return;
      }
    }
  }

  // Record completion + credit points atomically
  const [claimed] = await db
    .insert(partnerTaskCompletionsTable)
    .values({ taskId, telegramId })
    .onConflictDoNothing()
    .returning();

  if (!claimed) {
    // Race condition — already claimed by concurrent request
    res.json({ ok: true, alreadyClaimed: true, creditedPoints: 0, lifetimePoints: 0 });
    return;
  }

  // Partner task rewards are SKX (hard currency) — server-verified via
  // getChatMember, credited to the server-authoritative skx_balance column.
  const [updated] = await db
    .update(vaultUsersTable)
    .set(skxCreditFields(task.rewardPoints))
    .where(eq(vaultUsersTable.telegramId, telegramId))
    .returning({ lifetimePoints: vaultUsersTable.lifetimePoints });

  req.log.info({ telegramId, taskId, points: task.rewardPoints }, "Partner task completed");

  res.json({
    ok: true,
    alreadyClaimed: false,
    creditedPoints: task.rewardPoints,
    lifetimePoints: updated?.lifetimePoints ?? 0,
  });
});

export default router;
