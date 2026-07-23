import React, { useState, useCallback } from 'react';
import { ChevronRight, Zap, Star, Video } from 'lucide-react';
import { useLevel } from '../context/LevelContext';
import { useVault } from '../context/VaultContext';
import { getLevelDef, LEVELS, formatSkpShort } from '../lib/levels';
import { haptic, getTelegramWebApp } from '../lib/telegram';
import { createStageSkipInvoice } from '../lib/gameApi';

interface StageBarProps {
  onOpen: () => void;
}

export function StageBar({ onOpen }: StageBarProps) {
  const { level, progress, nextSkp, currentSkp, levelDef, totalAdsWatched } = useLevel();
  const { refreshFromServer, isTelegramUser } = useVault();
  const { tier, name } = levelDef;
  const nextDef = getLevelDef(Math.min(level + 1, 100));
  const isMaxLevel = level >= 100;

  const [skipping, setSkipping] = useState(false);

  // Determine bottleneck for the NEXT stage
  const nextLevelDef = LEVELS[Math.min(level, 99)]; // index = level (next stage)
  const skpMet = currentSkp >= nextLevelDef.skpRequired;
  const videosMet = totalAdsWatched >= nextLevelDef.videosRequired;
  const videosRemaining = Math.max(0, nextLevelDef.videosRequired - totalAdsWatched);
  const remaining = Math.max(0, nextSkp - currentSkp);

  // Show video bottleneck if SKP is met but videos are not
  const showVideoBottleneck = !isMaxLevel && skpMet && !videosMet;

  const handleSkip = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (skipping || isMaxLevel) return;
    const targetLevel = level + 1;
    if (targetLevel > 100) return;
    haptic('medium');
    setSkipping(true);
    try {
      const { invoiceUrl } = await createStageSkipInvoice(targetLevel);
      const webApp = getTelegramWebApp();
      if (webApp?.openInvoice) {
        webApp.openInvoice(invoiceUrl, async (status: string) => {
          if (status === 'paid') {
            haptic('success');
            await refreshFromServer();
          }
          setSkipping(false);
        });
      } else {
        window.open(invoiceUrl, '_blank');
        setSkipping(false);
      }
    } catch {
      haptic('error');
      setSkipping(false);
    }
  }, [skipping, isMaxLevel, level, refreshFromServer]);

  return (
    <button
      onClick={() => { haptic('light'); onOpen(); }}
      className="w-full px-3 py-2.5 flex flex-col gap-1.5 active:opacity-80 transition-opacity relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${tier.color}12 0%, transparent 60%)`,
        borderBottom: `1px solid ${tier.color}20`,
      }}
    >
      {/* Subtle glow layer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 60% at 10% 50%, ${tier.color}08, transparent)` }}
      />

      {/* Row 1: Stage info + Skip button + arrow */}
      <div className="flex items-center gap-2 relative z-10">
        {/* Tier badge */}
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg shrink-0"
          style={{ background: `${tier.color}18`, border: `1px solid ${tier.color}35` }}
        >
          <span className="text-[11px]">{tier.icon}</span>
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: tier.color }}>
            Stage {level}
          </span>
        </div>

        {/* Stage name */}
        <span className="text-[12px] font-bold text-white/80 truncate flex-1">{name}</span>

        {/* Right side */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* SKP remaining indicator */}
          {!isMaxLevel && !showVideoBottleneck && (
            <div className="flex items-center gap-0.5">
              <Zap className="w-3 h-3" style={{ color: tier.color }} />
              <span className="text-[10px] font-bold" style={{ color: tier.color }}>
                {formatSkpShort(remaining)} to go
              </span>
            </div>
          )}

          {/* Video bottleneck indicator */}
          {showVideoBottleneck && (
            <div className="flex items-center gap-0.5">
              <Video className="w-3 h-3 text-sky-400" />
              <span className="text-[10px] font-bold text-sky-400">
                {videosRemaining} vids left
              </span>
            </div>
          )}

          {/* Stars skip button */}
          {!isMaxLevel && isTelegramUser && (
            <button
              onClick={handleSkip}
              disabled={skipping}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded-md active:scale-95 transition-all"
              style={{ background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.25)' }}
            >
              <Star className="w-2.5 h-2.5 text-amber-400" />
              <span className="text-[10px] font-black text-amber-400">
                {skipping ? '…' : nextLevelDef.starsSkipCost}
              </span>
            </button>
          )}

          {isMaxLevel && (
            <span className="text-[10px] font-black text-amber-400">MAX ✦</span>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-white/30 ml-0.5" />
        </div>
      </div>

      {/* Row 2: Progress bar */}
      <div className="relative z-10 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 relative"
            style={{
              width: `${isMaxLevel ? 100 : progress}%`,
              background: `linear-gradient(90deg, ${tier.color}cc, ${tier.color})`,
            }}
          >
            <div
              className="absolute inset-0 rounded-full animate-pulse"
              style={{ background: `linear-gradient(90deg, transparent, ${tier.color}50, transparent)` }}
            />
          </div>
        </div>

        {/* Progress numbers */}
        {!isMaxLevel && (
          <span className="text-[9px] font-bold text-white/35 shrink-0 tabular-nums">
            {formatSkpShort(currentSkp)} / {formatSkpShort(nextSkp)}
          </span>
        )}

        {/* Video progress (shows when videos also tracked) */}
        {!isMaxLevel && nextLevelDef.videosRequired > 0 && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold shrink-0"
            style={{ color: videosMet ? '#34d399' : '#38bdf8' }}
          >
            <Video className="w-2.5 h-2.5" />
            {Math.min(totalAdsWatched, nextLevelDef.videosRequired)}/{nextLevelDef.videosRequired}
          </span>
        )}

        {/* Next stage pill */}
        {!isMaxLevel && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
            style={{ background: `${nextDef.tier.color}15`, color: `${nextDef.tier.color}cc` }}
          >
            {nextDef.tier.icon} {level + 1}
          </span>
        )}
      </div>
    </button>
  );
}
