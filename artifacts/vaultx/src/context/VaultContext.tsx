import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { initTelegramWebApp, getTelegramInitData, haptic } from '../lib/telegram';
import { getPublicConfig } from '../lib/gameApi';

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
  adMiningPoints: number;
  claimedPoints?: number;
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
  1: { name: 'Classic',      accent: '#f5c518', glow: 'rgba(245,197,24,0.3)',   price: 0 },
  2: { name: 'Neon Blue',    accent: '#22d3ee', glow: 'rgba(34,211,238,0.35)',  price: 50_000 },
  3: { name: 'Emerald',      accent: '#34d399', glow: 'rgba(52,211,153,0.35)',  price: 150_000 },
  4: { name: 'Royal Purple', accent: '#a78bfa', glow: 'rgba(167,139,250,0.35)', price: 500_000 },
  5: { name: 'Crimson',      accent: '#f87171', glow: 'rgba(248,113,113,0.35)', price: 1_000_000 },
  6: { name: 'Frost',        accent: '#7dd3fc', glow: 'rgba(125,211,252,0.35)', price: 2_500_000 },
  7: { name: 'Galaxy',       accent: '#c084fc', glow: 'rgba(192,132,252,0.35)', price: 5_000_000 },
  8: { name: 'Sovereign',    accent: '#fbbf24', glow: 'rgba(251,191,36,0.4)',   price: 10_000_000 },
};

type VaultContextType = {
  userId: string;
  username: string;
  isTelegramUser: boolean;
  isSyncing: boolean;
  totalBalanceUSD: number;
  tempMiningPoints: number;
  adMiningPoints: number;
  claimedPoints: number;
  skxBalance: number;
  miningLevel: number;
  energy: number;
  maxEnergy: number;
  totalReferrals: number;
  referralEarnings: number;

  lifetimePoints: number;
  withdrawnPoints: number;
  availablePoints: number;
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
  offlineEarnings: { amount: number; awayMs: number } | null;
  claimOfflineEarnings: () => void;
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

  claimEarnings: () => Promise<{ convertedSkp: number; receivedSkx: number } | null>;
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

  /** SKP bonus redeemed server-side during the last hydration (null = nothing to show). */
  bonusReward: number | null;
  dismissBonusReward: () => void;
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
  // SKP bonus folded in by the server during hydration — drives the animated reward popup.
  const [bonusReward, setBonusReward] = useState<number | null>(null);
  const dismissBonusReward = () => setBonusReward(null);

  const [totalBalanceUSD, setTotalBalanceUSD] = useState(() => Number(localStorage.getItem('totalBalanceUSD')) || 0);
  const [tempMiningPoints, setTempMiningPoints] = useState(() => {
    const saved = localStorage.getItem('tempMiningPoints');
    return saved ? Number(saved) : 0;
  });
  // Tracks how many of the current tempMiningPoints came from ads (100% conversion).
  // Game/farm/reward points are the remainder (gameToSpendablePercent% conversion).
  // Only server ad-reward routes can increase this; client can only decrease (spend).
  const [adMiningPoints, setAdMiningPoints] = useState(() => Number(localStorage.getItem('adMiningPoints')) || 0);
  // The withdrawable balance: only grows when the user manually Claims (converts)
  // the Mined buffer. Server-authoritative for Telegram users (claim happens via
  // POST /vault/claim; the PUT sync can never change it).
  const [claimedPoints, setClaimedPoints] = useState(() => Number(localStorage.getItem('claimedPoints')) || 0);
  // SKX: the hard, withdrawable currency. Server-authoritative column
  // (vault_users.skx_balance) for Telegram users — only /vault/convert,
  // pixel buys/dividends, and withdrawals can change it server-side.
  const [skxBalance, setSkxBalance] = useState(() => Number(localStorage.getItem('skxBalance')) || 0);
  const [miningLevel, setMiningLevel] = useState(() => Number(localStorage.getItem('miningLevel')) || 1);
  const [energy, setEnergy] = useState(() => Number(localStorage.getItem('energy')) || 100);
  const [maxEnergy, setMaxEnergy] = useState(() => Number(localStorage.getItem('maxEnergy')) || 100);
  const [totalReferrals, setTotalReferrals] = useState(() => Number(localStorage.getItem('totalReferrals')) || 0);
  const [referralEarnings, setReferralEarnings] = useState(() => Number(localStorage.getItem('referralEarnings')) || 0);

  const [lifetimePoints, setLifetimePoints] = useState(() => Number(localStorage.getItem('lifetimePoints')) || 0);
  // Points locked in pending/approved withdrawals (server-authoritative).
  // Available (withdrawable/dollar) balance = lifetimePoints - withdrawnPoints.
  const [withdrawnPoints, setWithdrawnPoints] = useState(0);
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

  // Offline passive earnings, computed once after hydration from the gap since
  // the app was last open (capped). null = nothing to show.
  const [offlineEarnings, setOfflineEarnings] = useState<{ amount: number; awayMs: number } | null>(null);
  const offlineChecked = useRef(false);

  const hasHydratedFromServer = useRef(false);
  const isHydrating = useRef(false);
  // % of game points (tap, farming, mini-games) credited to spendable balance.
  // Fetched from /config/public once after mount; ads/surveys are always 100%.
  const gameToSpendablePct = useRef(0);
  // % of converted SKP that becomes SKX (rest is burned). Default 5.
  const skpToSkxRate = useRef(5);
  useEffect(() => {
    getPublicConfig().then(cfg => {
      gameToSpendablePct.current = cfg.features.gameToSpendablePercent;
      if (typeof cfg.features.skpToSkxConversionRate === 'number') {
        skpToSkxRate.current = cfg.features.skpToSkxConversionRate;
      }
    }).catch(() => { /* keep defaults on error */ });
  }, []);

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
        setAdMiningPoints(typeof state.adMiningPoints === 'number' ? state.adMiningPoints : 0);
        setClaimedPoints(typeof state.claimedPoints === 'number' ? state.claimedPoints : 0);
        setSkxBalance(typeof data.user.skxBalance === 'number' ? data.user.skxBalance : 0);
        setMiningLevel(typeof state.miningLevel === 'number' ? state.miningLevel : 1);
        setEnergy(typeof state.energy === 'number' ? state.energy : 100);
        setMaxEnergy(typeof state.maxEnergy === 'number' ? state.maxEnergy : 100);
        setTotalReferrals(typeof data.user.referralCount === 'number' ? data.user.referralCount : 0);
        setReferralEarnings(typeof data.user.referralEarnings === 'number' ? data.user.referralEarnings : 0);
        setLifetimePoints(typeof data.user.lifetimePoints === 'number' ? data.user.lifetimePoints : 0);
        setWithdrawnPoints(typeof data.user.withdrawnPoints === 'number' ? data.user.withdrawnPoints : 0);
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
        if (typeof data.redeemedBonus === 'number' && data.redeemedBonus > 0) {
          setBonusReward(data.redeemedBonus);
          haptic('success');
        }
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

  // Heartbeat: every 30s while the app is open, update last_seen_at on the server
  // and accumulate total session time. Only fires for authenticated Telegram users.
  useEffect(() => {
    if (!isTelegramUser) return;
    const INTERVAL_MS = 30_000;
    let lastPingAt = Date.now();

    const id = setInterval(() => {
      const now = Date.now();
      const delta = Math.round((now - lastPingAt) / 1000);
      lastPingAt = now;
      apiFetch('/vault/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ sessionSeconds: delta }),
      }).catch(() => { /* silent — offline or session expired */ });
    }, INTERVAL_MS);

    // Send first ping immediately so presence is registered right away.
    lastPingAt = Date.now();
    apiFetch('/vault/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ sessionSeconds: 0 }),
    }).catch(() => {});

    return () => clearInterval(id);
  }, [isTelegramUser]);

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
    localStorage.setItem('adMiningPoints', adMiningPoints.toString());
    localStorage.setItem('claimedPoints', claimedPoints.toString());
    localStorage.setItem('skxBalance', skxBalance.toString());
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
  }, [totalBalanceUSD, tempMiningPoints, adMiningPoints, claimedPoints, skxBalance, miningLevel, energy, maxEnergy, lifetimePoints, turboUsesToday, rechargeUsesToday, farmState, farmStartTime, passiveCards, totalReferrals, referralEarnings, permanentMultiplierPercent, ownedBadgeIds, equippedBadgeId, ownedSkinIds, equippedSkinId, selectedExchange, claimedAchievements, hasClaimedWelcome]);

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
        adMiningPoints,
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
  }, [isTelegramUser, totalBalanceUSD, tempMiningPoints, adMiningPoints, miningLevel, energy, maxEnergy, lifetimePoints, turboUsesToday, rechargeUsesToday, farmState, farmStartTime, passiveCards, permanentMultiplierPercent, ownedBadgeIds, equippedBadgeId, ownedSkinIds, equippedSkinId, selectedExchange, claimedAchievements, hasClaimedWelcome]);

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
        const idlePts = miningLevel === 1 ? 1 : miningLevel === 2 ? 3 : miningLevel === 3 ? 10 : 50;
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

  // Compute offline passive earnings ONCE, after hydration settles — for
  // Telegram users the passive cards (and thus profitPerHour) arrive from the
  // server, so this must not run before that. The amount is only granted when
  // the player taps "collect" in the popup; it then flows through the normal
  // debounced sync (bounded server-side by maxPointsPerHourCap).
  // Guard: only shows when offlineEarningsEnabled flag is true in admin settings.
  useEffect(() => {
    if (isSyncing || !hasHydratedFromServer.current || offlineChecked.current) return;
    offlineChecked.current = true;

    import('../lib/gameApi').then(({ getPublicConfig }) => {
      getPublicConfig().then(cfg => {
        if (!cfg.features.offlineEarningsEnabled) {
          localStorage.setItem('lastOnlineAt', Date.now().toString());
          return;
        }
        const last = Number(localStorage.getItem('lastOnlineAt')) || 0;
        const now = Date.now();
        if (last > 0 && now > last && profitPerHour > 0) {
          const awayMs = now - last;
          const MIN_AWAY_MS = 10 * 60 * 1000;
          const MAX_OFFLINE_HOURS = 3;
          if (awayMs >= MIN_AWAY_MS) {
            const cappedHours = Math.min(awayMs / 3_600_000, MAX_OFFLINE_HOURS);
            const earned = Math.floor(profitPerHour * cappedHours);
            if (earned >= 1) setOfflineEarnings({ amount: earned, awayMs });
          }
        }
        localStorage.setItem('lastOnlineAt', now.toString());
      }).catch(() => {
        localStorage.setItem('lastOnlineAt', Date.now().toString());
      });
    });
  }, [isSyncing, profitPerHour]);

  // Heartbeat so the next session knows when this one ended. Declared AFTER the
  // computation effect above so a mount-time run can't clobber lastOnlineAt first.
  useEffect(() => {
    const beat = () => localStorage.setItem('lastOnlineAt', Date.now().toString());
    const interval = setInterval(beat, 30_000);
    window.addEventListener('beforeunload', beat);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', beat);
      document.removeEventListener('visibilitychange', beat);
    };
  }, []);

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

  // Deducts `cost` from Mined buffer with priority: game points first, then ad points.
  // Returns false if total Mined is insufficient.
  const spendFromMined = (cost: number): boolean => {
    if (tempMiningPoints < cost) return false;
    const gamePts = Math.max(0, tempMiningPoints - adMiningPoints);
    if (gamePts < cost) {
      // Game points alone aren't enough — also deduct from ad portion.
      const adDeduct = cost - gamePts;
      setAdMiningPoints(p => Math.max(0, p - adDeduct));
    }
    setTempMiningPoints(p => p - cost);
    return true;
  };

  const buySkin = (skinId: number): boolean => {
    if (isHydrationPending()) return false;
    const skin = SKINS[skinId];
    if (!skin) return false;
    if (ownedSkinIds.includes(skinId)) {
      setEquippedSkinId(skinId);
      return true;
    }
    if (!spendFromMined(skin.price)) return false;
    setOwnedSkinIds(prev => (prev.includes(skinId) ? prev : [...prev, skinId]));
    setEquippedSkinId(skinId);
    return true;
  };

  const claimEarnings = async (): Promise<{ convertedSkp: number; receivedSkx: number } | null> => {
    if (isHydrationPending()) return null;
    if (isTelegramUser) {
      // Server-side SKP → SKX conversion (authoritative, tamper-proof): the
      // server converts the entire SKP buffer at skpToSkxConversionRate% into
      // the skx_balance column atomically and burns the rest.
      // Throws on failure so the UI can show an error instead of a false success.
      const res = await apiFetch('/vault/convert', { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok) throw new Error('Convert failed');
      const data = await res.json();
      const state = (data.state ?? {}) as Partial<SyncedState>;
      if (typeof data.user?.skxBalance === 'number') setSkxBalance(data.user.skxBalance);
      setTempMiningPoints(typeof state.tempMiningPoints === 'number' ? state.tempMiningPoints : 0);
      setAdMiningPoints(typeof state.adMiningPoints === 'number' ? state.adMiningPoints : 0);
      return {
        convertedSkp: typeof data.convertedSkp === 'number' ? data.convertedSkp : 0,
        receivedSkx: typeof data.receivedSkx === 'number' ? data.receivedSkx : 0,
      };
    }
    // Local (non-Telegram) fallback: same conversion computed locally at the
    // admin-set rate (the remainder is burned, mirroring the server).
    const buffer = Math.floor(tempMiningPoints);
    const receivedSkx = Math.floor((buffer * skpToSkxRate.current) / 100);
    setSkxBalance(prev => prev + receivedSkx);
    setTempMiningPoints(0);
    setAdMiningPoints(0);
    return { convertedSkp: buffer, receivedSkx };
  };

  const upgradeMiningLevel = (cost: number, newLevel: number) => {
    if (isHydrationPending()) return;
    if (spendFromMined(cost)) {
      setMiningLevel(newLevel);
    }
  };

  const expandBattery = (cost: number) => {
    if (isHydrationPending()) return;
    if (maxEnergy < 200 && spendFromMined(cost)) {
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
      // Tapping fills the Mined buffer (tempMiningPoints) fully.
      // The rate (gameToSpendablePercent) is applied only at Claim time,
      // so the on-screen Mined counter always reflects real tap work.
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
      const farmPts = 4000;
      setTempMiningPoints(p => p + farmPts);
      setLifetimePoints(p => p + farmPts);
      setFarmState('idle');
      setFarmStartTime(0);
    }
  };

  const buyPassiveCard = (cardId: string, cost: number, newLevel: number, newPtsPerHour: number, name: string) => {
    if (isHydrationPending()) return;
    if (spendFromMined(cost)) {
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

  // Client-side bonus points (e.g. tap combo, mini-games). Added to Mined
  // buffer fully; rate is applied at Claim time, not here.
  const addBonusPoints = (n: number) => {
    if (isHydrationPending() || n <= 0) return;
    setLifetimePoints(p => p + n);
    setTempMiningPoints(p => p + n);
  };

  const WELCOME_REWARD = 2500;
  const claimWelcomeReward = () => {
    if (isHydrationPending() || hasClaimedWelcome) return;
    setHasClaimedWelcome(true);
    setLifetimePoints(p => p + WELCOME_REWARD);
    setTempMiningPoints(p => p + WELCOME_REWARD);
    haptic('success');
  };

  const claimOfflineEarnings = () => {
    if (isHydrationPending() || !offlineEarnings) return;
    setTempMiningPoints(p => p + offlineEarnings.amount);
    setLifetimePoints(p => p + offlineEarnings.amount);
    setOfflineEarnings(null);
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
      setAdMiningPoints(typeof state.adMiningPoints === 'number' ? state.adMiningPoints : 0);
      setClaimedPoints(typeof state.claimedPoints === 'number' ? state.claimedPoints : 0);
      setSkxBalance(typeof data.user.skxBalance === 'number' ? data.user.skxBalance : 0);
      setMiningLevel(typeof state.miningLevel === 'number' ? state.miningLevel : 1);
      setEnergy(typeof state.energy === 'number' ? state.energy : 100);
      setMaxEnergy(typeof state.maxEnergy === 'number' ? state.maxEnergy : 100);
      setTotalReferrals(typeof data.user.referralCount === 'number' ? data.user.referralCount : 0);
      setReferralEarnings(typeof data.user.referralEarnings === 'number' ? data.user.referralEarnings : 0);
      setLifetimePoints(typeof data.user.lifetimePoints === 'number' ? data.user.lifetimePoints : 0);
      setWithdrawnPoints(typeof data.user.withdrawnPoints === 'number' ? data.user.withdrawnPoints : 0);
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
      if (typeof data.redeemedBonus === 'number' && data.redeemedBonus > 0) {
        setBonusReward(data.redeemedBonus);
        haptic('success');
      }
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
        adMiningPoints,
        claimedPoints,
        skxBalance,
        miningLevel,
        energy,
        maxEnergy,
        totalReferrals,
        referralEarnings,
        lifetimePoints,
        withdrawnPoints,
        // Withdrawable balance = SKX. The server already deducts skx_balance on
        // withdrawal requests, so no client-side subtraction is needed.
        // lifetimePoints (SKP lifetime) is leaderboard-only and NOT withdrawable.
        availablePoints: Math.max(0, skxBalance),
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
        offlineEarnings,
        claimOfflineEarnings,
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
        bonusReward,
        dismissBonusReward,
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
