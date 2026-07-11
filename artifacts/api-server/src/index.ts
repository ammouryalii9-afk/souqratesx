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
