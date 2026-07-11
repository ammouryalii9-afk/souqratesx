import app from "./app";
import { logger } from "./lib/logger";
import { getSettingsMap } from "./lib/settings";
import { syncProvidersFromSettings } from "./providers/manager";
import { db, vaultUsersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { sendReminderToUser, isTelegramBotConfigured } from "./lib/telegramBot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function bootstrapProviders(): Promise<void> {
  try {
    const settings = await getSettingsMap();
    await syncProvidersFromSettings(settings);
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap earning providers");
  }
}

/** Runs once a day: sends re-engagement messages to users inactive for 3+ days. */
async function runDailyReminders(): Promise<void> {
  if (!isTelegramBotConfigured()) return;

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

  // Build the app URL from environment (REPLIT_DOMAINS contains comma-separated public domains)
  const domains = process.env.REPLIT_DOMAINS ?? "";
  const primaryDomain = domains.split(",")[0]?.trim();
  const appUrl = primaryDomain ? `https://${primaryDomain}/` : "";

  if (!appUrl) {
    logger.warn("Daily reminders: REPLIT_DOMAINS not set, skipping (URL would be empty)");
    return;
  }

  const text =
    `⚡ Your mining rewards are waiting!\n\nYour idle miners kept working — come back and collect your points before they overflow.\n\n🏆 Don't fall behind on the leaderboard — tap to resume mining now.`;

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (!user?.telegramId) continue;
    try {
      const ok = await sendReminderToUser(user.telegramId, text, appUrl);
      if (ok) sent++; else failed++;
    } catch {
      failed++;
    }
    // Stay under Telegram's 30 msg/s global rate limit
    if ((i + 1) % 25 === 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  logger.info({ total: users.length, sent, failed, inactiveDays: INACTIVE_DAYS }, "Daily reminders sent");
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  await bootstrapProviders();
  logger.info({ port }, "Server listening");

  // Schedule daily reminders — first run after 5 minutes (let the server warm up),
  // then every 24 hours.
  setTimeout(() => {
    void runDailyReminders();
    setInterval(() => { void runDailyReminders(); }, TWENTY_FOUR_HOURS);
  }, 5 * 60 * 1000);
});
