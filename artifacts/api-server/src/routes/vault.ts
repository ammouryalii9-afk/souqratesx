import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import {
  UpdateVaultMeBody,
  GetVaultMeResponse,
  UpdateVaultMeResponse,
  GetVaultLeaderboardResponse,
} from "@workspace/api-zod";
import { getSessionTelegramId } from "../lib/session";

const router: IRouter = Router();

router.get("/vault/me", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(
    GetVaultMeResponse.parse({
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        lifetimePoints: user.lifetimePoints,
      },
      state: user.state,
    }),
  );
});

router.put("/vault/me", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = UpdateVaultMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .update(vaultUsersTable)
    .set({
      state: parsed.data.state,
      lifetimePoints: parsed.data.lifetimePoints,
    })
    .where(eq(vaultUsersTable.telegramId, telegramId))
    .returning();

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(
    UpdateVaultMeResponse.parse({
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        lifetimePoints: user.lifetimePoints,
      },
      state: user.state,
    }),
  );
});

router.get("/vault/leaderboard", async (_req, res): Promise<void> => {
  const users = await db
    .select()
    .from(vaultUsersTable)
    .orderBy(desc(vaultUsersTable.lifetimePoints))
    .limit(50);

  res.json(
    GetVaultLeaderboardResponse.parse(
      users.map((user) => ({
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        photoUrl: user.photoUrl,
        lifetimePoints: user.lifetimePoints,
      })),
    ),
  );
});

export default router;
