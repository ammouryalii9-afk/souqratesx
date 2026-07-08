import { useEffect, useRef, useState, useCallback } from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Battery, Zap, Gamepad2, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

type GameState = 'idle' | 'playing' | 'gameover';

export const GamesTab = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [sessionEarned, setSessionEarned] = useState(0); // pts earned this round
  const [isReviving, setIsReviving] = useState(false);
  const [reviveProgress, setReviveProgress] = useState(0);

  const { tempMiningPoints, miningLevel, maxEnergy, upgradeMiningLevel, expandBattery, setTempMiningPoints } = useVault();
  const { toast } = useToast();

  // Use refs so the game loop closure always sees latest values
  const gameStateRef = useRef<GameState>('idle');
  const scoreRef = useRef(0);
  const sessionEarnedRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Add game points to vault balance in real-time — no cap on game earnings
  const addPointsToVault = useCallback((pts: number) => {
    setTempMiningPoints(prev => prev + pts);
    setSessionEarned(prev => { sessionEarnedRef.current = prev + pts; return prev + pts; });
  }, [setTempMiningPoints]);

  // Shop
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

  // ── GAME LOOP ──
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

    // Reset local state on fresh game (score = 0) or keep for revive
    if (currentScore === 0) {
      sessionEarnedRef.current = 0;
      setSessionEarned(0);
    }

    const draw = () => {
      if (gameStateRef.current !== 'playing') return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#0A0A0C');
      grad.addColorStop(1, '#0D0D0F');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle grid lines
      ctx.strokeStyle = 'rgba(245,197,24,0.04)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < canvas.width; gx += 40) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke();
      }
      for (let gy = 0; gy < canvas.height; gy += 40) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke();
      }

      // Physics
      playerVelocity += gravity;
      playerY += playerVelocity;

      // Draw player — glowing gold "X"
      const glowStrength = Math.abs(playerVelocity) * 2;
      ctx.shadowColor = '#F5C518';
      ctx.shadowBlur = 10 + glowStrength;
      ctx.fillStyle = '#F5C518';
      ctx.font = 'bold 26px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('X', playerX, playerY);
      ctx.shadowBlur = 0;

      // Boundaries — hit top or bottom
      if (playerY > canvas.height - 10 || playerY < 10) {
        setGameState('gameover');
        return;
      }

      // Spawn obstacles
      const spawnInterval = Math.max(60, 100 - Math.floor(currentScore / 200));
      if (frameCount % spawnInterval === 0) {
        const gapSize = 110;
        const gapY = Math.random() * (canvas.height - gapSize - 60) + 30;
        obstacles.push({ x: canvas.width + 10, gapY, passed: false });
      }

      // Draw & update obstacles
      const speed = 3 + currentScore / 300;
      let collided = false;

      for (const obs of obstacles) {
        obs.x -= speed;

        // Obstacle color — gold-tinted dark pillars
        const pillarGrad = ctx.createLinearGradient(obs.x, 0, obs.x + 28, 0);
        pillarGrad.addColorStop(0, '#1A1A20');
        pillarGrad.addColorStop(1, '#2A2A35');
        ctx.fillStyle = pillarGrad;
        ctx.shadowColor = 'rgba(245,197,24,0.15)';
        ctx.shadowBlur = 8;

        // Top pillar
        ctx.fillRect(obs.x, 0, 28, obs.gapY);
        // Bottom pillar
        ctx.fillRect(obs.x, obs.gapY + 110, 28, canvas.height - obs.gapY - 110);
        ctx.shadowBlur = 0;

        // Gap highlight lines
        ctx.strokeStyle = 'rgba(245,197,24,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(obs.x, obs.gapY); ctx.lineTo(obs.x + 28, obs.gapY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(obs.x, obs.gapY + 110); ctx.lineTo(obs.x + 28, obs.gapY + 110); ctx.stroke();

        // Collision detection (tighter hitbox)
        if (playerX + 10 > obs.x + 4 && playerX - 10 < obs.x + 24) {
          if (playerY - 10 < obs.gapY || playerY + 10 > obs.gapY + 110) {
            collided = true;
          }
        }

        // Score — passed obstacle → +50 pts to vault!
        if (obs.x + 28 < playerX && !obs.passed) {
          obs.passed = true;
          currentScore += 50;
          scoreRef.current = currentScore;
          setScore(currentScore);
          addPointsToVault(50); // ← HERE: game points go to vault
        }
      }

      if (collided) {
        setGameState('gameover');
        return;
      }

      // Remove off-screen
      obstacles = obstacles.filter(obs => obs.x > -40);

      // Score overlay (top left)
      ctx.fillStyle = 'rgba(245,197,24,0.9)';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${currentScore} pts`, 12, 24);

      // Speed badge (top right)
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

      {/* Game Canvas */}
      <div className="relative bg-black" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <canvas
          ref={canvasRef}
          width={430}
          height={300}
          className="w-full touch-none block"
          style={{ height: '300px' }}
          data-testid="canvas-game"
        />

        {/* Idle overlay */}
        {gameState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6"
            style={{ background: 'rgba(10,10,12,0.75)', backdropFilter: 'blur(4px)' }}>
            <Gamepad2 className="w-10 h-10 text-primary mb-1" />
            <h2 className="text-2xl font-bold text-white tracking-tight">Tappy Dodge</h2>
            <p className="text-sm text-muted-foreground">Tap to jump. Every barrier cleared = <span className="text-primary font-bold">+50 pts</span> added to your Vault!</p>
            <button
              data-testid="button-start-game"
              onClick={startFresh}
              className="mt-2 bg-primary text-black px-9 py-3 rounded-full font-bold shadow-[0_0_24px_rgba(245,197,24,0.4)] active:scale-95 transition-transform"
            >
              Start Game
            </button>
          </div>
        )}

        {/* Game Over overlay */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6"
            style={{ background: 'rgba(10,10,12,0.85)', backdropFilter: 'blur(6px)' }}>
            <h2 className="text-2xl font-bold text-destructive">Game Over</h2>
            <p className="text-white text-lg font-semibold">Score: {score} pts</p>

            {/* Points earned badge */}
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-xl px-5 py-2.5 mt-1">
              <TrendingUp className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-bold text-primary">
                +{sessionEarned.toLocaleString()} pts added to your Vault!
              </span>
            </div>

            <div className="flex gap-3 mt-3">
              <button
                data-testid="button-play-again"
                onClick={startFresh}
                className="bg-white/10 text-white px-6 py-2.5 rounded-full font-medium active:scale-95 transition-transform text-sm"
              >
                Play Again
              </button>
              <button
                data-testid="button-revive"
                onClick={handleRevive}
                className="bg-primary text-black px-6 py-2.5 rounded-full font-bold shadow-[0_0_15px_rgba(245,197,24,0.3)] active:scale-95 transition-transform text-sm"
              >
                Revive (Watch Ad)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live session tracker — shows while playing */}
      {gameState === 'playing' && (
        <div className="mx-4 mt-3 flex items-center justify-between bg-primary/5 border border-primary/15 rounded-xl px-4 py-2.5">
          <span className="text-xs text-muted-foreground">This session</span>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-bold text-primary">+{sessionEarned.toLocaleString()} pts → Vault</span>
          </div>
        </div>
      )}

      {/* Upgrade Shop */}
      <div className="px-4 mt-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Upgrade Shop</h2>
          <div className="bg-white/5 px-3 py-1 rounded-full text-xs font-medium border border-white/10 text-muted-foreground">
            {Math.floor(tempMiningPoints).toLocaleString()} pts available
          </div>
        </div>

        {/* Laser Drill */}
        <div className="bg-card border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="bg-primary/10 p-3 rounded-lg shrink-0">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm">Laser Drill Upgrade</h3>
            <p className="text-xs text-muted-foreground">Multiplies mining & tap speed</p>
            <div className="text-xs text-primary mt-0.5 font-medium">Level {miningLevel} active</div>
          </div>
          <div className="shrink-0">
            {miningLevel < 4 ? (
              <button
                data-testid="button-buy-drill"
                onClick={handleBuyLevel}
                disabled={tempMiningPoints < (nextLevelCost || 0)}
                className="bg-primary text-black text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-40 disabled:bg-white/10 disabled:text-white/40 transition-colors whitespace-nowrap"
              >
                {nextLevelCost?.toLocaleString()} pts
              </button>
            ) : (
              <span className="text-xs text-emerald-400 font-bold px-2 bg-emerald-500/10 border border-emerald-500/20 py-1.5 rounded-lg">Max</span>
            )}
          </div>
        </div>

        {/* Battery Pack */}
        <div className="bg-card border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="bg-blue-500/10 p-3 rounded-lg shrink-0">
            <Battery className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm">Battery Expansion</h3>
            <p className="text-xs text-muted-foreground">Max energy 100 → 200</p>
          </div>
          <div className="shrink-0">
            {hasBatteryUpgrade ? (
              <span className="text-xs text-emerald-400 font-bold px-2 bg-emerald-500/10 border border-emerald-500/20 py-1.5 rounded-lg">Installed</span>
            ) : (
              <button
                data-testid="button-buy-battery"
                onClick={handleBuyBattery}
                disabled={tempMiningPoints < batteryCost}
                className="bg-primary text-black text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-40 disabled:bg-white/10 disabled:text-white/40 transition-colors whitespace-nowrap"
              >
                {batteryCost.toLocaleString()} pts
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Revive Ad Modal */}
      <Dialog open={isReviving} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md border-white/10 bg-[#0D0D0F]">
          <DialogTitle className="text-center text-xl">Watching Ad to Revive</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground text-sm">
            AdsGram SDK — Future: AdController.show()
          </DialogDescription>
          <div className="py-8">
            <Progress value={reviveProgress} className="h-3" />
            <p className="text-center text-muted-foreground text-sm mt-3">
              Please wait... {Math.ceil(5 - (reviveProgress / 100) * 5)}s
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
