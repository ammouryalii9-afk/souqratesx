import { and, eq, lt, isNull, or, sql } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import type { EarnOffer, EarnProvider, HealthCheckResult, ProviderContext, RewardResult, RewardVerifyInput } from "./types";
import { creditedStateSql } from "../lib/weeklyCredit";

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

interface AdsgramConfig {
  blockId: string;
  rewardPoints: number;
  cooldownSeconds: number;
  dailyCap: number;
  postbackSecret: string;
}

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Adsgram rewarded-ad provider. Owns the cooldown/daily-cap anti-cheat logic
 * that lives on the `vault_users` ads* columns (kept there rather than a
 * generic table since it predates the provider engine and other rewarded-ad
 * providers may want the same columns).
 */
export function createAdsgramProvider(): EarnProvider {
  let config: AdsgramConfig = { blockId: "", rewardPoints: 100, cooldownSeconds: 30, dailyCap: 20, postbackSecret: "" };
  let enabled = false;

  async function creditWithCooldown(telegramId: string, amount: number) {
    const now = new Date();
    const today = todayStr();
    const cooldownCutoff = new Date(now.getTime() - config.cooldownSeconds * 1000);

    return db
      .update(vaultUsersTable)
      .set({
        lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${amount}`,
        // Ads add to the Mined buffer (tempMiningPoints) AND to adMiningPoints
        // (the ad-earned sub-counter). At Claim time the client converts adMiningPoints
        // at 100% and game remainder at gameToSpendablePercent%.
        state: sql`jsonb_set(${creditedStateSql(amount, {})}, '{adMiningPoints}', to_jsonb(COALESCE((${vaultUsersTable.state}->>'adMiningPoints')::numeric, 0) + ${amount}::numeric))`,
        adsWatchedToday: sql`case when ${vaultUsersTable.adsWatchedDate} = ${today} then ${vaultUsersTable.adsWatchedToday} + 1 else 1 end`,
        adsWatchedDate: today,
        lastAdRewardAt: now,
      })
      .where(
        and(
          eq(vaultUsersTable.telegramId, telegramId),
          eq(vaultUsersTable.isBanned, false),
          or(isNull(vaultUsersTable.lastAdRewardAt), lt(vaultUsersTable.lastAdRewardAt, cooldownCutoff)),
          or(
            sql`${vaultUsersTable.adsWatchedDate} is distinct from ${today}`,
            sql`${vaultUsersTable.adsWatchedToday} < case when ${vaultUsersTable.isPremium} and (${vaultUsersTable.premiumExpiresAt} is null or ${vaultUsersTable.premiumExpiresAt} > now()) then ${config.dailyCap * 2}::int else ${config.dailyCap}::int end`,
          ),
        ),
      )
      .returning();
  }

  return {
    key: "adsgram",
    type: "rewarded_ad",

    initialize(rawConfig) {
      config = {
        blockId: asStr(rawConfig["blockId"]),
        rewardPoints: asNum(rawConfig["rewardPoints"], 100),
        cooldownSeconds: asNum(rawConfig["cooldownSeconds"], 30),
        dailyCap: asNum(rawConfig["dailyCap"], 20),
        postbackSecret: asStr(rawConfig["postbackSecret"]),
      };
      enabled = config.blockId.length > 0;
    },

    isEnabled() {
      return enabled;
    },

    async getOffers(_ctx: ProviderContext): Promise<EarnOffer[]> {
      if (!enabled) return [];
      return [
        {
          providerKey: "adsgram",
          type: "rewarded_ad",
          title: "\u0634\u0627\u0647\u062F \u0625\u0639\u0644\u0627\u0646 \u0648\u0627\u0631\u0628\u062D \u0646\u0642\u0627\u0637",
          rewardPoints: config.rewardPoints,
        },
      ];
    },

    async verifyReward(input: RewardVerifyInput) {
      // Server-to-server postback: secret must match. Client-triggered claims
      // (no secret passed) are trusted because the SDK only fires on real completion.
      if (input.secret !== undefined) {
        if (!config.postbackSecret || input.secret !== config.postbackSecret) {
          return { verified: false, amount: 0, txId: input.txId ?? "", reason: "Invalid postback secret" };
        }
      }
      return { verified: true, amount: config.rewardPoints, txId: input.txId ?? `client-${Date.now()}` };
    },

    async rewardUser(telegramId: string, amount: number, _txId: string): Promise<RewardResult> {
      const [updated] = await creditWithCooldown(telegramId, amount);
      if (!updated) {
        return { ok: false, creditedPoints: 0, lifetimePoints: 0, reason: "Unknown/banned user or cooldown/daily cap reached" };
      }
      return { ok: true, creditedPoints: amount, lifetimePoints: updated.lifetimePoints };
    },

    async healthCheck(): Promise<HealthCheckResult> {
      const start = Date.now();
      return { healthy: enabled, latencyMs: Date.now() - start, message: enabled ? undefined : "Not configured" };
    },
  };
}
