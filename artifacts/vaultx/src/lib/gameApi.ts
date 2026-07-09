const API_BASE = "/api";

export type PublicConfig = {
  adsgram: {
    enabled: boolean;
    blockId: string | null;
    rewardPoints: number;
    cooldownSeconds: number;
    dailyCap: number;
  };
  offerwalls: { id: string; name: string; url: string | null; enabled: boolean }[];
  stars: { enabled: boolean };
};

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
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function getPublicConfig(): Promise<PublicConfig> {
  return apiFetch<PublicConfig>("/config/public");
}

export function claimAdsgramReward(): Promise<{ creditedPoints: number; lifetimePoints: number }> {
  return apiFetch("/earn/adsgram/reward", { method: "POST" });
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
