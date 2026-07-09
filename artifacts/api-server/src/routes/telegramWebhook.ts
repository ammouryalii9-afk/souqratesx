import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import { answerPreCheckoutQuery, sendTelegramMessage, type TelegramUpdate } from "../lib/telegramBot";

const router: IRouter = Router();

const PREMIUM_MONTH_MS = 1000 * 60 * 60 * 24 * 30;

router.post("/telegram/webhook", async (req, res): Promise<void> => {
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
      if (telegramId) {
        const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
        if (user) {
          if (payload.product === "premium_month") {
            const base = user.premiumExpiresAt && user.premiumExpiresAt.getTime() > Date.now() ? user.premiumExpiresAt.getTime() : Date.now();
            await db
              .update(vaultUsersTable)
              .set({ isPremium: true, premiumExpiresAt: new Date(base + PREMIUM_MONTH_MS) })
              .where(eq(vaultUsersTable.telegramId, telegramId));
          } else {
            await db
              .update(vaultUsersTable)
              .set({ starsBalance: user.starsBalance + payment.total_amount })
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
