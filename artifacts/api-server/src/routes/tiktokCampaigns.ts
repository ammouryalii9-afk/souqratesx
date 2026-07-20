import { Router, type IRouter } from "express";
import { db, vaultUsersTable, tiktokCampaignsTable, tiktokApplicationsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { getSessionTelegramId, isAdminSession } from "../lib/session";
import { rateLimit } from "../lib/rateLimit";
import { z } from "zod/v4";

const router: IRouter = Router();

// ─── Public: list active campaigns + user's applications ──────────────────────

router.get("/tiktok-campaigns", rateLimit("tiktok_list", 60, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);

  const campaigns = await db
    .select()
    .from(tiktokCampaignsTable)
    .where(eq(tiktokCampaignsTable.isActive, true))
    .orderBy(desc(tiktokCampaignsTable.prizeSkx));

  let myApplications: { campaignId: number; status: string; rewardSkxPaid: number; referralCount: number; totalReferralSkx: number; rejectReason: string | null; videoUrl: string | null }[] = [];
  if (telegramId) {
    const apps = await db
      .select({
        campaignId: tiktokApplicationsTable.campaignId,
        status: tiktokApplicationsTable.status,
        rewardSkxPaid: tiktokApplicationsTable.prizeSkxPaid,
        referralCount: tiktokApplicationsTable.referralCount,
        totalReferralSkx: tiktokApplicationsTable.totalReferralSkx,
        rejectReason: tiktokApplicationsTable.rejectReason,
        videoUrl: tiktokApplicationsTable.videoUrl,
      })
      .from(tiktokApplicationsTable)
      .where(eq(tiktokApplicationsTable.telegramId, telegramId));
    myApplications = apps;
  }

  res.json({ campaigns, myApplications });
});

// ─── User: apply to a campaign (username only — no video required yet) ─────────

router.post("/tiktok-campaigns/:id/apply", rateLimit("tiktok_apply", 5, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const campaignId = Number(req.params.id);
  const parsed = z.object({
    tiktokUsername: z.string().min(1).max(100),
  }).safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "tiktokUsername required" }); return; }

  const [campaign] = await db.select().from(tiktokCampaignsTable).where(and(eq(tiktokCampaignsTable.id, campaignId), eq(tiktokCampaignsTable.isActive, true)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found or inactive" }); return; }

  try {
    const [app] = await db.insert(tiktokApplicationsTable).values({
      campaignId,
      telegramId,
      tiktokUsername: parsed.data.tiktokUsername.replace(/^@/, ""),
      videoUrl: null,
    }).returning();
    res.json({ ok: true, application: app });
  } catch (err: unknown) {
    const e = err as { constraint?: string };
    if (e.constraint === "one_app_per_campaign_user") {
      res.status(409).json({ error: "Already applied to this campaign" });
      return;
    }
    req.log.error(err, "tiktok apply failed");
    res.status(500).json({ error: "Application failed" });
  }
});

// ─── User: submit video URL after approval ─────────────────────────────────────

router.post("/tiktok-campaigns/:id/submit-video", rateLimit("tiktok_video", 10, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const campaignId = Number(req.params.id);
  const parsed = z.object({
    videoUrl: z.string().url().max(500),
  }).safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Valid video URL required" }); return; }

  const [app] = await db
    .select()
    .from(tiktokApplicationsTable)
    .where(and(eq(tiktokApplicationsTable.campaignId, campaignId), eq(tiktokApplicationsTable.telegramId, telegramId)));

  if (!app) { res.status(404).json({ error: "No application found" }); return; }
  if (app.status !== "approved") { res.status(400).json({ error: "Application must be approved first" }); return; }

  await db.update(tiktokApplicationsTable)
    .set({ videoUrl: parsed.data.videoUrl })
    .where(and(eq(tiktokApplicationsTable.campaignId, campaignId), eq(tiktokApplicationsTable.telegramId, telegramId)));

  res.json({ ok: true });
});

// ─── Admin: list all campaigns ────────────────────────────────────────────────

router.get("/admin/tiktok-campaigns", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const campaigns = await db.select().from(tiktokCampaignsTable).orderBy(desc(tiktokCampaignsTable.createdAt));
  res.json({ campaigns });
});

// ─── Admin: create campaign ───────────────────────────────────────────────────

router.post("/admin/tiktok-campaigns", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    minFollowers: z.number().int().min(0),
    minViews: z.number().int().min(0),
    prizeSkx: z.number().int().min(0),
    perReferralSkx: z.number().int().min(0).default(0),
  }).safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [campaign] = await db.insert(tiktokCampaignsTable).values(parsed.data).returning();
  res.json({ campaign });
});

// ─── Admin: toggle campaign active/inactive ───────────────────────────────────

router.post("/admin/tiktok-campaigns/:id/toggle", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  const [cur] = await db.select().from(tiktokCampaignsTable).where(eq(tiktokCampaignsTable.id, id));
  if (!cur) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(tiktokCampaignsTable).set({ isActive: !cur.isActive }).where(eq(tiktokCampaignsTable.id, id)).returning();
  res.json({ campaign: updated });
});

// ─── Admin: delete campaign ───────────────────────────────────────────────────

router.delete("/admin/tiktok-campaigns/:id", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  await db.delete(tiktokApplicationsTable).where(eq(tiktokApplicationsTable.campaignId, id));
  await db.delete(tiktokCampaignsTable).where(eq(tiktokCampaignsTable.id, id));
  res.json({ ok: true });
});

// ─── Admin: list all applications ────────────────────────────────────────────

router.get("/admin/tiktok-applications", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;

  const apps = await db
    .select({
      id: tiktokApplicationsTable.id,
      campaignId: tiktokApplicationsTable.campaignId,
      campaignTitle: tiktokCampaignsTable.title,
      prizeSkx: tiktokCampaignsTable.prizeSkx,
      perReferralSkx: tiktokCampaignsTable.perReferralSkx,
      telegramId: tiktokApplicationsTable.telegramId,
      username: vaultUsersTable.username,
      firstName: vaultUsersTable.firstName,
      tiktokUsername: tiktokApplicationsTable.tiktokUsername,
      videoUrl: tiktokApplicationsTable.videoUrl,
      status: tiktokApplicationsTable.status,
      rejectReason: tiktokApplicationsTable.rejectReason,
      prizeSkxPaid: tiktokApplicationsTable.prizeSkxPaid,
      referralCount: tiktokApplicationsTable.referralCount,
      totalReferralSkx: tiktokApplicationsTable.totalReferralSkx,
      reviewedAt: tiktokApplicationsTable.reviewedAt,
      createdAt: tiktokApplicationsTable.createdAt,
    })
    .from(tiktokApplicationsTable)
    .leftJoin(tiktokCampaignsTable, eq(tiktokApplicationsTable.campaignId, tiktokCampaignsTable.id))
    .leftJoin(vaultUsersTable, eq(tiktokApplicationsTable.telegramId, vaultUsersTable.telegramId))
    .where(statusFilter ? eq(tiktokApplicationsTable.status, statusFilter) : undefined)
    .orderBy(desc(tiktokApplicationsTable.createdAt));

  res.json({ applications: apps });
});

// ─── Admin: approve application + credit SKX ─────────────────────────────────

router.post("/admin/tiktok-applications/:id/approve", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const appId = Number(req.params.id);
  const [app] = await db.select().from(tiktokApplicationsTable).where(eq(tiktokApplicationsTable.id, appId));
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }
  if (app.status !== "pending") { res.status(400).json({ error: "Already reviewed" }); return; }

  const [campaign] = await db.select().from(tiktokCampaignsTable).where(eq(tiktokCampaignsTable.id, app.campaignId));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  await db.transaction(async (tx) => {
    if (campaign.prizeSkx > 0) {
      await tx.update(vaultUsersTable)
        .set({ skxBalance: sql`${vaultUsersTable.skxBalance} + ${String(campaign.prizeSkx)}::bigint` })
        .where(and(eq(vaultUsersTable.telegramId, app.telegramId), eq(vaultUsersTable.isBanned, false)));
    }
    await tx.update(tiktokApplicationsTable)
      .set({ status: "approved", prizeSkxPaid: campaign.prizeSkx, reviewedAt: new Date() })
      .where(eq(tiktokApplicationsTable.id, appId));
  });

  req.log.info({ appId, telegramId: app.telegramId, prize: campaign.prizeSkx }, "tiktok application approved");

  try {
    const { isTelegramBotConfigured, sendPlainTelegramMessage } = await import("../lib/telegramBot");
    if (isTelegramBotConfigured()) {
      await sendPlainTelegramMessage(
        app.telegramId,
        `🎉 Congratulations! Your application for "${campaign.title}" has been approved!\n` +
        `${campaign.prizeSkx.toLocaleString()} SKX has been added to your balance.\n\n` +
        `📹 Now post your TikTok video about SouqratesX and submit the link inside the app to complete the campaign.\n` +
        `You'll also earn ${campaign.perReferralSkx.toLocaleString()} SKX for every referral! 🚀`,
      );
    }
  } catch { /* DM failure never blocks the award */ }

  res.json({ ok: true, prizeSkxPaid: campaign.prizeSkx });
});

// ─── Admin: reject application ────────────────────────────────────────────────

router.post("/admin/tiktok-applications/:id/reject", async (req, res): Promise<void> => {
  if (!isAdminSession(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const appId = Number(req.params.id);
  const parsed = z.object({ reason: z.string().optional() }).safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? "") : "";

  const [app] = await db.select().from(tiktokApplicationsTable).where(eq(tiktokApplicationsTable.id, appId));
  if (!app) { res.status(404).json({ error: "Not found" }); return; }
  if (app.status !== "pending") { res.status(400).json({ error: "Already reviewed" }); return; }

  await db.update(tiktokApplicationsTable)
    .set({ status: "rejected", rejectReason: reason, reviewedAt: new Date() })
    .where(eq(tiktokApplicationsTable.id, appId));

  const [campaign] = await db.select().from(tiktokCampaignsTable).where(eq(tiktokCampaignsTable.id, app.campaignId));

  try {
    const { isTelegramBotConfigured, sendPlainTelegramMessage } = await import("../lib/telegramBot");
    if (isTelegramBotConfigured()) {
      await sendPlainTelegramMessage(
        app.telegramId,
        `❌ Your application for "${campaign?.title ?? ""}" was not approved.\n` +
        (reason ? `Reason: ${reason}\n` : "") +
        `You can apply again at any time.`,
      );
    }
  } catch { /* non-fatal */ }

  res.json({ ok: true });
});

export default router;
