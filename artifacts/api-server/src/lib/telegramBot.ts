import crypto from "node:crypto";
import { logger } from "./logger";

const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";

/**
 * Deterministic secret token used to authenticate incoming Telegram webhook
 * calls (X-Telegram-Bot-Api-Secret-Token header). Derived from SESSION_SECRET
 * so it survives restarts without extra configuration.
 */
export function getWebhookSecretToken(): string {
  const base = process.env.SESSION_SECRET ?? "";
  return crypto.createHmac("sha256", base).update("telegram-webhook-secret").digest("hex").slice(0, 64);
}

export function verifyWebhookSecretToken(headerValue: string | undefined): boolean {
  if (!headerValue) {
    return false;
  }
  const expected = Buffer.from(getWebhookSecretToken());
  const actual = Buffer.from(headerValue);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

async function callBotApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  const res = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    throw new Error(json.description ?? `Telegram API call to ${method} failed`);
  }
  return json.result as T;
}

export async function createStarsInvoiceLink(params: {
  title: string;
  description: string;
  payload: string;
  amountStars: number;
}): Promise<string> {
  return callBotApi<string>("createInvoiceLink", {
    title: params.title,
    description: params.description,
    payload: params.payload,
    currency: "XTR",
    prices: [{ label: params.title, amount: params.amountStars }],
  });
}

export async function answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string): Promise<void> {
  await callBotApi("answerPreCheckoutQuery", {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(errorMessage ? { error_message: errorMessage } : {}),
  });
}

export async function setTelegramWebhook(webhookUrl: string): Promise<void> {
  await callBotApi("setWebhook", {
    url: webhookUrl,
    allowed_updates: ["pre_checkout_query", "message"],
    secret_token: getWebhookSecretToken(),
  });
}

export async function sendTelegramMessage(chatId: number, text: string, webAppUrl?: string): Promise<void> {
  await callBotApi("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: webAppUrl
      ? {
          inline_keyboard: [[{ text: "🚀 Play Now", web_app: { url: webAppUrl } }]],
        }
      : undefined,
  });
}

export async function sendPlainTelegramMessage(chatId: string, text: string): Promise<void> {
  await callBotApi("sendMessage", {
    chat_id: chatId,
    text,
  });
}

export async function setTelegramMenuButton(appUrl: string): Promise<void> {
  await callBotApi("setChatMenuButton", {
    menu_button: { type: "web_app", text: "Open App", web_app: { url: appUrl } },
  });
}

export async function setTelegramBotCommands(): Promise<void> {
  await callBotApi("setMyCommands", {
    commands: [{ command: "start", description: "Open SouqratesX" }],
  });
}

export function isTelegramBotConfigured(): boolean {
  return Boolean(botToken);
}

export type TelegramSuccessfulPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
};

export type TelegramUpdate = {
  pre_checkout_query?: { id: string; from: { id: number }; invoice_payload: string; total_amount: number };
  message?: { from?: { id: number }; text?: string; successful_payment?: TelegramSuccessfulPayment };
};

export function logTelegramWebhookError(context: string, err: unknown): void {
  logger.error({ err, context }, "Telegram webhook processing error");
}

/**
 * Send a reminder message to a single user by their numeric Telegram ID.
 * Returns true on success, false if the user has blocked the bot or another
 * non-fatal error occurred (e.g. chat not found).
 */
export async function sendReminderToUser(chatId: string, text: string, webAppUrl: string): Promise<boolean> {
  try {
    await callBotApi("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [[{ text: "🚀 Play Now", web_app: { url: webAppUrl } }]],
      },
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // These errors are expected for users who blocked the bot — don't throw.
    if (msg.includes("Forbidden") || msg.includes("chat not found") || msg.includes("user is deactivated")) {
      return false;
    }
    throw err;
  }
}
