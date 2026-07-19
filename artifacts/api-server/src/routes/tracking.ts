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

export default router;
