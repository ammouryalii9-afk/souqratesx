import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, vaultUsersTable, processedTransactionsTable, starProductsTable } from "@workspace/db";
import { answerPreCheckoutQuery, sendTelegramMessage, verifyWebhookSecretToken, type TelegramUpdate } from "../lib/telegramBot";
import { logUserActivity } from "../lib/activityLog";

const router: IRouter = Router();

const DAY_MS = 1000 * 60 * 60 * 24;

type VaultState = Record<string, unknown>;

function isVaultState(value: unknown): value is VaultState {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function applyStarProductEffect(
  telegramId: string,
  product: typeof starProductsTable.$inferSelect,
  amountStars: number,
): Promise<void> {
  const [user] = await db.select().from(vaultUsersTable).where(eq(vaultUsersTable.telegramId, telegramId));
  if (!user) return;

  const state = isVaultState(user.state) ? user.state : {};

  switch (product.effectType) {
    case "premium_days": {
      const days = product.effectValue ?? 30;
      const base = user.premiumExpiresAt && user.premiumExpiresAt.getTime() > Date.now() ? user.premiumExpiresAt.getTime() : Date.now();
      await db
        .update(vaultUsersTable)
        .set({
          isPremium: true,
          premiumExpiresAt: new Date(base + days * DAY_MS),
          starsBalance: sql`${vaultUsersTable.starsBalance} + ${amountStars}`,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "energy_refill": {
      const maxEnergy = typeof state.maxEnergy === "number" ? state.maxEnergy : 1000;
      await db
        .update(vaultUsersTable)
        .set({
          state: { ...state, energy: maxEnergy },
          starsBalance: sql`${vaultUsersTable.starsBalance} + ${amountStars}`,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "turbo_boost": {
      const seconds = product.effectValue ?? 20;
      await db
        .update(vaultUsersTable)
        .set({
          state: {
            ...state,
            activeTurbo: true,
            turboExpiresAt: Date.now() + seconds * 1000,
          },
          starsBalance: sql`${vaultUsersTable.starsBalance} + ${amountStars}`,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "permanent_multiplier": {
      // Percentage points added permanently to the player's mining/tap output.
      // Stacks additively across purchases (e.g. two +10% items = +20% total).
      const percent = product.effectValue ?? 0;
      const currentPercent = typeof state.permanentMultiplierPercent === "number" ? state.permanentMultiplierPercent : 0;
      await db
        .update(vaultUsersTable)
        .set({
          state: { ...state, permanentMultiplierPercent: currentPercent + percent },
          starsBalance: sql`${vaultUsersTable.starsBalance} + ${amountStars}`,
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
      const ownedBadges = Array.isArray(state.ownedBadgeIds) ? (state.ownedBadgeIds as unknown[]) : [];
      const nextOwnedBadges = ownedBadges.includes(badgeId) ? ownedBadges : [...ownedBadges, badgeId];
      await db
        .update(vaultUsersTable)
        .set({
          state: { ...state, ownedBadgeIds: nextOwnedBadges, equippedBadgeId: badgeId },
          starsBalance: sql`${vaultUsersTable.starsBalance} + ${amountStars}`,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    case "skin": {
      // effectValue is the skin's id; frontend maps it to a color theme for
      // the vault/tap button. Cosmetic only — no gameplay effect.
      const skinId = product.effectValue ?? 0;
      const ownedSkins = Array.isArray(state.ownedSkinIds) ? (state.ownedSkinIds as unknown[]) : [];
      const nextOwnedSkins = ownedSkins.includes(skinId) ? ownedSkins : [...ownedSkins, skinId];
      await db
        .update(vaultUsersTable)
        .set({
          state: { ...state, ownedSkinIds: nextOwnedSkins, equippedSkinId: skinId },
          starsBalance: sql`${vaultUsersTable.starsBalance} + ${amountStars}`,
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
      const currentTempMiningPoints = typeof state.tempMiningPoints === "number" ? state.tempMiningPoints : 0;
      await db
        .update(vaultUsersTable)
        .set({
          lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${points}`,
          state: { ...state, tempMiningPoints: currentTempMiningPoints + points },
          starsBalance: sql`${vaultUsersTable.starsBalance} + ${amountStars}`,
        })
        .where(eq(vaultUsersTable.telegramId, telegramId));
      break;
    }
    default: {
      await db
        .update(vaultUsersTable)
        .set({ starsBalance: sql`${vaultUsersTable.starsBalance} + ${amountStars}` })
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
      await sendTelegramMessage(
        update.message.from.id,
        `👋 Welcome to SouqratesX!\n\nTap, mine & earn points — then cash out later. Your progress is saved permanently across all devices.\n\n⚡ Tap the button below to start mining now!`,
        appUrl,
      );
    } else if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const fromId = update.message.from?.id;
      let payload: { telegramId?: string; productId?: number } = {};
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
