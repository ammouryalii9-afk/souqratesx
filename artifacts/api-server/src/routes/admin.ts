import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { and, count, desc, eq, ilike, or, sql, gte, lte, inArray } from "drizzle-orm";
import { db, vaultUsersTable, adminSettingsTable, adminAuditLogTable, userActivityLogTable, broadcastJobsTable, sponsoredAdsTable, starProductsTable, providersTable, providerLogsTable, rewardTransactionsTable, partnerTasksTable, partnerTaskCompletionsTable } from "@workspace/db";
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
  GetAdminUserActivityResponse,
  GetAdminBroadcastsResponse,
  CreateAdminBroadcastBody,
  CreateAdminBroadcastResponse,
  GetAdminBroadcastResponse,
  GetAdminAdsResponse,
  CreateAdminAdBody,
  CreateAdminAdResponse,
  UpdateAdminAdBody,
  UpdateAdminAdResponse,
  GetAdminStarProductsResponse,
  CreateAdminStarProductBody,
  CreateAdminStarProductResponse,
  UpdateAdminStarProductBody,
  UpdateAdminStarProductResponse,
} from "@workspace/api-zod";
import { setAdminSessionCookie, clearAdminSessionCookie, isAdminSession } from "../lib/session";
import { rateLimit } from "../lib/rateLimit";
import {
  setTelegramWebhook,
  setTelegramMenuButton,
  setTelegramBotCommands,
  isTelegramBotConfigured,
  sendPlainTelegramMessage,
  sendReminderToUser,
} from "../lib/telegramBot";
import { logger } from "../lib/logger";
import { syncProvidersFromSettings } from "../providers/manager";

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
    referrerId: user.referrerId,
    referralCount: user.referralCount,
    referralEarnings: user.referralEarnings,
    createdAt: user.createdAt.toISOString(),
  };
}

function toUserDetail(user: typeof vaultUsersTable.$inferSelect) {
  const st = (typeof user.state === "object" && user.state !== null && !Array.isArray(user.state))
    ? (user.state as Record<string, unknown>)
    : {};
  return {
    internalId: user.id,
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
    referrerId: user.referrerId,
    referralCount: user.referralCount,
    referralEarnings: user.referralEarnings,
    adsWatchedToday: user.adsWatchedToday,
    notes: user.notes,
    state: user.state,
    // Extracted game-state fields for convenient display
    currentPoints: typeof st.tempMiningPoints === "number" ? st.tempMiningPoints : 0,
    miningLevel: typeof st.miningLevel === "number" ? st.miningLevel : 1,
    energy: typeof st.energy === "number" ? st.energy : 0,
    maxEnergy: typeof st.maxEnergy === "number" ? st.maxEnergy : 1000,
    profitPerHour: typeof st.profitPerHour === "number" ? st.profitPerHour : 0,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

router.post("/admin/login", rateLimit("admin-login", 5, 60_000), async (req, res): Promise<void> => {
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

router.post("/admin/users/bulk-ban", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const body = req.body as { telegramIds?: unknown; ban?: unknown };
  const ids = Array.isArray(body.telegramIds)
    ? body.telegramIds.map(String).filter((s) => s.length > 0).slice(0, 500)
    : [];
  const ban = body.ban !== false; // default true

  if (ids.length === 0) {
    res.status(400).json({ error: "No telegramIds provided" });
    return;
  }

  const updated = await db
    .update(vaultUsersTable)
    .set({ isBanned: ban })
    .where(inArray(vaultUsersTable.telegramId, ids))
    .returning({ telegramId: vaultUsersTable.telegramId });

  await logAdminAction(ban ? "bulk_ban" : "bulk_unban", "multiple", { count: updated.length, telegramIds: ids });

  res.json({ ok: true, affected: updated.length, ban });
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

  await syncProvidersFromSettings(settings);

  res.json(UpdateAdminSettingsResponse.parse(settings));
});

router.post("/admin/telegram/setup-webhook", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  if (!isTelegramBotConfigured()) {
    res.status(400).json({ error: "TELEGRAM_BOT_TOKEN is not configured" });
    return;
  }

  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  const webhookUrl = `${proto}://${host}/api/telegram/webhook`;

  try {
    const appUrl = `${proto}://${host}/`;
    await setTelegramWebhook(webhookUrl);
    await setTelegramBotCommands();
    await setTelegramMenuButton(appUrl);
    await logAdminAction("setup_telegram_webhook", null, { webhookUrl, appUrl });
    res.json({ ok: true, webhookUrl, description: "Telegram webhook configured successfully" });
  } catch (err) {
    req.log.error({ err }, "Failed to set Telegram webhook");
    res.status(400).json({ error: "Failed to set Telegram webhook" });
  }
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

// ─── User Deep Stats ──────────────────────────────────────────────────────────

router.get("/admin/users/:telegramId/stats", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const telegramId = req.params.telegramId;

  const [rewardRows, providerLogRows] = await Promise.all([
    db.execute(sql`
      SELECT
        provider_key,
        count(*)::int           AS total_rewards,
        coalesce(sum(amount),0)::bigint AS total_points
      FROM reward_transactions
      WHERE telegram_id = ${telegramId}
        AND status = 'credited'
      GROUP BY provider_key
      ORDER BY total_points DESC
    `),
    db.execute(sql`
      SELECT
        count(*)::int           AS total_events,
        count(*) FILTER (WHERE NOT success)::int AS error_count
      FROM provider_logs
      WHERE telegram_id = ${telegramId}
    `),
  ]);

  res.json({
    rewardsByProvider: rewardRows.rows,
    totalEvents: (providerLogRows.rows[0] as { total_events: number } | undefined)?.total_events ?? 0,
    errorCount: (providerLogRows.rows[0] as { error_count: number } | undefined)?.error_count ?? 0,
  });
});

router.get("/admin/users/:telegramId/activity", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const telegramId = req.params.telegramId;

  const [activityRows, auditRows] = await Promise.all([
    db
      .select()
      .from(userActivityLogTable)
      .where(eq(userActivityLogTable.telegramId, telegramId))
      .orderBy(desc(userActivityLogTable.createdAt))
      .limit(200),
    db
      .select()
      .from(adminAuditLogTable)
      .where(eq(adminAuditLogTable.targetTelegramId, telegramId))
      .orderBy(desc(adminAuditLogTable.createdAt))
      .limit(200),
  ]);

  const merged = [
    ...activityRows.map((row) => ({
      source: "activity" as const,
      type: row.type,
      details: row.details as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    })),
    ...auditRows.map((row) => ({
      source: "admin" as const,
      type: row.action,
      details: row.details as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(GetAdminUserActivityResponse.parse(merged));
});

function toSponsoredAd(row: typeof sponsoredAdsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    linkUrl: row.linkUrl,
    rewardPoints: row.rewardPoints,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/admin/ads", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const rows = await db.select().from(sponsoredAdsTable).orderBy(desc(sponsoredAdsTable.createdAt));
  res.json(GetAdminAdsResponse.parse(rows.map(toSponsoredAd)));
});

router.post("/admin/ads", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const parsed = CreateAdminAdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { notify, ...adInput } = parsed.data;

  const [ad] = await db
    .insert(sponsoredAdsTable)
    .values({
      title: adInput.title,
      description: adInput.description ?? null,
      imageUrl: adInput.imageUrl ?? null,
      linkUrl: adInput.linkUrl,
      rewardPoints: adInput.rewardPoints,
    })
    .returning();

  if (!ad) {
    res.status(400).json({ error: "Failed to create ad" });
    return;
  }

  await logAdminAction("create_ad", null, { adId: ad.id, title: ad.title, notify: Boolean(notify) });

  if (notify && isTelegramBotConfigured()) {
    const message = `📢 ${ad.title}\n\n${ad.description ?? ""}\n\nأكمل المهمة في تطبيق SouqrateX واحصل على ${ad.rewardPoints.toLocaleString()} نقطة!`.trim();
    const [job] = await db.insert(broadcastJobsTable).values({ message, audience: "all", status: "pending" }).returning();
    if (job) {
      runBroadcastJob(job.id, message, "all").catch((err) => {
        logger.error({ err, jobId: job.id }, "Ad notification broadcast failed");
      });
    }
  }

  res.json(CreateAdminAdResponse.parse(toSponsoredAd(ad)));
});

router.patch("/admin/ads/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(404).json({ error: "Ad not found" });
    return;
  }

  const parsed = UpdateAdminAdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const patch: Partial<typeof sponsoredAdsTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.imageUrl !== undefined) patch.imageUrl = parsed.data.imageUrl;
  if (parsed.data.linkUrl !== undefined) patch.linkUrl = parsed.data.linkUrl;
  if (parsed.data.rewardPoints !== undefined) patch.rewardPoints = parsed.data.rewardPoints;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;

  const [ad] = await db.update(sponsoredAdsTable).set(patch).where(eq(sponsoredAdsTable.id, id)).returning();
  if (!ad) {
    res.status(404).json({ error: "Ad not found" });
    return;
  }

  await logAdminAction("update_ad", null, { adId: id, ...patch });

  res.json(UpdateAdminAdResponse.parse(toSponsoredAd(ad)));
});

router.delete("/admin/ads/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(404).json({ error: "Ad not found" });
    return;
  }

  await db.delete(sponsoredAdsTable).where(eq(sponsoredAdsTable.id, id));
  await logAdminAction("delete_ad", null, { adId: id });

  res.json(AdminLogoutResponse.parse({ authenticated: true }));
});

function toStarProduct(row: typeof starProductsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    priceStars: row.priceStars,
    effectType: row.effectType,
    effectValue: row.effectValue,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    benefitsBullets: row.benefitsBullets,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/admin/star-products", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const rows = await db.select().from(starProductsTable).orderBy(desc(starProductsTable.createdAt));
  res.json(GetAdminStarProductsResponse.parse(rows.map(toStarProduct)));
});

router.post("/admin/star-products", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const parsed = CreateAdminStarProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const body = parsed.data as typeof parsed.data & { sortOrder?: number; benefitsBullets?: string | null };
  const [product] = await db
    .insert(starProductsTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      priceStars: parsed.data.priceStars,
      effectType: parsed.data.effectType,
      effectValue: parsed.data.effectValue ?? null,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      benefitsBullets: body.benefitsBullets ?? null,
    })
    .returning();

  if (!product) {
    res.status(400).json({ error: "Failed to create product" });
    return;
  }

  await logAdminAction("create_star_product", null, { productId: product.id, title: product.title });

  res.json(CreateAdminStarProductResponse.parse(toStarProduct(product)));
});

router.patch("/admin/star-products/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const parsed = UpdateAdminStarProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const patchBody = parsed.data as typeof parsed.data & { sortOrder?: number; benefitsBullets?: string | null };
  const patch: Partial<typeof starProductsTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.imageUrl !== undefined) patch.imageUrl = parsed.data.imageUrl;
  if (parsed.data.priceStars !== undefined) patch.priceStars = parsed.data.priceStars;
  if (parsed.data.effectType !== undefined) patch.effectType = parsed.data.effectType;
  if (parsed.data.effectValue !== undefined) patch.effectValue = parsed.data.effectValue;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (patchBody.sortOrder !== undefined) patch.sortOrder = patchBody.sortOrder;
  if (patchBody.benefitsBullets !== undefined) patch.benefitsBullets = patchBody.benefitsBullets;

  const [product] = await db.update(starProductsTable).set(patch).where(eq(starProductsTable.id, id)).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  await logAdminAction("update_star_product", null, { productId: id, ...patch });

  res.json(UpdateAdminStarProductResponse.parse(toStarProduct(product)));
});

router.delete("/admin/star-products/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  await db.delete(starProductsTable).where(eq(starProductsTable.id, id));
  await logAdminAction("delete_star_product", null, { productId: id });

  res.json(AdminLogoutResponse.parse({ authenticated: true }));
});

router.get("/admin/broadcast", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const rows = await db.select().from(broadcastJobsTable).orderBy(desc(broadcastJobsTable.createdAt)).limit(50);

  res.json(
    GetAdminBroadcastsResponse.parse(
      rows.map((row) => ({
        id: row.id,
        message: row.message,
        audience: row.audience,
        status: row.status,
        totalUsers: row.totalUsers,
        sentCount: row.sentCount,
        failedCount: row.failedCount,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      })),
    ),
  );
});

function toBroadcastJob(row: typeof broadcastJobsTable.$inferSelect) {
  return {
    id: row.id,
    message: row.message,
    audience: row.audience,
    status: row.status,
    totalUsers: row.totalUsers,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

async function runBroadcastJob(jobId: number, message: string, audience: string): Promise<void> {
  const whereClause =
    audience === "premium"
      ? and(eq(vaultUsersTable.isBanned, false), eq(vaultUsersTable.isPremium, true))
      : audience === "active"
        ? and(eq(vaultUsersTable.isBanned, false), sql`${vaultUsersTable.updatedAt} >= now() - interval '7 days'`)
        : eq(vaultUsersTable.isBanned, false);

  const users = await db.select({ telegramId: vaultUsersTable.telegramId }).from(vaultUsersTable).where(whereClause);

  await db
    .update(broadcastJobsTable)
    .set({ status: "running", totalUsers: users.length })
    .where(eq(broadcastJobsTable.id, jobId));

  let sentCount = 0;
  let failedCount = 0;

  for (const user of users) {
    try {
      await sendPlainTelegramMessage(user.telegramId, message);
      sentCount += 1;
    } catch (err) {
      failedCount += 1;
      logger.warn({ err, telegramId: user.telegramId }, "Failed to deliver broadcast message");
    }

    if ((sentCount + failedCount) % 20 === 0) {
      await db
        .update(broadcastJobsTable)
        .set({ sentCount, failedCount })
        .where(eq(broadcastJobsTable.id, jobId));
    }

    await new Promise((resolve) => setTimeout(resolve, 35));
  }

  await db
    .update(broadcastJobsTable)
    .set({ status: "completed", sentCount, failedCount, completedAt: new Date() })
    .where(eq(broadcastJobsTable.id, jobId));
}

router.post("/admin/broadcast", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  if (!isTelegramBotConfigured()) {
    res.status(400).json({ error: "TELEGRAM_BOT_TOKEN is not configured" });
    return;
  }

  const parsed = CreateAdminBroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const audience = parsed.data.audience ?? "all";
  const [job] = await db
    .insert(broadcastJobsTable)
    .values({ message: parsed.data.message, audience, status: "pending" })
    .returning();

  if (!job) {
    res.status(400).json({ error: "Failed to create broadcast job" });
    return;
  }

  await logAdminAction("create_broadcast", null, { jobId: job.id, audience, message: parsed.data.message });

  runBroadcastJob(job.id, parsed.data.message, audience).catch((err) => {
    logger.error({ err, jobId: job.id }, "Broadcast job failed");
  });

  res.json(CreateAdminBroadcastResponse.parse(toBroadcastJob(job)));
});

router.get("/admin/broadcast/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(404).json({ error: "Broadcast job not found" });
    return;
  }

  const [job] = await db.select().from(broadcastJobsTable).where(eq(broadcastJobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Broadcast job not found" });
    return;
  }

  res.json(GetAdminBroadcastResponse.parse(toBroadcastJob(job)));
});

// ─── Analytics ───────────────────────────────────────────────────────────────

router.get("/admin/analytics", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const days = Math.min(Number(req.query.days) || 14, 90);

  const [
    newUsersByDay,
    retentionD1,
    retentionD7,
    topLeague,
    rewardsByDay,
  ] = await Promise.all([
    // New users per day (last N days)
    db.execute(sql`
      SELECT
        date_trunc('day', created_at AT TIME ZONE 'UTC')::date::text AS date,
        count(*)::int AS count
      FROM vault_users
      WHERE created_at >= now() - (${days} || ' days')::interval
      GROUP BY 1
      ORDER BY 1
    `),
    // D1 retention: users who came back the day after signup
    db.execute(sql`
      SELECT
        (count(*) FILTER (WHERE u.updated_at >= u.created_at + interval '1 day'))::int AS returned,
        count(*)::int AS total
      FROM vault_users u
      WHERE u.created_at >= now() - interval '30 days'
        AND u.created_at < now() - interval '1 day'
    `),
    // D7 retention
    db.execute(sql`
      SELECT
        (count(*) FILTER (WHERE u.updated_at >= u.created_at + interval '7 days'))::int AS returned,
        count(*)::int AS total
      FROM vault_users u
      WHERE u.created_at >= now() - interval '37 days'
        AND u.created_at < now() - interval '7 days'
    `),
    // Users per league bucket
    db.execute(sql`
      SELECT
        CASE
          WHEN lifetime_points >= 1000000 THEN 'Diamond'
          WHEN lifetime_points >= 500000  THEN 'Gold'
          WHEN lifetime_points >= 100000  THEN 'Silver'
          ELSE 'Bronze'
        END AS league,
        count(*)::int AS count
      FROM vault_users
      GROUP BY 1
      ORDER BY count DESC
    `),
    // Total rewards credited per day (from reward_transactions)
    db.execute(sql`
      SELECT
        date_trunc('day', created_at AT TIME ZONE 'UTC')::date::text AS date,
        coalesce(sum(amount), 0)::int AS total_points,
        count(*)::int AS tx_count
      FROM reward_transactions
      WHERE created_at >= now() - (${days} || ' days')::interval
        AND status = 'credited'
      GROUP BY 1
      ORDER BY 1
    `),
  ]);

  const d1Row = retentionD1.rows[0] as { returned: number; total: number } | undefined;
  const d7Row = retentionD7.rows[0] as { returned: number; total: number } | undefined;

  res.json({
    newUsersByDay: newUsersByDay.rows,
    rewardsByDay: rewardsByDay.rows,
    leagueDistribution: topLeague.rows,
    retention: {
      d1Rate: d1Row && d1Row.total > 0 ? Math.round((d1Row.returned / d1Row.total) * 100) : null,
      d7Rate: d7Row && d7Row.total > 0 ? Math.round((d7Row.returned / d7Row.total) * 100) : null,
      d1Total: d1Row?.total ?? 0,
      d7Total: d7Row?.total ?? 0,
    },
  });
});

// ─── Anti-Cheat ───────────────────────────────────────────────────────────────

router.get("/admin/anticheat", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const settings = await db.select().from(adminSettingsTable);
  const capSetting = settings.find((s) => s.key === "maxPointsPerHourCap");
  const capPerHour = Number(capSetting?.value ?? 3_000_000);

  // Users who gained more than cap in the last 24h (via lifetime_points delta approximation)
  // We use reward_transactions sum as a proxy for verified earned points
  const [suspicious, multiAccountCandidates, topEarners] = await Promise.all([
    // High earners via provider rewards in last 24h
    db.execute(sql`
      SELECT
        rt.telegram_id,
        u.username,
        u.first_name,
        u.is_banned,
        u.lifetime_points,
        coalesce(sum(rt.amount), 0)::int AS earned_24h,
        count(*)::int AS tx_count
      FROM reward_transactions rt
      LEFT JOIN vault_users u ON u.telegram_id = rt.telegram_id
      WHERE rt.created_at >= now() - interval '24 hours'
        AND rt.status = 'credited'
      GROUP BY rt.telegram_id, u.username, u.first_name, u.is_banned, u.lifetime_points
      HAVING coalesce(sum(rt.amount), 0) > ${capPerHour}
      ORDER BY earned_24h DESC
      LIMIT 20
    `),
    // Users sharing the same referrer with high counts — possible multi-account ring
    db.execute(sql`
      SELECT
        referrer.telegram_id AS referrer_id,
        referrer.username AS referrer_username,
        referrer.first_name AS referrer_first_name,
        referrer.referral_count,
        referrer.referral_earnings,
        referrer.lifetime_points,
        referrer.is_banned
      FROM vault_users referrer
      WHERE referrer.referral_count >= 20
      ORDER BY referrer.referral_count DESC
      LIMIT 15
    `),
    // Top 10 all-time by lifetime points (quick sanity check)
    db.execute(sql`
      SELECT telegram_id, username, first_name, lifetime_points, is_banned, created_at
      FROM vault_users
      ORDER BY lifetime_points DESC
      LIMIT 10
    `),
  ]);

  res.json({
    suspicious: suspicious.rows,
    multiAccountCandidates: multiAccountCandidates.rows,
    topEarners: topEarners.rows,
    capPerHour,
  });
});

// ─── Reminders ────────────────────────────────────────────────────────────────

/**
 * POST /admin/reminders/send
 * Sends a Telegram message to all users who have been inactive for >= `inactiveDays` days.
 * Runs in the background and streams progress via the response.
 */
router.post("/admin/reminders/send", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  if (!isTelegramBotConfigured()) {
    res.status(400).json({ error: "TELEGRAM_BOT_TOKEN is not configured" });
    return;
  }

  const inactiveDays = Math.max(1, Math.min(90, Number(req.body?.inactiveDays) || 3));
  const customMessage: string = typeof req.body?.message === "string" && req.body.message.trim()
    ? req.body.message.trim()
    : null!;

  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  const appUrl = `${proto}://${host}/`;

  const text = customMessage ||
    `⚡ You have unclaimed mining rewards waiting!\n\nYour miners have been working while you were away. Come back and collect your points before they overflow!\n\n🏆 Don't fall behind on the leaderboard — tap to resume mining now.`;

  // Fetch inactive users (updatedAt older than N days, not banned)
  const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
  const inactiveUsers = await db
    .select({ telegramId: vaultUsersTable.telegramId })
    .from(vaultUsersTable)
    .where(
      and(
        eq(vaultUsersTable.isBanned, false),
        sql`${vaultUsersTable.updatedAt} < ${cutoff}`,
        sql`${vaultUsersTable.telegramId} is not null`,
        sql`length(${vaultUsersTable.telegramId}) > 0`,
      )
    )
    .limit(5000);

  req.log.info({ count: inactiveUsers.length, inactiveDays }, "Starting reminder send to inactive users");

  let sent = 0;
  let failed = 0;

  // Send in batches to avoid Telegram rate limits (30 msg/s)
  for (let i = 0; i < inactiveUsers.length; i++) {
    const user = inactiveUsers[i];
    if (!user?.telegramId) continue;
    try {
      const ok = await sendReminderToUser(user.telegramId, text, appUrl);
      if (ok) sent++; else failed++;
    } catch {
      failed++;
    }
    // ~25 messages/second to stay under Telegram's 30/s limit
    if ((i + 1) % 25 === 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  req.log.info({ sent, failed, total: inactiveUsers.length }, "Reminder send completed");
  res.json({ ok: true, total: inactiveUsers.length, sent, failed });
});

// ─── Provider Reports ─────────────────────────────────────────────────────────

router.get("/admin/providers/report", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Not authenticated as admin" });
    return;
  }

  const days = Math.min(Number(req.query.days) || 7, 30);

  const [providers, recentTx, errorRate] = await Promise.all([
    // All providers with their config
    db.select().from(providersTable).orderBy(desc(providersTable.priority)),
    // Reward transactions grouped by provider for last N days
    db.execute(sql`
      SELECT
        provider_key,
        count(*)::int AS total_rewards,
        coalesce(sum(amount), 0)::int AS total_points,
        round(avg(amount))::int AS avg_reward,
        date_trunc('day', created_at AT TIME ZONE 'UTC')::date::text AS date
      FROM reward_transactions
      WHERE created_at >= now() - (${days} || ' days')::interval
        AND status = 'credited'
      GROUP BY provider_key, date
      ORDER BY date, provider_key
    `),
    // Error rate per provider last 7 days
    db.execute(sql`
      SELECT
        provider_key,
        count(*)::int AS total_events,
        count(*) FILTER (WHERE NOT success)::int AS error_count,
        round(avg(latency_ms))::int AS avg_latency_ms
      FROM provider_logs
      WHERE created_at >= now() - (${days} || ' days')::interval
      GROUP BY provider_key
      ORDER BY error_count DESC
    `),
  ]);

  res.json({
    providers: providers.map((p) => ({
      key: p.key,
      name: p.name,
      type: p.type,
      enabled: p.enabled,
      priority: p.priority,
    })),
    recentTx: recentTx.rows,
    errorRate: errorRate.rows,
  });
});

// ─── Partner Tasks CRUD ───────────────────────────────────────────────────────

router.get("/admin/partner-tasks", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) { res.status(401).json({ error: "Not authenticated as admin" }); return; }
  const tasks = await db.select().from(partnerTasksTable).orderBy(partnerTasksTable.sortOrder, partnerTasksTable.id);
  const counts = await db.execute(sql`
    SELECT task_id, count(*)::int AS completions
    FROM partner_task_completions GROUP BY task_id
  `);
  const completionMap = Object.fromEntries((counts.rows as { task_id: number; completions: number }[]).map(r => [r.task_id, r.completions]));
  res.json(tasks.map(t => ({ ...t, completions: completionMap[t.id] ?? 0 })));
});

router.post("/admin/partner-tasks", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) { res.status(401).json({ error: "Not authenticated as admin" }); return; }
  const { title, description, channelUsername, channelUrl, iconEmoji, rewardPoints, isActive, sortOrder } = req.body as Record<string, unknown>;
  if (!title || !channelUsername || !channelUrl) { res.status(400).json({ error: "title, channelUsername and channelUrl are required" }); return; }
  const [task] = await db.insert(partnerTasksTable).values({
    title: String(title),
    description: description ? String(description) : null,
    channelUsername: String(channelUsername).replace(/^@/, ""),
    channelUrl: String(channelUrl),
    iconEmoji: iconEmoji ? String(iconEmoji) : "📢",
    rewardPoints: typeof rewardPoints === "number" ? rewardPoints : 5000,
    isActive: typeof isActive === "boolean" ? isActive : true,
    sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
  }).returning();
  res.status(201).json(task);
});

router.put("/admin/partner-tasks/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) { res.status(401).json({ error: "Not authenticated as admin" }); return; }
  const id = Number(req.params.id);
  const { title, description, channelUsername, channelUrl, iconEmoji, rewardPoints, isActive, sortOrder } = req.body as Record<string, unknown>;
  const patch: Partial<typeof partnerTasksTable.$inferInsert> = {};
  if (title !== undefined) patch.title = String(title);
  if (description !== undefined) patch.description = description ? String(description) : null;
  if (channelUsername !== undefined) patch.channelUsername = String(channelUsername).replace(/^@/, "");
  if (channelUrl !== undefined) patch.channelUrl = String(channelUrl);
  if (iconEmoji !== undefined) patch.iconEmoji = String(iconEmoji);
  if (rewardPoints !== undefined) patch.rewardPoints = Number(rewardPoints);
  if (isActive !== undefined) patch.isActive = Boolean(isActive);
  if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder);
  const [task] = await db.update(partnerTasksTable).set(patch).where(eq(partnerTasksTable.id, id)).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(task);
});

router.delete("/admin/partner-tasks/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) { res.status(401).json({ error: "Not authenticated as admin" }); return; }
  const id = Number(req.params.id);
  await db.delete(partnerTaskCompletionsTable).where(eq(partnerTaskCompletionsTable.taskId, id));
  await db.delete(partnerTasksTable).where(eq(partnerTasksTable.id, id));
  res.status(204).send();
});

export default router;
