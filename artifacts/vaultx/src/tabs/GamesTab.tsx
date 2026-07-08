import { useEffect, useRef, useState, useCallback } from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Battery, Zap, Gamepad2, TrendingUp, Pickaxe, Sun, Wind, Server, Cpu } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

type GameState = 'idle' | 'playing' | 'gameover';

const PASSIVE_CARDS = [
  { id: 'mining-rig', name: 'Mining Rig', base: 50, levelCost: (lvl: number) => lvl * 2000, icon: Pickaxe },
  { id: 'solar-farm', name: 'Solar Farm', base: 200, levelCost: (lvl: number) => lvl * 8000, icon: Sun },
  { id: 'wind-turbine', name: 'Wind Turbine', base: 500, levelCost: (lvl: number) => lvl * 20000, icon: Wind },
  { id: 'data-center', name: 'Data Center', base: 1500, levelCost: (lvl: number) => lvl * 60000, icon: Server },
  { id: 'quantum-chip', name: 'Quantum Chip', base: 5000, levelCost: (lvl: number) => lvl * 200000, icon: Cpu },
  { id: 'black-hole', name: 'Black Hole Miner', base: 20000, levelCost: (lvl: number) => lvl * 800000, icon: Zap },
];

export const GamesTab = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [sessionEarned, setSessionEarned] = useState(0);
  const [isReviving, setIsReviving] = useState(false);
  const [reviveProgress, setReviveProgress] = useState(0);

  const { tempMiningPoints, miningLevel, maxEnergy, upgradeMiningLevel, expandBattery, setTempMiningPoints, addLifetimePoints, passiveCards, buyPassiveCard } = useVault();
  const { toast } = useToast();

  const gameStateRef = useRef<GameState>('idle');
  const scoreRef = useRef(0);
  const sessionEarnedRef = useRef(0);

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const addPointsToVault = useCallback((pts: number) => {
    setTempMiningPoints(prev => prev + pts);
    addLifetimePoints(pts);
    setSessionEarned(prev => { sessionEarnedRef.current = prev + pts; return prev + pts; });
  }, [setTempMiningPoints, addLifetimePoints]);

  const nextLevelCost = miningLevel === 1 ? 10000 : miningLevel === 2 ? 50000 : miningLevel === 3 ? 200000 : null;
  const batteryCost = 30000;
  const hasBatteryUpgrade = maxEnergy >= 200;

  const handleBuyLevel = () => {
    if (nextLevelCost && tempMiningPoints >= nextLevelCost) {
      upgradeMiningLevel(nextLevelCost, miningLevel + 1);
      toast({ title: "Upgraded!", description: `You are now a Level ${miningLevel + 1} Miner.` });
    }
  };

  const handleBuyBattery = () => {
    if (tempMiningPoints >= batteryCost && !hasBatteryUpgrade) {
      expandBattery(batteryCost);
      toast({ title: "Upgraded!", description: "Battery capacity expanded to 200." });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState !== 'playing') return;

    let animationId: number;
    let playerY = canvas.height / 2;
    let playerVelocity = 0;
    const gravity = 0.45;
    const jumpStrength = -8;
    const playerX = 55;

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

      playerVelocity += gravity;
      playerY += playerVelocity;

      const glowStrength = Math.abs(playerVelocity) * 2;
      ctx.shadowColor = '#F5C518';
      ctx.shadowBlur = 10 + glowStrength;
      ctx.fillStyle = '#F5C518';
      ctx.font = 'bold 26px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('X', playerX, playerY);
      ctx.shadowBlur = 0;

      if (playerY > canvas.height - 10 || playerY < 10) {
        setGameState('gameover');
        return;
      }

      const spawnInterval = Math.max(60, 100 - Math.floor(currentScore / 200));
      if (frameCount % spawnInterval === 0) {
        const gapSize = 110;
        const gapY = Math.random() * (canvas.height - gapSize - 60) + 30;
        obstacles.push({ x: canvas.width + 10, gapY, passed: false });
      }

      const speed = 3 + currentScore / 300;
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
        ctx.fillRect(obs.x, obs.gapY + 110, 28, canvas.height - obs.gapY - 110);
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(245,197,24,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(obs.x, obs.gapY); ctx.lineTo(obs.x + 28, obs.gapY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(obs.x, obs.gapY + 110); ctx.lineTo(obs.x + 28, obs.gapY + 110); ctx.stroke();

        if (playerX + 10 > obs.x + 4 && playerX - 10 < obs.x + 24) {
          if (playerY - 10 < obs.gapY || playerY + 10 > obs.gapY + 110) {
            collided = true;
          }
        }

        if (obs.x + 28 < playerX && !obs.passed) {
          obs.passed = true;
          currentScore += 50;
          scoreRef.current = currentScore;
          setScore(currentScore);
          addPointsToVault(50);
        }
      }

      if (collided) {
        setGameState('gameover');
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
    <div className="flex flex-col pb-24 animate-in fade-in duration-500">
      <div className="relative bg-black" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <canvas ref={canvasRef} width={430} height={300} className="w-full touch-none block" style={{ height: '300px' }} data-testid="canvas-game" />

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

      {/* Passive Income Cards */}
      <div className="px-4 mt-5 space-y-4">
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
                  onClick={() => buyPassiveCard(def.id, cost, nextLevel, nextYield, def.name)}
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
