import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, vaultUsersTable, processedTransactionsTable, starProductsTable, squadsTable, competitionEntriesTable, competitionsTable, arcadeTicketsTable, arcadeSessionsTable, arcadePurchasesTable } from "@workspace/db";
import { answerPreCheckoutQuery, sendTelegramMessage, sendStartMessage, answerCallbackQuery, sendCallbackReply, verifyWebhookSecretToken, type TelegramUpdate } from "../lib/telegramBot";
import { getSettingsMap, asString } from "../lib/settings";
import { logUserActivity } from "../lib/activityLog";

const router: IRouter = Router();

// Insert a competition entry, re-checking status + maxEntries at PAYMENT time —
// the invoice-time check alone races: the competition can fill up (or be closed)
// between invoice creation and the successful_payment webhook. If entry is not
// possible the paid Stars still land in starsBalance (compensation), we just skip
// the entry. The (competitionId, telegramId) unique index makes the
// onConflictDoNothing an actual dedupe against webhook retries/double-buys.
async function tryEnterCompetition(telegramId: string, competitionId: number): Promise<boolean> {
  const [comp] = await db.select().from(competitionsTable).where(eq(competitionsTable.id, competitionId)).limit(1);
  if (!comp || comp.status !== "active" || comp.endAt.getTime() < Date.now()) {
    return false;
  }
  if (typeof comp.maxEntries === "number" && comp.maxEntries > 0) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(competitionEntriesTable)
      .where(eq(competitionEntriesTable.competitionId, competitionId));
    if ((row?.n ?? 0) >= comp.maxEntries) {
      return false;
    }
  }
  const [userRow] = await db
    .select({ lifetimePoints: vaultUsersTable.lifetimePoints })
    .from(vaultUsersTable)
    .where(eq(vaultUsersTable.telegramId, telegramId))
    .limit(1);
  const inserted = await db
    .insert(competitionEntriesTable)
    .values({
      competitionId,
      telegramId,
      pointsAtEntry: userRow?.lifetimePoints ?? 0,
    })
    .onConflictDoNothing()
    .returning({ id: competitionEntriesTable.id });
  return inserted.length > 0;
}

// All effect writes below are ATOMIC single-statement SQL (jsonb_set / column
// expressions). The previous read-modify-write pattern raced with the frequent
// PUT /vault/me sync — a payment applying a stale state snapshot could silently
// clobber concurrent game-state changes (and vice versa).
async function applyStarProductEffect(
  telegramId: string,
  product: typeof starProductsTable.$inferSelect,
  amountStars: number,
): Promise<void> {
  const baseState = sql`coalesce(${vaultUsersTable.state}, '{}'::jsonb)`;
  const creditStars = sql`${vaultUsersTable.starsBalance} + ${amountStars}::int`;

  switch (product.effectType) {
    case "premium_days": {
      const days = product.effectValue ?? 30;
      await db
        .update(vaultUsersTable)
        .set({
          isPremium: true,
          // Extend from the CURRENT expiry if still in the future, else from now —
          // computed inside the DB so concurrent purchases both extend correctly.
          premiumExpiresAt: sql`GREATEST(coalesce(${vaultUsersTable.premiumExpiresAt}, now()), now()) + make_interval(days => ${days}::int)`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "energy_refill": {
      await db
        .update(vaultUsersTable)
        .set({
          state: sql`jsonb_set(${baseState}, '{energy}', coalesce(${vaultUsersTable.state}->'maxEnergy', '1000'::jsonb))`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "turbo_boost": {
      const seconds = product.effectValue ?? 20;
      const expiresAtMs = Date.now() + seconds * 1000;
      await db
        .update(vaultUsersTable)
        .set({
          state: sql`jsonb_set(jsonb_set(${baseState}, '{activeTurbo}', 'true'::jsonb), '{turboExpiresAt}', to_jsonb(${expiresAtMs}::bigint))`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "permanent_multiplier": {
      // Percentage points added permanently to the player's mining/tap output.
      // Stacks additively across purchases (e.g. two +10% items = +20% total).
      const percent = product.effectValue ?? 0;
      await db
        .update(vaultUsersTable)
        .set({
          state: sql`jsonb_set(${baseState}, '{permanentMultiplierPercent}', to_jsonb(coalesce((${vaultUsersTable.state}->>'permanentMultiplierPercent')::numeric, 0) + ${percent}::numeric))`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "badge": {
      // effectValue is the badge's tier id; frontend maps it to a label/color.
      // Cosmetic only — no gameplay effect. Owning multiple badges lets the
      // player switch their equipped badge later (equippedBadgeId defaults to
      // the most recently purchased one).
      const badgeId = product.effectValue ?? 0;
      const owned = sql`coalesce(${vaultUsersTable.state}->'ownedBadgeIds', '[]'::jsonb)`;
      await db
        .update(vaultUsersTable)
        .set({
          state: sql`jsonb_set(
            jsonb_set(${baseState}, '{ownedBadgeIds}',
              CASE WHEN ${owned} @> to_jsonb(${badgeId}::int) THEN ${owned} ELSE ${owned} || to_jsonb(${badgeId}::int) END),
            '{equippedBadgeId}', to_jsonb(${badgeId}::int))`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "skin": {
      // effectValue is the skin's id; frontend maps it to a color theme for
      // the vault/tap button. Cosmetic only — no gameplay effect.
      const skinId = product.effectValue ?? 0;
      const owned = sql`coalesce(${vaultUsersTable.state}->'ownedSkinIds', '[]'::jsonb)`;
      await db
        .update(vaultUsersTable)
        .set({
          state: sql`jsonb_set(
            jsonb_set(${baseState}, '{ownedSkinIds}',
              CASE WHEN ${owned} @> to_jsonb(${skinId}::int) THEN ${owned} ELSE ${owned} || to_jsonb(${skinId}::int) END),
            '{equippedSkinId}', to_jsonb(${skinId}::int))`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "points": {
      // "points" here means the user's spendable/mined balance — the frontend
      // reads this from state.tempMiningPoints (see VaultContext.refreshFromServer),
      // not a "points" key. lifetimePoints is only the read-only lifetime/leaderboard
      // counter, so it must also be bumped to keep it consistent, but crediting only
      // lifetimePoints (as before) left the purchase invisible/unusable in-game.
      const points = product.effectValue ?? 0;
      await db
        .update(vaultUsersTable)
        .set({
          lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${points}::int`,
          state: sql`jsonb_set(${baseState}, '{tempMiningPoints}', to_jsonb(coalesce((${vaultUsersTable.state}->>'tempMiningPoints')::bigint, 0) + ${points}::bigint))`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "mining_level_up": {
      const targetLevel = product.effectValue ?? 1;
      await db
        .update(vaultUsersTable)
        .set({
          state: sql`jsonb_set(${baseState}, '{miningLevel}', to_jsonb(GREATEST(coalesce((${vaultUsersTable.state}->>'miningLevel')::int, 1), ${targetLevel}::int)))`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "max_energy_boost": {
      // Permanently increases maxEnergy by effectValue, and also increases
      // current energy by the same amount so the purchase is immediately useful.
      const boost = product.effectValue ?? 500;
      await db
        .update(vaultUsersTable)
        .set({
          state: sql`jsonb_set(
            jsonb_set(${baseState},
              '{maxEnergy}', to_jsonb(coalesce((${vaultUsersTable.state}->>'maxEnergy')::int, 100) + ${boost}::int)),
            '{energy}', to_jsonb(coalesce((${vaultUsersTable.state}->>'energy')::int, 100) + ${boost}::int))`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "farm_instant": {
      // Instantly completes the current farming cycle: sets farmState → 'ready'
      // so the user can collect immediately. No-op if not currently farming.
      await db
        .update(vaultUsersTable)
        .set({
          state: sql`CASE
            WHEN coalesce(${vaultUsersTable.state}->>'farmState', 'idle') = 'active'
            THEN jsonb_set(${baseState}, '{farmState}', '"ready"')
            ELSE ${baseState}
          END`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "skx_credit": {
      // Directly credits SKX (hard currency) to the user's withdrawable balance.
      const skxAmount = product.effectValue ?? 0;
      await db
        .update(vaultUsersTable)
        .set({
          skxBalance: sql`${vaultUsersTable.skxBalance} + ${skxAmount}::bigint`,
          starsBalance: creditStars,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "squad_gold": {
      const userRow = await db
        .select({ squadId: vaultUsersTable.squadId })
        .from(vaultUsersTable)
        .where(eq(vaultUsersTable.telegramId, telegramId))
        .limit(1);
      const squadId = userRow[0]?.squadId;
      if (squadId) {
        await db
          .update(squadsTable)
          .set({ isGold: true })
          .where(eq(squadsTable.id, squadId));
      }
      await db
        .update(vaultUsersTable)
        .set({ starsBalance: creditStars })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "competition_entry": {
      const compId = product.effectValue ?? 0;
      await tryEnterCompetition(telegramId, compId);
      await db
        .update(vaultUsersTable)
        .set({ starsBalance: creditStars })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    default: {
      await db
        .update(vaultUsersTable)
        .set({ starsBalance: creditStars })
        .where(eq(vaultUsersTable.telegramId, telegramId));
    }
  }
}

router.post("/telegram/webhook", async (req, res): Promise<void> => {
  const secretHeader = req.get("x-telegram-bot-api-secret-token");
  if (!verifyWebhookSecretToken(secretHeader ?? undefined)) {
    req.log.warn("Rejected Telegram webhook call with missing/invalid secret token");
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const update = req.body as TelegramUpdate;

  try {
    if (update.pre_checkout_query) {
      await answerPreCheckoutQuery(update.pre_checkout_query.id, true);
    } else if (update.message?.text?.startsWith("/start") && update.message.from?.id) {
      const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
      const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
      const appUrl = `${proto}://${host}/`;
      const settings = await getSettingsMap();
      const startText = asString(settings.botStartMessage) ||
        `👋 <b>Welcome to SouqratesX!</b>\n\nTap, mine &amp; earn points — then cash out later.\nYour progress is saved permanently across all devices.\n\n⚡ Tap the button below to start mining now!`;
      const helpText = asString(settings.botHelpText) ||
        `ℹ️ <b>Help</b>\n\n• Tap the miner to earn points\n• Upgrade your miner to boost production\n• Complete daily tasks to multiply your earnings\n• Invite friends to earn referral bonuses\n\nSupport: @SouqratesSupport`;
      const policyText = asString(settings.botPolicyText) ||
        `📜 <b>Terms of Use</b>\n\n• Personal use only\n• Bots, scripts, and automation are strictly prohibited\n• We reserve the right to suspend accounts that violate the rules\n• Your data is never shared with third parties\n• Points are redeemable according to the announced withdrawal terms`;
      await sendStartMessage(update.message.from.id, startText, appUrl, helpText, policyText);
    } else if (update.callback_query?.id && update.callback_query.from?.id) {
      const cq = update.callback_query;
      const settings = await getSettingsMap();
      if (cq.data?.startsWith("help:")) {
        const helpText = asString(settings.botHelpText) ||
          `ℹ️ <b>Help</b>\n\n• Tap the miner to earn points\n• Upgrade your miner to boost production\n• Complete daily tasks to multiply your earnings\n• Invite friends to earn referral bonuses\n\nSupport: @SouqratesSupport`;
        await answerCallbackQuery(cq.id);
        await sendCallbackReply(cq.from.id, helpText);
      } else if (cq.data?.startsWith("policy:")) {
        const policyText = asString(settings.botPolicyText) ||
          `📜 <b>Terms of Use</b>\n\n• Personal use only\n• Bots, scripts, and automation are strictly prohibited\n• We reserve the right to suspend accounts that violate the rules\n• Your data is never shared with third parties\n• Points are redeemable according to the announced withdrawal terms`;
        await answerCallbackQuery(cq.id);
        await sendCallbackReply(cq.from.id, policyText);
      } else {
        await answerCallbackQuery(cq.id);
      }
    } else if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const fromId = update.message.from?.id;
      let payload: { telegramId?: string; productId?: number; competitionId?: number; effect?: string } = {};
      try {
        payload = JSON.parse(payment.invoice_payload);
      } catch {
        req.log.warn({ payload: payment.invoice_payload }, "Failed to parse Stars payment payload");
      }

      const telegramId = payload.telegramId ?? (fromId ? String(fromId) : undefined);

      // Idempotency: Telegram retries webhook deliveries; only credit each
      // telegram_payment_charge_id once.
      const [claimed] = await db
        .insert(processedTransactionsTable)
        .values({ provider: "telegram_stars", txId: payment.telegram_payment_charge_id, telegramId: telegramId ?? null })
        .onConflictDoNothing()
        .returning();
      if (!claimed) {
        req.log.info({ chargeId: payment.telegram_payment_charge_id }, "Skipped duplicate Stars payment webhook");
        res.json({ ok: true });
        return;
      }

      if (telegramId) {
        let product: typeof starProductsTable.$inferSelect | undefined;
        if (typeof payload.productId === "number") {
          [product] = await db.select().from(starProductsTable).where(eq(starProductsTable.id, payload.productId));
        }

        if (product) {
          await applyStarProductEffect(telegramId, product, payment.total_amount);
        } else if (payload.effect === "competition_entry" && typeof payload.competitionId === "number") {
          await tryEnterCompetition(telegramId, payload.competitionId);
          await db
            .update(vaultUsersTable)
            .set({ starsBalance: sql`${vaultUsersTable.starsBalance} + ${payment.total_amount}` })
            .where(eq(vaultUsersTable.telegramId, telegramId));
        } else if (payload.effect === "arcade_ticket") {
          // Grant daily arcade ticket purchased via Stars.
          // First purchase of the day: insert/upsert to grant access.
          // Additional purchases on the same day: ticket already exists, so
          // convert each extra ticket into +3 extraCellCredits (= 3 more session
          // slots) so the Stars are never wasted.
          const dayKey = new Date().toISOString().slice(0, 10);
          const [existingTicket] = await db
            .select({ id: arcadeTicketsTable.id, ticketGranted: arcadeTicketsTable.ticketGranted })
            .from(arcadeTicketsTable)
            .where(
              and(
                eq(arcadeTicketsTable.telegramId, telegramId),
                eq(arcadeTicketsTable.dayKey, dayKey),
              ),
            )
            .limit(1);

          if (existingTicket?.ticketGranted) {
            // Already has today's ticket — convert to +3 extra cell slots instead
            await db.execute(sql`
              UPDATE vault_users
              SET state = jsonb_set(
                COALESCE(state, '{}'),
                '{extraCellCredits}',
                to_jsonb(LEAST(COALESCE((state->>'extraCellCredits')::int, 0) + 3, 99))
              )
              WHERE telegram_id = ${telegramId}
            `);
            req.log.info({ telegramId, dayKey }, "arcade_ticket duplicate — converted to +3 extraCellCredits");
          } else {
            await db
              .insert(arcadeTicketsTable)
              .values({
                telegramId,
                dayKey,
                entryMethod: "stars" as const,
                adsWatched: 0,
                ticketGranted: true,
                grantedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [arcadeTicketsTable.telegramId, arcadeTicketsTable.dayKey],
                set: { ticketGranted: true, entryMethod: "stars" as const, grantedAt: new Date() },
              });
          }
        } else if (payload.effect === "arcade_shop") {
          // Apply arcade shop item purchased via real Telegram Stars
          const shopPayload = payload as { itemType?: string; sessionId?: number | null };
          const { itemType, sessionId } = shopPayload;
          if (itemType) {
            const now = new Date();
            if ((itemType === "shield_3h" || itemType === "shield_full") && sessionId) {
              const duration = itemType === "shield_3h" ? 3 * 3_600_000 : 24 * 3_600_000;
              await db
                .update(arcadeSessionsTable)
                .set({ shieldExpiresAt: new Date(now.getTime() + duration) })
                .where(
                  and(
                    eq(arcadeSessionsTable.id, sessionId),
                    eq(arcadeSessionsTable.telegramId, telegramId),
                  ),
                );
            } else if (itemType === "decoy" && sessionId) {
              await db
                .update(arcadeSessionsTable)
                .set({ isDecoy: true })
                .where(
                  and(
                    eq(arcadeSessionsTable.id, sessionId),
                    eq(arcadeSessionsTable.telegramId, telegramId),
                  ),
                );
            } else if (itemType === "extra_cells") {
              // Add 3 extra cell slots to user state (capped at 9 total extra)
              await db.execute(sql`
                UPDATE vault_users
                SET state = jsonb_set(
                  COALESCE(state, '{}'),
                  '{extraCellCredits}',
                  to_jsonb(LEAST(COALESCE((state->>'extraCellCredits')::int, 0) + 3, 9))
                )
                WHERE telegram_id = ${telegramId}
              `);
            }
            // skx_custom — credit exact SKX amount from payload
            if (itemType === "skx_custom") {
              const skxAmt = Math.floor(Number((shopPayload as { skxAmount?: number }).skxAmount) || 0);
              if (skxAmt > 0) {
                await db
                  .update(vaultUsersTable)
                  .set({ skxBalance: sql`${vaultUsersTable.skxBalance} + ${skxAmt}::bigint` })
                  .where(eq(vaultUsersTable.telegramId, telegramId));
              }
            }
            // radar and multi_strike are handled client-side; just record the purchase
            await db
              .insert(arcadePurchasesTable)
              .values({
                telegramId,
                sessionId: sessionId ?? null,
                itemType,
                starsSpent: payment.total_amount,
              })
              .onConflictDoNothing();
          }
        } else {
          await db
            .update(vaultUsersTable)
            .set({ starsBalance: sql`${vaultUsersTable.starsBalance} + ${payment.total_amount}` })
            .where(eq(vaultUsersTable.telegramId, telegramId));
        }

        req.log.info({ telegramId, productId: payload.productId, amount: payment.total_amount }, "Telegram Stars payment processed");
        await logUserActivity(telegramId, "stars_purchase", {
          productId: payload.productId ?? null,
          productTitle: product?.title ?? "stars_topup",
          amountStars: payment.total_amount,
          chargeId: payment.telegram_payment_charge_id,
        });
      }
    }
  } catch (err) {
    req.log.error({ err }, "Failed to process Telegram webhook update");
  }

  res.json({ ok: true });
});

export default router;
