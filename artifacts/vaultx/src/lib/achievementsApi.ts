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

export type Announcement = {
  id: number;
  title: string;
  body: string | null;
  emoji: string;
  isPinned: boolean;
  createdAt: string;
};

export function getAnnouncements(): Promise<Announcement[]> {
  return apiFetch<Announcement[]>('/announcements');
}

export function claimAchievement(achievementId: string): Promise<{ ok: boolean; reward: number; lifetimePoints: number }> {
  return apiFetch('/achievements/claim', { method: 'POST', body: JSON.stringify({ achievementId }) });
}
