const API_BASE = '/api';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type EngageStatus = {
  today: string;
  streak: {
    count: number;
    claimedToday: boolean;
    day: number;
    nextReward: number;
    rewards: number[];
  };
  mysteryBox: {
    freeAvailable: boolean;
    freeCooldownEndsAt: number;
    adBoxesOpenedToday: number;
    adBoxesRemaining: number;
  };
  challenges: {
    list: { id: string; title: string; done: boolean }[];
    allDone: boolean;
    claimed: boolean;
    bonus: number;
  };
  event: {
    active: boolean;
    multiplier: number;
    title: string;
    endsAt: string | null;
  };
};

export type LeaderboardEntry = {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
  lifetimePoints: number;
};

export type WeeklyLeaderboardEntry = {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
  points: number;
};

export function getEngageStatus(): Promise<EngageStatus> {
  return apiFetch<EngageStatus>('/engage/status');
}

export function claimStreak(): Promise<{ ok: boolean; reward: number; streakCount: number; lifetimePoints: number }> {
  return apiFetch('/engage/streak/claim', { method: 'POST' });
}

export function openMysteryBox(source: 'free' | 'ad'): Promise<{ ok: boolean; tier: string; reward: number; lifetimePoints: number }> {
  return apiFetch('/engage/mysterybox/open', { method: 'POST', body: JSON.stringify({ source }) });
}

export function claimChallenge(): Promise<{ ok: boolean; reward: number; lifetimePoints: number }> {
  return apiFetch('/engage/challenge/claim', { method: 'POST' });
}

export function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return apiFetch('/vault/leaderboard');
}

export function getWeeklyLeaderboard(): Promise<{ weekKey: string; entries: WeeklyLeaderboardEntry[] }> {
  return apiFetch('/vault/leaderboard/weekly');
}
