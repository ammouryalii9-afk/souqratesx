import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, vaultUsersTable, adminSettingsTable, adminAuditLogTable } from "@workspace/db";
import {
  AdminLoginBody,
  AdminLoginResponse,
  AdminLogoutResponse,
  GetAdminMeResponse,
  GetAdminStatsResponse,
  GetAdminUsersResponse,
  GetAdminUserResponse,
  UpdateAdminUserBody,
  UpdateAdminUserResponse,
  DeleteAdminUserResponse,
  GetAdminSettingsResponse,
  UpdateAdminSettingsBody,
  UpdateAdminSettingsResponse,
  GetAdminAuditLogResponse,
} from "@workspace/api-zod";
import { setAdminSessionCookie, clearAdminSessionCookie, isAdminSession } from "../lib/session";

const router: IRouter = Router();

const adminPassword = process.env.ADMIN_PASSWORD ?? "";

function requireAdmin(req: Parameters<Parameters<IRouter["get"]>[1]>[0]): boolean {
  return isAdminSession(req as never);
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function logAdminAction(action: string, targetTelegramId: string | null, details: Record<string, unknown> = {}): Promise<void> {
  await db.insert(adminAuditLogTable).values({ action, targetTelegramId, details });
}

function toUserSummary(user: typeof vaultUsersTable.$inferSelect) {
  return {
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    lifetimePoints: user.lifetimePoints,
    isBanned: user.isBanned,
    isPremium: user.isPremium,
    starsBalance: user.starsBalance,
    createdAt: user.createdAt.toISOString(),
  };
}

function toUserDetail(user: typeof vaultUsersTable.$inferSelect) {
  return {
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    lifetimePoints: user.lifetimePoints,
    isBanned: user.isBanned,
    isPremium: user.isPremium,
    premiumExpiresAt: user.premiumExpiresAt ? user.premiumExpiresAt.toISOString() : null,
    starsBalance: user.starsBalance,
    notes: user.notes,
    state: user.state,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

router.post("/admin/login", async (req, res): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!adminPassword || !timingSafeEqualStrings(parsed.data.password, adminPassword)) {
    req.log.warn("Failed admin login attempt");
    res.status(401).json({ error: "Invalid admin password" });
    return;
  }

  setAdminSessionCookie(res);
  res.json(AdminLoginResponse.parse({ authenticated: true }));
});

router.post("/admin/logout", async (_req, res): Promise<void> => {
  clearAdminSessionCookie(res);
  res.json(AdminLogoutResponse.parse({ authenticated: false }));
});

router.get("/admin/me", async (req, res): Promise<void> => {
  res.json(GetAdminMeResponse.parse({ authenticated: requireAdmin(req) }));
});

router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const [totals] = await db
    .select({
      totalUsers: count(),
      totalLifetimePoints: sql<number>`coalesce(sum(${vaultUsersTable.lifetimePoints}), 0)`,
      premiumUsers: sql<number>`count(*) filter (where ${vaultUsersTable.isPremium})`,
      bannedUsers: sql<number>`count(*) filter (where ${vaultUsersTable.isBanned})`,
      newUsersToday: sql<number>`count(*) filter (where ${vaultUsersTable.createdAt} >= now() - interval '1 day')`,
    })
    .from(vaultUsersTable);

  res.json(
    GetAdminStatsResponse.parse({
      totalUsers: Number(totals?.totalUsers ?? 0),
      totalLifetimePoints: Number(totals?.totalLifetimePoints ?? 0),
      totalBalanceUSD: 0,
      premiumUsers: Number(totals?.premiumUsers ?? 0),
      bannedUsers: Number(totals?.bannedUsers ?? 0),
      newUsersToday: Number(totals?.newUsersToday ?? 0),
    }),
  );
});

router.get("/admin/users", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const searchClause = search
    ? or(
        ilike(vaultUsersTable.telegramId, `%${search}%`),
        ilike(vaultUsersTable.username, `%${search}%`),
        ilike(vaultUsersTable.firstName, `%${search}%`),
        ilike(vaultUsersTable.lastName, `%${search}%`),
      )
    : undefined;

  const [users, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select()
      .from(vaultUsersTable)
      .where(searchClause)
      .orderBy(desc(vaultUsersTable.lifetimePoints))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(vaultUsersTable).where(searchClause),
  ]);

  res.json(
    GetAdminUsersResponse.parse({
      users: users.map(toUserSummary),
      total: Number(total),
    }),
  );
});

router.get("/admin/users/:telegramId", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, req.params.telegramId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetAdminUserResponse.parse(toUserDetail(user)));
});

router.put("/admin/users/:telegramId", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const patch: Partial<typeof vaultUsersTable.$inferInsert> = {};
  if (parsed.data.lifetimePoints !== undefined) patch.lifetimePoints = parsed.data.lifetimePoints;
  if (parsed.data.isBanned !== undefined) patch.isBanned = parsed.data.isBanned;
  if (parsed.data.isPremium !== undefined) patch.isPremium = parsed.data.isPremium;
  if (parsed.data.premiumExpiresAt !== undefined) {
    patch.premiumExpiresAt = parsed.data.premiumExpiresAt ? new Date(parsed.data.premiumExpiresAt) : null;
  }
  if (parsed.data.starsBalance !== undefined) patch.starsBalance = parsed.data.starsBalance;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
  if (parsed.data.state !== undefined) patch.state = parsed.data.state;

  const [user] = await db
    .update(vaultUsersTable)
    .set(patch)
    .where(eq(vaultUsersTable.telegramId, req.params.telegramId))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await logAdminAction("update_user", req.params.telegramId, patch);

  res.json(UpdateAdminUserResponse.parse(toUserDetail(user)));
});

router.delete("/admin/users/:telegramId", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  await db.delete(vaultUsersTable).where(eq(vaultUsersTable.telegramId, req.params.telegramId));
  await logAdminAction("delete_user", req.params.telegramId);

  res.json(DeleteAdminUserResponse.parse({ authenticated: true }));
});

router.get("/admin/settings", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const rows = await db.select().from(adminSettingsTable);
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  res.json(GetAdminSettingsResponse.parse(settings));
});

router.put("/admin/settings", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const parsed = UpdateAdminSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const entries = Object.entries(parsed.data);
  for (const [key, value] of entries) {
    await db
      .insert(adminSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: adminSettingsTable.key, set: { value } });
  }

  await logAdminAction("update_settings", null, { keys: entries.map(([key]) => key) });

  const rows = await db.select().from(adminSettingsTable);
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  res.json(UpdateAdminSettingsResponse.parse(settings));
});

router.get("/admin/audit-log", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const rows = await db.select().from(adminAuditLogTable).orderBy(desc(adminAuditLogTable.createdAt)).limit(100);

  res.json(
    GetAdminAuditLogResponse.parse(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        targetTelegramId: row.targetTelegramId,
        details: row.details as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      })),
    ),
  );
});

export default router;
