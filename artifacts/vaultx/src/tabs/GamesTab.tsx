import { useEffect, useRef, useState, useCallback } from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import { Battery, Zap, Gamepad2, TrendingUp, Pickaxe, Sun, Wind, Server, Cpu, Timer, Brain, Sparkles, ArrowLeft, Sword, Layers } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { KnifeHitGame } from '../games/KnifeHitGame';
import { StackTowerGame } from '../games/StackTowerGame';

type GameState = 'idle' | 'playing' | 'gameover';
type GameId = 'speed-tap' | 'memory-match' | 'lucky-wheel' | 'knife-hit' | 'stack-tower';

const PASSIVE_CARDS = [
  { id: 'mining-rig', name: 'Mining Rig', base: 50, levelCost: (lvl: number) => lvl * 2000, icon: Pickaxe },
  { id: 'solar-farm', name: 'Solar Farm', base: 200, levelCost: (lvl: number) => lvl * 8000, icon: Sun },
  { id: 'wind-turbine', name: 'Wind Turbine', base: 500, levelCost: (lvl: number) => lvl * 20000, icon: Wind },
  { id: 'data-center', name: 'Data Center', base: 1500, levelCost: (lvl: number) => lvl * 60000, icon: Server },
  { id: 'quantum-chip', name: 'Quantum Chip', base: 5000, levelCost: (lvl: number) => lvl * 200000, icon: Cpu },
  { id: 'black-hole', name: 'Black Hole Miner', base: 20000, levelCost: (lvl: number) => lvl * 800000, icon: Zap },
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

  const nextLevelCost = miningLevel === 1 ? 10000 : miningLevel === 2 ? 50000 : miningLevel === 3 ? 200000 : null;
  const batteryCost = 30000;
  const hasBatteryUpgrade = maxEnergy >= 200;

  const handleBuyLevel = () => {
    if (nextLevelCost && tempMiningPoints >= nextLevelCost) {
      upgradeMiningLevel(nextLevelCost, miningLevel + 1);
      haptic('success');
      toast({ title: "Upgraded!", description: `You are now a Level ${miningLevel + 1} Miner.` });
    }
  };

  const handleBuyBattery = () => {
    if (tempMiningPoints >= batteryCost && !hasBatteryUpgrade) {
      expandBattery(batteryCost);
      haptic('success');
      toast({ title: "Upgraded!", description: "Battery capacity expanded to 200." });
    }
  };

  if (activeGame === 'speed-tap') return <SpeedTapGame onBack={() => setActiveGame(null)} />;
  if (activeGame === 'memory-match') return <MemoryMatchGame onBack={() => setActiveGame(null)} />;
  if (activeGame === 'lucky-wheel') return <LuckyWheelGame onBack={() => setActiveGame(null)} />;
  if (activeGame === 'knife-hit') return <KnifeHitGame onBack={() => setActiveGame(null)} />;
  if (activeGame === 'stack-tower') return <StackTowerGame onBack={() => setActiveGame(null)} />;

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-500">
      <div className="px-4 pt-4">
        <h2 className="text-lg font-bold text-white">Games</h2>
        <p className="text-xs text-muted-foreground">Play mini-games to earn extra points</p>
      </div>

      <div className="px-4 mt-3 grid grid-cols-2 gap-3">
        {GAME_LIST.map((g) => {
          const Icon = g.icon;
          return (
            <button
              key={g.id}
              data-testid={`open-game-${g.id}`}
              onClick={() => { haptic('select'); setActiveGame(g.id); }}
              className="bg-card border border-white/5 rounded-xl p-4 flex flex-col items-start gap-2 text-left active:scale-95 transition-transform"
            >
              <div className="p-2.5 rounded-lg" style={{ background: `${g.color}1A` }}>
                <Icon className="w-6 h-6" style={{ color: g.color }} />
              </div>
              <h3 className="font-semibold text-white text-sm">{g.name}</h3>
              <p className="text-xs text-muted-foreground leading-snug">{g.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Passive Income Cards */}
      <div className="px-4 mt-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Passive Income</h2>
          <p className="text-xs text-muted-foreground">Earn pts/hr automatically</p>
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
                  <span className="text-xs font-bold text-muted-foreground">Lv {level}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">{def.name}</h3>
                  <p className="text-xs text-emerald-400 font-medium">+{currentYield.toLocaleString()} /hr</p>
                </div>
                <button
                  data-testid={`buy-passive-${def.id}`}
                  onClick={() => { buyPassiveCard(def.id, cost, nextLevel, nextYield, def.name); haptic('light'); }}
                  disabled={tempMiningPoints < cost}
                  className="mt-1 w-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                >
                  Buy Lv{nextLevel} ({cost.toLocaleString()})
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 mt-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Booster Upgrades</h2>

        <div className="bg-card/40 backdrop-blur-md border border-white/5 rounded-[20px] p-5 flex items-center gap-4 shadow-sm">
          <div className="bg-primary/10 p-3 rounded-xl border border-primary/20 shrink-0"><Zap className="w-5 h-5 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-sm tracking-tight">Laser Drill Upgrade</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Multiplies mining & tap speed</p>
            <div className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-md inline-block mt-2 font-bold border border-primary/20">Level {miningLevel} active</div>
          </div>
          <div className="shrink-0">
            {miningLevel < 4 ? (
              <button data-testid="button-buy-drill" onClick={handleBuyLevel} disabled={tempMiningPoints < (nextLevelCost || 0)} className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(52,211,153,0.3)] active:scale-[0.98] whitespace-nowrap">
                {nextLevelCost?.toLocaleString()} pts
              </button>
            ) : (
              <span className="text-xs text-primary font-bold px-3 bg-primary/10 border border-primary/20 py-2 rounded-xl">Max</span>
            )}
          </div>
        </div>

        <div className="bg-card/40 backdrop-blur-md border border-white/5 rounded-[20px] p-5 flex items-center gap-4 shadow-sm">
          <div className="bg-cyan-500/10 p-3 rounded-xl border border-cyan-500/20 shrink-0"><Battery className="w-5 h-5 text-cyan-400" /></div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-sm tracking-tight">Battery Expansion</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Max energy 100 → 200</p>
          </div>
          <div className="shrink-0">
            {hasBatteryUpgrade ? (
              <span className="text-xs text-cyan-400 font-bold px-3 bg-cyan-500/10 border border-cyan-500/20 py-2 rounded-xl">Installed</span>
            ) : (
              <button data-testid="button-buy-battery" onClick={handleBuyBattery} disabled={tempMiningPoints < batteryCost} className="bg-cyan-500 hover:bg-cyan-400 text-cyan-950 text-xs font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] active:scale-[0.98] whitespace-nowrap">
                {batteryCost.toLocaleString()} pts
              </button>
            )}
          </div>
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

// ---------------- Speed Tap ----------------

const SPEED_TAP_DURATION = 10;
const SPEED_TAP_PTS_PER_TAP = 15;

const SpeedTapGame = ({ onBack }: { onBack: () => void }) => {
  const { setTempMiningPoints, addLifetimePoints } = useVault();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [taps, setTaps] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SPEED_TAP_DURATION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef(0);

  const start = () => {
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
    if (phase === 'done' && taps > 0) {
      const earned = taps * SPEED_TAP_PTS_PER_TAP;
      setTempMiningPoints(prev => prev + earned);
      addLifetimePoints(earned);
      haptic('success');
    }
    // Runs once when transitioning into 'done' with the final tap count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleTap = () => {
    if (phase !== 'playing') return;
    setTaps(t => t + 1);
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
            <button data-testid="button-start-speedtap" onClick={start} className="bg-primary hover:bg-primary/90 text-primary-foreground px-10 py-3.5 rounded-xl font-bold shadow-[0_0_20px_rgba(52,211,153,0.3)] active:scale-[0.98] transition-all w-full mt-2">Start Game</button>
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
            <button data-testid="button-again-speedtap" onClick={start} className="bg-white/10 hover:bg-white/20 border border-white/10 text-white px-8 py-3.5 rounded-xl font-bold active:scale-[0.98] transition-all text-sm w-full mt-2">Play Again</button>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------- Memory Match ----------------

const MEMORY_EMOJIS = ['⚡', '💎', '🔥', '🌙', '⭐', '🪙'];
const MEMORY_TIME_LIMIT = 45;
const MEMORY_REWARD_PER_PAIR = 200;

type MemoryCard = { id: number; symbol: string; flipped: boolean; matched: boolean };

function buildMemoryDeck(): MemoryCard[] {
  const pairs = [...MEMORY_EMOJIS, ...MEMORY_EMOJIS];
  const deck = pairs
    .map((symbol, i) => ({ id: i, symbol, flipped: false, matched: false }))
    .sort(() => Math.random() - 0.5);
  return deck;
}

const MemoryMatchGame = ({ onBack }: { onBack: () => void }) => {
  const { setTempMiningPoints, addLifetimePoints } = useVault();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MEMORY_TIME_LIMIT);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockRef = useRef(false);

  const start = () => {
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
            <button data-testid="button-start-memory" onClick={start} className="bg-primary hover:bg-primary/90 text-primary-foreground px-10 py-3.5 rounded-xl font-bold shadow-[0_0_20px_rgba(52,211,153,0.3)] active:scale-[0.98] transition-all w-full mt-2">Start Game</button>
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
            <button data-testid="button-again-memory" onClick={start} className="bg-white/10 hover:bg-white/20 border border-white/10 text-white px-8 py-3.5 rounded-xl font-bold active:scale-[0.98] transition-all text-sm w-full mt-2">Play Again</button>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------- Lucky Wheel ----------------

const WHEEL_SEGMENTS = [50, 100, 250, 500, 100, 1000, 50, 5000];
const MAX_SPINS_PER_DAY = 3;

const LuckyWheelGame = ({ onBack }: { onBack: () => void }) => {
  const { setTempMiningPoints, addLifetimePoints } = useVault();
  const [spinsUsedToday, setSpinsUsedToday] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    const savedDate = localStorage.getItem('luckyWheelDate');
    if (savedDate !== today) {
      localStorage.setItem('luckyWheelDate', today);
      localStorage.setItem('luckyWheelSpins', '0');
      return 0;
    }
    return Number(localStorage.getItem('luckyWheelSpins')) || 0;
  });
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [lastWin, setLastWin] = useState<number | null>(null);

  const spinsLeft = MAX_SPINS_PER_DAY - spinsUsedToday;

  const spin = () => {
    if (isSpinning || spinsLeft <= 0) return;
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
      const used = spinsUsedToday + 1;
      setSpinsUsedToday(used);
      localStorage.setItem('luckyWheelSpins', used.toString());
      haptic(winAmount >= 1000 ? 'success' : 'light');
    }, 3200);
  };

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      <GameHeader title="Lucky Wheel" onBack={onBack} />
      <div className="mx-4 rounded-[24px] bg-card/60 backdrop-blur-xl border border-white/10 p-8 flex flex-col items-center gap-6 shadow-sm overflow-hidden relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/5 rounded-full blur-[60px] pointer-events-none" />
        
        <p className="text-sm text-muted-foreground text-center relative z-10 leading-relaxed">Free spin, pure luck.<br/><span className="text-white font-bold bg-white/10 px-2 py-0.5 rounded-md inline-block mt-1">{spinsLeft}</span> of {MAX_SPINS_PER_DAY} spins left today.</p>

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

        <button 
          data-testid="button-spin-wheel-game" 
          onClick={spin} 
          disabled={spinsLeft <= 0 || isSpinning} 
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-10 py-3.5 rounded-xl font-bold shadow-[0_0_20px_rgba(52,211,153,0.3)] active:scale-[0.98] transition-all w-full mt-2 disabled:opacity-50 disabled:shadow-none disabled:bg-white/10 disabled:text-white/40"
        >
          {isSpinning ? 'Spinning...' : spinsLeft <= 0 ? 'Come back tomorrow' : 'Spin Wheel'}
        </button>
      </div>
    </div>
  );
};
