import crypto from "node:crypto";
import type { Request, Response } from "express";

const SESSION_COOKIE = "vaultx_session";
const sessionSecret = process.env.SESSION_SECRET ?? "";

function sign(value: string): string {
  const signature = crypto.createHmac("sha256", sessionSecret).update(value).digest("hex");
  return `${value}.${signature}`;
}

function unsign(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) {
    return null;
  }
  const value = signed.slice(0, lastDot);
  const signature = signed.slice(lastDot + 1);
  const expected = crypto.createHmac("sha256", sessionSecret).update(value).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
    return null;
  }
  return value;
}

export function setSessionCookie(res: Response, telegramId: string): void {
  const token = sign(telegramId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 365,
    path: "/",
  });
}

export function getSessionTelegramId(req: Request): string | null {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw || typeof raw !== "string") {
    return null;
  }
  return unsign(raw);
}
