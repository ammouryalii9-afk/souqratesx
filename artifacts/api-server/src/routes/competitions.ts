import { Router, type IRouter } from "express";
import { and, eq, sql, desc } from "drizzle-orm";
import { db, vaultUsersTable, competitionsTable, competitionEntriesTable } from "@workspace/db";
import { getSessionTelegramId, isAdminSession } from "../lib/session";
import { z } from "zod";
import { skpRewardFields } from "../lib/skxCredit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isReferral(c: { type: string | null }) {
  return c.type === "referral";
}

// ─── GET /competitions ─────────────────────────────────────────────────────────

router.get("/competitions", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  const now = new Date();

  const comps = await db
    .select()
    .from(competitionsTable)
    .where(
      sql`${competitionsTable.status} IN ('active', 'upcoming') AND ${competitionsTable.endAt} > ${now}`
    )
    .orderBy(competitionsTable.endAt);

  if (!telegramId) {
    res.json({ competitions: comps.map(c => ({ ...c, entered: false, myProgress: 0 })) });
    return;
  }

  const myEntries = await db
    .select({
      competitionId: competitionEntriesTable.competitionId,
      pointsAtEntry: competitionEntriesTable.pointsAtEntry,
      referralsAtEntry: competitionEntriesTable.referralsAtEntry,
    })
    .from(competitionEntriesTable)
    .where(eq(competitionEntriesTable.telegramId, telegramId));

  const entryMap = new Map(myEntries.map(e => [e.competitionId, e]));

  const [userRow] = await db
    .select({ lifetimePoints: vaultUsersTable.lifetimePoints, referralCount: vaultUsersTable.referralCount })
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.telegramId, telegramId));

  const currentPts = userRow?.lifetimePoints ?? 0;
  const currentRefs = userRow?.referralCount ?? 0;

  res.json({
    competitions: comps.map(c => {
      const entry = entryMap.get(c.id);
      const entered = !!entry;
      let myProgress = 0;
      if (entered) {
        myProgress = isReferral(c)
          ? Math.max(0, currentRefs - (entry.referralsAtEntry ?? 0))
          : Math.max(0, currentPts - (entry.pointsAtEntry ?? 0));
      }
      return { ...c, entered, myProgress };
    }),
  });
});

// ─── GET /competitions/:id/leaderboard ────────────────────────────────────────

router.get("/competitions/:id/leaderboard", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }

  const [comp] = await db.select().from(competitionsTable).where(eq(competitionsTable.id, id));
  if (!comp) { res.status(404).json({ error: "not found" }); return; }

  const entries = await db
    .select({
      telegramId: competitionEntriesTable.telegramId,
      pointsAtEntry: competitionEntriesTable.pointsAtEntry,
      referralsAtEntry: competitionEntriesTable.referralsAtEntry,
      firstName: vaultUsersTable.firstName,
      username: vaultUsersTable.username,
      currentPoints: vaultUsersTable.lifetimePoints,
      currentReferrals: vaultUsersTable.referralCount,
    })
    .from(competitionEntriesTable)
    .innerJoin(vaultUsersTable, eq(competitionEntriesTable.telegramId, vaultUsersTable.telegramId))
    .where(eq(competitionEntriesTable.competitionId, id))
    .limit(200);

  const board = entries
    .map(e => ({
      name: e.username ? `@${e.username}` : (e.firstName ?? "Player"),
      gained: isReferral(comp)
        ? Math.max(0, (e.currentReferrals ?? 0) - (e.referralsAtEntry ?? 0))
        : Math.max(0, (e.currentPoints ?? 0) - (e.pointsAtEntry ?? 0)),
    }))
    .sort((a, b) => b.gained - a.gained)
    .slice(0, 20)
    .map((e, i) => ({ rank: i + 1, ...e }));

  res.json({ leaderboard: board });
});

// ─── POST /competitions/:id/join  (free — referral race only) ────────────────

router.post("/competitions/:id/join", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "not authenticated" }); return; }

  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }

  const [comp] = await db.select().from(competitionsTable).where(
    and(eq(competitionsTable.id, id), eq(competitionsTable.status, "active"))
  );
  if (!comp) { res.status(404).json({ error: "competition not found" }); return; }
  if (!isReferral(comp)) { res.status(400).json({ error: "use invoice endpoint for paid competitions" }); return; }

  const [user] = await db
    .select({ referralCount: vaultUsersTable.referralCount, isBanned: vaultUsersTable.isBanned })
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.telegramId, telegramId));

  if (!user || user.isBanned) { res.status(403).json({ error: "banned or not found" }); return; }

  const [entry] = await db
    .insert(competitionEntriesTable)
    .values({
      competitionId: id,
      telegramId,
      pointsAtEntry: 0,
      referralsAtEntry: user.referralCount ?? 0,
    })
    .onConflictDoNothing()
    .returning();

  if (!entry) {
    res.json({ ok: true, alreadyJoined: true });
    return;
  }

  res.json({ ok: true, alreadyJoined: false, referralsAtEntry: user.referralCount ?? 0 });
});

// ─── POST /competitions/:id/invoice  (Stars — points competitions) ────────────

router.post("/competitions/:id/invoice", async (req, res): Promise<void> => {
  const { createStarsInvoiceLink, isTelegramBotConfigured } = await import("../lib/telegramBot");
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "not authenticated" }); return; }
  if (!isTelegramBotConfigured()) { res.status(400).json({ error: "Stars not configured" }); return; }

  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }

  const [comp] = await db.select().from(competitionsTable).where(
    and(eq(competitionsTable.id, id), eq(competitionsTable.status, "active"))
  );
  if (!comp) { res.status(404).json({ error: "competition not found" }); return; }
  if (isReferral(comp)) { res.status(400).json({ error: "use join endpoint for referral races" }); return; }

  if (comp.maxEntries) {
    const [cnt] = await db.select({ n: sql<number>`count(*)::int` }).from(competitionEntriesTable).where(eq(competitionEntriesTable.competitionId, id));
    if ((cnt?.n ?? 0) >= comp.maxEntries) { res.status(409).json({ error: "competition is full" }); return; }
  }

  const existing = await db.select().from(competitionEntriesTable).where(
    and(eq(competitionEntriesTable.competitionId, id), eq(competitionEntriesTable.telegramId, telegramId))
  ).limit(1);
  if (existing.length > 0) { res.status(409).json({ error: "already entered" }); return; }

  const payload = JSON.stringify({ telegramId, competitionId: id, effect: "competition_entry" });
  try {
    const invoiceUrl = await createStarsInvoiceLink({
      title: `🏆 ${comp.title}`,
      description: comp.description ?? `Entry fee for competition: ${comp.title}`,
      payload,
      amountStars: comp.entryFeeStars,
    });
    res.json({ invoiceUrl, priceStars: comp.entryFeeStars });
  } catch {
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

// ─── Admin ────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(2).max(80),
  titleEn: z.string().max(80).optional().nullable(),
  description: z.string().max(300).optional().nullable(),
  descriptionEn: z.string().max(300).optional().nullable(),
  prizePoints: z.number().int().min(0),
  entryFeeStars: z.number().int().min(1).default(5),
  maxEntries: z.number().int().min(1).optional().nullable(),
  endAt: z.string(),
  type: z.enum(["points", "referral"]).default("points"),
  requiredInvites: z.number().int().min(1).optional().nullable(),
});

router.get("/admin/competitions", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "unauthorized" }); return; }

  const comps = await db
    .select()
    .from(competitionsTable)
    .orderBy(desc(competitionsTable.createdAt));

  const counts = await db
    .select({ competitionId: competitionEntriesTable.competitionId, cnt: sql<number>`count(*)::int` })
    .from(competitionEntriesTable)
    .groupBy(competitionEntriesTable.competitionId);

  const countMap = new Map(counts.map(c => [c.competitionId, c.cnt]));

  res.json({ competitions: comps.map(c => ({ ...c, entryCount: countMap.get(c.id) ?? 0 })) });
});

router.get("/admin/competitions/:id/participants", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }

  const [comp] = await db.select().from(competitionsTable).where(eq(competitionsTable.id, id));
  if (!comp) { res.status(404).json({ error: "not found" }); return; }

  const entries = await db
    .select({
      telegramId: competitionEntriesTable.telegramId,
      referralsAtEntry: competitionEntriesTable.referralsAtEntry,
      pointsAtEntry: competitionEntriesTable.pointsAtEntry,
      joinedAt: competitionEntriesTable.enteredAt,
      firstName: vaultUsersTable.firstName,
      username: vaultUsersTable.username,
      currentReferrals: vaultUsersTable.referralCount,
      currentPoints: vaultUsersTable.lifetimePoints,
    })
    .from(competitionEntriesTable)
    .innerJoin(vaultUsersTable, eq(competitionEntriesTable.telegramId, vaultUsersTable.telegramId))
    .where(eq(competitionEntriesTable.competitionId, id))
    .orderBy(desc(competitionEntriesTable.enteredAt));

  const participants = entries
    .map(e => ({
      telegramId: e.telegramId,
      name: e.username ? `@${e.username}` : (e.firstName ?? "Player"),
      joinedAt: e.joinedAt,
      gained: isReferral(comp)
        ? Math.max(0, (e.currentReferrals ?? 0) - (e.referralsAtEntry ?? 0))
        : Math.max(0, (e.currentPoints ?? 0) - (e.pointsAtEntry ?? 0)),
      atEntry: isReferral(comp) ? (e.referralsAtEntry ?? 0) : (e.pointsAtEntry ?? 0),
      current: isReferral(comp) ? (e.currentReferrals ?? 0) : (e.currentPoints ?? 0),
    }))
    .sort((a, b) => b.gained - a.gained)
    .map((e, i) => ({ rank: i + 1, ...e }));

  res.json({
    competition: {
      id: comp.id,
      title: comp.title,
      type: comp.type,
      requiredInvites: comp.requiredInvites,
      prizePoints: comp.prizePoints,
      status: comp.status,
      endAt: comp.endAt,
    },
    participants,
  });
});

router.post("/admin/competitions", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "unauthorized" }); return; }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid body" }); return; }

  const d = parsed.data;
  const [comp] = await db.insert(competitionsTable).values({
    title: d.title,
    titleEn: d.titleEn ?? null,
    description: d.description ?? null,
    descriptionEn: d.descriptionEn ?? null,
    prizePoints: d.prizePoints,
    entryFeeStars: d.entryFeeStars,
    maxEntries: d.maxEntries ?? null,
    endAt: new Date(d.endAt),
    type: d.type,
    requiredInvites: d.requiredInvites ?? null,
    status: "active",
  }).returning();

  res.json({ competition: comp });
});

router.post("/admin/competitions/:id/close", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }

  const [comp] = await db.update(competitionsTable)
    .set({ status: "closed" })
    .where(and(eq(competitionsTable.id, id), eq(competitionsTable.status, "active")))
    .returning();

  if (!comp) { res.status(404).json({ error: "not found or already closed" }); return; }

  const entries = await db
    .select({
      telegramId: competitionEntriesTable.telegramId,
      pointsAtEntry: competitionEntriesTable.pointsAtEntry,
      referralsAtEntry: competitionEntriesTable.referralsAtEntry,
      currentPoints: vaultUsersTable.lifetimePoints,
      currentReferrals: vaultUsersTable.referralCount,
      firstName: vaultUsersTable.firstName,
      username: vaultUsersTable.username,
    })
    .from(competitionEntriesTable)
    .innerJoin(vaultUsersTable, eq(competitionEntriesTable.telegramId, vaultUsersTable.telegramId))
    .where(eq(competitionEntriesTable.competitionId, id));

  if (entries.length === 0) {
    res.json({ comp, winner: null });
    return;
  }

  const winner = entries
    .map(e => ({
      ...e,
      displayName: e.username ? `@${e.username}` : (e.firstName ?? "Player"),
      gained: isReferral(comp)
        ? Math.max(0, (e.currentReferrals ?? 0) - (e.referralsAtEntry ?? 0))
        : Math.max(0, (e.currentPoints ?? 0) - (e.pointsAtEntry ?? 0)),
    }))
    .sort((a, b) => b.gained - a.gained)[0];

  if (winner && comp.prizePoints > 0) {
    await db.update(vaultUsersTable)
      .set(skpRewardFields(comp.prizePoints))
      .where(eq(vaultUsersTable.telegramId, winner.telegramId));
    logger.info({ competitionId: id, winner: winner.telegramId, prize: comp.prizePoints }, "Competition closed, prize awarded");
  }

  res.json({ comp, winner: { name: winner?.displayName, gained: winner?.gained, prize: comp.prizePoints } });
});

export default router;
