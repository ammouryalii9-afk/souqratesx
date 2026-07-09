const API_BASE = "/api";

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new AdminApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type AdminSessionStatus = { authenticated: boolean };

export type AdminStats = {
  totalUsers: number;
  totalLifetimePoints: number;
  totalBalanceUSD: number;
  premiumUsers: number;
  bannedUsers: number;
  newUsersToday: number;
};

export type AdminUserSummary = {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  lifetimePoints: number;
  isBanned: boolean;
  isPremium: boolean;
  starsBalance: number;
  referrerId: string | null;
  referralCount: number;
  referralEarnings: number;
  createdAt: string;
};

export type AdminUserDetail = AdminUserSummary & {
  premiumExpiresAt: string | null;
  notes: string | null;
  state: Record<string, unknown>;
  updatedAt: string;
};

export type AdminUserPatch = Partial<{
  lifetimePoints: number;
  isBanned: boolean;
  isPremium: boolean;
  premiumExpiresAt: string | null;
  starsBalance: number;
  notes: string | null;
  state: Record<string, unknown>;
}>;

export type AdminSettingsMap = Record<string, unknown>;

export type AdminAuditLogEntry = {
  id: number;
  action: string;
  targetTelegramId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type UserActivityEntry = {
  source: "activity" | "admin";
  type: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type BroadcastJob = {
  id: number;
  message: string;
  audience: string;
  status: string;
  totalUsers: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
};

export type SponsoredAd = {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string;
  rewardPoints: number;
  isActive: boolean;
  createdAt: string;
};

export type CreateSponsoredAdInput = {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  linkUrl: string;
  rewardPoints: number;
  notify?: boolean;
};

export type UpdateSponsoredAdInput = Partial<{
  title: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string;
  rewardPoints: number;
  isActive: boolean;
}>;

export type StarProductEffectType =
  | "points"
  | "energy_refill"
  | "turbo_boost"
  | "premium_days"
  | "permanent_multiplier"
  | "badge"
  | "skin";

export type StarProduct = {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceStars: number;
  effectType: StarProductEffectType;
  effectValue: number | null;
  isActive: boolean;
  createdAt: string;
};

export type CreateStarProductInput = {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  priceStars: number;
  effectType: StarProductEffectType;
  effectValue?: number | null;
};

export type UpdateStarProductInput = Partial<{
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceStars: number;
  effectType: StarProductEffectType;
  effectValue: number | null;
  isActive: boolean;
}>;

export const adminApi = {
  login: (password: string) =>
    adminFetch<AdminSessionStatus>("/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => adminFetch<AdminSessionStatus>("/admin/logout", { method: "POST" }),
  me: () => adminFetch<AdminSessionStatus>("/admin/me"),
  stats: () => adminFetch<AdminStats>("/admin/stats"),
  users: (params: { search?: string; limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return adminFetch<{ users: AdminUserSummary[]; total: number }>(`/admin/users${qs ? `?${qs}` : ""}`);
  },
  user: (telegramId: string) => adminFetch<AdminUserDetail>(`/admin/users/${telegramId}`),
  updateUser: (telegramId: string, patch: AdminUserPatch) =>
    adminFetch<AdminUserDetail>(`/admin/users/${telegramId}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteUser: (telegramId: string) => adminFetch<AdminSessionStatus>(`/admin/users/${telegramId}`, { method: "DELETE" }),
  settings: () => adminFetch<AdminSettingsMap>("/admin/settings"),
  updateSettings: (patch: AdminSettingsMap) =>
    adminFetch<AdminSettingsMap>("/admin/settings", { method: "PUT", body: JSON.stringify(patch) }),
  auditLog: () => adminFetch<AdminAuditLogEntry[]>("/admin/audit-log"),
  setupTelegramWebhook: () =>
    adminFetch<{ ok: boolean; webhookUrl: string; description: string }>("/admin/telegram/setup-webhook", {
      method: "POST",
    }),
  userActivity: (telegramId: string) => adminFetch<UserActivityEntry[]>(`/admin/users/${telegramId}/activity`),
  broadcasts: () => adminFetch<BroadcastJob[]>("/admin/broadcast"),
  createBroadcast: (message: string, audience: string) =>
    adminFetch<BroadcastJob>("/admin/broadcast", { method: "POST", body: JSON.stringify({ message, audience }) }),
  broadcast: (id: number) => adminFetch<BroadcastJob>(`/admin/broadcast/${id}`),
  ads: () => adminFetch<SponsoredAd[]>("/admin/ads"),
  createAd: (input: CreateSponsoredAdInput) =>
    adminFetch<SponsoredAd>("/admin/ads", { method: "POST", body: JSON.stringify(input) }),
  updateAd: (id: number, patch: UpdateSponsoredAdInput) =>
    adminFetch<SponsoredAd>(`/admin/ads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteAd: (id: number) => adminFetch<AdminSessionStatus>(`/admin/ads/${id}`, { method: "DELETE" }),
  starProducts: () => adminFetch<StarProduct[]>("/admin/star-products"),
  createStarProduct: (input: CreateStarProductInput) =>
    adminFetch<StarProduct>("/admin/star-products", { method: "POST", body: JSON.stringify(input) }),
  updateStarProduct: (id: number, patch: UpdateStarProductInput) =>
    adminFetch<StarProduct>(`/admin/star-products/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteStarProduct: (id: number) => adminFetch<AdminSessionStatus>(`/admin/star-products/${id}`, { method: "DELETE" }),
};
