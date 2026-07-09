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
import { getSettingsMap, asNumber } from "../lib/settings";

const router: IRouter = Router();

// Generous ceiling covering tap-mining + all passive cards at high levels + mini-games.
// Anything above this per-sync window is treated as implausible and clamped server-side,
// closing the "client just sends a huge lifetimePoints number" exploit while still letting
// legitimate fast progression through (admin-tunable via admin_settings.maxPointsPerHourCap).
const DEFAULT_MAX_POINTS_PER_HOUR = 3_000_000;
const MIN_SYNC_WINDOW_SECONDS = 5; // first-ever sync / very fast repeats still get a small grace window

async function computeMaxAllowedDelta(lastSyncAt: Date | null): Promise<number> {
  const settings = await getSettingsMap();
  const capPerHour = asNumber(settings.maxPointsPerHourCap, DEFAULT_MAX_POINTS_PER_HOUR);
  const capPerSecond = capPerHour / 3600;
  const elapsedSeconds = lastSyncAt
    ? Math.max(MIN_SYNC_WINDOW_SECONDS, (Date.now() - lastSyncAt.getTime()) / 1000)
    : 60 * 60; // no prior sync on record: allow up to one hour worth as a one-time grace amount
  return Math.ceil(capPerSecond * elapsedSeconds);
}

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

  const [existing] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!existing) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const requestedLifetimePoints = parsed.data.lifetimePoints;
  const requestedDelta = requestedLifetimePoints - existing.lifetimePoints;

  let finalLifetimePoints = existing.lifetimePoints;
  let finalState = parsed.data.state;

  if (requestedDelta <= 0) {
    // Never let the client decrease lifetimePoints (e.g. a stale/racing sync) — keep the higher server value.
    finalLifetimePoints = existing.lifetimePoints;
  } else {
    const maxAllowedDelta = await computeMaxAllowedDelta(existing.lastPointsSyncAt);
    if (requestedDelta > maxAllowedDelta) {
      req.log.warn(
        { telegramId, requestedDelta, maxAllowedDelta, requestedLifetimePoints, previous: existing.lifetimePoints },
        "clamped implausible lifetimePoints increase from client",
      );
      finalLifetimePoints = existing.lifetimePoints + maxAllowedDelta;
    } else {
      finalLifetimePoints = requestedLifetimePoints;
    }
  }

  const [user] = await db
    .update(vaultUsersTable)
    .set({
      state: finalState,
      lifetimePoints: finalLifetimePoints,
      lastPointsSyncAt: new Date(),
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
