import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, vaultUsersTable, processedTransactionsTable } from "@workspace/db";
import { answerPreCheckoutQuery, sendTelegramMessage, verifyWebhookSecretToken, type TelegramUpdate } from "../lib/telegramBot";

const router: IRouter = Router();

const PREMIUM_MONTH_MS = 1000 * 60 * 60 * 24 * 30;
const BOOST_DURATION_MS = 20_000;

type VaultState = Record<string, unknown>;

function isVaultState(value: unknown): value is VaultState {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

router.post("/telegram/webhook", async (req, res): Promise<void> => {
  const secretHeader = req.get("x-telegram-bot-api-secret-token");
  if (!verifyWebhookSecretToken(secretHeader ?? undefined)) {
    req.log.warn("Rejected Telegram webhook call with missing/invalid secret token");
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const update = req.body as TelegramUpdate;

  try {
    if (update.pre_checkout_query) {
      await answerPreCheckoutQuery(update.pre_checkout_query.id, true);
    } else if (update.message?.text === "/start" && update.message.from?.id) {
      const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
      const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
      const appUrl = `${proto}://${host}/`;
      await sendTelegramMessage(
        update.message.from.id,
        "\u0645\u0631\u062D\u0628\u0627 \u0628\u0643 \u0641\u064A SouqratesX \u{1F3AE}\n\u0627\u0636\u0641 \u0648\u0627\u0631\u0641\u0639 \u0645\u0646 \u0645\u0633\u0629 \u0645\u0631\u0627\u062A \u0648\u0627\u0631\u0628\u062D \u0646\u0642\u0627\u0637\u0627\u064B \u062A\u0642\u062F\u0631 \u062A\u0633\u062D\u0628\u0647\u0627 \u0644\u0627\u062D\u0642\u0627\u064B!",
        appUrl,
      );
    } else if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const fromId = update.message.from?.id;
      let payload: { telegramId?: string; product?: string } = {};
      try {
        payload = JSON.parse(payment.invoice_payload);
      } catch {
        req.log.warn({ payload: payment.invoice_payload }, "Failed to parse Stars payment payload");
      }

      const telegramId = payload.telegramId ?? (fromId ? String(fromId) : undefined);

      // Idempotency: Telegram retries webhook deliveries; only credit each
      // telegram_payment_charge_id once.
      const [claimed] = await db
        .insert(processedTransactionsTable)
        .values({ provider: "telegram_stars", txId: payment.telegram_payment_charge_id, telegramId: telegramId ?? null })
        .onConflictDoNothing()
        .returning();
      if (!claimed) {
        req.log.info({ chargeId: payment.telegram_payment_charge_id }, "Skipped duplicate Stars payment webhook");
        res.json({ ok: true });
        return;
      }

      if (telegramId) {
        const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
        if (user) {
          if (payload.product === "premium_month") {
            const base = user.premiumExpiresAt && user.premiumExpiresAt.getTime() > Date.now() ? user.premiumExpiresAt.getTime() : Date.now();
            await db
              .update(vaultUsersTable)
              .set({ isPremium: true, premiumExpiresAt: new Date(base + PREMIUM_MONTH_MS) })
              .where(eq(vaultUsersTable.telegramId, telegramId));
          } else if (payload.product === "energy_refill") {
            const state = isVaultState(user.state) ? user.state : {};
            const maxEnergy = typeof state.maxEnergy === "number" ? state.maxEnergy : 1000;
            await db
              .update(vaultUsersTable)
              .set({
                state: { ...state, energy: maxEnergy },
                starsBalance: sql`${vaultUsersTable.starsBalance} + ${payment.total_amount}`,
              })
              .where(eq(vaultUsersTable.telegramId, telegramId));
          } else if (payload.product === "boost") {
            const state = isVaultState(user.state) ? user.state : {};
            await db
              .update(vaultUsersTable)
              .set({
                state: {
                  ...state,
                  activeTurbo: true,
                  turboExpiresAt: Date.now() + BOOST_DURATION_MS,
                },
                starsBalance: sql`${vaultUsersTable.starsBalance} + ${payment.total_amount}`,
              })
              .where(eq(vaultUsersTable.telegramId, telegramId));
          } else {
            await db
              .update(vaultUsersTable)
              .set({ starsBalance: sql`${vaultUsersTable.starsBalance} + ${payment.total_amount}` })
              .where(eq(vaultUsersTable.telegramId, telegramId));
          }
          req.log.info({ telegramId, product: payload.product, amount: payment.total_amount }, "Telegram Stars payment processed");
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "Failed to process Telegram webhook update");
  }

  res.json({ ok: true });
});

export default router;
