import { and, eq, lt, isNull, or, sql } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import type { EarnOffer, EarnProvider, HealthCheckResult, ProviderContext, RewardResult, RewardVerifyInput } from "./types";

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

interface RichAdsConfig {
  pubId: string;
  appId: string;
  rewardPoints: number;
  cooldownSeconds: number;
  dailyCap: number;
}

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * RichAds rewarded-ad provider (button-triggered, client-trusted like Monetag).
 * The SDK's showInterstitial() / showVastVideo() Promise only resolves after
 * the user actually views/closes the ad, so a client claim is trusted the same
 * way Monetag and Onclicka claims are. Shares the vault_users ads* cooldown /
 * daily-cap columns so total ad volume across all networks is capped together.
 */
export function createRichAdsProvider(): EarnProvider {
  let config: RichAdsConfig = { pubId: "", appId: "", rewardPoints: 100, cooldownSeconds: 30, dailyCap: 20 };
  let enabled = false;

  async function creditWithCooldown(telegramId: string, amount: number) {
    const now = new Date();
    const today = todayStr();
    const cooldownCutoff = new Date(now.getTime() - config.cooldownSeconds * 1000);

    return db
      .update(vaultUsersTable)
      .set({
        lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${amount}`,
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
    key: "richads",
    type: "rewarded_ad",

    initialize(rawConfig) {
      config = {
        pubId: asStr(rawConfig["pubId"]),
        appId: asStr(rawConfig["appId"]),
        rewardPoints: asNum(rawConfig["rewardPoints"], 100),
        cooldownSeconds: asNum(rawConfig["cooldownSeconds"], 30),
        dailyCap: asNum(rawConfig["dailyCap"], 20),
      };
      enabled = config.pubId.length > 0 && config.appId.length > 0;
    },

    isEnabled() {
      return enabled;
    },

    async getOffers(_ctx: ProviderContext): Promise<EarnOffer[]> {
      if (!enabled) return [];
      return [
        {
          providerKey: "richads",
          type: "rewarded_ad",
          title: "شاهد إعلان RichAds",
          rewardPoints: config.rewardPoints,
        },
      ];
    },

    async verifyReward(input: RewardVerifyInput) {
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
