import React, { useEffect, useRef, useState } from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Battery, Zap, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

export const GamesTab = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle');
  const [score, setScore] = useState(0);
  const [isReviving, setIsReviving] = useState(false);
  const [reviveProgress, setReviveProgress] = useState(0);
  
  const { tempMiningPoints, miningLevel, maxEnergy, upgradeMiningLevel, expandBattery } = useVault();
  const { toast } = useToast();

  // Shop Data
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

  // Canvas Game Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let playerY = 150;
    let playerVelocity = 0;
    const gravity = 0.5;
    const jumpStrength = -8;
    
    let obstacles: { x: number, gapY: number, passed: boolean }[] = [];
    let frameCount = 0;
    let currentScore = score; // sync ref

    const resetGame = (keepScore = false) => {
      playerY = 150;
      playerVelocity = 0;
      obstacles = [];
      frameCount = 0;
      if (!keepScore) {
        setScore(0);
        currentScore = 0;
      }
    };

    const draw = () => {
      if (gameState !== 'playing') return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw background
      ctx.fillStyle = '#0D0D0F';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Player physics
      playerVelocity += gravity;
      playerY += playerVelocity;

      // Draw player (Gold "X")
      ctx.fillStyle = '#F5C518';
      ctx.font = 'bold 24px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('X', 50, playerY);

      // Boundaries
      if (playerY > canvas.height || playerY < 0) {
        setGameState('gameover');
        return;
      }

      // Obstacles
      if (frameCount % 100 === 0) {
        obstacles.push({
          x: canvas.width,
          gapY: Math.random() * (canvas.height - 100) + 50,
          passed: false
        });
      }

      ctx.fillStyle = '#2A2A35';
      obstacles.forEach(obs => {
        obs.x -= 3 + (currentScore / 200); // Speed increases with score
        
        // Top bar
        ctx.fillRect(obs.x, 0, 30, obs.gapY - 60);
        // Bottom bar
        ctx.fillRect(obs.x, obs.gapY + 60, 30, canvas.height - (obs.gapY + 60));

        // Collision
        if (50 > obs.x - 15 && 50 < obs.x + 30) {
          if (playerY < obs.gapY - 60 || playerY > obs.gapY + 60) {
            setGameState('gameover');
            return;
          }
        }

        // Score logic
        if (obs.x < 50 && !obs.passed) {
          obs.passed = true;
          currentScore += 50;
          setScore(currentScore);
        }
      });

      // Remove off-screen obstacles
      obstacles = obstacles.filter(obs => obs.x > -50);

      // Draw Score overlay
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.font = 'bold 48px Inter';
      ctx.fillText(`${currentScore}`, canvas.width / 2, canvas.height / 2);

      frameCount++;
      animationId = requestAnimationFrame(draw);
    };

    if (gameState === 'playing') {
      if (obstacles.length === 0 && playerY === 150) resetGame(isReviving);
      draw();
    }

    const handleInput = (e: MouseEvent | TouchEvent | KeyboardEvent) => {
      if (gameState === 'playing') {
        playerVelocity = jumpStrength;
      }
    };

    canvas.addEventListener('mousedown', handleInput);
    canvas.addEventListener('touchstart', handleInput, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') handleInput(e);
    });

    return () => {
      cancelAnimationFrame(animationId);
      canvas.removeEventListener('mousedown', handleInput);
      canvas.removeEventListener('touchstart', handleInput);
    };
  }, [gameState, isReviving]);

  const handleRevive = () => {
    setIsReviving(true);
    setReviveProgress(0);
    
    // Simulate Ad
    const duration = 5000;
    const interval = 50;
    const steps = duration / interval;
    let currentStep = 0;
    
    const timer = setInterval(() => {
      currentStep++;
      setReviveProgress((currentStep / steps) * 100);
      if (currentStep >= steps) {
        clearInterval(timer);
        setTimeout(() => {
          setIsReviving(false);
          setGameState('playing');
        }, 300);
      }
    }, interval);
  };

  return (
    <div className="flex flex-col space-y-6 pb-24 animate-in fade-in duration-500">
      
      {/* Game Section */}
      <div className="relative border-b border-white/10 bg-black">
        <canvas 
          ref={canvasRef}
          width={430}
          height={300}
          className="w-full h-[300px] cursor-pointer touch-none"
          data-testid="canvas-game"
        />
        
        {gameState === 'idle' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4 text-center backdrop-blur-sm">
            <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Tappy Dodge</h2>
            <p className="text-muted-foreground mb-6">Tap to jump. Avoid the barriers.</p>
            <button 
              onClick={() => setGameState('playing')}
              className="bg-primary text-black px-8 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(245,197,24,0.4)] active:scale-95 transition-transform"
            >
              Start Game
            </button>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 text-center backdrop-blur-md">
            <h2 className="text-3xl font-bold text-destructive mb-2">Game Over</h2>
            <p className="text-white text-xl mb-6">Score: {score}</p>
            <div className="flex gap-4">
              <button 
                onClick={() => { setScore(0); setGameState('playing'); }}
                className="bg-white/10 text-white px-6 py-3 rounded-full font-medium active:scale-95 transition-transform"
              >
                Play Again
              </button>
              <button 
                onClick={handleRevive}
                className="bg-primary text-black px-6 py-3 rounded-full font-bold shadow-[0_0_15px_rgba(245,197,24,0.3)] active:scale-95 transition-transform flex items-center gap-2"
              >
                Revive (Watch Ad)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upgrade Shop */}
      <div className="px-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Upgrade Shop</h2>
          <div className="bg-white/5 px-3 py-1 rounded-full text-xs font-medium border border-white/10">
            Bal: {Math.floor(tempMiningPoints).toLocaleString()} pts
          </div>
        </div>

        {/* Laser Drill */}
        <div className="bg-card border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="bg-primary/10 p-3 rounded-lg">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-white text-sm">Laser Drill Upgrade</h3>
            <p className="text-xs text-muted-foreground">Increases mining speed</p>
            <div className="text-xs text-primary mt-1 font-medium">
              Current: Level {miningLevel}
            </div>
          </div>
          <div>
            {miningLevel < 4 ? (
              <button 
                data-testid="button-buy-drill"
                onClick={handleBuyLevel}
                disabled={tempMiningPoints < (nextLevelCost || 0)}
                className="bg-primary text-black text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50 disabled:bg-white/10 disabled:text-white/40 transition-colors"
              >
                {nextLevelCost?.toLocaleString()} pts
              </button>
            ) : (
              <span className="text-xs text-muted-foreground font-medium px-2">Maxed</span>
            )}
          </div>
        </div>

        {/* Battery Pack */}
        <div className="bg-card border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="bg-blue-500/10 p-3 rounded-lg">
            <Battery className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-white text-sm">Battery Expansion</h3>
            <p className="text-xs text-muted-foreground">Max energy 100 → 200</p>
          </div>
          <div>
            {hasBatteryUpgrade ? (
              <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
                Installed
              </div>
            ) : (
              <button 
                data-testid="button-buy-battery"
                onClick={handleBuyBattery}
                disabled={tempMiningPoints < batteryCost}
                className="bg-primary text-black text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50 disabled:bg-white/10 disabled:text-white/40 transition-colors"
              >
                {batteryCost.toLocaleString()} pts
              </button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isReviving} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md border-white/10 bg-[#0D0D0F]">
          <DialogTitle className="text-center text-xl">Watching Ad to Revive</DialogTitle>
          <div className="py-8">
            <Progress value={reviveProgress} className="h-3" />
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};
