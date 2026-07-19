import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "crypto";
import { db, trackingLinksTable, linkClickEventsTable } from "@workspace/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { isAdminSession } from "../lib/session";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + "souqratesx-salt").digest("hex").slice(0, 32);
}

function detectDevice(ua: string): string {
  if (!ua) return "unknown";
  const u = ua.toLowerCase();
  if (u.includes("mobile") || u.includes("android") || u.includes("iphone") || u.includes("ipad")) return "mobile";
  if (u.includes("tablet")) return "tablet";
  return "desktop";
}

function generateCode(len = 7): string {
  return randomBytes(6).toString("base64url").slice(0, len).replace(/[^a-zA-Z0-9]/g, "x").slice(0, len);
}

// ─── Public: redirect endpoint ────────────────────────────────────────────────

router.get("/t/:code", rateLimit("track", 300, 60_000), async (req, res): Promise<void> => {
  const { code } = req.params;
  const [link] = await db
    .select()
    .from(trackingLinksTable)
    .where(sql`${trackingLinksTable.code} = ${code} and ${trackingLinksTable.isActive} = true`);

  if (!link) {
    res.status(404).send("رابط غير موجود");
    return;
  }

  const rawIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const ua = req.headers["user-agent"] ?? "";
  const referer = req.headers["referer"] ?? req.headers["referrer"] ?? "";

  await db.insert(linkClickEventsTable).values({
    linkId: link.id,
    ipHash: hashIp(rawIp),
    userAgent: ua.slice(0, 512),
    deviceType: detectDevice(ua),
    referer: typeof referer === "string" ? referer.slice(0, 512) : "",
  });

  res.redirect(302, link.destinationUrl);
});

// ─── Admin: list all links with stats ─────────────────────────────────────────

router.get("/admin/tracking-links", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const links = await db.select().from(trackingLinksTable).orderBy(desc(trackingLinksTable.createdAt));

  const stats = await Promise.all(links.map(async (link) => {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(linkClickEventsTable)
      .where(eq(linkClickEventsTable.linkId, link.id));

    const [{ unique }] = await db
      .select({ unique: sql<number>`count(distinct ip_hash)::int` })
      .from(linkClickEventsTable)
      .where(eq(linkClickEventsTable.linkId, link.id));

    const since1h = new Date(Date.now() - 60 * 60 * 1000);
    const [{ last1h }] = await db
      .select({ last1h: sql<number>`count(*)::int` })
      .from(linkClickEventsTable)
      .where(and(eq(linkClickEventsTable.linkId, link.id), gte(linkClickEventsTable.createdAt, since1h)));

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ last24h }] = await db
      .select({ last24h: sql<number>`count(*)::int` })
      .from(linkClickEventsTable)
      .where(and(eq(linkClickEventsTable.linkId, link.id), gte(linkClickEventsTable.createdAt, since24h)));

    const deviceBreakdown = await db
      .select({ device: linkClickEventsTable.deviceType, count: sql<number>`count(*)::int` })
      .from(linkClickEventsTable)
      .where(eq(linkClickEventsTable.linkId, link.id))
      .groupBy(linkClickEventsTable.deviceType);

    return { ...link, total, unique, last1h, last24h, deviceBreakdown };
  }));

  res.json({ links: stats });
});

// ─── Admin: recent click events for one link ──────────────────────────────────

router.get("/admin/tracking-links/:id/events", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  const events = await db
    .select()
    .from(linkClickEventsTable)
    .where(eq(linkClickEventsTable.linkId, id))
    .orderBy(desc(linkClickEventsTable.createdAt))
    .limit(100);

  res.json({ events });
});

// ─── Admin: create tracking link ──────────────────────────────────────────────

router.post("/admin/tracking-links", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, destinationUrl } = req.body as Record<string, string>;
  if (!name?.trim() || !destinationUrl?.trim()) {
    res.status(400).json({ error: "name and destinationUrl are required" });
    return;
  }

  let code = generateCode();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await db.select({ id: trackingLinksTable.id }).from(trackingLinksTable).where(eq(trackingLinksTable.code, code));
    if (existing.length === 0) break;
    code = generateCode();
    attempts++;
  }

  const [link] = await db.insert(trackingLinksTable).values({ code, name: name.trim(), destinationUrl: destinationUrl.trim() }).returning();
  res.json({ link });
});

// ─── Admin: toggle active ─────────────────────────────────────────────────────

router.patch("/admin/tracking-links/:id", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  const { isActive } = req.body as Record<string, unknown>;
  const [link] = await db.update(trackingLinksTable).set({ isActive: Boolean(isActive) }).where(eq(trackingLinksTable.id, id)).returning();
  res.json({ link });
});

// ─── Admin: delete link + events ─────────────────────────────────────────────

router.delete("/admin/tracking-links/:id", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  await db.delete(linkClickEventsTable).where(eq(linkClickEventsTable.linkId, id));
  await db.delete(trackingLinksTable).where(eq(trackingLinksTable.id, id));
  res.json({ ok: true });
});

export default router;
