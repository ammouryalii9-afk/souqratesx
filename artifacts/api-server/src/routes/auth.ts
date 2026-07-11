import { Router, type IRouter } from "express";
import { rateLimit } from "../lib/rateLimit";
import { eq } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import { AuthTelegramBody, AuthTelegramResponse } from "@workspace/api-zod";
import { verifyTelegramInitData } from "../lib/telegramAuth";
import { setSessionCookie } from "../lib/session";
import { linkReferrer } from "../lib/referral";
import { joinSquadOnSignup } from "../lib/squadSignup";

const router: IRouter = Router();

router.post("/auth/telegram", rateLimit("auth", 20, 60_000), async (req, res): Promise<void> => {
  const parsed = AuthTelegramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const verified = verifyTelegramInitData(parsed.data.initData);
  if (!verified) {
    req.log.warn("Failed to verify Telegram initData");
    res.status(401).json({ error: "Invalid Telegram authentication data" });
    return;
  }

  const { user: telegramUser, startParam } = verified;
  const telegramId = String(telegramUser.id);

  const [existing] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));

  if (existing?.isBanned) {
    req.log.warn({ telegramId }, "Banned user attempted to authenticate");
    res.status(403).json({ error: "This account has been banned" });
    return;
  }

  let user;
  if (existing) {
    [user] = await db
      .update(vaultUsersTable)
      .set({
        username: telegramUser.username ?? existing.username,
        firstName: telegramUser.first_name ?? existing.firstName,
        lastName: telegramUser.last_name ?? existing.lastName,
        photoUrl: telegramUser.photo_url ?? existing.photoUrl,
      })
      .where(eq(vaultUsersTable.telegramId, telegramId))
      .returning();
  } else {
    [user] = await db
      .insert(vaultUsersTable)
      .values({
        telegramId,
        username: telegramUser.username ?? null,
        firstName: telegramUser.first_name ?? null,
        lastName: telegramUser.last_name ?? null,
        photoUrl: telegramUser.photo_url ?? null,
        lifetimePoints: 0,
        state: {},
      })
      .returning();

    if (user) {
      if (startParam?.startsWith("squad_")) {
        await joinSquadOnSignup(telegramId, startParam);
      } else {
        await linkReferrer(telegramId, startParam);
      }
    }
  }

  if (!user) {
    res.status(500).json({ error: "Failed to create user" });
    return;
  }

  setSessionCookie(res, telegramId);

  res.json(
    AuthTelegramResponse.parse({
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        lifetimePoints: user.lifetimePoints,
        referralCount: user.referralCount,
        referralEarnings: user.referralEarnings,
      },
      state: user.state,
    }),
  );
});

export default router;
