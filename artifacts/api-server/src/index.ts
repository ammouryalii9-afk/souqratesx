import cluster from "node:cluster";
import os from "node:os";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// ─── Primary process: fork one worker per CPU, run scheduled jobs here ────────

if (cluster.isPrimary) {
  const { logger } = await import("./lib/logger");
  const numCPUs = os.cpus().length;
  logger.info({ numCPUs }, "Primary — forking workers");

  for (let i = 0; i < numCPUs; i++) cluster.fork();

  cluster.on("exit", (worker, code, signal) => {
    logger.warn({ pid: worker.process.pid, code, signal }, "Worker exited — restarting");
    cluster.fork();
  });

  // Daily reminders only run in the primary to avoid N duplicates
  setTimeout(() => {
    void runDailyReminders();
    setInterval(() => { void runDailyReminders(); }, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);

  // Weekly leaderboard prizes — checked hourly in the primary only; the
  // admin_settings claim-in-WHERE makes it idempotent across restarts.
  setTimeout(() => {
    void runWeeklyPrizes();
    setInterval(() => { void runWeeklyPrizes(); }, 60 * 60 * 1000);
  }, 2 * 60 * 1000);

} else {

  // ─── Worker: serve HTTP ──────────────────────────────────────────────────────
  const app = (await import("./app")).default;
  const { logger } = await import("./lib/logger");
  const { getSettingsMap } = await import("./lib/settings");
  const { syncProvidersFromSettings } = await import("./providers/manager");

  async function bootstrapProviders(): Promise<void> {
    try {
      const settings = await getSettingsMap();
      await syncProvidersFromSettings(settings);
    } catch (err) {
      logger.error({ err }, "Failed to bootstrap earning providers");
    }
  }

  app.listen(port, async (err) => {
    if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
    await bootstrapProviders();
    logger.info({ port, pid: process.pid }, "Worker listening");
  });
}

// ─── Daily reminders (called from primary only) ───────────────────────────────

async function runDailyReminders(): Promise<void> {
  const { logger } = await import("./lib/logger");
  const { isTelegramBotConfigured, sendReminderToUser } = await import("./lib/telegramBot");
  if (!isTelegramBotConfigured()) return;

  const { db, vaultUsersTable } = await import("@workspace/db");
  const { and, eq, sql } = await import("drizzle-orm");

  const INACTIVE_DAYS = 3;
  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);

  let users: { telegramId: string }[];
  try {
    users = await db
      .select({ telegramId: vaultUsersTable.telegramId })
      .from(vaultUsersTable)
      .where(
        and(
          eq(vaultUsersTable.isBanned, false),
          sql`${vaultUsersTable.updatedAt} < ${cutoff}`,
          sql`${vaultUsersTable.telegramId} is not null`,
          sql`length(${vaultUsersTable.telegramId}) > 0`,
        )
      )
      .limit(5000);
  } catch (err) {
    logger.error({ err }, "Daily reminders: failed to fetch inactive users");
    return;
  }

  const domains = process.env.REPLIT_DOMAINS ?? "";
  const primaryDomain = domains.split(",")[0]?.trim();
  const appUrl = primaryDomain ? `https://${primaryDomain}/` : "";
  if (!appUrl) { logger.warn("Daily reminders: REPLIT_DOMAINS not set, skipping"); return; }

  const text = `⚡ Your mining rewards are waiting!\n\nYour idle miners kept working — come back and collect your points before they overflow.\n\n🏆 Don't fall behind on the leaderboard — tap to resume mining now.`;

  let sent = 0, failed = 0;
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (!user?.telegramId) continue;
    try {
      const ok = await sendReminderToUser(user.telegramId, text, appUrl);
      if (ok) sent++; else failed++;
    } catch { failed++; }
    if ((i + 1) % 25 === 0) await new Promise((r) => setTimeout(r, 1000));
  }

  logger.info({ total: users.length, sent, failed, inactiveDays: INACTIVE_DAYS }, "Daily reminders sent");
}

// ─── Weekly leaderboard prizes (called from primary only) ─────────────────────
//
// Once the week rolls over (Monday UTC), the top-10 of the PREVIOUS week get
// automatic point prizes. Idempotent: an admin_settings row records the last
// awarded week and is claimed atomically (INSERT ... ON CONFLICT ... WHERE the
// stored value differs, RETURNING) — a restart or a second timer tick can never
// double-award the same week. (Accepted tradeoff: a crash AFTER the claim but
// BEFORE the award loop finishes skips that week rather than risking a double
// payout on retry.)
//
// weeklyPoints reset LAZILY on a user's first credit of the new week, which
// would destroy prev-week scores before this hourly job reads them — so every
// rollover path (PUT /vault/me merge + creditedStateSql) first ARCHIVES the old
// score into state.prevWeekKey/prevWeekPoints, and the winners query below reads
// whichever of the two holds prevWeek's score.

async function runWeeklyPrizes(): Promise<void> {
  const { logger } = await import("./lib/logger");
  try {
    const { db, vaultUsersTable } = await import("@workspace/db");
    const { and, eq, sql } = await import("drizzle-orm");
    const { weekKey } = await import("./lib/weeklyCredit");

    // Monday-of-(now - 7d) is always the PREVIOUS, fully-completed week.
    const prevWeek = weekKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

    const claimed = await db.execute(sql`
      INSERT INTO admin_settings (key, value)
      VALUES ('lastWeeklyPrizeWeekKey', to_jsonb(${prevWeek}::text))
      ON CONFLICT (key) DO UPDATE SET value = to_jsonb(${prevWeek}::text), updated_at = now()
      WHERE admin_settings.value != to_jsonb(${prevWeek}::text)
      RETURNING key
    `);
    if (claimed.rows.length === 0) return; // this week already awarded

    // A user's prevWeek score lives in weeklyPoints if they haven't earned yet
    // this week (no rollover happened), or in the prevWeekPoints archive if a
    // new-week credit already rolled them over.
    const S = vaultUsersTable.state;
    const scoreSql = sql<string>`CASE
      WHEN ${S}->>'weekKey' = ${prevWeek}::text THEN COALESCE((${S}->>'weeklyPoints')::numeric, 0)
      WHEN ${S}->>'prevWeekKey' = ${prevWeek}::text THEN COALESCE((${S}->>'prevWeekPoints')::numeric, 0)
      ELSE 0 END`;
    const winners = await db
      .select({ telegramId: vaultUsersTable.telegramId, points: scoreSql })
      .from(vaultUsersTable)
      .where(and(eq(vaultUsersTable.isBanned, false), sql`${scoreSql} > 0`))
      .orderBy(sql`${scoreSql} DESC`)
      .limit(10);

    if (winners.length === 0) {
      logger.info({ prevWeek }, "Weekly prizes: no eligible players");
      return;
    }

    const PRIZES = [1_000_000, 600_000, 400_000, 250_000, 150_000, 100_000, 100_000, 100_000, 100_000, 100_000];

    const { logUserActivity } = await import("./lib/activityLog");
    const { isTelegramBotConfigured, sendPlainTelegramMessage } = await import("./lib/telegramBot");

    let awarded = 0;
    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i];
      const prize = PRIZES[i] ?? 0;
      if (!winner?.telegramId || prize <= 0) continue;

      // Credit lifetime + pending spendable. Deliberately NOT weeklyPoints (the
      // prize must not seed the winner's NEXT week score), and deliberately NOT
      // state.tempMiningPoints directly — an online winner's debounced client
      // sync would erase it; pendingBonusPoints is folded in at next hydration.
      const res = await db
        .update(vaultUsersTable)
        .set({
          lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${prize}`,
          pendingBonusPoints: sql`${vaultUsersTable.pendingBonusPoints} + ${prize}`,
        })
        .where(and(eq(vaultUsersTable.telegramId, winner.telegramId), eq(vaultUsersTable.isBanned, false)))
        .returning({ telegramId: vaultUsersTable.telegramId });
      if (res.length === 0) continue;
      awarded++;

      await logUserActivity(winner.telegramId, "weekly_prize", { week: prevWeek, rank: i + 1, prize });

      if (isTelegramBotConfigured()) {
        try {
          await sendPlainTelegramMessage(
            winner.telegramId,
            `🏆 مبروك! حصلت على المركز #${i + 1} في سباق الأسبوع الماضي وفزت بجائزة ${prize.toLocaleString("en-US")} نقطة! افتح التطبيق لاستلامها 🎉`,
          );
        } catch {
          // DM failure must never block the remaining prizes.
        }
      }
    }

    logger.info({ prevWeek, awarded }, "Weekly prizes awarded");
  } catch (err) {
    logger.error({ err }, "Weekly prizes run failed");
  }
}
