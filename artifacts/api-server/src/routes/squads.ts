import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { rateLimit } from "../lib/rateLimit";
import { db, vaultUsersTable, squadsTable } from "@workspace/db";
import { getSessionTelegramId, clearSessionCookie } from "../lib/session";
import { getSettingsMap, asNumber } from "../lib/settings";
import { logUserActivity } from "../lib/activityLog";
import { skxCreditFields } from "../lib/skxCredit";

const router: IRouter = Router();

const DEFAULT_SQUAD_JOIN_BONUS = 5000;
const MAX_NAME_LEN = 24;
const MAX_EMOJI_LEN = 8;

type SquadLeaderRow = {
  id: number;
  name: string;
  emoji: string;
  ownerId: string;
  memberCount: number;
  totalPoints: number;
};

/**
 * Squad leaderboard: ranks squads by the summed lifetimePoints of their (non-banned)
 * members. Computed live via GROUP BY (no denormalized counters to drift) — the squads
 * table holds only name/emoji/owner. Squads with zero non-banned members are excluded
 * via HAVING so abandoned/emptied squads never clutter the public board.
 */
async function loadSquadBoard(limit = 100): Promise<SquadLeaderRow[]> {
  const rows = await db
    .select({
      id: squadsTable.id,
      name: squadsTable.name,
      emoji: squadsTable.emoji,
      ownerId: squadsTable.ownerId,
      memberCount: sql<number>`count(${vaultUsersTable.id})::int`,
      totalPoints: sql<number>`coalesce(sum(${vaultUsersTable.lifetimePoints}), 0)::int`,
    })
    .from(squadsTable)
    .leftJoin(
      vaultUsersTable,
      and(eq(vaultUsersTable.squadId, squadsTable.id), eq(vaultUsersTable.isBanned, false)),
    )
    .groupBy(squadsTable.id)
    .having(sql`count(${vaultUsersTable.id}) > 0`)
    .orderBy(desc(sql`coalesce(sum(${vaultUsersTable.lifetimePoints}), 0)`))
    .limit(limit);
  return rows;
}

// GET /squads — top squads leaderboard (viral competition surface)
router.get("/squads", async (_req, res): Promise<void> => {
  const board = await loadSquadBoard(100);
  const goldIds = new Set(
    (await db.select({ id: squadsTable.id }).from(squadsTable).where(eq(squadsTable.isGold, true))).map(r => r.id)
  );
  res.json(board.map((s, i) => ({ rank: i + 1, ...s, isGold: goldIds.has(s.id) })));
});

// GET /squads/me — the caller's squad, its members, and its rank (or null)
router.get("/squads/me", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [me] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!me?.squadId) {
    res.json({ squad: null });
    return;
  }

  const [squad] = await db.select().from(squadsTable).where(eq(squadsTable.id, me.squadId));
  if (!squad) {
    // Orphaned reference (squad was deleted) — self-heal by clearing it.
    await db.update(vaultUsersTable).set({ squadId: null }).where(eq(vaultUsersTable.telegramId, telegramId));
    res.json({ squad: null });
    return;
  }

  const members = await db
    .select({
      telegramId: vaultUsersTable.telegramId,
      username: vaultUsersTable.username,
      firstName: vaultUsersTable.firstName,
      lifetimePoints: vaultUsersTable.lifetimePoints,
    })
    .from(vaultUsersTable)
    .where(and(eq(vaultUsersTable.squadId, me.squadId), eq(vaultUsersTable.isBanned, false)))
    .orderBy(desc(vaultUsersTable.lifetimePoints))
    .limit(100);

  const [board, settings] = await Promise.all([loadSquadBoard(500), getSettingsMap()]);
  const idx = board.findIndex((s) => s.id === me.squadId);
  const entry = idx >= 0 ? board[idx] : null;
  const rank = idx >= 0 ? idx + 1 : null;
  const memberCount = entry?.memberCount ?? members.length;

  const rankBonusPercent = rank === 1 ? asNumber(settings.squadRankBonusPercent, 20) : 0;

  const MILESTONE_THRESHOLDS = [10, 25, 50, 100];
  const nextMilestone = MILESTONE_THRESHOLDS.find((t) => t > memberCount) ?? null;

  res.json({
    squad: {
      id: squad.id,
      name: squad.name,
      emoji: squad.emoji,
      ownerId: squad.ownerId,
      isGold: squad.isGold,
      isOwner: squad.ownerId === telegramId,
      rank,
      memberCount,
      totalPoints: entry?.totalPoints ?? 0,
      members: members.map((m) => ({
        telegramId: m.telegramId,
        name: m.username || m.firstName || `Player ${m.telegramId.slice(-4)}`,
        lifetimePoints: m.lifetimePoints,
        isOwner: m.telegramId === squad.ownerId,
      })),
      rankBonusPercent,
      nextMilestone,
    },
  });
});

// POST /squads — create a squad; the creator becomes owner + first member
router.post("/squads", rateLimit("squadCreate", 5, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const name = String(req.body?.name ?? "").trim().slice(0, MAX_NAME_LEN);
  const emoji = String(req.body?.emoji ?? "🛡️").trim().slice(0, MAX_EMOJI_LEN) || "🛡️";
  if (name.length < 2) {
    res.status(400).json({ error: "Squad name must be at least 2 characters" });
    return;
  }

  const [me] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!me) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Session expired. Please close and reopen the app." });
    return;
  }
  if (me.isBanned) {
    res.status(403).json({ error: "Account is banned" });
    return;
  }
  if (me.squadId) {
    res.status(409).json({ error: "You are already in a squad. Leave it first." });
    return;
  }

  const [squad] = await db.insert(squadsTable).values({ name, emoji, ownerId: telegramId }).returning();
  if (!squad) {
    res.status(500).json({ error: "Failed to create squad" });
    return;
  }

  await db.update(vaultUsersTable).set({ squadId: squad.id }).where(eq(vaultUsersTable.telegramId, telegramId));
  await logUserActivity(telegramId, "squad_created", { squadId: squad.id, name });

  res.json({ squad: { id: squad.id, name: squad.name, emoji: squad.emoji } });
});

// POST /squads/:id/join — join a squad; one-time join bonus on the caller's first-ever join
router.post("/squads/:id/join", rateLimit("squadJoin", 20, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const squadId = Number(req.params.id);
  if (!Number.isInteger(squadId) || squadId <= 0) {
    res.status(400).json({ error: "Invalid squad id" });
    return;
  }

  const [me] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!me) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Session expired. Please close and reopen the app." });
    return;
  }
  if (me.isBanned) {
    res.status(403).json({ error: "Account is banned" });
    return;
  }
  if (me.squadId === squadId) {
    res.status(409).json({ error: "You are already in this squad" });
    return;
  }

  const [squad] = await db.select().from(squadsTable).where(eq(squadsTable.id, squadId));
  if (!squad) {
    res.status(404).json({ error: "Squad not found" });
    return;
  }

  const settings = await getSettingsMap();
  const joinBonus = asNumber(settings.squadJoinBonus, DEFAULT_SQUAD_JOIN_BONUS);

  // Grant the join bonus at most once per account, EVER (the hasClaimedSquadBonus flag),
  // guarded in the WHERE clause so concurrent join calls can't double-credit it. Squad-
  // hopping (leave + rejoin, or joining a different squad) can never re-trigger it, so
  // there's no farming vector even though joins themselves are unlimited.
  let creditedBonus = 0;
  if (!me.hasClaimedSquadBonus && joinBonus > 0) {
    const [updated] = await db
      .update(vaultUsersTable)
      .set({
        squadId,
        hasClaimedSquadBonus: true,
        // Squad join bonus is SKX (hard currency), credited server-side directly.
        ...skxCreditFields(joinBonus),
      })
      .where(and(eq(vaultUsersTable.telegramId, telegramId), eq(vaultUsersTable.hasClaimedSquadBonus, false)))
      .returning();
    if (updated) {
      creditedBonus = joinBonus;
    } else {
      // Lost the race: bonus already claimed elsewhere; just set the squad.
      await db.update(vaultUsersTable).set({ squadId }).where(eq(vaultUsersTable.telegramId, telegramId));
    }
  } else {
    await db.update(vaultUsersTable).set({ squadId }).where(eq(vaultUsersTable.telegramId, telegramId));
  }

  await logUserActivity(telegramId, "squad_joined", { squadId, creditedBonus });
  res.json({ ok: true, squadId, creditedBonus });

  // ── Fire-and-forget: squad growth milestone check ────────────────────────
  void (async () => {
    try {
      const [updatedSquad] = await db.select({ id: squadsTable.id, milestonesClaimed: squadsTable.milestonesClaimed })
        .from(squadsTable).where(eq(squadsTable.id, squadId));
      if (!updatedSquad) return;

      const currentCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(vaultUsersTable)
        .where(and(eq(vaultUsersTable.squadId, squadId), eq(vaultUsersTable.isBanned, false)));
      const memberCount = currentCount[0]?.count ?? 0;

      const milestoneSettings = await getSettingsMap();
      const MILESTONES: { threshold: number; settingKey: string; defaultBonus: number }[] = [
        { threshold: 10,  settingKey: 'squadGrowthMilestone10',  defaultBonus: 10000 },
        { threshold: 25,  settingKey: 'squadGrowthMilestone25',  defaultBonus: 25000 },
        { threshold: 50,  settingKey: 'squadGrowthMilestone50',  defaultBonus: 50000 },
        { threshold: 100, settingKey: 'squadGrowthMilestone100', defaultBonus: 100000 },
      ];

      let claimed: string[] = [];
      try { claimed = JSON.parse(updatedSquad.milestonesClaimed) as string[]; } catch { claimed = []; }

      for (const m of MILESTONES) {
        if (memberCount < m.threshold) continue;
        if (claimed.includes(String(m.threshold))) continue;

        // Atomically mark the milestone as claimed
        const result = await db.update(squadsTable)
          .set({ milestonesClaimed: sql`(${squadsTable.milestonesClaimed}::jsonb || to_jsonb(${String(m.threshold)}::text))::text` })
          .where(and(
            eq(squadsTable.id, squadId),
            sql`NOT (${squadsTable.milestonesClaimed}::jsonb @> to_jsonb(${String(m.threshold)}::text))`
          ))
          .returning({ id: squadsTable.id });

        if (result.length === 0) continue; // another process already claimed it

        const bonusAmount = asNumber(milestoneSettings[m.settingKey], m.defaultBonus);
        if (bonusAmount <= 0) continue;

        // Credit all current non-banned squad members
        await db.update(vaultUsersTable)
          .set({
            pendingBonusPoints: sql`${vaultUsersTable.pendingBonusPoints} + ${bonusAmount}`,
            lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${bonusAmount}`,
          })
          .where(and(eq(vaultUsersTable.squadId, squadId), eq(vaultUsersTable.isBanned, false)));

        req.log.info({ squadId, threshold: m.threshold, bonusAmount, memberCount }, 'Squad growth milestone awarded');
        claimed.push(String(m.threshold));
      }
    } catch (err) {
      req.log.warn({ err, squadId }, 'Squad milestone check failed (non-critical)');
    }
  })();
});

// POST /squads/leave — leave the caller's current squad
router.post("/squads/leave", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  await db.update(vaultUsersTable).set({ squadId: null }).where(eq(vaultUsersTable.telegramId, telegramId));
  await logUserActivity(telegramId, "squad_left", {});
  res.json({ ok: true });
});

export default router;
