import { logger } from "./logger";

const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";

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
  message?: { from?: { id: number }; successful_payment?: TelegramSuccessfulPayment };
};

export function logTelegramWebhookError(context: string, err: unknown): void {
  logger.error({ err, context }, "Telegram webhook processing error");
}
