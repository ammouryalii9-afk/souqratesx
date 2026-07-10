import { and, eq, lt, isNull, or, sql } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import type { EarnOffer, EarnProvider, HealthCheckResult, ProviderContext, RewardResult, RewardVerifyInput } from "./types";

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

interface MonetagConfig {
  zoneId: string;
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
 * Monetag rewarded-ad provider (SDK-based, like Adsgram — no server postback,
 * the client SDK's Promise only resolves after a real completed view). Shares
 * the same `vault_users` ads* cooldown/daily-cap columns as Adsgram so a
 * user's total rewarded-ad volume across networks is capped together.
 */
export function createMonetagProvider(): EarnProvider {
  let config: MonetagConfig = { zoneId: "", rewardPoints: 100, cooldownSeconds: 30, dailyCap: 20 };
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
            lt(vaultUsersTable.adsWatchedToday, config.dailyCap),
          ),
        ),
      )
      .returning();
  }

  return {
    key: "monetag",
    type: "rewarded_ad",

    initialize(rawConfig) {
      config = {
        zoneId: asStr(rawConfig["zoneId"]),
        rewardPoints: asNum(rawConfig["rewardPoints"], 100),
        cooldownSeconds: asNum(rawConfig["cooldownSeconds"], 30),
        dailyCap: asNum(rawConfig["dailyCap"], 20),
      };
      enabled = config.zoneId.length > 0;
    },

    isEnabled() {
      return enabled;
    },

    async getOffers(_ctx: ProviderContext): Promise<EarnOffer[]> {
      if (!enabled) return [];
      return [
        {
          providerKey: "monetag",
          type: "rewarded_ad",
          title: "\u0634\u0627\u0647\u062F \u0625\u0639\u0644\u0627\u0646 Monetag",
          rewardPoints: config.rewardPoints,
        },
      ];
    },

    async verifyReward(input: RewardVerifyInput) {
      // Client-triggered only: the Monetag SDK's show() promise only resolves
      // after a real completed/closed ad view, so a client claim is trusted
      // the same way Adsgram's client-triggered claim is.
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
