import { useEffect, useRef, useState, useCallback } from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import { Battery, Zap, Gamepad2, TrendingUp, Pickaxe, Sun, Wind, Server, Cpu, Timer, Brain, Sparkles, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

type GameState = 'idle' | 'playing' | 'gameover';
type GameId = 'tappy-dodge' | 'speed-tap' | 'memory-match' | 'lucky-wheel';

const PASSIVE_CARDS = [
  { id: 'mining-rig', name: 'Mining Rig', base: 50, levelCost: (lvl: number) => lvl * 2000, icon: Pickaxe },
  { id: 'solar-farm', name: 'Solar Farm', base: 200, levelCost: (lvl: number) => lvl * 8000, icon: Sun },
  { id: 'wind-turbine', name: 'Wind Turbine', base: 500, levelCost: (lvl: number) => lvl * 20000, icon: Wind },
  { id: 'data-center', name: 'Data Center', base: 1500, levelCost: (lvl: number) => lvl * 60000, icon: Server },
  { id: 'quantum-chip', name: 'Quantum Chip', base: 5000, levelCost: (lvl: number) => lvl * 200000, icon: Cpu },
  { id: 'black-hole', name: 'Black Hole Miner', base: 20000, levelCost: (lvl: number) => lvl * 800000, icon: Zap },
];

const GAME_LIST: { id: GameId; name: string; desc: string; icon: typeof Gamepad2; color: string }[] = [
  { id: 'tappy-dodge', name: 'Tappy Dodge', desc: 'Dodge the barriers, tap to jump', icon: Gamepad2, color: '#F5C518' },
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

  if (activeGame === 'tappy-dodge') return <TappyDodgeGame onBack={() => setActiveGame(null)} />;
  if (activeGame === 'speed-tap') return <SpeedTapGame onBack={() => setActiveGame(null)} />;
  if (activeGame === 'memory-match') return <MemoryMatchGame onBack={() => setActiveGame(null)} />;
  if (activeGame === 'lucky-wheel') return <LuckyWheelGame onBack={() => setActiveGame(null)} />;

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

        <div className="bg-card border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="bg-primary/10 p-3 rounded-lg shrink-0"><Zap className="w-5 h-5 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm">Laser Drill Upgrade</h3>
            <p className="text-xs text-muted-foreground">Multiplies mining & tap speed</p>
            <div className="text-xs text-primary mt-0.5 font-medium">Level {miningLevel} active</div>
          </div>
          <div className="shrink-0">
            {miningLevel < 4 ? (
              <button data-testid="button-buy-drill" onClick={handleBuyLevel} disabled={tempMiningPoints < (nextLevelCost || 0)} className="bg-primary text-black text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-40 disabled:bg-white/10 disabled:text-white/40 transition-colors whitespace-nowrap">
                {nextLevelCost?.toLocaleString()} pts
              </button>
            ) : (
              <span className="text-xs text-emerald-400 font-bold px-2 bg-emerald-500/10 border border-emerald-500/20 py-1.5 rounded-lg">Max</span>
            )}
          </div>
        </div>

        <div className="bg-card border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="bg-blue-500/10 p-3 rounded-lg shrink-0"><Battery className="w-5 h-5 text-blue-400" /></div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm">Battery Expansion</h3>
            <p className="text-xs text-muted-foreground">Max energy 100 → 200</p>
          </div>
          <div className="shrink-0">
            {hasBatteryUpgrade ? (
              <span className="text-xs text-emerald-400 font-bold px-2 bg-emerald-500/10 border border-emerald-500/20 py-1.5 rounded-lg">Installed</span>
            ) : (
              <button data-testid="button-buy-battery" onClick={handleBuyBattery} disabled={tempMiningPoints < batteryCost} className="bg-primary text-black text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-40 disabled:bg-white/10 disabled:text-white/40 transition-colors whitespace-nowrap">
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
  <div className="flex items-center gap-3 px-4 pt-4 pb-2">
    <button data-testid="button-back-to-games" onClick={onBack} className="p-2 rounded-full bg-white/5 active:scale-90 transition-transform">
      <ArrowLeft className="w-4 h-4 text-white" />
    </button>
    <h2 className="text-lg font-bold text-white">{title}</h2>
  </div>
);

// ---------------- Tappy Dodge ----------------

const TappyDodgeGame = ({ onBack }: { onBack: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [sessionEarned, setSessionEarned] = useState(0);
  const [isReviving, setIsReviving] = useState(false);
  const [reviveProgress, setReviveProgress] = useState(0);

  const { setTempMiningPoints, addLifetimePoints } = useVault();

  const gameStateRef = useRef<GameState>('idle');
  const scoreRef = useRef(0);
  const sessionEarnedRef = useRef(0);

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const addPointsToVault = useCallback((pts: number) => {
    setTempMiningPoints(prev => prev + pts);
    addLifetimePoints(pts);
    setSessionEarned(prev => { sessionEarnedRef.current = prev + pts; return prev + pts; });
  }, [setTempMiningPoints, addLifetimePoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState !== 'playing') return;

    let animationId: number;
    let playerY = canvas.height / 2;
    let playerVelocity = 0;
    const gravity = 0.38;
    const jumpStrength = -7.2;
    const playerX = 55;
    const gracePeriodFrames = 45; // ~0.75s of no-obstacle, no-fall-death grace so a run never ends instantly

    let obstacles: { x: number; gapY: number; passed: boolean }[] = [];
    let frameCount = 0;
    let currentScore = scoreRef.current;

    if (currentScore === 0) {
      sessionEarnedRef.current = 0;
      setSessionEarned(0);
    }

    const draw = () => {
      if (gameStateRef.current !== 'playing') return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#0A0A0C');
      grad.addColorStop(1, '#0D0D0F');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(245,197,24,0.04)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < canvas.width; gx += 40) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke();
      }
      for (let gy = 0; gy < canvas.height; gy += 40) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke();
      }

      if (frameCount > gracePeriodFrames) {
        playerVelocity += gravity;
      }
      playerY += playerVelocity;
      playerY = Math.max(14, Math.min(canvas.height - 14, playerY));

      const glowStrength = Math.abs(playerVelocity) * 2;
      ctx.shadowColor = '#F5C518';
      ctx.shadowBlur = 10 + glowStrength;
      ctx.fillStyle = '#F5C518';
      ctx.font = 'bold 26px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('X', playerX, playerY);
      ctx.shadowBlur = 0;

      if (frameCount > gracePeriodFrames && (playerY >= canvas.height - 14 || playerY <= 14)) {
        setGameState('gameover');
        haptic('error');
        return;
      }

      const spawnInterval = Math.max(70, 105 - Math.floor(currentScore / 250));
      if (frameCount > gracePeriodFrames && (frameCount - gracePeriodFrames) % spawnInterval === 0) {
        const gapSize = 125;
        const gapY = Math.random() * (canvas.height - gapSize - 60) + 30;
        obstacles.push({ x: canvas.width + 10, gapY, passed: false });
      }

      const speed = 2.6 + currentScore / 400;
      let collided = false;

      for (const obs of obstacles) {
        obs.x -= speed;

        const pillarGrad = ctx.createLinearGradient(obs.x, 0, obs.x + 28, 0);
        pillarGrad.addColorStop(0, '#1A1A20');
        pillarGrad.addColorStop(1, '#2A2A35');
        ctx.fillStyle = pillarGrad;
        ctx.shadowColor = 'rgba(245,197,24,0.15)';
        ctx.shadowBlur = 8;

        ctx.fillRect(obs.x, 0, 28, obs.gapY);
        ctx.fillRect(obs.x, obs.gapY + 125, 28, canvas.height - obs.gapY - 125);
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(245,197,24,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(obs.x, obs.gapY); ctx.lineTo(obs.x + 28, obs.gapY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(obs.x, obs.gapY + 125); ctx.lineTo(obs.x + 28, obs.gapY + 125); ctx.stroke();

        if (playerX + 9 > obs.x + 4 && playerX - 9 < obs.x + 24) {
          if (playerY - 9 < obs.gapY || playerY + 9 > obs.gapY + 125) {
            collided = true;
          }
        }

        if (obs.x + 28 < playerX && !obs.passed) {
          obs.passed = true;
          currentScore += 50;
          scoreRef.current = currentScore;
          setScore(currentScore);
          addPointsToVault(50);
          haptic('light');
        }
      }

      if (collided) {
        setGameState('gameover');
        haptic('error');
        return;
      }

      obstacles = obstacles.filter(obs => obs.x > -40);

      ctx.fillStyle = 'rgba(245,197,24,0.9)';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${currentScore} pts`, 12, 24);

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Speed ×${speed.toFixed(1)}`, canvas.width - 10, 24);

      frameCount++;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    const handleJump = (e: Event) => {
      e.preventDefault();
      if (gameStateRef.current === 'playing') {
        playerVelocity = jumpStrength;
        haptic('light');
      }
    };

    canvas.addEventListener('mousedown', handleJump);
    canvas.addEventListener('touchstart', handleJump, { passive: false });
    const keyHandler = (e: KeyboardEvent) => { if (e.code === 'Space') handleJump(e); };
    window.addEventListener('keydown', keyHandler);

    return () => {
      cancelAnimationFrame(animationId);
      canvas.removeEventListener('mousedown', handleJump);
      canvas.removeEventListener('touchstart', handleJump);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [gameState, addPointsToVault]);

  const startFresh = () => {
    scoreRef.current = 0;
    setScore(0);
    setSessionEarned(0);
    sessionEarnedRef.current = 0;
    setGameState('playing');
  };

  const handleRevive = () => {
    setIsReviving(true);
    setReviveProgress(0);
    let step = 0;
    const steps = 100;
    const timer = setInterval(() => {
      step++;
      setReviveProgress((step / steps) * 100);
      if (step >= steps) {
        clearInterval(timer);
        setTimeout(() => {
          setIsReviving(false);
          setGameState('playing');
        }, 300);
      }
    }, 50);
  };

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      <GameHeader title="Tappy Dodge" onBack={onBack} />
      <div className="relative bg-black mx-4 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <canvas ref={canvasRef} width={400} height={300} className="w-full touch-none block" style={{ height: '300px' }} data-testid="canvas-game" />

        {gameState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6" style={{ background: 'rgba(10,10,12,0.75)', backdropFilter: 'blur(4px)' }}>
            <Gamepad2 className="w-10 h-10 text-primary mb-1" />
            <h2 className="text-2xl font-bold text-white tracking-tight">Tappy Dodge</h2>
            <p className="text-sm text-muted-foreground">Tap to jump. Every barrier cleared = <span className="text-primary font-bold">+50 pts</span> added to your Vault!</p>
            <button data-testid="button-start-game" onClick={startFresh} className="mt-2 bg-primary text-black px-9 py-3 rounded-full font-bold shadow-[0_0_24px_rgba(245,197,24,0.4)] active:scale-95 transition-transform">Start Game</button>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6" style={{ background: 'rgba(10,10,12,0.85)', backdropFilter: 'blur(6px)' }}>
            <h2 className="text-2xl font-bold text-destructive">Game Over</h2>
            <p className="text-white text-lg font-semibold">Score: {score} pts</p>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-xl px-5 py-2.5 mt-1">
              <TrendingUp className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-bold text-primary">+{sessionEarned.toLocaleString()} pts added to your Vault!</span>
            </div>
            <div className="flex gap-3 mt-3">
              <button data-testid="button-play-again" onClick={startFresh} className="bg-white/10 text-white px-6 py-2.5 rounded-full font-medium active:scale-95 transition-transform text-sm">Play Again</button>
              <button data-testid="button-revive" onClick={handleRevive} className="bg-primary text-black px-6 py-2.5 rounded-full font-bold shadow-[0_0_15px_rgba(245,197,24,0.3)] active:scale-95 transition-transform text-sm">Revive (Watch Ad)</button>
            </div>
          </div>
        )}
      </div>

      {gameState === 'playing' && (
        <div className="mx-4 mt-3 flex items-center justify-between bg-primary/5 border border-primary/15 rounded-xl px-4 py-2.5">
          <span className="text-xs text-muted-foreground">This session</span>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-bold text-primary">+{sessionEarned.toLocaleString()} pts → Vault</span>
          </div>
        </div>
      )}

      <Dialog open={isReviving} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md border-white/10 bg-[#0D0D0F]">
          <DialogTitle className="text-center text-xl">Watching Ad to Revive</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground text-sm">AdsGram SDK — Future: AdController.show()</DialogDescription>
          <div className="py-8">
            <Progress value={reviveProgress} className="h-3" />
            <p className="text-center text-muted-foreground text-sm mt-3">Please wait... {Math.ceil(5 - (reviveProgress / 100) * 5)}s</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

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
      <div className="mx-4 rounded-xl bg-card border border-white/5 p-6 flex flex-col items-center gap-4">
        {phase === 'idle' && (
          <>
            <Timer className="w-10 h-10 text-blue-400" />
            <p className="text-sm text-muted-foreground text-center">Tap the button as many times as you can in {SPEED_TAP_DURATION} seconds. Each tap = <span className="text-primary font-bold">+{SPEED_TAP_PTS_PER_TAP} pts</span>.</p>
            <button data-testid="button-start-speedtap" onClick={start} className="bg-primary text-black px-8 py-3 rounded-full font-bold shadow-[0_0_24px_rgba(245,197,24,0.4)] active:scale-95 transition-transform">Start</button>
          </>
        )}

        {phase === 'playing' && (
          <>
            <div className="text-4xl font-bold text-white">{timeLeft}s</div>
            <div className="text-sm text-muted-foreground">Taps: <span className="text-primary font-bold">{taps}</span></div>
            <button
              data-testid="button-tap-speedtap"
              onClick={handleTap}
              className="w-40 h-40 rounded-full bg-primary text-black text-xl font-bold shadow-[0_0_40px_rgba(245,197,24,0.5)] active:scale-90 transition-transform select-none"
            >
              TAP!
            </button>
          </>
        )}

        {phase === 'done' && (
          <>
            <h2 className="text-2xl font-bold text-white">Time's Up!</h2>
            <p className="text-white text-lg font-semibold">{taps} taps</p>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-xl px-5 py-2.5">
              <TrendingUp className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-bold text-primary">+{earned.toLocaleString()} pts added to your Vault!</span>
            </div>
            <button data-testid="button-again-speedtap" onClick={start} className="bg-white/10 text-white px-6 py-2.5 rounded-full font-medium active:scale-95 transition-transform text-sm">Play Again</button>
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
      <div className="mx-4 rounded-xl bg-card border border-white/5 p-5 flex flex-col items-center gap-4">
        {phase === 'idle' && (
          <>
            <Brain className="w-10 h-10 text-emerald-400" />
            <p className="text-sm text-muted-foreground text-center">Flip cards and match all {MEMORY_EMOJIS.length} pairs within {MEMORY_TIME_LIMIT}s. Each pair = <span className="text-primary font-bold">+{MEMORY_REWARD_PER_PAIR} pts</span>.</p>
            <button data-testid="button-start-memory" onClick={start} className="bg-primary text-black px-8 py-3 rounded-full font-bold shadow-[0_0_24px_rgba(245,197,24,0.4)] active:scale-95 transition-transform">Start</button>
          </>
        )}

        {phase === 'playing' && (
          <>
            <div className="w-full flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pairs: <span className="text-primary font-bold">{matchedPairs}/{MEMORY_EMOJIS.length}</span></span>
              <span className="text-sm font-bold text-white">{timeLeft}s</span>
            </div>
            <div className="grid grid-cols-4 gap-2 w-full">
              {cards.map(card => (
                <button
                  key={card.id}
                  data-testid={`memory-card-${card.id}`}
                  onClick={() => handleFlip(card.id)}
                  disabled={card.matched}
                  className={`aspect-square rounded-lg flex items-center justify-center text-2xl font-bold transition-all duration-200 ${
                    card.matched ? 'bg-emerald-500/20 border border-emerald-500/40' : card.flipped ? 'bg-primary/20 border border-primary/40' : 'bg-white/5 border border-white/10 active:scale-95'
                  }`}
                >
                  {card.flipped || card.matched ? card.symbol : ''}
                </button>
              ))}
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <h2 className="text-2xl font-bold text-white">{matchedPairs === MEMORY_EMOJIS.length ? 'Cleared!' : "Time's Up!"}</h2>
            <p className="text-white text-lg font-semibold">{matchedPairs}/{MEMORY_EMOJIS.length} pairs matched</p>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-xl px-5 py-2.5">
              <TrendingUp className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-bold text-primary">+{earned.toLocaleString()} pts added to your Vault!</span>
            </div>
            <button data-testid="button-again-memory" onClick={start} className="bg-white/10 text-white px-6 py-2.5 rounded-full font-medium active:scale-95 transition-transform text-sm">Play Again</button>
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
      <div className="mx-4 rounded-xl bg-card border border-white/5 p-6 flex flex-col items-center gap-5">
        <p className="text-sm text-muted-foreground text-center">Free spin, pure luck. <span className="text-primary font-bold">{spinsLeft}</span> of {MAX_SPINS_PER_DAY} spins left today.</p>

        <div className="relative w-56 h-56">
          <div
            className="w-full h-full rounded-full relative overflow-hidden border-4 border-primary/40 shadow-[0_0_40px_rgba(245,197,24,0.25)]"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning ? 'transform 3.2s cubic-bezier(0.15, 0.85, 0.25, 1)' : 'none',
              background: `conic-gradient(${WHEEL_SEGMENTS.map((_, i) => {
                const colors = ['#F5C518', '#0D0D0F', '#F5C518', '#0D0D0F', '#F5C518', '#0D0D0F', '#F5C518', '#0D0D0F'];
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
                    className="text-xs font-bold mt-4"
                    style={{ color: i % 2 === 0 ? '#0D0D0F' : '#F5C518' }}
                  >
                    {val}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-primary" />
        </div>

        {lastWin !== null && !isSpinning && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-xl px-5 py-2.5">
            <TrendingUp className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-bold text-primary">+{lastWin.toLocaleString()} pts added to your Vault!</span>
          </div>
        )}

        <button
          data-testid="button-spin-wheel"
          onClick={spin}
          disabled={isSpinning || spinsLeft <= 0}
          className="bg-primary text-black px-9 py-3 rounded-full font-bold shadow-[0_0_24px_rgba(245,197,24,0.4)] active:scale-95 transition-transform disabled:opacity-40 disabled:shadow-none"
        >
          {isSpinning ? 'Spinning...' : spinsLeft > 0 ? 'Spin' : 'No spins left today'}
        </button>
      </div>
    </div>
  );
};
