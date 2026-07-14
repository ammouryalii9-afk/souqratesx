const API_BASE = "/api";

export type PublicConfig = {
  botMessages: {
    termsText: string;
    welcomeText: string;
  };
  adsgram: {
    enabled: boolean;
    blockId: string | null;
    bannerBlockId: string | null;
    rewardPoints: number;
    cooldownSeconds: number;
    dailyCap: number;
  };
  monetag: {
    enabled: boolean;
    zoneId: string | null;
    rewardPoints: number;
    cooldownSeconds: number;
    dailyCap: number;
  };
  onclicka: {
    enabled: boolean;
    spotId: string | null;
    inpageId: string | null;
    rewardPoints: number;
    cooldownSeconds: number;
    dailyCap: number;
  };

  exoclick: {
    enabled: boolean;
    zoneId: string | null;
    insClass: string | null;
  };
  offerwalls: { id: string; name: string; url: string | null; enabled: boolean }[];
  stars: { enabled: boolean };
  features: {
    weeklyPrizesEnabled: boolean;
    referralMilestonesEnabled: boolean;
    offlineEarningsEnabled: boolean;
    gameToSpendablePercent: number;
    skpToSkxConversionRate: number;
    maintenanceMode: boolean;
  };
  botUsername: string | null;
  pointsPerDollar: number;
  dollarBonus: number;
  dailyCipher: string;
  dailyComboIds: string[];
};

const FALLBACK_BOT_USERNAME = "SouqratesX_bot";
let cachedBotUsername: string | null = null;

export async function getBotUsername(): Promise<string> {
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const cfg = await getPublicConfig();
    if (cfg.botUsername) cachedBotUsername = cfg.botUsername;
  } catch {
    // fall through to fallback
  }
  return cachedBotUsername ?? FALLBACK_BOT_USERNAME;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export function getPublicConfig(): Promise<PublicConfig> {
  return apiFetch<PublicConfig>("/config/public");
}

export function claimAdsgramReward(): Promise<{ creditedPoints: number; lifetimePoints: number }> {
  return apiFetch("/earn/adsgram/reward", { method: "POST" });
}

export function claimMonetagReward(): Promise<{ creditedPoints: number; lifetimePoints: number }> {
  return apiFetch("/earn/monetag/reward", { method: "POST" });
}

export function claimOnclickaReward(): Promise<{ creditedPoints: number; lifetimePoints: number }> {
  return apiFetch("/earn/onclicka/reward", { method: "POST" });
}


export type StarProduct = {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceStars: number;
  effectType: "points" | "energy_refill" | "turbo_boost" | "premium_days" | "permanent_multiplier" | "badge" | "skin";
  effectValue: number | null;
  isActive: boolean;
  sortOrder: number;
  benefitsBullets: string | null;
  createdAt: string;
};

export function getStarProducts(): Promise<StarProduct[]> {
  return apiFetch<StarProduct[]>("/store/products");
}

export function createStarsInvoice(productId: number): Promise<{ invoiceUrl: string; priceStars: number }> {
  return apiFetch("/stars/invoice", { method: "POST", body: JSON.stringify({ productId }) });
}

export type SponsoredAdTask = {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string;
  rewardPoints: number;
  claimed: boolean;
  minWatchSeconds: number;
  startedAt: string | null;
};

export function getAds(): Promise<SponsoredAdTask[]> {
  return apiFetch<SponsoredAdTask[]>("/ads");
}

export function startAd(id: number): Promise<{ startedAt: string; minWatchSeconds: number }> {
  return apiFetch<{ startedAt: string; minWatchSeconds: number }>(`/ads/${id}/start`, { method: "POST" });
}

export function claimAd(id: number): Promise<{ creditedPoints: number; lifetimePoints: number }> {
  return apiFetch(`/ads/${id}/claim`, { method: "POST" });
}

export type PartnerTask = {
  id: number;
  title: string;
  description: string | null;
  channelUsername: string;
  channelUrl: string;
  iconEmoji: string;
  rewardPoints: number;
  isActive: boolean;
  sortOrder: number;
  completed: boolean;
};

export function getPartnerTasks(): Promise<{ tasks: PartnerTask[] }> {
  return apiFetch<{ tasks: PartnerTask[] }>("/partner-tasks");
}

export function verifyPartnerTask(id: number): Promise<{ ok: boolean; alreadyClaimed: boolean; creditedPoints: number; lifetimePoints: number }> {
  return apiFetch(`/partner-tasks/${id}/verify`, { method: "POST" });
}

// ── Pixels (SKX investment cycles) ───────────────────────────────────────────

export type PixelTier = { upTo: number; price: number };

export type PixelMarket = {
  cycleId: number;
  endDate: string;
  totalSupply: number;
  sold: number;
  remaining: number;
  tiers: PixelTier[];
  currentPrice: number;
  dividendPercent: number;
  estimatedPoolSkx: number;
  maxPerPurchase: number;
  myPixels: number;
  skxBalance: number;
};

export type PixelDividend = {
  cycleId: number;
  pixelsHeld: number;
  dividendSkx: number;
  paidAt: string;
};

export function getPixelMarket(): Promise<PixelMarket> {
  return apiFetch<PixelMarket>("/pixels/market");
}

export function buyPixels(quantity: number): Promise<{
  purchasedQuantity: number;
  pricePaidSkx: number;
  skxBalance: number;
  myPixels: number;
  remaining: number;
}> {
  return apiFetch("/pixels/buy", { method: "POST", body: JSON.stringify({ quantity }) });
}

export function getMyPixels(): Promise<{ cycleId: number | null; myPixels: number; pixelUsdCents: number; dividends: PixelDividend[] }> {
  return apiFetch("/pixels/me");
}

export function requestPixelUsdWithdrawal(): Promise<{ ok: boolean; id: number; usdCents: number }> {
  return apiFetch("/pixels/withdraw-usd", { method: "POST" });
}
