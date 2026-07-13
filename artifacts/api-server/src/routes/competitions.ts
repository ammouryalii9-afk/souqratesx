import { Router, type IRouter } from "express";
import { and, eq, sql, desc } from "drizzle-orm";
import { db, vaultUsersTable, competitionsTable, competitionEntriesTable } from "@workspace/db";
import { getSessionTelegramId, isAdminSession } from "../lib/session";
import { z } from "zod";

const router: IRouter = Router();


// GET /competitions — list active + upcoming competitions with user entry status
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
    res.json({ competitions: comps.map(c => ({ ...c, entered: false, myPoints: 0 })) });
    return;
  }

  const myEntries = await db
    .select({ competitionId: competitionEntriesTable.competitionId, pointsAtEntry: competitionEntriesTable.pointsAtEntry })
    .from(competitionEntriesTable)
    .where(eq(competitionEntriesTable.telegramId, telegramId));

  const entryMap = new Map(myEntries.map(e => [e.competitionId, e.pointsAtEntry]));

  const userRow = await db
    .select({ lifetimePoints: vaultUsersTable.lifetimePoints })
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.telegramId, telegramId))
    .limit(1);

  const currentPts = userRow[0]?.lifetimePoints ?? 0;

  res.json({
    competitions: comps.map(c => ({
      ...c,
      entered: entryMap.has(c.id),
      myPointsGained: entryMap.has(c.id) ? Math.max(0, currentPts - (entryMap.get(c.id) ?? 0)) : 0,
    })),
  });
});

// GET /competitions/:id/leaderboard — top 20 participants by points gained
router.get("/competitions/:id/leaderboard", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }

  const entries = await db
    .select({
      telegramId: competitionEntriesTable.telegramId,
      pointsAtEntry: competitionEntriesTable.pointsAtEntry,
      firstName: vaultUsersTable.firstName,
      username: vaultUsersTable.username,
      currentPoints: vaultUsersTable.lifetimePoints,
    })
    .from(competitionEntriesTable)
    .innerJoin(vaultUsersTable, eq(competitionEntriesTable.telegramId, vaultUsersTable.telegramId))
    .where(eq(competitionEntriesTable.competitionId, id))
    .limit(100);

  const board = entries
    .map(e => ({
      name: e.username ?? e.firstName ?? "Player",
      gained: Math.max(0, (e.currentPoints ?? 0) - (e.pointsAtEntry ?? 0)),
    }))
    .sort((a, b) => b.gained - a.gained)
    .slice(0, 20)
    .map((e, i) => ({ rank: i + 1, ...e }));

  res.json({ leaderboard: board });
});

// POST /competitions/:id/invoice — create Telegram Stars invoice for competition entry
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

// ── Admin routes ──────────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(2).max(80),
  description: z.string().max(300).optional(),
  prizePoints: z.number().int().min(0),
  entryFeeStars: z.number().int().min(1),
  maxEntries: z.number().int().min(1).optional().nullable(),
  endAt: z.string(), // ISO date
});

router.get("/admin/competitions", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "unauthorized" }); return; }

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

router.post("/admin/competitions", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "unauthorized" }); return; }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid body" }); return; }

  const d = parsed.data;
  const [comp] = await db.insert(competitionsTable).values({
    title: d.title,
    description: d.description ?? null,
    prizePoints: d.prizePoints,
    entryFeeStars: d.entryFeeStars,
    maxEntries: d.maxEntries ?? null,
    endAt: new Date(d.endAt),
    status: "active",
  }).returning();

  res.json({ competition: comp });
});

router.post("/admin/competitions/:id/close", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "unauthorized" }); return; }

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
      currentPoints: vaultUsersTable.lifetimePoints,
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
      displayName: e.username ?? e.firstName ?? "Player",
      gained: Math.max(0, (e.currentPoints ?? 0) - (e.pointsAtEntry ?? 0)),
    }))
    .sort((a, b) => b.gained - a.gained)[0];

  if (winner && comp.prizePoints > 0) {
    await db.update(vaultUsersTable)
      .set({ lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${comp.prizePoints}::bigint` })
      .where(eq(vaultUsersTable.telegramId, winner.telegramId));
  }

  res.json({ comp, winner: { name: winner?.displayName, gained: winner?.gained, prize: comp.prizePoints } });
});

export default router;
