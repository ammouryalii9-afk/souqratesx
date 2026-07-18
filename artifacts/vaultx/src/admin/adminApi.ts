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
  onlineNow: number;
};

export type LiveUser = {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
  lastSeenAt: string | null;
  totalSessionSeconds: number;
  lifetimePoints: number;
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
  referralUsdCents: number;
  createdAt: string;
};

export type AdminUserDetail = AdminUserSummary & {
  internalId: number;
  premiumExpiresAt: string | null;
  adsWatchedToday: number;
  notes: string | null;
  state: Record<string, unknown>;
  skxBalance: number;
  // extracted game-state fields
  currentPoints: number;
  miningLevel: number;
  maxEnergy: number;
  energy: number;
  profitPerHour: number;
  updatedAt: string;
};

export type UserDeepStats = {
  rewardsByProvider: { provider_key: string; total_rewards: number; total_points: number }[];
  totalEvents: number;
  errorCount: number;
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
  sponsorName: string | null;
  sponsorUrl: string | null;
  isSponsored: number;
  langFilter: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type LangStat = { langCode: string; count: number };

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
  | "max_energy_boost"
  | "turbo_boost"
  | "premium_days"
  | "permanent_multiplier"
  | "badge"
  | "skin"
  | "mining_level_up"
  | "farm_instant"
  | "skx_credit"
  | "squad_gold"
  | "competition_entry";

export type StarProduct = {
  id: number;
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  imageUrl: string | null;
  priceStars: number;
  effectType: StarProductEffectType;
  effectValue: number | null;
  isActive: boolean;
  sortOrder: number;
  benefitsBullets: string | null;
  benefitsBulletsAr: string | null;
  createdAt: string;
};

export type CreateStarProductInput = {
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  imageUrl?: string | null;
  priceStars: number;
  effectType: StarProductEffectType;
  effectValue?: number | null;
  sortOrder?: number;
  benefitsBullets?: string | null;
  benefitsBulletsAr?: string | null;
};

export type UpdateStarProductInput = Partial<{
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  imageUrl: string | null;
  priceStars: number;
  effectType: StarProductEffectType;
  effectValue: number | null;
  isActive: boolean;
  sortOrder: number;
  benefitsBullets: string | null;
  benefitsBulletsAr: string | null;
}>;

// ─── Analytics types ──────────────────────────────────────────────────────────

export type AnalyticsData = {
  newUsersByDay: { date: string; count: number }[];
  rewardsByDay: { date: string; total_points: number; tx_count: number }[];
  leagueDistribution: { league: string; count: number }[];
  retention: { d1Rate: number | null; d7Rate: number | null; d1Total: number; d7Total: number };
};

// ─── Anti-Cheat types ─────────────────────────────────────────────────────────

export type SuspiciousUser = {
  telegram_id: string; username: string | null; first_name: string | null;
  is_banned: boolean; lifetime_points: number; earned_24h: number; tx_count: number;
};

export type MultiAccountCandidate = {
  referrer_id: string; referrer_username: string | null; referrer_first_name: string | null;
  referral_count: number; referral_earnings: number; lifetime_points: number; is_banned: boolean;
};

export type TopEarner = {
  telegram_id: string; username: string | null; first_name: string | null;
  lifetime_points: number; is_banned: boolean; created_at: string;
};

export type AntiCheatData = {
  suspicious: SuspiciousUser[];
  multiAccountCandidates: MultiAccountCandidate[];
  topEarners: TopEarner[];
  capPerHour: number;
};

// ─── Pixels types ─────────────────────────────────────────────────────────────

export type PixelSettings = {
  totalSupply: number;
  dividendPercent: number;
  cycleDays: number;
  maxPerPurchase: number;
  tiers: { upTo: number; price: number }[];
  autoStart: boolean;
};

export type PixelCycleRow = {
  id: number;
  status: string;
  startDate: string;
  endDate: string;
  totalAdRevenueSkx: number;
  distributionAmountSkx: number;
  totalPixelsSold: number;
};

export type PixelCyclesData = {
  settings: PixelSettings;
  activeStats: { sold: number; holders: number } | null;
  cycles: PixelCycleRow[];
};

// ─── Provider Report types ────────────────────────────────────────────────────

export type ProviderSummary = { key: string; name: string; type: string; enabled: boolean; priority: number };

export type ProviderTxRow = { provider_key: string; total_rewards: number; total_points: number; avg_reward: number; date: string };

export type ProviderErrorRow = { provider_key: string; total_events: number; error_count: number; avg_latency_ms: number | null };

export type ProviderReportData = {
  providers: ProviderSummary[];
  recentTx: ProviderTxRow[];
  errorRate: ProviderErrorRow[];
};

export const adminApi = {
  login: (password: string) =>
    adminFetch<AdminSessionStatus>("/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => adminFetch<AdminSessionStatus>("/admin/logout", { method: "POST" }),
  me: () => adminFetch<AdminSessionStatus>("/admin/me"),
  stats: () => adminFetch<AdminStats>("/admin/stats"),
  liveUsers: () => adminFetch<LiveUser[]>("/admin/live-users"),
  topSessionUsers: () => adminFetch<LiveUser[]>("/admin/top-session-users"),
  analytics: (days?: number) => adminFetch<AnalyticsData>(`/admin/analytics${days ? `?days=${days}` : ""}`),
  antiCheat: () => adminFetch<AntiCheatData>("/admin/anticheat"),
  providerReport: (days?: number) => adminFetch<ProviderReportData>(`/admin/providers/report${days ? `?days=${days}` : ""}`),
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
  userStats: (telegramId: string) => adminFetch<UserDeepStats>(`/admin/users/${telegramId}/stats`),
  creditSkx: (telegramId: string, amount: number, reason?: string) =>
    adminFetch<{ skxBalance: number }>(`/admin/users/${telegramId}/credit-skx`, {
      method: "POST",
      body: JSON.stringify({ amount, ...(reason ? { reason } : {}) }),
    }),
  broadcasts: () => adminFetch<BroadcastJob[]>("/admin/broadcast"),
  broadcastLangStats: () => adminFetch<LangStat[]>("/admin/broadcast/lang-stats"),
  createBroadcast: (message: string, audience: string, langCodes?: string[]) =>
    adminFetch<BroadcastJob>("/admin/broadcast", { method: "POST", body: JSON.stringify({ message, audience, langCodes }) }),
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
  pixelCycles: () => adminFetch<PixelCyclesData>("/admin/pixels/cycles"),
  closePixelCycle: () => adminFetch<{ ok: boolean }>("/admin/pixels/cycles/close", { method: "POST" }),
  startPixelCycle: () => adminFetch<{ ok: boolean; cycleId: number }>("/admin/pixels/cycles/start", { method: "POST" }),
  sendReminders: (inactiveDays: number, message?: string) =>
    adminFetch<{ ok: boolean; total: number; sent: number; failed: number }>("/admin/reminders/send", {
      method: "POST",
      body: JSON.stringify({ inactiveDays, ...(message ? { message } : {}) }),
    }),

  // Generic helpers for admin endpoints without a typed wrapper
  get: <T>(path: string) => adminFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    adminFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    adminFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    adminFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path: string) => adminFetch<void>(path, { method: "DELETE" }),
};
