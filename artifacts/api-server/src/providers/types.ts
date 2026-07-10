export type ProviderKind = "rewarded_ad" | "offerwall";

/** Context about the requesting user, used by the Revenue Optimizer to rank providers. */
export interface ProviderContext {
  telegramId: string;
  country?: string;
  device?: string;
  os?: string;
}

/** A single earning opportunity surfaced to the Mini App, provider-agnostic. */
export interface EarnOffer {
  providerKey: string;
  type: ProviderKind;
  title: string;
  rewardPoints: number;
  url?: string;
}

/** Raw inbound reward claim/callback, before provider-specific verification. */
export interface RewardVerifyInput {
  telegramId: string;
  txId?: string;
  amount?: number;
  secret?: string;
  raw: Record<string, unknown>;
}

export interface RewardVerifyResult {
  verified: boolean;
  amount: number;
  txId: string;
  reason?: string;
}

export interface RewardResult {
  ok: boolean;
  creditedPoints: number;
  lifetimePoints: number;
  reason?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  message?: string;
}

/**
 * Every earning provider (Adsgram, CPA, Monlix, Bitlabs, and any future ones)
 * implements this interface. The ProviderManager/RewardEngine only ever talk
 * to this interface — nothing else in the codebase should know a provider's
 * internals.
 */
export interface EarnProvider {
  readonly key: string;
  readonly type: ProviderKind;
  initialize(config: Record<string, unknown>): void;
  isEnabled(): boolean;
  getOffers(ctx: ProviderContext): Promise<EarnOffer[]>;
  verifyReward(input: RewardVerifyInput): Promise<RewardVerifyResult>;
  rewardUser(telegramId: string, amount: number, txId: string): Promise<RewardResult>;
  healthCheck(): Promise<HealthCheckResult>;
}
