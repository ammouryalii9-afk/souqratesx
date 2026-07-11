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

export type SquadBoardEntry = {
  rank: number;
  id: number;
  name: string;
  emoji: string;
  ownerId: string;
  memberCount: number;
  totalPoints: number;
};

export type SquadMember = {
  telegramId: string;
  name: string;
  lifetimePoints: number;
  isOwner: boolean;
};

export type MySquad = {
  id: number;
  name: string;
  emoji: string;
  ownerId: string;
  isOwner: boolean;
  rank: number | null;
  memberCount: number;
  totalPoints: number;
  members: SquadMember[];
};

export function getSquadBoard(): Promise<SquadBoardEntry[]> {
  return apiFetch<SquadBoardEntry[]>('/squads');
}

export function getMySquad(): Promise<{ squad: MySquad | null }> {
  return apiFetch<{ squad: MySquad | null }>('/squads/me');
}

export function createSquad(name: string, emoji: string): Promise<{ squad: { id: number; name: string; emoji: string } }> {
  return apiFetch('/squads', { method: 'POST', body: JSON.stringify({ name, emoji }) });
}

export function joinSquad(id: number): Promise<{ ok: boolean; squadId: number; creditedBonus: number }> {
  return apiFetch(`/squads/${id}/join`, { method: 'POST' });
}

export function leaveSquad(): Promise<{ ok: boolean }> {
  return apiFetch('/squads/leave', { method: 'POST' });
}
