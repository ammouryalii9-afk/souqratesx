import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  groupInviteChallengesTable,
  groupInviteCompletionsTable,
  vaultUsersTable,
} from "@workspace/db";
import { getSessionTelegramId, isAdminSession } from "../lib/session";
import { skpRewardFields } from "../lib/skxCredit";
import { rateLimit } from "../lib/rateLimit";
import { z } from "zod/v4";

const router: IRouter = Router();

// ── Public ─────────────────────────────────────────────────────────────────

router.get("/group-challenges", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);

  const challenges = await db
    .select()
    .from(groupInviteChallengesTable)
    .where(eq(groupInviteChallengesTable.isActive, true))
    .orderBy(groupInviteChallengesTable.sortOrder, groupInviteChallengesTable.id);

  if (!telegramId) {
    res.json({ challenges: challenges.map(c => ({ ...c, completed: false, currentInvites: 0 })) });
    return;
  }

  const [user] = await db
    .select({ referralCount: vaultUsersTable.referralCount })
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.telegramId, telegramId));

  const completions = await db
    .select({ challengeId: groupInviteCompletionsTable.challengeId })
    .from(groupInviteCompletionsTable)
    .where(eq(groupInviteCompletionsTable.telegramId, telegramId));

  const completedIds = new Set(completions.map(c => c.challengeId));
  const currentInvites = user?.referralCount ?? 0;

  res.json({
    challenges: challenges.map(c => ({
      ...c,
      completed: completedIds.has(c.id),
      currentInvites,
    })),
  });
});

// ── Claim ───────────────────────────────────────────────────────────────────

router.post(
  "/group-challenges/:id/claim",
  rateLimit("group-challenge-claim", 10, 60_000),
  async (req, res): Promise<void> => {
    const telegramId = getSessionTelegramId(req);
    if (!telegramId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const challengeId = Number(req.params.id);
    if (!Number.isFinite(challengeId)) {
      res.status(400).json({ error: "Invalid challenge id" });
      return;
    }

    const [challenge] = await db
      .select()
      .from(groupInviteChallengesTable)
      .where(
        and(
          eq(groupInviteChallengesTable.id, challengeId),
          eq(groupInviteChallengesTable.isActive, true),
        ),
      );

    if (!challenge) {
      res.status(404).json({ error: "Challenge not found" });
      return;
    }

    const [existing] = await db
      .select()
      .from(groupInviteCompletionsTable)
      .where(
        and(
          eq(groupInviteCompletionsTable.challengeId, challengeId),
          eq(groupInviteCompletionsTable.telegramId, telegramId),
        ),
      );

    if (existing) {
      res.json({ ok: true, alreadyClaimed: true, creditedPoints: 0 });
      return;
    }

    const [user] = await db
      .select({ referralCount: vaultUsersTable.referralCount, isBanned: vaultUsersTable.isBanned })
      .from(vaultUsersTable)
      .where(eq(vaultUsersTable.telegramId, telegramId));

    if (!user || user.isBanned) {
      res.status(403).json({ error: "User not found or banned" });
      return;
    }

    if ((user.referralCount ?? 0) < challenge.requiredInvites) {
      res.status(403).json({
        error: "not_enough_invites",
        message: `You need ${challenge.requiredInvites} invites to claim this reward.`,
        currentInvites: user.referralCount ?? 0,
        requiredInvites: challenge.requiredInvites,
      });
      return;
    }

    const [claimed] = await db
      .insert(groupInviteCompletionsTable)
      .values({ challengeId, telegramId })
      .onConflictDoNothing()
      .returning();

    if (!claimed) {
      res.json({ ok: true, alreadyClaimed: true, creditedPoints: 0 });
      return;
    }

    await db
      .update(vaultUsersTable)
      .set(skpRewardFields(challenge.rewardSkp))
      .where(eq(vaultUsersTable.telegramId, telegramId));

    req.log.info({ telegramId, challengeId, points: challenge.rewardSkp }, "Group invite challenge claimed");

    res.json({ ok: true, alreadyClaimed: false, creditedPoints: challenge.rewardSkp });
  },
);

// ── Admin ──────────────────────────────────────────────────────────────────

const ChallengeBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  channelUrl: z.string().default(""),
  requiredInvites: z.number().int().min(1).default(20),
  rewardSkp: z.number().int().min(1).default(50000),
  iconEmoji: z.string().default("👥"),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

router.get("/admin/group-challenges", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const challenges = await db
    .select()
    .from(groupInviteChallengesTable)
    .orderBy(groupInviteChallengesTable.sortOrder, groupInviteChallengesTable.id);
  res.json({ challenges });
});

router.post("/admin/group-challenges", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = ChallengeBodySchema.parse(req.body);
  const [created] = await db.insert(groupInviteChallengesTable).values(body).returning();
  res.json({ challenge: created });
});

router.put("/admin/group-challenges/:id", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  const body = ChallengeBodySchema.parse(req.body);
  const [updated] = await db
    .update(groupInviteChallengesTable)
    .set(body)
    .where(eq(groupInviteChallengesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ challenge: updated });
});

router.delete("/admin/group-challenges/:id", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  await db.delete(groupInviteChallengesTable).where(eq(groupInviteChallengesTable.id, id));
  res.json({ ok: true });
});

router.get("/admin/group-challenges/:id/completions", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  const completions = await db
    .select({
      id: groupInviteCompletionsTable.id,
      telegramId: groupInviteCompletionsTable.telegramId,
      claimedAt: groupInviteCompletionsTable.claimedAt,
      firstName: vaultUsersTable.firstName,
      username: vaultUsersTable.username,
    })
    .from(groupInviteCompletionsTable)
    .leftJoin(vaultUsersTable, eq(groupInviteCompletionsTable.telegramId, vaultUsersTable.telegramId))
    .where(eq(groupInviteCompletionsTable.challengeId, id))
    .orderBy(desc(groupInviteCompletionsTable.claimedAt));
  res.json({ completions });
});

export default router;
