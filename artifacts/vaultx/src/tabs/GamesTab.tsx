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
import { SkinsShop } from '../components/SkinsShop';
import { watchRewardedAdWithFallback } from '../lib/adFallback';
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
  endAt: string;
  entered: boolean;
  myPointsGained: number;
};

function formatTimeLeft(endAt: string): string {
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function CompetitionsSection() {
  const { isTelegramUser } = useVault();
  const [comps, setComps] = useState<CompetitionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState<number | null>(null);
  const { toast } = useToast();

  async function load() {
    try {
      const r = await fetch('/api/competitions', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json() as { competitions: CompetitionEntry[] };
      setComps(data.competitions.filter(c => c.status === 'active'));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleEnter(comp: CompetitionEntry) {
    if (!isTelegramUser) {
      toast({ title: 'Telegram Only', description: 'Open this app inside Telegram to enter competitions.', variant: 'destructive' });
      return;
    }
    setEntering(comp.id);
    try {
      const r = await fetch(`/api/competitions/${comp.id}/invoice`, { method: 'POST', credentials: 'include' });
      const data = await r.json() as { invoiceUrl?: string; error?: string };
      if (!r.ok) {
        toast({ title: 'Error', description: data.error ?? 'Failed to create invoice', variant: 'destructive' });
        return;
      }
      const webApp = (window as { Telegram?: { WebApp?: { openInvoice?: (url: string, cb: (s: string) => void) => void } } }).Telegram?.WebApp;
      if (webApp?.openInvoice && data.invoiceUrl) {
        webApp.openInvoice(data.invoiceUrl, (status) => {
          if (status === 'paid') {
            toast({ title: '🏆 Entered!', description: 'You\'re now competing. Good luck!' });
            setTimeout(() => void load(), 1500);
          }
        });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to open payment', variant: 'destructive' });
    } finally {
      setEntering(null);
    }
  }

  if (loading || comps.length === 0) return null;

  return (
    <div className="px-4 mt-6">
      <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-400" /> Competitions
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
                  <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-yellow-400" /> {c.prizePoints.toLocaleString()} pts prize</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTimeLeft(c.endAt)}</span>
                  {c.maxEntries && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> max {c.maxEntries}</span>}
                </div>
                {c.entered && (
                  <div className="mt-2 text-[11px] bg-primary/10 text-primary px-2 py-1 rounded-lg inline-block border border-primary/20 font-bold">
                    ✓ Entered · +{c.myPointsGained.toLocaleString()} pts gained
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
                <span className="shrink-0 text-primary text-xs font-bold">✓ In</span>
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

export const GamesTab = () => {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);

  const { tempMiningPoints, miningLevel, maxEnergy, upgradeMiningLevel, expandBattery, passiveCards, buyPassiveCard } = useVault();
  const { toast } = useToast();
  const { tr } = useLanguage();

  // Daily play limits — must be called before any early returns (React rules)
  const speedTapPlays = useDailyGamePlays('speed-tap');
  const memoryMatchPlays = useDailyGamePlays('memory-match');
  const luckyWheelPlays = useDailyGamePlays('lucky-wheel');

  const nextLevelCost = miningLevel === 1 ? 10000 : miningLevel === 2 ? 50000 : miningLevel === 3 ? 200000 : null;
  const batteryCost = 30000;
  const hasBatteryUpgrade = maxEnergy >= 200;

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
      <div className="px-4 pt-4">
        <h2 className="text-lg font-bold text-white">{tr.games.title}</h2>
        <p className="text-xs text-muted-foreground">{tr.games.subtitle}</p>
      </div>

      <div className="px-4 mt-3 grid grid-cols-2 gap-3">
        {GAME_LIST.map((g) => {
          const Icon = g.icon;
          const plays = playsMap[g.id];
          const playsLeft = plays?.playsLeft ?? FREE_PLAYS_PER_DAY;
          const totalPlays = FREE_PLAYS_PER_DAY + (plays ? (FREE_PLAYS_PER_DAY + MAX_EXTRA_PLAYS_PER_DAY - plays.extraPlaysLeft) - FREE_PLAYS_PER_DAY : 0);
          const noPlays = playsLeft <= 0;
          return (
            <button
              key={g.id}
              data-testid={`open-game-${g.id}`}
              onClick={() => { haptic('select'); setActiveGame(g.id); }}
              className="rounded-xl p-4 flex flex-col items-start gap-2 text-left active:scale-95 transition-transform relative"
              style={{
                background: noPlays
                  ? 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              }}
            >
              {plays && (
                <div className={`absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${noPlays ? 'bg-white/5 text-white/30' : 'bg-primary/15 text-primary'}`}>
                  <PlayCircle className="w-2.5 h-2.5" />
                  <span>{playsLeft}</span>
                </div>
              )}
              <div style={{
                background: `radial-gradient(circle at 30% 25%, ${g.color}${noPlays ? '10' : '22'} 0%, ${g.color}08 100%)`,
                border: `1px solid ${g.color}20`,
                boxShadow: `0 0 16px ${g.color}12, inset 0 1px 0 rgba(255,255,255,0.05)`,
                width: '48px', height: '48px', borderRadius: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: noPlays ? 0.4 : 1,
              }}>
                <Icon className="w-6 h-6" style={{ color: g.color, filter: `drop-shadow(0 0 6px ${g.color}50)` }} />
              </div>
              <h3 className={`font-semibold text-sm ${noPlays ? 'text-white/40' : 'text-white'}`}>{gameI18n[g.id]?.name ?? g.name}</h3>
              <p className="text-xs text-muted-foreground leading-snug">{gameI18n[g.id]?.desc ?? g.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Passive Income Cards */}
      <div className="px-4 mt-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">{tr.games.passiveIncome}</h2>
          <p className="text-xs text-muted-foreground">{tr.games.passiveSubtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {PASSIVE_CARDS.map(def => {
            const owned = passiveCards.find(c => c.id === def.id);
            const level = owned ? owned.level : 0;
            const nextLevel = level + 1;
            const cost = def.levelCost(nextLevel);
            const currentYield = owned ? owned.ptsPerHour : 0;
            const nextYield = def.base * nextLevel;
            const Icon = def.icon;

            return (
              <div key={def.id} className={`bg-card border ${owned ? 'border-primary/50 shadow-[0_0_10px_rgba(245,197,24,0.1)]' : 'border-white/5'} rounded-xl p-3 flex flex-col gap-2`}>
                <div className="flex items-start justify-between">
                  <div className={`p-2 rounded-lg ${owned ? 'bg-primary/20' : 'bg-white/5'}`}>
                    <Icon className={`w-5 h-5 ${owned ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">{tr.games.lv} {level}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">{tr.games.passiveCards[def.id] ?? def.name}</h3>
                  <p className="text-xs text-emerald-400 font-medium">+{currentYield.toLocaleString()} /hr</p>
                </div>
                <button
                  data-testid={`buy-passive-${def.id}`}
                  onClick={() => { buyPassiveCard(def.id, cost, nextLevel, nextYield, def.name); haptic('light'); }}
                  disabled={tempMiningPoints < cost}
                  className="mt-1 w-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                >
                  {tr.games.buyLv}{nextLevel} ({cost.toLocaleString()})
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 mt-6 space-y-4">
        <h2 className="text-lg font-bold text-white">{tr.games.boosterUpgrades}</h2>

        <div className="bg-card/40 backdrop-blur-md border border-white/5 rounded-[20px] p-5 flex items-center gap-4 shadow-sm">
          <div className="bg-primary/10 p-3 rounded-xl border border-primary/20 shrink-0"><Zap className="w-5 h-5 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-sm tracking-tight">{tr.games.laserDrill}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{tr.games.laserDrillDesc}</p>
            <div className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-md inline-block mt-2 font-bold border border-primary/20">{tr.games.levelActive(miningLevel)}</div>
          </div>
          <div className="shrink-0">
            {miningLevel < 4 ? (
              <button data-testid="button-buy-drill" onClick={handleBuyLevel} disabled={tempMiningPoints < (nextLevelCost || 0)} className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(52,211,153,0.3)] active:scale-[0.98] whitespace-nowrap">
                {nextLevelCost?.toLocaleString()} pts
              </button>
            ) : (
              <span className="text-xs text-primary font-bold px-3 bg-primary/10 border border-primary/20 py-2 rounded-xl">{tr.games.max}</span>
            )}
          </div>
        </div>

        <div className="bg-card/40 backdrop-blur-md border border-white/5 rounded-[20px] p-5 flex items-center gap-4 shadow-sm">
          <div className="bg-cyan-500/10 p-3 rounded-xl border border-cyan-500/20 shrink-0"><Battery className="w-5 h-5 text-cyan-400" /></div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-sm tracking-tight">{tr.games.batteryExpansion}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{tr.games.batteryDesc}</p>
          </div>
          <div className="shrink-0">
            {hasBatteryUpgrade ? (
              <span className="text-xs text-cyan-400 font-bold px-3 bg-cyan-500/10 border border-cyan-500/20 py-2 rounded-xl">{tr.games.installed}</span>
            ) : (
              <button data-testid="button-buy-battery" onClick={handleBuyBattery} disabled={tempMiningPoints < batteryCost} className="bg-cyan-500 hover:bg-cyan-400 text-cyan-950 text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] active:scale-[0.98] whitespace-nowrap">
                {batteryCost.toLocaleString()} pts
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 mt-6">
        <SkinsShop />
      </div>

      <CompetitionsSection />
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
