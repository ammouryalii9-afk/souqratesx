import { Router, type IRouter } from "express";
import { createHash } from "crypto";
import { db, linkClickEventsTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { isAdminSession } from "../lib/session";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

// sentinel id=0 — serial starts at 1, so no real tracking_link collides
const ADSPAGE_ID = 0;

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + "souqratesx-salt").digest("hex").slice(0, 32);
}

// ─── Public: record an /adspage visit ─────────────────────────────────────────

router.post("/track/adspage", rateLimit("track_adspage", 10, 60_000), async (req, res): Promise<void> => {
  const rawIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
  await db.insert(linkClickEventsTable).values({
    linkId: ADSPAGE_ID,
    ipHash: hashIp(rawIp),
    userAgent: (req.headers["user-agent"] ?? "").slice(0, 512),
    deviceType: "unknown",
    referer: "",
  });
  res.json({ ok: true });
});

// ─── Admin: view counts ────────────────────────────────────────────────────────

router.get("/admin/adspage-views", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfHour = new Date(Date.now() - 60 * 60 * 1000);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(eq(linkClickEventsTable.linkId, ADSPAGE_ID));

  const [{ today }] = await db
    .select({ today: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, startOfToday)));

  const [{ lastHour }] = await db
    .select({ lastHour: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, startOfHour)));

  res.json({ total, today, lastHour });
});

// ─── Admin: full detailed report (for ad-platform complaint) ──────────────────

router.get("/admin/adspage-views/report", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const now         = new Date();
  const startOfDay  = new Date(now); startOfDay.setHours(0,0,0,0);
  const start7d     = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const start30d    = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startHour   = new Date(now.getTime() - 60 * 60 * 1000);

  // Total all-time
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(eq(linkClickEventsTable.linkId, ADSPAGE_ID));

  // Today
  const [{ today }] = await db
    .select({ today: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, startOfDay)));

  // Last hour
  const [{ lastHour }] = await db
    .select({ lastHour: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, startHour)));

  // Last 7 days
  const [{ last7d }] = await db
    .select({ last7d: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, start7d)));

  // Last 30 days
  const [{ last30d }] = await db
    .select({ last30d: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, start30d)));

  // Unique IPs all-time
  const [{ uniqueIps }] = await db
    .select({ uniqueIps: sql<number>`count(distinct ip_hash)::int` })
    .from(linkClickEventsTable)
    .where(eq(linkClickEventsTable.linkId, ADSPAGE_ID));

  // Unique IPs today
  const [{ uniqueIpsToday }] = await db
    .select({ uniqueIpsToday: sql<number>`count(distinct ip_hash)::int` })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, startOfDay)));

  // Unique IPs last 7 days
  const [{ uniqueIps7d }] = await db
    .select({ uniqueIps7d: sql<number>`count(distinct ip_hash)::int` })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, start7d)));

  // First + latest visit
  const [firstRow] = await db
    .select({ ts: linkClickEventsTable.createdAt })
    .from(linkClickEventsTable)
    .where(eq(linkClickEventsTable.linkId, ADSPAGE_ID))
    .orderBy(linkClickEventsTable.createdAt)
    .limit(1);

  const [latestRow] = await db
    .select({ ts: linkClickEventsTable.createdAt })
    .from(linkClickEventsTable)
    .where(eq(linkClickEventsTable.linkId, ADSPAGE_ID))
    .orderBy(sql`created_at DESC`)
    .limit(1);

  // Daily breakdown — last 30 days
  const dailyRows = await db
    .select({
      date:    sql<string>`date_trunc('day', created_at AT TIME ZONE 'UTC')::date::text`,
      visits:  sql<number>`count(*)::int`,
      unique:  sql<number>`count(distinct ip_hash)::int`,
    })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, start30d)))
    .groupBy(sql`date_trunc('day', created_at AT TIME ZONE 'UTC')::date`)
    .orderBy(sql`date_trunc('day', created_at AT TIME ZONE 'UTC')::date DESC`);

  // Hourly breakdown — today
  const hourlyRows = await db
    .select({
      hour:   sql<number>`extract(hour from created_at AT TIME ZONE 'UTC')::int`,
      visits: sql<number>`count(*)::int`,
    })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, startOfDay)))
    .groupBy(sql`extract(hour from created_at AT TIME ZONE 'UTC')`)
    .orderBy(sql`extract(hour from created_at AT TIME ZONE 'UTC')`);

  // Top user agents (top 15)
  const uaRows = await db
    .select({
      ua:     linkClickEventsTable.userAgent,
      count:  sql<number>`count(*)::int`,
    })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), sql`user_agent is not null`))
    .groupBy(linkClickEventsTable.userAgent)
    .orderBy(sql`count(*) DESC`)
    .limit(15);

  res.json({
    generatedAt:   now.toISOString(),
    summary: {
      total, today, lastHour, last7d, last30d,
      uniqueIps, uniqueIpsToday, uniqueIps7d,
      firstVisit:  firstRow?.ts  ?? null,
      latestVisit: latestRow?.ts ?? null,
    },
    daily:  dailyRows,
    hourly: hourlyRows,
    topUserAgents: uaRows,
  });
});

export default router;
