import { eq, and } from "drizzle-orm";
import { db, vaultUsersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { creditedStateSql } from "../lib/weeklyCredit";
import type { EarnOffer, EarnProvider, HealthCheckResult, ProviderContext, RewardResult, RewardVerifyInput } from "./types";

// Upper bound per single postback — a sanity cap against buggy/malicious postbacks,
// not a business limit. 2M pts = $1.00 at the default rate; high-payout CPA offers
// (surveys, deposits) legitimately exceed the old 1M cap.
const MAX_OFFERWALL_CREDIT = 2_000_000;

interface OfferwallConfig {
  apiKey: string;
  url: string;
  postbackSecret: string;
}

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/**
 * Shared implementation for offerwall-style providers (CPA, Monlix, Bitlabs).
 * They all follow the same contract: outbound link with `sub1=<telegramId>`,
 * inbound postback with a shared secret and a credited point amount. Adding a
 * new offerwall provider only requires a new `createOfferwallProvider(...)` call.
 */
export function createOfferwallProvider(key: string, title: string): EarnProvider {
  let config: OfferwallConfig = { apiKey: "", url: "", postbackSecret: "" };
  let enabled = false;

  return {
    key,
    type: "offerwall",

    initialize(rawConfig) {
      config = {
        apiKey: asStr(rawConfig["apiKey"]),
        url: asStr(rawConfig["url"]),
        postbackSecret: asStr(rawConfig["postbackSecret"]),
      };
      enabled = config.url.length > 0 && config.postbackSecret.length > 0;
    },

    isEnabled() {
      return enabled;
    },

    async getOffers(ctx: ProviderContext): Promise<EarnOffer[]> {
      if (!enabled) return [];
      // Support {telegramId} placeholder (e.g. AdGem uses playerid={telegramId})
      // Fall back to appending sub1= for providers that don't use a placeholder
      const url = config.url.includes("{telegramId}")
        ? config.url.replace("{telegramId}", encodeURIComponent(ctx.telegramId))
        : `${config.url}${config.url.includes("?") ? "&" : "?"}sub1=${encodeURIComponent(ctx.telegramId)}`;
      return [{ providerKey: key, type: "offerwall", title, rewardPoints: 0, url }];
    },

    async verifyReward(input: RewardVerifyInput) {
      if (!config.postbackSecret || input.secret !== config.postbackSecret) {
        return { verified: false, amount: 0, txId: input.txId ?? "", reason: "Invalid postback secret" };
      }
      const amount = typeof input.amount === "number" && Number.isFinite(input.amount) && input.amount > 0 ? input.amount : 0;
      if (amount <= 0) {
        return { verified: false, amount: 0, txId: input.txId ?? "", reason: "Invalid amount" };
      }
      return { verified: true, amount: Math.min(Math.round(amount), MAX_OFFERWALL_CREDIT), txId: input.txId ?? `${key}-${Date.now()}` };
    },

    async rewardUser(telegramId: string, amount: number, _txId: string): Promise<RewardResult> {
      const [updated] = await db
        .update(vaultUsersTable)
        .set({
          lifetimePoints: sql`${vaultUsersTable.lifetimePoints} + ${amount}`,
          // Also write tempMiningPoints + weeklyPoints into the state JSONB so
          // the cap in PUT /vault/me doesn't zero out the offerwall reward.
          state: creditedStateSql(amount, {}),
        })
        .where(and(eq(vaultUsersTable.telegramId, telegramId), eq(vaultUsersTable.isBanned, false)))
        .returning();

      if (!updated) {
        return { ok: false, creditedPoints: 0, lifetimePoints: 0, reason: "Unknown or banned user" };
      }
      return { ok: true, creditedPoints: amount, lifetimePoints: updated.lifetimePoints };
    },

    async healthCheck(): Promise<HealthCheckResult> {
      const start = Date.now();
      return { healthy: enabled, latencyMs: Date.now() - start, message: enabled ? undefined : "Not configured" };
    },
  };
}
