import crypto from "node:crypto";

export type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
};

export type VerifiedInitData = {
  user: TelegramUser;
  startParam: string | null;
};

const botToken = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Verifies the initData string sent by a Telegram WebApp client using the
 * HMAC-SHA256 scheme documented at https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
export function verifyTelegramInitData(initData: string): VerifiedInitData | null {
  if (!botToken) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return null;
  }
  params.delete("hash");

  const dataCheckArr: string[] = [];
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) {
    return null;
  }

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > 86400) {
    return null;
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return null;
  }

  try {
    const user = JSON.parse(userRaw) as TelegramUser;
    const startParam = params.get("start_param");
    return { user, startParam: startParam && startParam.length > 0 ? startParam : null };
  } catch {
    return null;
  }
}
