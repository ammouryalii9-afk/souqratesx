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

// ─── Admin: fraud / fake-visit analysis ───────────────────────────────────────

router.get("/admin/adspage-views/fraud", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const now      = new Date();
  const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── 1. Total visits in window ──
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, start30d)));

  // ── 2. Empty / missing user agent ──
  const [{ emptyUa }] = await db
    .select({ emptyUa: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(and(
      eq(linkClickEventsTable.linkId, ADSPAGE_ID),
      gte(linkClickEventsTable.createdAt, start30d),
      sql`(user_agent is null or trim(user_agent) = '')`,
    ));

  // ── 3. Known bot / crawler UAs ──
  const [{ botUa }] = await db
    .select({ botUa: sql<number>`count(*)::int` })
    .from(linkClickEventsTable)
    .where(and(
      eq(linkClickEventsTable.linkId, ADSPAGE_ID),
      gte(linkClickEventsTable.createdAt, start30d),
      sql`lower(user_agent) ~ '(bot|crawler|spider|scraper|headless|phantom|selenium|puppeteer|playwright|wget|curl|python|java|go-http|axios|okhttp|libwww|java|ahrefsbot|semrushbot|mj12bot|dotbot|bingbot|googlebot|yandexbot|baiduspider|facebookexternalhit|twitterbot|slurp|duckduckbot|ia_archiver|archive\.org_bot|masscan|zgrab)'`,
    ));

  // ── 4. High-repeat IPs (same hash > 10 visits in 30d) ──
  const highRepeatRows = await db
    .select({
      ipHash: linkClickEventsTable.ipHash,
      count:  sql<number>`count(*)::int`,
    })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, start30d)))
    .groupBy(linkClickEventsTable.ipHash)
    .having(sql`count(*) > 10`)
    .orderBy(sql`count(*) DESC`)
    .limit(20);

  const highRepeatTotal = highRepeatRows.reduce((a, r) => a + r.count, 0);

  // ── 5. Burst windows: minutes with ≥ 5 visits ──
  const burstRows = await db
    .select({
      minute: sql<string>`date_trunc('minute', created_at)::text`,
      count:  sql<number>`count(*)::int`,
    })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, start30d)))
    .groupBy(sql`date_trunc('minute', created_at)`)
    .having(sql`count(*) >= 5`)
    .orderBy(sql`count(*) DESC`)
    .limit(20);

  const totalBurstVisits = burstRows.reduce((a, r) => a + r.count, 0);

  // ── 6. Unique IP ratio (low ratio = suspicious) ──
  const [{ uniqueIps }] = await db
    .select({ uniqueIps: sql<number>`count(distinct ip_hash)::int` })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, start30d)));

  // ── 7. Sub-second duplicate detection (same ip_hash within 2s window) ──
  const rapidFireResult = await db.execute<{ rapid_fire: string }>(sql`
    SELECT count(*)::int AS rapid_fire
    FROM (
      SELECT
        created_at AS ts,
        lag(created_at) OVER (PARTITION BY ip_hash ORDER BY created_at) AS prev
      FROM link_click_events
      WHERE link_id = ${ADSPAGE_ID}
        AND created_at >= ${start30d}
    ) windowed
    WHERE extract(epoch FROM (ts - prev)) < 2
  `);
  const rapidFire = Number((rapidFireResult.rows[0] as { rapid_fire: string })?.rapid_fire ?? 0);

  // ── Score ──────────────────────────────────────────────────────────────────
  const suspiciousVisits =
    emptyUa + botUa +
    highRepeatTotal +
    Math.max(0, totalBurstVisits - burstRows.length) + // burst excess over 1/min baseline
    rapidFire;

  const suspiciousPct = total > 0 ? Math.round((Math.min(suspiciousVisits, total) / total) * 100) : 0;

  const riskLevel =
    suspiciousPct >= 40 ? "HIGH" :
    suspiciousPct >= 15 ? "MEDIUM" :
    suspiciousPct >= 5  ? "LOW" :
    "CLEAN";

  res.json({
    generatedAt: now.toISOString(),
    window:      "last 30 days",
    total,
    uniqueIps,
    uniqueRatio: total > 0 ? +(uniqueIps / total * 100).toFixed(1) : 100,
    signals: {
      emptyUserAgent:  { count: emptyUa,          pct: total > 0 ? +(emptyUa / total * 100).toFixed(1) : 0 },
      botUserAgent:    { count: botUa,             pct: total > 0 ? +(botUa   / total * 100).toFixed(1) : 0 },
      highRepeatIps:   { count: highRepeatRows.length, totalVisits: highRepeatTotal, pct: total > 0 ? +(highRepeatTotal / total * 100).toFixed(1) : 0, top: highRepeatRows.map(r => ({ ipHashPrefix: r.ipHash.slice(0,8)+"…", count: r.count })) },
      burstWindows:    { count: burstRows.length, totalVisits: totalBurstVisits, top: burstRows.map(r => ({ minute: r.minute, count: r.count })) },
      rapidFireClicks: { count: rapidFire,         pct: total > 0 ? +(rapidFire / total * 100).toFixed(1) : 0 },
    },
    suspiciousPct,
    riskLevel,
  });
});

// ─── Admin: export raw visit logs as CSV ──────────────────────────────────────

router.get("/admin/adspage-views/export.csv", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  // optional ?days=N query param, default 30, max 365
  const days   = Math.min(365, Math.max(1, parseInt(String(req.query["days"] ?? "30")) || 30));
  const since  = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id:        linkClickEventsTable.id,
      createdAt: linkClickEventsTable.createdAt,
      ipHash:    linkClickEventsTable.ipHash,
      userAgent: linkClickEventsTable.userAgent,
    })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.linkId, ADSPAGE_ID), gte(linkClickEventsTable.createdAt, since)))
    .orderBy(linkClickEventsTable.createdAt);

  // Build CSV
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines  = [
    ["#","timestamp_utc","ip_hash_sha256","user_agent"].join(","),
    ...rows.map((r, i) => [
      i + 1,
      escape(r.createdAt.toISOString()),
      escape(r.ipHash),
      escape(r.userAgent ?? ""),
    ].join(",")),
  ];

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="souqratesx-adspage-visits-${days}d.csv"`);
  res.send(lines.join("\r\n"));
});

// ─── Admin: reset adspage view counter ────────────────────────────────────────

router.delete("/admin/adspage-views/reset", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await db
    .delete(linkClickEventsTable)
    .where(eq(linkClickEventsTable.linkId, ADSPAGE_ID))
    .returning({ id: linkClickEventsTable.id });
  req.log.info({ deleted: result.length }, "adspage view counter reset");
  res.json({ ok: true, deleted: result.length });
});

export default router;
