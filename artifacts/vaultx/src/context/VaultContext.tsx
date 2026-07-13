import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { initTelegramWebApp, getTelegramInitData, haptic } from '../lib/telegram';

export type PassiveCard = {
  id: string;
  name: string;
  level: number;
  ptsPerHour: number;
};

export const getLeague = (pts: number) => {
  if (pts >= 100000000) return { name: 'Master', color: '#ff4d4d', icon: '👑' };
  if (pts >= 10000000) return { name: 'Diamond', color: '#b9f2ff', icon: '💎' };
  if (pts >= 1000000) return { name: 'Platinum', color: '#e5e4e2', icon: '💠' };
  if (pts >= 100000) return { name: 'Gold', color: '#ffd700', icon: '🏆' };
  if (pts >= 10000) return { name: 'Silver', color: '#c0c0c0', icon: '🥈' };
  return { name: 'Bronze', color: '#cd7f32', icon: '🥉' };
};

type SyncedState = {
  totalBalanceUSD: number;
  tempMiningPoints: number;
  miningLevel: number;
  energy: number;
  maxEnergy: number;
  lifetimePoints: number;
  turboUsesToday: number;
  rechargeUsesToday: number;
  farmState: 'idle' | 'farming' | 'ready';
  farmStartTime: number;
  passiveCards: PassiveCard[];
  lastResetDate?: string;
  lastEnergyRegen?: number;
  permanentMultiplierPercent?: number;
  ownedBadgeIds?: number[];
  equippedBadgeId?: number | null;
  ownedSkinIds?: number[];
  equippedSkinId?: number | null;
  selectedExchange?: string | null;
  claimedAchievements?: string[];
  hasClaimedWelcome?: boolean;
};

export const BADGES: Record<number, { label: string; color: string }> = {
  1: { label: 'Explorer', color: '#c0c0c0' },
  2: { label: 'Pro', color: '#ffd700' },
  3: { label: 'Legend', color: '#ff4d4d' },
};

export const SKINS: Record<number, { name: string; accent: string; glow: string; price: number }> = {
  1: { name: 'Classic', accent: '#f5c518', glow: 'rgba(245,197,24,0.3)', price: 0 },
  2: { name: 'Neon Blue', accent: '#22d3ee', glow: 'rgba(34,211,238,0.35)', price: 50000 },
  3: { name: 'Emerald', accent: '#34d399', glow: 'rgba(52,211,153,0.35)', price: 150000 },
  4: { name: 'Royal Purple', accent: '#a78bfa', glow: 'rgba(167,139,250,0.35)', price: 500000 },
};

type VaultContextType = {
  userId: string;
  username: string;
  isTelegramUser: boolean;
  isSyncing: boolean;
  totalBalanceUSD: number;
  tempMiningPoints: number;
  miningLevel: number;
  energy: number;
  maxEnergy: number;
  totalReferrals: number;
  referralEarnings: number;

  lifetimePoints: number;
  profitPerHour: number;
  activeTurbo: boolean;
  turboExpiresAt: number;
  turboUsesToday: number;
  rechargeUsesToday: number;
  farmState: 'idle' | 'farming' | 'ready';
  farmStartTime: number;
  passiveCards: PassiveCard[];

  permanentMultiplierPercent: number;
  ownedBadgeIds: number[];
  equippedBadgeId: number | null;
  ownedSkinIds: number[];
  equippedSkinId: number | null;
  selectedExchange: string | null;
  claimedAchievements: string[];
  hasClaimedWelcome: boolean;
  claimWelcomeReward: () => void;
  isPremium: boolean;
  equipBadge: (badgeId: number | null) => void;
  equipSkin: (skinId: number | null) => void;
  buySkin: (skinId: number) => boolean;
  setSelectedExchange: (id: string | null) => void;
  addClaimedAchievement: (id: string) => void;

  setTotalBalanceUSD: (val: number | ((prev: number) => number)) => void;
  setTempMiningPoints: (val: number | ((prev: number) => number)) => void;
  setMiningLevel: (val: number | ((prev: number) => number)) => void;
  setEnergy: (val: number | ((prev: number) => number)) => void;
  setMaxEnergy: (val: number | ((prev: number) => number)) => void;

  claimEarnings: () => void;
  upgradeMiningLevel: (cost: number, newLevel: number) => void;
  expandBattery: (cost: number) => void;
  tapMine: () => number;

  activateTurbo: () => void;
  grantAdTurbo: () => void;
  rechargeEnergy: () => void;
  startFarming: () => void;
  claimFarming: () => void;
  buyPassiveCard: (cardId: string, cost: number, newLevel: number, newPtsPerHour: number, name: string) => void;
  addLifetimePoints: (n: number) => void;
  addBonusPoints: (n: number) => void;
  refreshFromServer: () => Promise<void>;
};

const VaultContext = createContext<VaultContextType | undefined>(undefined);

const API_BASE = '/api';

async function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userId, setUserId] = useState('user_123');
  const [username, setUsername] = useState('CryptoMiner');
  const [isTelegramUser, setIsTelegramUser] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [totalBalanceUSD, setTotalBalanceUSD] = useState(() => Number(localStorage.getItem('totalBalanceUSD')) || 0);
  const [tempMiningPoints, setTempMiningPoints] = useState(() => {
    const saved = localStorage.getItem('tempMiningPoints');
    return saved ? Number(saved) : 0;
  });
  const [miningLevel, setMiningLevel] = useState(() => Number(localStorage.getItem('miningLevel')) || 1);
  const [energy, setEnergy] = useState(() => Number(localStorage.getItem('energy')) || 100);
  const [maxEnergy, setMaxEnergy] = useState(() => Number(localStorage.getItem('maxEnergy')) || 100);
  const [totalReferrals, setTotalReferrals] = useState(() => Number(localStorage.getItem('totalReferrals')) || 0);
  const [referralEarnings, setReferralEarnings] = useState(() => Number(localStorage.getItem('referralEarnings')) || 0);

  const [lifetimePoints, setLifetimePoints] = useState(() => Number(localStorage.getItem('lifetimePoints')) || 0);
  const [turboUsesToday, setTurboUsesToday] = useState(() => Number(localStorage.getItem('turboUsesToday')) || 0);
  const [rechargeUsesToday, setRechargeUsesToday] = useState(() => Number(localStorage.getItem('rechargeUsesToday')) || 0);
  const [farmState, setFarmState] = useState<'idle' | 'farming' | 'ready'>(() => (localStorage.getItem('farmState') as any) || 'idle');
  const [farmStartTime, setFarmStartTime] = useState(() => Number(localStorage.getItem('farmStartTime')) || 0);
  const [passiveCards, setPassiveCards] = useState<PassiveCard[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('passiveCards') || '[]');
    } catch {
      return [];
    }
  });

  const [activeTurbo, setActiveTurbo] = useState(false);
  const [turboExpiresAt, setTurboExpiresAt] = useState(0);

  const [permanentMultiplierPercent, setPermanentMultiplierPercent] = useState(() => Number(localStorage.getItem('permanentMultiplierPercent')) || 0);
  const [ownedBadgeIds, setOwnedBadgeIds] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ownedBadgeIds') || '[]');
    } catch {
      return [];
    }
  });
  const [equippedBadgeId, setEquippedBadgeId] = useState<number | null>(() => {
    const saved = localStorage.getItem('equippedBadgeId');
    return saved ? Number(saved) : null;
  });
  const [ownedSkinIds, setOwnedSkinIds] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ownedSkinIds') || '[]');
    } catch {
      return [];
    }
  });
  const [equippedSkinId, setEquippedSkinId] = useState<number | null>(() => {
    const saved = localStorage.getItem('equippedSkinId');
    return saved ? Number(saved) : null;
  });
  const [selectedExchange, setSelectedExchange] = useState<string | null>(() => localStorage.getItem('selectedExchange') || null);
  const [claimedAchievements, setClaimedAchievements] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('claimedAchievements') || '[]'); } catch { return []; }
  });
  const [hasClaimedWelcome, setHasClaimedWelcome] = useState<boolean>(() => localStorage.getItem('hasClaimedWelcome') === 'true');
  const [isPremium, setIsPremium] = useState(false);

  const hasHydratedFromServer = useRef(false);
  const isHydrating = useRef(false);

  const basePassiveProfitPerHour = passiveCards.reduce((acc, card) => acc + card.ptsPerHour, 0);
  const multiplierFactor = 1 + permanentMultiplierPercent / 100;
  const premiumMultiplier = isPremium ? 2 : 1;
  const profitPerHour = Math.round(basePassiveProfitPerHour * multiplierFactor * premiumMultiplier);

  // Authenticate with Telegram (if running inside Telegram) and hydrate state from the server.
  useEffect(() => {
    const webApp = initTelegramWebApp();
    const initData = getTelegramInitData();

    if (!webApp || !initData) {
      // Not running inside Telegram (e.g. local dev preview) — fall back to localStorage only.
      hasHydratedFromServer.current = true;
      return;
    }

    const unsafeUser = webApp.initDataUnsafe?.user;
    if (unsafeUser) {
      setUserId(String(unsafeUser.id));
      setUsername(unsafeUser.username || unsafeUser.first_name || 'Player');
    }

    setIsSyncing(true);
    isHydrating.current = true;
    apiFetch('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Telegram auth failed');
        const data = await res.json();
        const state = (data.state ?? {}) as Partial<SyncedState>;

        setUserId(data.user.telegramId);
        setUsername(data.user.username || data.user.firstName || 'Player');
        setIsTelegramUser(true);

        // Server is the source of truth. If the server has no state (new or
        // admin-reset account), reset local values to defaults instead of
        // keeping stale localStorage progress.
        setTotalBalanceUSD(typeof state.totalBalanceUSD === 'number' ? state.totalBalanceUSD : 0);
        setTempMiningPoints(typeof state.tempMiningPoints === 'number' ? state.tempMiningPoints : 0);
        setMiningLevel(typeof state.miningLevel === 'number' ? state.miningLevel : 1);
        setEnergy(typeof state.energy === 'number' ? state.energy : 100);
        setMaxEnergy(typeof state.maxEnergy === 'number' ? state.maxEnergy : 100);
        setTotalReferrals(typeof data.user.referralCount === 'number' ? data.user.referralCount : 0);
        setReferralEarnings(typeof data.user.referralEarnings === 'number' ? data.user.referralEarnings : 0);
        setLifetimePoints(typeof data.user.lifetimePoints === 'number' ? data.user.lifetimePoints : 0);
        setTurboUsesToday(typeof state.turboUsesToday === 'number' ? state.turboUsesToday : 0);
        setRechargeUsesToday(typeof state.rechargeUsesToday === 'number' ? state.rechargeUsesToday : 0);
        setFarmState(state.farmState ?? 'idle');
        setFarmStartTime(typeof state.farmStartTime === 'number' ? state.farmStartTime : 0);
        setPassiveCards(Array.isArray(state.passiveCards) ? state.passiveCards : []);
        setPermanentMultiplierPercent(typeof state.permanentMultiplierPercent === 'number' ? state.permanentMultiplierPercent : 0);
        setOwnedBadgeIds(Array.isArray(state.ownedBadgeIds) ? state.ownedBadgeIds : []);
        setEquippedBadgeId(typeof state.equippedBadgeId === 'number' ? state.equippedBadgeId : null);
        setOwnedSkinIds(Array.isArray(state.ownedSkinIds) ? state.ownedSkinIds : []);
        setEquippedSkinId(typeof state.equippedSkinId === 'number' ? state.equippedSkinId : null);
        if (typeof state.selectedExchange === 'string') setSelectedExchange(state.selectedExchange);
        if (Array.isArray(state.claimedAchievements)) setClaimedAchievements(state.claimedAchievements as string[]);
        setHasClaimedWelcome(!!state.hasClaimedWelcome);
        setIsPremium(!!data.user.isPremium);
      })
      .catch((err) => {
        console.error('Telegram auth failed, falling back to local progress', err);
      })
      .finally(() => {
        hasHydratedFromServer.current = true;
        isHydrating.current = false;
        setIsSyncing(false);
      });
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const lastReset = localStorage.getItem('lastResetDate');
    if (lastReset !== today) {
      setTurboUsesToday(0);
      setRechargeUsesToday(0);
      localStorage.setItem('lastResetDate', today);
    }
  }, []);

  // Persist to localStorage always (fast local cache / offline fallback).
  useEffect(() => {
    localStorage.setItem('totalBalanceUSD', totalBalanceUSD.toString());
    localStorage.setItem('tempMiningPoints', tempMiningPoints.toString());
    localStorage.setItem('miningLevel', miningLevel.toString());
    localStorage.setItem('energy', energy.toString());
    localStorage.setItem('maxEnergy', maxEnergy.toString());
    localStorage.setItem('lifetimePoints', lifetimePoints.toString());
    localStorage.setItem('turboUsesToday', turboUsesToday.toString());
    localStorage.setItem('rechargeUsesToday', rechargeUsesToday.toString());
    localStorage.setItem('farmState', farmState);
    localStorage.setItem('farmStartTime', farmStartTime.toString());
    localStorage.setItem('passiveCards', JSON.stringify(passiveCards));
    localStorage.setItem('totalReferrals', totalReferrals.toString());
    localStorage.setItem('referralEarnings', referralEarnings.toString());
    localStorage.setItem('permanentMultiplierPercent', permanentMultiplierPercent.toString());
    localStorage.setItem('ownedBadgeIds', JSON.stringify(ownedBadgeIds));
    localStorage.setItem('equippedBadgeId', equippedBadgeId === null ? '' : equippedBadgeId.toString());
    localStorage.setItem('ownedSkinIds', JSON.stringify(ownedSkinIds));
    localStorage.setItem('equippedSkinId', equippedSkinId === null ? '' : equippedSkinId.toString());
    localStorage.setItem('selectedExchange', selectedExchange ?? '');
    localStorage.setItem('claimedAchievements', JSON.stringify(claimedAchievements));
    localStorage.setItem('hasClaimedWelcome', hasClaimedWelcome ? 'true' : 'false');
  }, [totalBalanceUSD, tempMiningPoints, miningLevel, energy, maxEnergy, lifetimePoints, turboUsesToday, rechargeUsesToday, farmState, farmStartTime, passiveCards, totalReferrals, referralEarnings, permanentMultiplierPercent, ownedBadgeIds, equippedBadgeId, ownedSkinIds, equippedSkinId, selectedExchange, claimedAchievements, hasClaimedWelcome]);

  // Debounced sync to the server whenever game state changes (Telegram users only).
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isTelegramUser || !hasHydratedFromServer.current || isHydrating.current) {
      return;
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const state: SyncedState = {
        totalBalanceUSD,
        tempMiningPoints,
        miningLevel,
        energy,
        maxEnergy,
        lifetimePoints,
        turboUsesToday,
        rechargeUsesToday,
        farmState,
        farmStartTime,
        passiveCards,
        permanentMultiplierPercent,
        ownedBadgeIds,
        equippedBadgeId,
        ownedSkinIds,
        equippedSkinId,
        selectedExchange,
        claimedAchievements,
        hasClaimedWelcome,
      };
      apiFetch('/vault/me', {
        method: 'PUT',
        body: JSON.stringify({ state, lifetimePoints }),
      }).catch((err) => console.error('Failed to sync progress to server', err));
    }, 1500);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [isTelegramUser, totalBalanceUSD, tempMiningPoints, miningLevel, energy, maxEnergy, lifetimePoints, turboUsesToday, rechargeUsesToday, farmState, farmStartTime, passiveCards, permanentMultiplierPercent, ownedBadgeIds, equippedBadgeId, ownedSkinIds, equippedSkinId, selectedExchange, claimedAchievements, hasClaimedWelcome]);

  useEffect(() => {
    if (activeTurbo && turboExpiresAt > 0) {
      const remaining = turboExpiresAt - Date.now();
      if (remaining > 0) {
        const timer = setTimeout(() => {
          setActiveTurbo(false);
          setTurboExpiresAt(0);
        }, remaining);
        return () => clearTimeout(timer);
      } else {
        setActiveTurbo(false);
        setTurboExpiresAt(0);
      }
    }
    return undefined;
  }, [activeTurbo, turboExpiresAt]);

  useEffect(() => {
    const interval = setInterval(() => {
      setEnergy((prevEnergy) => {
        if (prevEnergy <= 0) return prevEnergy;
        const idlePts = miningLevel === 1 ? 1 : miningLevel === 2 ? 5 : miningLevel === 3 ? 20 : 100;
        setTempMiningPoints((prevPoints) => prevPoints + idlePts);
        setLifetimePoints((prevLifetime) => prevLifetime + idlePts);
        return prevEnergy - 1;
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [miningLevel]);

  useEffect(() => {
    const checkRegen = () => {
      const lastRegen = Number(localStorage.getItem('lastEnergyRegen')) || Date.now();
      const now = Date.now();
      const diffMinutes = Math.floor((now - lastRegen) / 60000);

      if (diffMinutes >= 15) {
        const intervals = Math.floor(diffMinutes / 15);
        setEnergy(prev => Math.min(maxEnergy, prev + (5 * intervals)));
        localStorage.setItem('lastEnergyRegen', (lastRegen + intervals * 15 * 60000).toString());
      } else if (!localStorage.getItem('lastEnergyRegen')) {
        localStorage.setItem('lastEnergyRegen', now.toString());
      }
    };
    checkRegen();
    const regenInterval = setInterval(checkRegen, 60000);
    return () => clearInterval(regenInterval);
  }, [maxEnergy]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (farmState === 'farming' && farmStartTime > 0) {
        if (Date.now() - farmStartTime >= 8 * 3600 * 1000) {
          setFarmState('ready');
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [farmState, farmStartTime]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (profitPerHour > 0) {
        setTempMiningPoints(p => p + profitPerHour);
        setLifetimePoints(p => p + profitPerHour);
      }
    }, 3600000);
    return () => clearInterval(interval);
  }, [profitPerHour]);

  // While the server auth/hydration request is in flight inside Telegram,
  // block progress-mutating actions — otherwise taps made before hydration
  // completes would be overwritten (lost) when the server state arrives.
  const isHydrationPending = () => isHydrating.current;

  const equipBadge = (badgeId: number | null) => {
    if (badgeId !== null && !ownedBadgeIds.includes(badgeId)) return;
    setEquippedBadgeId(badgeId);
  };

  const equipSkin = (skinId: number | null) => {
    if (skinId !== null && !ownedSkinIds.includes(skinId)) return;
    setEquippedSkinId(skinId);
  };

  const buySkin = (skinId: number): boolean => {
    if (isHydrationPending()) return false;
    const skin = SKINS[skinId];
    if (!skin) return false;
    if (ownedSkinIds.includes(skinId)) {
      setEquippedSkinId(skinId);
      return true;
    }
    if (tempMiningPoints < skin.price) return false;
    setTempMiningPoints(prev => prev - skin.price);
    setOwnedSkinIds(prev => (prev.includes(skinId) ? prev : [...prev, skinId]));
    setEquippedSkinId(skinId);
    return true;
  };

  const claimEarnings = () => {
    if (isHydrationPending()) return;
    const usdToAdd = (tempMiningPoints / 10000) * 0.01;
    setTotalBalanceUSD(prev => prev + usdToAdd);
    setTempMiningPoints(0);
  };

  const upgradeMiningLevel = (cost: number, newLevel: number) => {
    if (isHydrationPending()) return;
    if (tempMiningPoints >= cost) {
      setTempMiningPoints(prev => prev - cost);
      setMiningLevel(newLevel);
    }
  };

  const expandBattery = (cost: number) => {
    if (isHydrationPending()) return;
    if (tempMiningPoints >= cost && maxEnergy < 200) {
      setTempMiningPoints(prev => prev - cost);
      setMaxEnergy(200);
    }
  };

  const tapMine = (): number => {
    if (isHydrationPending()) return 0;
    let earned = 0;
    setEnergy(prev => {
      if (prev <= 0) return prev;
      const basePts = miningLevel === 1 ? 1 : miningLevel === 2 ? 5 : miningLevel === 3 ? 20 : 100;
      const boostedPts = activeTurbo ? basePts * 5 : basePts;
      earned = Math.round(boostedPts * multiplierFactor);
      setTempMiningPoints(p => p + earned);
      setLifetimePoints(p => p + earned);
      return prev - 1;
    });
    return earned;
  };

  const activateTurbo = () => {
    if (isHydrationPending()) return;
    if (turboUsesToday < 3 && !activeTurbo) {
      setActiveTurbo(true);
      setTurboExpiresAt(Date.now() + 20000);
      setTurboUsesToday(p => p + 1);
    }
  };

  const rechargeEnergy = () => {
    if (isHydrationPending()) return;
    if (rechargeUsesToday < 3) {
      setEnergy(maxEnergy);
      setRechargeUsesToday(p => p + 1);
    }
  };

  const grantAdTurbo = () => {
    if (isHydrationPending()) return;
    if (!activeTurbo) {
      setActiveTurbo(true);
      setTurboExpiresAt(Date.now() + 20000);
    }
  };

  const startFarming = () => {
    if (isHydrationPending()) return;
    if (farmState === 'idle') {
      setFarmState('farming');
      setFarmStartTime(Date.now());
    }
  };

  const claimFarming = () => {
    if (isHydrationPending()) return;
    if (farmState === 'ready') {
      setTempMiningPoints(p => p + 4000);
      setLifetimePoints(p => p + 4000);
      setFarmState('idle');
      setFarmStartTime(0);
    }
  };

  const buyPassiveCard = (cardId: string, cost: number, newLevel: number, newPtsPerHour: number, name: string) => {
    if (isHydrationPending()) return;
    if (tempMiningPoints >= cost) {
      setTempMiningPoints(p => p - cost);
      setPassiveCards(prev => {
        const existing = prev.find(c => c.id === cardId);
        if (existing) {
          return prev.map(c => c.id === cardId ? { ...c, level: newLevel, ptsPerHour: newPtsPerHour } : c);
        } else {
          return [...prev, { id: cardId, name, level: newLevel, ptsPerHour: newPtsPerHour }];
        }
      });
    }
  };

  const addLifetimePoints = (n: number) => {
    if (isHydrationPending()) return;
    setLifetimePoints(p => p + n);
    setTempMiningPoints(p => p + n);
  };

  // Client-side bonus points (e.g. tap combo). Added to both the spendable
  // balance and lifetime total; the server's maxPointsPerHourCap clamps abuse
  // on the next debounced sync, same as normal tap-mining.
  const addBonusPoints = (n: number) => {
    if (isHydrationPending() || n <= 0) return;
    setLifetimePoints(p => p + n);
    setTempMiningPoints(p => p + n);
  };

  const WELCOME_REWARD = 5000;
  const claimWelcomeReward = () => {
    if (isHydrationPending() || hasClaimedWelcome) return;
    setHasClaimedWelcome(true);
    setLifetimePoints(p => p + WELCOME_REWARD);
    setTempMiningPoints(p => p + WELCOME_REWARD);
    haptic('success');
  };

  // Pulls the latest server state and overwrites local values. Used after a
  // Telegram Stars purchase (e.g. energy refill, boost) is applied server-side
  // by the webhook, so the effect shows up immediately instead of getting
  // silently clobbered by the next debounced autosync (which would otherwise
  // push our stale pre-purchase local state back over the server's change).
  const refreshFromServer = async () => {
    if (!isTelegramUser) return;
    isHydrating.current = true;
    setIsSyncing(true);
    try {
      const res = await apiFetch('/vault/me');
      if (!res.ok) throw new Error('Failed to refresh state');
      const data = await res.json();
      const state = (data.state ?? {}) as Partial<SyncedState>;
      setTotalBalanceUSD(typeof state.totalBalanceUSD === 'number' ? state.totalBalanceUSD : 0);
      setTempMiningPoints(typeof state.tempMiningPoints === 'number' ? state.tempMiningPoints : 0);
      setMiningLevel(typeof state.miningLevel === 'number' ? state.miningLevel : 1);
      setEnergy(typeof state.energy === 'number' ? state.energy : 100);
      setMaxEnergy(typeof state.maxEnergy === 'number' ? state.maxEnergy : 100);
      setTotalReferrals(typeof data.user.referralCount === 'number' ? data.user.referralCount : 0);
      setReferralEarnings(typeof data.user.referralEarnings === 'number' ? data.user.referralEarnings : 0);
      setLifetimePoints(typeof data.user.lifetimePoints === 'number' ? data.user.lifetimePoints : 0);
      setTurboUsesToday(typeof state.turboUsesToday === 'number' ? state.turboUsesToday : 0);
      setRechargeUsesToday(typeof state.rechargeUsesToday === 'number' ? state.rechargeUsesToday : 0);
      setFarmState(state.farmState ?? 'idle');
      setFarmStartTime(typeof state.farmStartTime === 'number' ? state.farmStartTime : 0);
      setPassiveCards(Array.isArray(state.passiveCards) ? state.passiveCards : []);
      setPermanentMultiplierPercent(typeof state.permanentMultiplierPercent === 'number' ? state.permanentMultiplierPercent : 0);
      setOwnedBadgeIds(Array.isArray(state.ownedBadgeIds) ? state.ownedBadgeIds : []);
      setEquippedBadgeId(typeof state.equippedBadgeId === 'number' ? state.equippedBadgeId : null);
      setOwnedSkinIds(Array.isArray(state.ownedSkinIds) ? state.ownedSkinIds : []);
      setEquippedSkinId(typeof state.equippedSkinId === 'number' ? state.equippedSkinId : null);
      const activeTurboFromServer = (state as Record<string, unknown>).activeTurbo === true;
      const turboExpiresAtFromServer = typeof (state as Record<string, unknown>).turboExpiresAt === 'number'
        ? (state as Record<string, unknown>).turboExpiresAt as number
        : 0;
      setActiveTurbo(activeTurboFromServer && turboExpiresAtFromServer > Date.now());
      setTurboExpiresAt(activeTurboFromServer ? turboExpiresAtFromServer : 0);
      if (typeof state.selectedExchange === 'string') setSelectedExchange(state.selectedExchange);
      if (Array.isArray(state.claimedAchievements)) setClaimedAchievements(state.claimedAchievements as string[]);
      setHasClaimedWelcome(!!state.hasClaimedWelcome);
      setIsPremium(!!data.user.isPremium);
    } catch (err) {
      console.error('Failed to refresh state from server', err);
    } finally {
      isHydrating.current = false;
      setIsSyncing(false);
    }
  };

  return (
    <VaultContext.Provider
      value={{
        userId,
        username,
        isTelegramUser,
        isSyncing,
        totalBalanceUSD,
        tempMiningPoints,
        miningLevel,
        energy,
        maxEnergy,
        totalReferrals,
        referralEarnings,
        lifetimePoints,
        profitPerHour,
        activeTurbo,
        turboExpiresAt,
        turboUsesToday,
        rechargeUsesToday,
        farmState,
        farmStartTime,
        passiveCards,
        permanentMultiplierPercent,
        ownedBadgeIds,
        equippedBadgeId,
        ownedSkinIds,
        equippedSkinId,
        selectedExchange,
        claimedAchievements,
        hasClaimedWelcome,
        claimWelcomeReward,
        isPremium,
        equipBadge,
        equipSkin,
        buySkin,
        setSelectedExchange,
        addClaimedAchievement: (id: string) => setClaimedAchievements((prev) => prev.includes(id) ? prev : [...prev, id]),
        setTotalBalanceUSD,
        setTempMiningPoints,
        setMiningLevel,
        setEnergy,
        setMaxEnergy,
        claimEarnings,
        upgradeMiningLevel,
        expandBattery,
        tapMine,
        activateTurbo,
        grantAdTurbo,
        rechargeEnergy,
        startFarming,
        claimFarming,
        buyPassiveCard,
        addLifetimePoints,
        addBonusPoints,
        refreshFromServer,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const context = useContext(VaultContext);
  if (context === undefined) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
};
