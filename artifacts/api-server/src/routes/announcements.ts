import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, announcementsTable } from "@workspace/db";
import { getSessionTelegramId } from "../lib/session";
import { isAdminSession } from "../lib/session";

const router: IRouter = Router();

// ── Public: active announcements for authenticated users ──────────────────────

router.get("/announcements", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rows = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.isActive, true))
    .orderBy(desc(announcementsTable.isPinned), desc(announcementsTable.createdAt));

  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      emoji: r.emoji,
      isPinned: r.isPinned,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// ── Admin CRUD ────────────────────────────────────────────────────────────────

router.get("/admin/announcements", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }

  const rows = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
  res.json(rows.map((r) => ({
    id: r.id, title: r.title, body: r.body, emoji: r.emoji,
    isPinned: r.isPinned, isActive: r.isActive, createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/admin/announcements", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }

  const { title, body, emoji, isPinned } = req.body as Record<string, unknown>;
  if (!title || typeof title !== "string") { res.status(400).json({ error: "title required" }); return; }

  const [row] = await db
    .insert(announcementsTable)
    .values({
      title: title.trim(),
      body: typeof body === "string" ? body.trim() || null : null,
      emoji: typeof emoji === "string" && emoji.trim() ? emoji.trim() : "📢",
      isPinned: isPinned === true,
    })
    .returning();

  res.json(row);
});

router.patch("/admin/announcements/:id", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }

  const id = Number(req.params.id);
  const { title, body, emoji, isPinned, isActive } = req.body as Record<string, unknown>;

  const patch: Partial<typeof announcementsTable.$inferInsert> = {};
  if (typeof title === "string") patch.title = title.trim();
  if (body !== undefined) patch.body = typeof body === "string" ? body.trim() || null : null;
  if (typeof emoji === "string" && emoji.trim()) patch.emoji = emoji.trim();
  if (typeof isPinned === "boolean") patch.isPinned = isPinned;
  if (typeof isActive === "boolean") patch.isActive = isActive;

  const [row] = await db.update(announcementsTable).set(patch).where(eq(announcementsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/admin/announcements/:id", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }

  await db.delete(announcementsTable).where(eq(announcementsTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

export default router;
