import { useEffect, useRef, useState, useCallback } from 'react';
import { useLanguage } from '../lib/i18n';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import { Battery, Zap, Gamepad2, TrendingUp, Pickaxe, Sun, Wind, Server, Cpu, Timer, Brain, Sparkles, ArrowLeft, Sword, Layers, PlayCircle, Tv, Trophy, Clock, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { KnifeHitGame } from '../games/KnifeHitGame';
import { StackTowerGame } from '../games/StackTowerGame';
import { watchRewardedAdWithFallback, isNoFillError } from '../lib/adFallback';
import { getPublicConfig, type PublicConfig } from '../lib/gameApi';

// ─── Competitions ────────────────────────────────────────────────────────────

type CompetitionEntry = {
  id: number;
  title: string;
  description: string | null;
  prizePoints: number;
  entryFeeStars: number;
  maxEntries: number | null;
  status: string;
  type: string;
  endAt: string;
  entered: boolean;
  myProgress: number;
};

function formatTimeLeft(endAt: string, tr: ReturnType<typeof import('../lib/i18n').useLanguage>['tr']): string {
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return tr.games.ended;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}${tr.games.timeDay} ${h % 24}${tr.games.timeHour}`;
  return `${h}${tr.games.timeHour} ${m}${tr.games.timeMin}`;
}

function CompetitionsSection() {
  const { isTelegramUser } = useVault();
  const [comps, setComps] = useState<CompetitionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState<number | null>(null);
  const { toast } = useToast();
  const { tr } = useLanguage();

  async function load() {
    try {
      const r = await fetch('/api/competitions', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json() as { competitions: CompetitionEntry[] };
      setComps(data.competitions.filter(c => c.status === 'active' && c.type !== 'referral'));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleEnter(comp: CompetitionEntry) {
    if (!isTelegramUser) {
      toast({ title: tr.games.telegramOnlyTitle, description: tr.games.telegramOnlyDesc, variant: 'destructive' });
      return;
    }
    setEntering(comp.id);
    try {
      const r = await fetch(`/api/competitions/${comp.id}/invoice`, { method: 'POST', credentials: 'include' });
      const data = await r.json() as { invoiceUrl?: string; error?: string };
      if (!r.ok) {
        toast({ title: tr.games.failedToOpenPayment, description: data.error, variant: 'destructive' });
        return;
      }
      const webApp = (window as { Telegram?: { WebApp?: { openInvoice?: (url: string, cb: (s: string) => void) => void } } }).Telegram?.WebApp;
      if (webApp?.openInvoice && data.invoiceUrl) {
        webApp.openInvoice(data.invoiceUrl, (status) => {
          if (status === 'paid') {
            toast({ title: tr.games.enteredTitle, description: tr.games.enteredDesc });
            setTimeout(() => void load(), 1500);
          }
        });
      }
    } catch {
      toast({ title: tr.games.failedToOpenPayment, variant: 'destructive' });
    } finally {
      setEntering(null);
    }
  }

  if (loading || comps.length === 0) return null;

  return (
    <div className="px-4 mt-6">
      <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-400" /> {tr.games.competitions}
      </h2>
      <div className="space-y-3">
        {comps.map(c => (
          <div key={c.id} className="bg-card/40 backdrop-blur-md border border-yellow-400/20 rounded-[20px] p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/5 rounded-full blur-[40px] pointer-events-none" />
            <div className="flex items-start justify-between gap-3 relative z-10">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-white text-sm tracking-tight">{c.title}</h3>
                {c.description && <p className="text-[11px] text-muted-foreground mt-1">{c.description}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-yellow-400" /> {tr.games.ptsPrize(c.prizePoints.toLocaleString())}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTimeLeft(c.endAt, tr)}</span>
                  {c.maxEntries && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {tr.games.maxEntries(c.maxEntries)}</span>}
                </div>
                {c.entered && (
                  <div className="mt-2 text-[11px] bg-primary/10 text-primary px-2 py-1 rounded-lg inline-block border border-primary/20 font-bold">
                    {tr.games.enteredStatus((c.myProgress ?? 0).toLocaleString())}
                  </div>
                )}
              </div>
              {!c.entered ? (
                <button
                  onClick={() => void handleEnter(c)}
                  disabled={entering === c.id}
                  className="shrink-0 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
                >
                  {entering === c.id ? '...' : `${c.entryFeeStars} ⭐`}
                </button>
              ) : (
                <span className="shrink-0 text-primary text-xs font-bold">{tr.games.enteredShort}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type GameState = 'idle' | 'playing' | 'gameover';
type GameId = 'speed-tap' | 'memory-match' | 'lucky-wheel' | 'knife-hit' | 'stack-tower';

// ---- Daily plays system ----
const FREE_PLAYS_PER_DAY = 3;
const MAX_EXTRA_PLAYS_PER_DAY = 3;

type DailyPlays = {
  playsLeft: number;
  extraPlaysLeft: number;
  watchingAd: boolean;
  usePlay: () => boolean;
  watchAdForPlay: () => Promise<void>;
};

function useDailyGamePlays(gameId: string): DailyPlays {
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `gameDaily_${gameId}`;

  const readFresh = useCallback((): { playsUsed: number; extraPlays: number } => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { playsUsed: 0, extraPlays: 0 };
      const s = JSON.parse(raw) as { date: string; playsUsed: number; extraPlays: number };
      if (s.date !== today) return { playsUsed: 0, extraPlays: 0 };
      return { playsUsed: s.playsUsed, extraPlays: s.extraPlays };
    } catch { return { playsUsed: 0, extraPlays: 0 }; }
  }, [storageKey, today]);

  const [stored, setStored] = useState(readFresh);
  const [watchingAd, setWatchingAd] = useState(false);
  const configRef = useRef<PublicConfig | null>(null);

  const save = useCallback((next: { playsUsed: number; extraPlays: number }) => {
    localStorage.setItem(storageKey, JSON.stringify({ date: today, ...next }));
    setStored(next);
  }, [storageKey, today]);

  const playsLeft = Math.max(0, FREE_PLAYS_PER_DAY + stored.extraPlays - stored.playsUsed);
  const extraPlaysLeft = MAX_EXTRA_PLAYS_PER_DAY - stored.extraPlays;

  const usePlay = useCallback((): boolean => {
    const fresh = readFresh();
    const left = Math.max(0, FREE_PLAYS_PER_DAY + fresh.extraPlays - fresh.playsUsed);
    if (left <= 0) return false;
    save({ ...fresh, playsUsed: fresh.playsUsed + 1 });
    return true;
  }, [readFresh, save]);

  const watchAdForPlay = useCallback(async (): Promise<void> => {
    const fresh = readFresh();
    if (MAX_EXTRA_PLAYS_PER_DAY - fresh.extraPlays <= 0 || watchingAd) return;
    if (!configRef.current) configRef.current = await getPublicConfig();
    setWatchingAd(true);
    try {
      await watchRewardedAdWithFallback(configRef.current);
      const fresh2 = readFresh();
      save({ ...fresh2, extraPlays: fresh2.extraPlays + 1 });
    } catch { /* user dismissed or no ad fill */ } finally {
      setWatchingAd(false);
    }
  }, [readFresh, save, watchingAd]);

  return { playsLeft, extraPlaysLeft, watchingAd, usePlay, watchAdForPlay };
}

const PASSIVE_CARDS = [
  { id: 'mining-rig', name: 'Mining Rig', base: 25, levelCost: (lvl: number) => lvl * 2000, icon: Pickaxe },
  { id: 'solar-farm', name: 'Solar Farm', base: 100, levelCost: (lvl: number) => lvl * 8000, icon: Sun },
  { id: 'wind-turbine', name: 'Wind Turbine', base: 250, levelCost: (lvl: number) => lvl * 20000, icon: Wind },
  { id: 'data-center', name: 'Data Center', base: 750, levelCost: (lvl: number) => lvl * 60000, icon: Server },
  { id: 'quantum-chip', name: 'Quantum Chip', base: 2500, levelCost: (lvl: number) => lvl * 200000, icon: Cpu },
  { id: 'black-hole', name: 'Black Hole Miner', base: 10000, levelCost: (lvl: number) => lvl * 800000, icon: Zap },
];

const GAME_LIST: { id: GameId; name: string; desc: string; icon: typeof Gamepad2; color: string }[] = [
  { id: 'speed-tap', name: 'Speed Tap', desc: '10 seconds, tap as fast as you can', icon: Timer, color: '#60A5FA' },
  { id: 'memory-match', name: 'Memory Match', desc: 'Match all pairs before time runs out', icon: Brain, color: '#34D399' },
  { id: 'lucky-wheel', name: 'Lucky Wheel', desc: '3 free spins a day, pure luck', icon: Sparkles, color: '#F472B6' },
];

const CARD_COLORS: Record<string, { from: string; to: string; border: string; text: string; shadow: string }> = {
  'mining-rig':   { from: 'rgba(245,158,11,0.14)', to: 'rgba(245,158,11,0.02)', border: 'rgba(245,158,11,0.22)', text: '#fbbf24', shadow: 'rgba(245,158,11,0.12)' },
  'solar-farm':   { from: 'rgba(234,179,8,0.14)',  to: 'rgba(234,179,8,0.02)',  border: 'rgba(234,179,8,0.22)',  text: '#fde047', shadow: 'rgba(234,179,8,0.12)' },
  'wind-turbine': { from: 'rgba(56,189,248,0.14)', to: 'rgba(56,189,248,0.02)', border: 'rgba(56,189,248,0.22)', text: '#38bdf8', shadow: 'rgba(56,189,248,0.12)' },
  'data-center':  { from: 'rgba(139,92,246,0.14)', to: 'rgba(139,92,246,0.02)', border: 'rgba(139,92,246,0.22)', text: '#a78bfa', shadow: 'rgba(139,92,246,0.12)' },
  'quantum-chip': { from: 'rgba(16,185,129,0.14)', to: 'rgba(16,185,129,0.02)', border: 'rgba(16,185,129,0.22)', text: '#34d399', shadow: 'rgba(16,185,129,0.12)' },
  'black-hole':   { from: 'rgba(239,68,68,0.14)',  to: 'rgba(239,68,68,0.02)',  border: 'rgba(239,68,68,0.22)',  text: '#f87171', shadow: 'rgba(239,68,68,0.12)' },
};

// Premium cards require 10 videos at level 1, scaling up to 15
const PREMIUM_CARD_IDS = new Set(['quantum-chip', 'black-hole']);

// Videos needed to unlock a given level (Level 1 → 2, Level 2 → 3, ...)
// Premium cards: start at 10, max 15. Others: start at 2, max 7.
const videosForLevel = (nextLevel: number, cardId?: string) =>
  PREMIUM_CARD_IDS.has(cardId ?? '')
    ? Math.min(nextLevel + 9, 15)
    : Math.min(nextLevel + 1, 7);

// localStorage key for per-card video progress
const passiveAdKey = (cardId: string, nextLevel: number) => `passiveAdProg_${cardId}_lv${nextLevel}`;

// Cooldown between consecutive passive-card ad views (ms)
const PASSIVE_AD_COOLDOWN_MS = 30_000;

export const GamesTab = () => {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);

  const { tempMiningPoints, miningLevel, maxEnergy, upgradeMiningLevel, expandBattery, passiveCards, buyPassiveCard, profitPerHour } = useVault();
  const { toast } = useToast();
  const { tr } = useLanguage();

  // Daily play limits — must be called before any early returns (React rules)
  const speedTapPlays = useDailyGamePlays('speed-tap');
  const memoryMatchPlays = useDailyGamePlays('memory-match');
  const luckyWheelPlays = useDailyGamePlays('lucky-wheel');

  const nextLevelCost = miningLevel === 1 ? 10000 : miningLevel === 2 ? 50000 : miningLevel === 3 ? 200000 : null;
  const batteryCost = 30000;
  const hasBatteryUpgrade = maxEnergy >= 200;

  // ── Passive-card video upgrade state ──────────────────────────────────────
  const [passiveConfig, setPassiveConfig] = useState<PublicConfig | null>(null);
  const [loadingAdForCard, setLoadingAdForCard] = useState<string | null>(null);
  // Per-card video progress, keyed by `cardId_lv${nextLevel}` → videos watched
  const [passiveAdProgress, setPassiveAdProgress] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('passiveAdProgress') || '{}') as Record<string, number>; }
    catch { return {}; }
  });
  // Last time any passive-card ad completed — for 30s cooldown
  const lastPassiveAdAt = useRef<number>(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    getPublicConfig().then(setPassiveConfig).catch(() => {});
  }, []);

  // Tick down cooldown display
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lastPassiveAdAt.current + PASSIVE_AD_COOLDOWN_MS - Date.now()) / 1000));
      setCooldownLeft(remaining);
    }, 500);
    return () => clearInterval(id);
  }, [cooldownLeft]);

  const savePassiveAdProgress = (next: Record<string, number>) => {
    setPassiveAdProgress(next);
    localStorage.setItem('passiveAdProgress', JSON.stringify(next));
  };

  const handleWatchAdForPassive = async (
    cardId: string,
    nextLevel: number,
    nextYield: number,
    name: string,
  ) => {
    if (loadingAdForCard) return;

    // Enforce 30-second cooldown between ad views
    const elapsed = Date.now() - lastPassiveAdAt.current;
    if (elapsed < PASSIVE_AD_COOLDOWN_MS) {
      const secs = Math.ceil((PASSIVE_AD_COOLDOWN_MS - elapsed) / 1000);
      toast({ title: 'Please wait', description: `Wait ${secs}s before watching the next ad` });
      return;
    }

    setLoadingAdForCard(cardId);
    try {
      await watchRewardedAdWithFallback(passiveConfig);

      lastPassiveAdAt.current = Date.now();
      setCooldownLeft(Math.ceil(PASSIVE_AD_COOLDOWN_MS / 1000));

      const key = passiveAdKey(cardId, nextLevel);
      const needed = videosForLevel(nextLevel, cardId);
      const current = passiveAdProgress[key] ?? 0;
      const next = current + 1;

      if (next >= needed) {
        // All videos watched — upgrade the card for free!
        buyPassiveCard(cardId, 0, nextLevel, nextYield, name);
        haptic('success');
        toast({ title: '🎉 Card Upgraded!', description: `${name} → Level ${nextLevel} unlocked by watching videos` });
        // Clear progress for this level
        const updated = { ...passiveAdProgress };
        delete updated[key];
        savePassiveAdProgress(updated);
      } else {
        haptic('light');
        toast({ title: '📺 Video watched!', description: `${next}/${needed} — keep going to unlock Level ${nextLevel}` });
        savePassiveAdProgress({ ...passiveAdProgress, [key]: next });
      }
    } catch (err) {
      if (isNoFillError(err)) {
        toast({ title: 'No ad available', description: 'No video available right now — try again in a moment' });
      } else if (err instanceof Error && (err.message.includes('dismiss') || err.message.includes('close') || err.message.includes('cancel'))) {
        // User closed the ad — silent, no toast
      } else {
        toast({ title: 'Video not completed', description: 'Please watch the full video to get credit' });
      }
    } finally {
      setLoadingAdForCard(null);
    }
  };

  const gameI18n: Record<string, { name: string; desc: string }> = {
    'speed-tap': tr.games.speedTap,
    'memory-match': tr.games.memoryMatch,
    'lucky-wheel': tr.games.luckyWheel,
  };

  const playsMap: Record<string, DailyPlays> = {
    'speed-tap': speedTapPlays,
    'memory-match': memoryMatchPlays,
    'lucky-wheel': luckyWheelPlays,
  };

  const handleBuyLevel = () => {
    if (nextLevelCost && tempMiningPoints >= nextLevelCost) {
      upgradeMiningLevel(nextLevelCost, miningLevel + 1);
      haptic('success');
      toast({ title: tr.games.upgradedTitle, description: tr.games.nowLevel(miningLevel + 1) });
    }
  };

  const handleBuyBattery = () => {
    if (tempMiningPoints >= batteryCost && !hasBatteryUpgrade) {
      expandBattery(batteryCost);
      haptic('success');
      toast({ title: tr.games.upgradedTitle, description: tr.games.batteryUpgraded });
    }
  };

  if (activeGame === 'speed-tap') return <SpeedTapGame onBack={() => setActiveGame(null)} plays={speedTapPlays} />;
  if (activeGame === 'memory-match') return <MemoryMatchGame onBack={() => setActiveGame(null)} plays={memoryMatchPlays} />;
  if (activeGame === 'lucky-wheel') return <LuckyWheelGame onBack={() => setActiveGame(null)} plays={luckyWheelPlays} />;
  if (activeGame === 'knife-hit') return <KnifeHitGame onBack={() => setActiveGame(null)} />;
  if (activeGame === 'stack-tower') return <StackTowerGame onBack={() => setActiveGame(null)} />;

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-500">

      {/* ── Mini Games ── */}
      <div className="px-4 pt-1">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-3.5 h-3.5 text-purple-400/60" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-purple-400/60">Mini Games</span>
          <div className="flex-1 h-px bg-gradient-to-r from-purple-400/20 to-transparent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { haptic('select'); setActiveGame('stack-tower'); }}
            className="rounded-[18px] p-4 flex flex-col items-start gap-2 active:scale-95 transition-transform relative overflow-hidden"
            style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.18)' }}
          >
            <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl pointer-events-none" style={{ background: 'rgba(52,211,153,0.08)' }} />
            <div className="w-11 h-11 rounded-[14px] flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)' }}>
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">Stack Tower</p>
              <p className="text-[10px] text-white/40 mt-0.5">ابنِ برجاً، اكسب النقاط</p>
            </div>
            <div className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/15 px-2 py-0.5 rounded-full">
              🎯 الهدف: 15 مكعباً
            </div>
          </button>

          <button
            onClick={() => { haptic('select'); setActiveGame('knife-hit'); }}
            className="rounded-[18px] p-4 flex flex-col items-start gap-2 active:scale-95 transition-transform relative overflow-hidden"
            style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.18)' }}
          >
            <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl pointer-events-none" style={{ background: 'rgba(251,146,60,0.08)' }} />
            <div className="w-11 h-11 rounded-[14px] flex items-center justify-center" style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.2)' }}>
              <Sword className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">Knife Hit</p>
              <p className="text-[10px] text-white/40 mt-0.5">ارمِ السكاكين، لا تصطدم</p>
            </div>
            <div className="text-[9px] font-bold text-orange-400 bg-orange-400/10 border border-orange-400/15 px-2 py-0.5 rounded-full">
              🗡️ +30 لكل إصابة
            </div>
          </button>
        </div>
      </div>

      {/* ── Passive Income Cards ── */}
      <div className="px-4 mt-7">
        <div className="flex items-center gap-2 mb-3">
          <Pickaxe className="w-3.5 h-3.5 text-primary/60" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary/60">{tr.games.passiveIncome}</span>
          <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {PASSIVE_CARDS.map(def => {
            const ownedCard = passiveCards.find(c => c.id === def.id);
            const level = ownedCard ? ownedCard.level : 0;
            const nextLevel = level + 1;
            const cost = def.levelCost(nextLevel);
            const currentYield = ownedCard ? ownedCard.ptsPerHour : 0;
            const nextYield = def.base * nextLevel;
            const Icon = def.icon;
            const col = CARD_COLORS[def.id] ?? CARD_COLORS['mining-rig'];
            const canAfford = tempMiningPoints >= cost;

            // Video upgrade state for this card
            const needed = videosForLevel(nextLevel, def.id);
            const adKey = passiveAdKey(def.id, nextLevel);
            const watched = passiveAdProgress[adKey] ?? 0;
            const isAdLoading = loadingAdForCard === def.id;
            const adReady = !!(passiveConfig?.adsgram.enabled && passiveConfig.adsgram.blockId)
              || !!(passiveConfig?.monetag.enabled && passiveConfig.monetag.zoneId)
              || !!(passiveConfig?.onclicka.enabled && passiveConfig.onclicka.spotId);

            return (
              <div key={def.id} className="relative rounded-[20px] overflow-hidden flex flex-col" style={{
                background: `linear-gradient(145deg, ${col.from} 0%, ${col.to} 100%)`,
                border: `1px solid ${col.border}`,
                boxShadow: level > 0 ? `0 4px 24px ${col.shadow}` : 'none',
              }}>
                {/* Level badge */}
                <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[9px] font-black" style={{
                  background: level > 0 ? `${col.text}28` : 'rgba(255,255,255,0.07)',
                  color: level > 0 ? col.text : 'rgba(255,255,255,0.3)',
                  border: `1px solid ${level > 0 ? `${col.text}44` : 'rgba(255,255,255,0.08)'}`,
                }}>Lv {level}</div>
                {/* Icon */}
                <div className="flex justify-center pt-6 pb-2">
                  <div className="w-12 h-12 rounded-[16px] flex items-center justify-center" style={{
                    background: `radial-gradient(circle at 40% 35%, ${col.text}30, ${col.text}10)`,
                    border: `1px solid ${col.border}`,
                    boxShadow: `0 0 20px ${col.shadow}`,
                  }}>
                    <Icon className="w-5 h-5" style={{ color: col.text, filter: `drop-shadow(0 0 6px ${col.text})` }} />
                  </div>
                </div>
                {/* Name & Yield */}
                <div className="px-3 pb-1 flex-1 text-center">
                  <p className="text-[12px] font-bold text-white leading-tight">{tr.games.passiveCards[def.id] ?? def.name}</p>
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: level > 0 ? '#34d399' : 'rgba(255,255,255,0.3)' }}>
                    +{currentYield.toLocaleString()}<span className="text-[9px] opacity-70">/hr</span>
                  </p>
                  {nextYield > currentYield && (
                    <p className="text-[9px] mt-0.5" style={{ color: col.text, opacity: 0.65 }}>→ +{nextYield.toLocaleString()}/hr</p>
                  )}
                </div>
                {/* Upgrade Buttons */}
                <div className="px-2.5 pb-2.5 pt-2 flex flex-col gap-1.5">
                  {/* Points button */}
                  <button
                    data-testid={`buy-passive-${def.id}`}
                    onClick={() => { buyPassiveCard(def.id, cost, nextLevel, nextYield, def.name); haptic('light'); }}
                    disabled={!canAfford}
                    className="w-full py-1.5 rounded-xl text-[10px] font-bold transition-all active:scale-[0.97] disabled:opacity-40"
                    style={canAfford ? {
                      background: `linear-gradient(135deg, ${col.text}, ${col.text}bb)`,
                      color: '#000',
                      boxShadow: `0 2px 12px ${col.shadow}`,
                    } : {
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {tr.games.buyLv}{nextLevel} · {cost.toLocaleString()}
                  </button>

                  {/* Video upgrade option */}
                  {adReady && (
                    <>
                      {/* Divider */}
                      <div className="flex items-center gap-1.5 px-1">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-[8px] text-white/30 font-medium">OR</span>
                        <div className="flex-1 h-px bg-white/10" />
                      </div>

                      {/* Video progress bar (only when in progress) */}
                      {watched > 0 && (
                        <div className="px-1">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[8px] text-white/40">Videos</span>
                            <span className="text-[8px] font-bold" style={{ color: col.text }}>{watched}/{needed}</span>
                          </div>
                          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${(watched / needed) * 100}%`, background: col.text }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Watch video button */}
                      <button
                        onClick={() => void handleWatchAdForPassive(def.id, nextLevel, nextYield, def.name)}
                        disabled={isAdLoading || !!loadingAdForCard}
                        className="w-full py-1.5 rounded-xl text-[10px] font-bold transition-all active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-1"
                        style={{
                          background: 'rgba(255,255,255,0.08)',
                          color: isAdLoading ? col.text : 'rgba(255,255,255,0.7)',
                          border: `1px solid ${col.text}33`,
                        }}
                      >
                        {isAdLoading ? (
                          <>
                            <span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />
                            <span>Loading…</span>
                          </>
                        ) : cooldownLeft > 0 && !loadingAdForCard ? (
                          <>
                            <PlayCircle className="w-3 h-3 opacity-50" />
                            <span className="opacity-60">{cooldownLeft}s</span>
                          </>
                        ) : (
                          <>
                            <PlayCircle className="w-3 h-3" style={{ color: col.text }} />
                            <span>{watched === 0 ? `${needed} videos` : `${watched}/${needed}`}</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Booster Upgrades ── */}
      <div className="px-4 mt-7 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-boost/60" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-boost/60">{tr.games.boosterUpgrades}</span>
          <div className="flex-1 h-px bg-gradient-to-r from-boost/20 to-transparent" />
        </div>
        <div className="rounded-[20px] p-4 flex items-center gap-4"
          style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.1)' }}>
          <div className="bg-primary/10 p-3 rounded-xl border border-primary/15 shrink-0">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-sm">{tr.games.laserDrill}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{tr.games.laserDrillDesc}</p>
            <div className="text-[10px] px-2 py-0.5 rounded-md inline-block mt-1.5 font-bold border border-primary/20"
              style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399' }}>
              {tr.games.levelActive(miningLevel)}
            </div>
          </div>
          <div className="shrink-0">
            {miningLevel < 4 ? (
              <button data-testid="button-buy-drill" onClick={handleBuyLevel}
                disabled={tempMiningPoints < (nextLevelCost || 0)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(52,211,153,0.25)] active:scale-[0.98] whitespace-nowrap">
                {nextLevelCost?.toLocaleString()} pts
              </button>
            ) : (
              <span className="text-xs text-primary font-bold px-3 bg-primary/10 border border-primary/20 py-2 rounded-xl">{tr.games.max}</span>
            )}
          </div>
        </div>
        <div className="rounded-[20px] p-4 flex items-center gap-4"
          style={{ background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.1)' }}>
          <div className="bg-cyan-500/10 p-3 rounded-xl border border-cyan-500/15 shrink-0">
            <Battery className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-sm">{tr.games.batteryExpansion}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{tr.games.batteryDesc}</p>
          </div>
          <div className="shrink-0">
            {hasBatteryUpgrade ? (
              <span className="text-xs text-cyan-400 font-bold px-3 bg-cyan-500/10 border border-cyan-500/20 py-2 rounded-xl">{tr.games.installed}</span>
            ) : (
              <button data-testid="button-buy-battery" onClick={handleBuyBattery}
                disabled={tempMiningPoints < batteryCost}
                className="bg-cyan-500 hover:bg-cyan-400 text-cyan-950 text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(34,211,238,0.25)] active:scale-[0.98] whitespace-nowrap">
                {batteryCost.toLocaleString()} pts
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Daily Games ── */}
      <div className="px-4 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-pink-400/60" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-pink-400/60">Daily Games</span>
          <div className="flex-1 h-px bg-gradient-to-r from-pink-400/20 to-transparent" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GAME_LIST.map((g) => {
            const Icon = g.icon;
            const plays = playsMap[g.id];
            const playsLeft = plays?.playsLeft ?? FREE_PLAYS_PER_DAY;
            const noPlays = playsLeft <= 0;
            return (
              <button key={g.id} data-testid={`open-game-${g.id}`}
                onClick={() => { haptic('select'); setActiveGame(g.id); }}
                className="rounded-xl p-3 flex flex-col items-center gap-2 active:scale-95 transition-transform relative"
                style={{ background: `${g.color}0a`, border: `1px solid ${g.color}22` }}>
                {plays && (
                  <div className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-bold px-1"
                    style={!noPlays ? { background: `${g.color}28`, color: g.color } : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>
                    {playsLeft}
                  </div>
                )}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${g.color}18`, border: `1px solid ${g.color}22`, opacity: noPlays ? 0.4 : 1 }}>
                  <Icon className="w-5 h-5" style={{ color: g.color }} />
                </div>
                <p className={`text-[10px] font-bold text-center leading-tight ${noPlays ? 'text-white/30' : 'text-white/80'}`}>
                  {gameI18n[g.id]?.name ?? g.name}
                </p>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
};

const GameHeader = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <div className="flex items-center gap-3 px-4 pt-4 pb-4">
    <button data-testid="button-back-to-games" onClick={onBack} className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 active:scale-[0.9] transition-all border border-white/5">
      <ArrowLeft className="w-4 h-4 text-white" />
    </button>
    <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
  </div>
);

// ---- Shared UI helpers for daily play limits ----

const DailyPlaysBar = ({ plays }: { plays: DailyPlays }) => {
  const { tr } = useLanguage();
  return (
    <div className="w-full flex items-center justify-between bg-white/5 border border-white/8 rounded-xl px-4 py-2.5">
      <div className="flex items-center gap-1.5">
        <PlayCircle className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-white">
          {plays.playsLeft} <span className="text-muted-foreground font-normal">/ {FREE_PLAYS_PER_DAY + (MAX_EXTRA_PLAYS_PER_DAY - plays.extraPlaysLeft)}</span>
        </span>
        <span className="text-xs text-muted-foreground">{tr.games.playsLeftToday}</span>
      </div>
      <div className="flex items-center gap-1">
        <Tv className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{tr.games.adsAvailable(plays.extraPlaysLeft)}</span>
      </div>
    </div>
  );
};

const WatchAdButton = ({ plays }: { plays: DailyPlays }) => {
  const { tr } = useLanguage();
  return (
    <div className="w-full flex flex-col items-center gap-3 mt-1">
      <p className="text-sm text-muted-foreground text-center">{tr.games.noPlaysLeft}</p>
      {plays.extraPlaysLeft > 0 ? (
        <button
          onClick={plays.watchAdForPlay}
          disabled={plays.watchingAd}
          className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary px-6 py-3 rounded-xl font-bold active:scale-[0.98] transition-all w-full justify-center disabled:opacity-50"
        >
          <Tv className="w-4 h-4" />
          {plays.watchingAd ? tr.games.loadingAd : tr.games.watchAdForPlay}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground text-center bg-white/5 rounded-xl px-4 py-3 w-full">{tr.games.noAdsLeft}</p>
      )}
    </div>
  );
};

// ---------------- Speed Tap ----------------

const SPEED_TAP_DURATION = 10;
const SPEED_TAP_PTS_PER_TAP = 8;
const SPEED_TAP_MAX_TAPS = 200;
const SPEED_TAP_MAX_PER_SECOND = 20;

const SpeedTapGame = ({ onBack, plays }: { onBack: () => void; plays: DailyPlays }) => {
  const { setTempMiningPoints, addLifetimePoints } = useVault();
  const { tr } = useLanguage();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [taps, setTaps] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SPEED_TAP_DURATION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef(0);
  const tapCountRef = useRef(0);
  const tapTimestampsRef = useRef<number[]>([]);

  const start = () => {
    if (!plays.usePlay()) return;
    tapCountRef.current = 0;
    tapTimestampsRef.current = [];
    setTaps(0);
    setPhase('playing');
    setTimeLeft(SPEED_TAP_DURATION);
    endTimeRef.current = Date.now() + SPEED_TAP_DURATION * 1000;
    haptic('medium');
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remainingMs = endTimeRef.current - Date.now();
      if (remainingMs <= 0) {
        setTimeLeft(0);
        if (timerRef.current) clearInterval(timerRef.current);
        setPhase('done');
      } else {
        setTimeLeft(Math.ceil(remainingMs / 1000));
      }
    }, 100);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (phase === 'done' && tapCountRef.current > 0) {
      const earned = tapCountRef.current * SPEED_TAP_PTS_PER_TAP;
      setTempMiningPoints(prev => prev + earned);
      addLifetimePoints(earned);
      haptic('success');
    }
    // Runs once when transitioning into 'done' with the final tap count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleTap = () => {
    if (phase !== 'playing') return;
    if (tapCountRef.current >= SPEED_TAP_MAX_TAPS) return;
    const now = Date.now();
    tapTimestampsRef.current = tapTimestampsRef.current.filter(t => now - t < 1000);
    if (tapTimestampsRef.current.length >= SPEED_TAP_MAX_PER_SECOND) return;
    tapTimestampsRef.current.push(now);
    tapCountRef.current += 1;
    setTaps(tapCountRef.current);
    haptic('light');
  };

  const earned = taps * SPEED_TAP_PTS_PER_TAP;

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      <GameHeader title="Speed Tap" onBack={onBack} />
      <div className="mx-4 rounded-[24px] bg-card/60 backdrop-blur-xl border border-white/10 p-8 flex flex-col items-center gap-6 shadow-sm">
        {phase === 'idle' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(34,211,238,0.2)]">
              <Timer className="w-8 h-8 text-cyan-400" />
            </div>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">Tap the button as many times as you can in <span className="text-white font-bold">{SPEED_TAP_DURATION} seconds</span>.<br/>Each tap = <span className="text-primary font-bold">+{SPEED_TAP_PTS_PER_TAP} pts</span>.</p>
            <DailyPlaysBar plays={plays} />
            {plays.playsLeft > 0
              ? <button data-testid="button-start-speedtap" onClick={start} className="bg-primary hover:bg-primary/90 text-primary-foreground px-10 py-3.5 rounded-xl font-bold shadow-[0_0_20px_rgba(52,211,153,0.3)] active:scale-[0.98] transition-all w-full mt-2">Start Game</button>
              : <WatchAdButton plays={plays} />
            }
          </>
        )}

        {phase === 'playing' && (
          <>
            <div className="flex items-center justify-between w-full px-2">
              <div className="flex flex-col items-center">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Time Left</span>
                <span className="text-3xl font-black text-white tabular-nums">{timeLeft}s</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">Taps</span>
                <span className="text-3xl font-black text-primary tabular-nums">{taps}</span>
              </div>
            </div>
            <button
              data-testid="button-tap-speedtap"
              onClick={handleTap}
              className="w-48 h-48 rounded-full bg-gradient-to-b from-primary to-emerald-700 text-primary-foreground text-3xl font-black shadow-[0_0_50px_rgba(52,211,153,0.4)] active:scale-[0.92] transition-transform select-none border-4 border-white/20 mt-4 flex items-center justify-center"
            >
              TAP!
            </button>
          </>
        )}

        {phase === 'done' && (
          <>
            <h2 className="text-3xl font-black text-white tracking-tight mt-2">Time's Up!</h2>
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm text-muted-foreground font-medium uppercase tracking-widest">Total Taps</span>
              <span className="text-white text-5xl font-black">{taps}</span>
            </div>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-5 py-3 w-full justify-center shadow-inner mt-2">
              <TrendingUp className="w-5 h-5 text-primary shrink-0" />
              <span className="text-sm font-bold text-primary">+{earned.toLocaleString()} pts added to Vault!</span>
            </div>
            {plays.playsLeft > 0
              ? <button data-testid="button-again-speedtap" onClick={start} className="bg-white/10 hover:bg-white/20 border border-white/10 text-white px-8 py-3.5 rounded-xl font-bold active:scale-[0.98] transition-all text-sm w-full mt-2">{tr.games.playAgain(plays.playsLeft)}</button>
              : <WatchAdButton plays={plays} />
            }
          </>
        )}
      </div>
    </div>
  );
};

// ---------------- Memory Match ----------------

const MEMORY_EMOJIS = ['⚡', '💎', '🔥', '🌙', '⭐', '🪙'];
const MEMORY_TIME_LIMIT = 45;
const MEMORY_REWARD_PER_PAIR = 100;

type MemoryCard = { id: number; symbol: string; flipped: boolean; matched: boolean };

function buildMemoryDeck(): MemoryCard[] {
  const pairs = [...MEMORY_EMOJIS, ...MEMORY_EMOJIS];
  const deck = pairs
    .map((symbol, i) => ({ id: i, symbol, flipped: false, matched: false }))
    .sort(() => Math.random() - 0.5);
  return deck;
}

const MemoryMatchGame = ({ onBack, plays }: { onBack: () => void; plays: DailyPlays }) => {
  const { setTempMiningPoints, addLifetimePoints } = useVault();
  const { tr } = useLanguage();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MEMORY_TIME_LIMIT);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockRef = useRef(false);

  const start = () => {
    if (!plays.usePlay()) return;
    setCards(buildMemoryDeck());
    setSelected([]);
    setMatchedPairs(0);
    setTimeLeft(MEMORY_TIME_LIMIT);
    setPhase('playing');
    haptic('medium');
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase('done');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (matchedPairs === MEMORY_EMOJIS.length && phase === 'playing') {
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase('done');
      haptic('success');
    }
  }, [matchedPairs, phase]);

  useEffect(() => {
    if (phase === 'done') {
      const earned = matchedPairs * MEMORY_REWARD_PER_PAIR;
      if (earned > 0) {
        setTempMiningPoints(prev => prev + earned);
        addLifetimePoints(earned);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleFlip = (id: number) => {
    if (phase !== 'playing' || lockRef.current) return;
    const card = cards.find(c => c.id === id);
    if (!card || card.flipped || card.matched) return;
    if (selected.length >= 2) return;

    const nextCards = cards.map(c => (c.id === id ? { ...c, flipped: true } : c));
    setCards(nextCards);
    haptic('light');
    const nextSelected = [...selected, id];
    setSelected(nextSelected);

    if (nextSelected.length === 2) {
      lockRef.current = true;
      const [firstId, secondId] = nextSelected;
      const first = nextCards.find(c => c.id === firstId)!;
      const second = nextCards.find(c => c.id === secondId)!;

      if (first.symbol === second.symbol) {
        setTimeout(() => {
          setCards(prev => prev.map(c => (c.id === firstId || c.id === secondId ? { ...c, matched: true } : c)));
          setMatchedPairs(p => p + 1);
          setSelected([]);
          lockRef.current = false;
          haptic('success');
        }, 350);
      } else {
        setTimeout(() => {
          setCards(prev => prev.map(c => (c.id === firstId || c.id === secondId ? { ...c, flipped: false } : c)));
          setSelected([]);
          lockRef.current = false;
        }, 700);
      }
    }
  };

  const earned = matchedPairs * MEMORY_REWARD_PER_PAIR;

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      <GameHeader title="Memory Match" onBack={onBack} />
      <div className="mx-4 rounded-[24px] bg-card/60 backdrop-blur-xl border border-white/10 p-6 flex flex-col items-center gap-6 shadow-sm">
        {phase === 'idle' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.2)]">
              <Brain className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">Flip cards and match all <span className="text-white font-bold">{MEMORY_EMOJIS.length} pairs</span> within <span className="text-white font-bold">{MEMORY_TIME_LIMIT}s</span>.<br/>Each pair = <span className="text-primary font-bold">+{MEMORY_REWARD_PER_PAIR} pts</span>.</p>
            <DailyPlaysBar plays={plays} />
            {plays.playsLeft > 0
              ? <button data-testid="button-start-memory" onClick={start} className="bg-primary hover:bg-primary/90 text-primary-foreground px-10 py-3.5 rounded-xl font-bold shadow-[0_0_20px_rgba(52,211,153,0.3)] active:scale-[0.98] transition-all w-full mt-2">Start Game</button>
              : <WatchAdButton plays={plays} />
            }
          </>
        )}

        {phase === 'playing' && (
          <>
            <div className="w-full flex items-center justify-between bg-black/40 rounded-xl px-4 py-3 border border-white/5 shadow-inner">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Pairs Matched</span>
                <span className="text-lg font-bold text-primary tabular-nums leading-none">{matchedPairs} <span className="text-muted-foreground text-sm">/ {MEMORY_EMOJIS.length}</span></span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Time Left</span>
                <span className="text-lg font-bold text-white tabular-nums leading-none">{timeLeft}s</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2.5 w-full perspective-[1000px]">
              {cards.map(card => (
                <button
                  key={card.id}
                  data-testid={`memory-card-${card.id}`}
                  onClick={() => handleFlip(card.id)}
                  disabled={card.matched}
                  className={`aspect-square rounded-xl flex items-center justify-center text-3xl transition-all duration-300 transform-gpu ${
                    card.matched 
                      ? 'bg-primary/20 border border-primary/40 shadow-[0_0_15px_rgba(52,211,153,0.2)] rotate-y-180 scale-95' 
                      : card.flipped 
                        ? 'bg-cyan-500/20 border border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.2)] rotate-y-180' 
                        : 'bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.92] shadow-sm'
                  }`}
                >
                  <div className={`transition-opacity duration-200 ${card.flipped || card.matched ? 'opacity-100' : 'opacity-0'}`}>
                    {card.symbol}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <h2 className="text-3xl font-black text-white tracking-tight mt-2">{matchedPairs === MEMORY_EMOJIS.length ? 'Cleared!' : "Time's Up!"}</h2>
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm text-muted-foreground font-medium uppercase tracking-widest">Pairs Matched</span>
              <span className="text-white text-5xl font-black">{matchedPairs}<span className="text-xl text-muted-foreground">/{MEMORY_EMOJIS.length}</span></span>
            </div>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-5 py-3 w-full justify-center shadow-inner mt-2">
              <TrendingUp className="w-5 h-5 text-primary shrink-0" />
              <span className="text-sm font-bold text-primary">+{earned.toLocaleString()} pts added to Vault!</span>
            </div>
            {plays.playsLeft > 0
              ? <button data-testid="button-again-memory" onClick={start} className="bg-white/10 hover:bg-white/20 border border-white/10 text-white px-8 py-3.5 rounded-xl font-bold active:scale-[0.98] transition-all text-sm w-full mt-2">{tr.games.playAgain(plays.playsLeft)}</button>
              : <WatchAdButton plays={plays} />
            }
          </>
        )}
      </div>
    </div>
  );
};

// ---------------- Lucky Wheel ----------------

const WHEEL_SEGMENTS = [25, 50, 125, 250, 50, 500, 25, 2500];
const LuckyWheelGame = ({ onBack, plays }: { onBack: () => void; plays: DailyPlays }) => {
  const { setTempMiningPoints, addLifetimePoints } = useVault();
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [lastWin, setLastWin] = useState<number | null>(null);

  const spin = () => {
    if (isSpinning || plays.playsLeft <= 0) return;
    if (!plays.usePlay()) return;
    setIsSpinning(true);
    setLastWin(null);
    haptic('medium');

    const segmentAngle = 360 / WHEEL_SEGMENTS.length;
    const winningIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const winAmount = WHEEL_SEGMENTS[winningIndex];
    const targetAngle = 360 * 5 + (360 - winningIndex * segmentAngle - segmentAngle / 2);

    setRotation(prev => prev + targetAngle);

    setTimeout(() => {
      setIsSpinning(false);
      setLastWin(winAmount);
      setTempMiningPoints(prev => prev + winAmount);
      addLifetimePoints(winAmount);
      haptic(winAmount >= 1000 ? 'success' : 'light');
    }, 3200);
  };

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      <GameHeader title="Lucky Wheel" onBack={onBack} />
      <div className="mx-4 rounded-[24px] bg-card/60 backdrop-blur-xl border border-white/10 p-8 flex flex-col items-center gap-6 shadow-sm overflow-hidden relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/5 rounded-full blur-[60px] pointer-events-none" />

        <DailyPlaysBar plays={plays} />

        <div className="relative w-64 h-64 mt-2">
          <div className="absolute inset-0 rounded-full shadow-[0_0_50px_rgba(52,211,153,0.15)] animate-pulse" />
          <div
            className="w-full h-full rounded-full relative overflow-hidden border-8 border-background shadow-[0_0_0_2px_rgba(255,255,255,0.1)]"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning ? 'transform 3.2s cubic-bezier(0.15, 0.85, 0.25, 1)' : 'none',
              background: `conic-gradient(${WHEEL_SEGMENTS.map((_, i) => {
                const colors = ['hsl(var(--primary))', '#0A0D14', 'hsl(var(--primary))', '#0A0D14', 'hsl(var(--primary))', '#0A0D14', 'hsl(var(--primary))', '#0A0D14'];
                const start = (i / WHEEL_SEGMENTS.length) * 360;
                const end = ((i + 1) / WHEEL_SEGMENTS.length) * 360;
                return `${colors[i]} ${start}deg ${end}deg`;
              }).join(', ')})`,
            }}
          >
            {WHEEL_SEGMENTS.map((val, i) => {
              const segmentAngle = 360 / WHEEL_SEGMENTS.length;
              const angle = i * segmentAngle + segmentAngle / 2;
              return (
                <div
                  key={i}
                  className="absolute inset-0 flex items-start justify-center"
                  style={{ transform: `rotate(${angle}deg)` }}
                >
                  <span
                    className="text-[13px] font-black mt-5 tracking-tighter"
                    style={{ color: i % 2 === 0 ? '#0A0D14' : 'hsl(var(--primary))' }}
                  >
                    {val}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Wheel Pointer */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-8 drop-shadow-md z-20 flex flex-col items-center">
            <div className="w-4 h-4 bg-white rounded-full border-2 border-primary mb-[-8px] z-10" />
            <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[14px] border-l-transparent border-r-transparent border-t-white" />
          </div>

          {/* Wheel Center */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-background rounded-full border-4 border-primary/30 shadow-inner z-10 flex items-center justify-center">
            <div className="w-4 h-4 bg-primary rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
          </div>
        </div>

        {lastWin !== null && !isSpinning && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-5 py-2.5 w-full justify-center shadow-inner mt-2 animate-in slide-in-from-bottom-2 fade-in">
            <TrendingUp className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-bold text-primary">Won {lastWin.toLocaleString()} pts!</span>
          </div>
        )}

        {plays.playsLeft > 0 ? (
          <button
            data-testid="button-spin-wheel-game"
            onClick={spin}
            disabled={isSpinning}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-10 py-3.5 rounded-xl font-bold shadow-[0_0_20px_rgba(52,211,153,0.3)] active:scale-[0.98] transition-all w-full mt-2 disabled:opacity-50 disabled:shadow-none"
          >
            {isSpinning ? 'Spinning...' : 'Spin Wheel'}
          </button>
        ) : (
          <WatchAdButton plays={plays} />
        )}
      </div>
    </div>
  );
};
