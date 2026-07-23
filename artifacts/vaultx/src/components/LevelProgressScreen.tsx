import { useRef, useEffect, useState, useCallback } from 'react';
import { CheckCircle2, Lock, X, Zap, Star, Video } from 'lucide-react';
import { useLevel } from '../context/LevelContext';
import { useVault } from '../context/VaultContext';
import { LEVELS, formatSkpShort } from '../lib/levels';
import { haptic, getTelegramWebApp } from '../lib/telegram';
import { createStageSkipInvoice } from '../lib/gameApi';

interface Props { onClose: () => void }

export function LevelProgressScreen({ onClose }: Props) {
  const { level, progress, nextSkp, currentSkp, totalAdsWatched } = useLevel();
  const { refreshFromServer, isTelegramUser } = useVault();
  const activeRef = useRef<HTMLDivElement>(null);
  const [skippingLevel, setSkippingLevel] = useState<number | null>(null);

  useEffect(() => {
    setTimeout(() => activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }, []);

  const handleSkip = useCallback(async (targetLevel: number) => {
    if (skippingLevel !== null) return;
    haptic('medium');
    setSkippingLevel(targetLevel);
    try {
      const { invoiceUrl } = await createStageSkipInvoice(targetLevel);
      const webApp = getTelegramWebApp();
      if (webApp?.openInvoice) {
        webApp.openInvoice(invoiceUrl, async (status: string) => {
          if (status === 'paid') {
            haptic('success');
            await refreshFromServer();
          }
          setSkippingLevel(null);
        });
      } else {
        window.open(invoiceUrl, '_blank');
        setSkippingLevel(null);
      }
    } catch {
      haptic('error');
      setSkippingLevel(null);
    }
  }, [skippingLevel, refreshFromServer]);

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-[#060d1a] animate-in slide-in-from-bottom duration-300">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-white/8">
        <button
          onClick={() => { haptic('light'); onClose(); }}
          className="p-2 rounded-xl bg-white/5 active:scale-90 transition-all"
        >
          <X className="w-5 h-5 text-white/70" />
        </button>
        <div className="flex-1">
          <h2 className="font-black text-white text-lg leading-none">All Stages</h2>
          <p className="text-[11px] text-white/40 mt-0.5">100 Stages · Your Stage {level}</p>
        </div>
        <div
          className="px-3 py-1.5 rounded-xl text-[12px] font-black"
          style={{
            background: `${LEVELS[level - 1].tier.color}18`,
            color: LEVELS[level - 1].tier.color,
            border: `1px solid ${LEVELS[level - 1].tier.color}30`,
          }}
        >
          {LEVELS[level - 1].tier.icon} {LEVELS[level - 1].tier.name}
        </div>
      </div>

      {/* ── Current stage progress card ── */}
      <div className="px-4 pt-3 pb-3 border-b border-white/5">
        <div
          className="rounded-2xl p-4"
          style={{
            background: `${LEVELS[level - 1].tier.color}10`,
            border: `1px solid ${LEVELS[level - 1].tier.color}25`,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-0.5">Current Stage</div>
              <div className="text-[18px] font-black text-white">
                {LEVELS[level - 1].tier.icon} {LEVELS[level - 1].name}
              </div>
            </div>
            <div
              className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center"
              style={{ background: `${LEVELS[level - 1].tier.color}20`, border: `2px solid ${LEVELS[level - 1].tier.color}40` }}
            >
              <span className="text-[10px] text-white/40">Stage</span>
              <span className="text-[20px] font-black" style={{ color: LEVELS[level - 1].tier.color }}>{level}</span>
            </div>
          </div>

          <div className="flex justify-between mb-1.5">
            <span className="text-[11px] text-white/50">
              <Zap className="inline w-3 h-3 mr-0.5" style={{ color: LEVELS[level - 1].tier.color }} />
              {formatSkpShort(currentSkp)} SKP
            </span>
            {level < 100 && (
              <span className="text-[11px] text-white/50">
                Next: {formatSkpShort(nextSkp)} SKP
              </span>
            )}
          </div>
          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${level >= 100 ? 100 : progress}%`,
                background: `linear-gradient(90deg, ${LEVELS[level - 1].tier.color}cc, ${LEVELS[level - 1].tier.color})`,
                boxShadow: `0 0 8px ${LEVELS[level - 1].tier.glow}`,
              }}
            />
          </div>
          {level < 100 && (
            <div className="mt-1.5 text-[11px] text-white/35 text-right">
              {formatSkpShort(Math.max(0, nextSkp - currentSkp))} SKP remaining
            </div>
          )}

          {/* Video progress for next stage */}
          {level < 100 && LEVELS[level].videosRequired > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-sky-400" />
              <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (totalAdsWatched / LEVELS[level].videosRequired) * 100)}%`,
                    background: totalAdsWatched >= LEVELS[level].videosRequired
                      ? 'linear-gradient(90deg, #34d399cc, #34d399)'
                      : 'linear-gradient(90deg, #38bdf8cc, #38bdf8)',
                  }}
                />
              </div>
              <span className="text-[10px] font-bold"
                style={{ color: totalAdsWatched >= LEVELS[level].videosRequired ? '#34d399' : '#38bdf8' }}
              >
                {Math.min(totalAdsWatched, LEVELS[level].videosRequired)}/{LEVELS[level].videosRequired} videos
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/4">
        <div className="flex items-center gap-1 text-[10px] text-white/40">
          <Zap className="w-3 h-3 text-amber-400" />
          <span>SKP required</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-white/40">
          <Video className="w-3 h-3 text-sky-400" />
          <span>Videos required</span>
        </div>
        {isTelegramUser && (
          <div className="flex items-center gap-1 text-[10px] text-white/40">
            <Star className="w-3 h-3 text-amber-400" />
            <span>Skip with Stars</span>
          </div>
        )}
      </div>

      {/* ── Stages list ── */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6 space-y-1">
        {LEVELS.map((def) => {
          const isCompleted = def.level < level;
          const isCurrent   = def.level === level;
          const isLocked    = def.level > level;
          const skpMet = currentSkp >= def.skpRequired;
          const videosMet = totalAdsWatched >= def.videosRequired;

          // Tier separator
          const showTierHeader = def.level === def.tier.from;

          return (
            <div key={def.level}>
              {/* Tier group header */}
              {showTierHeader && (
                <div
                  className="flex items-center gap-2 px-2 py-2 mt-3 mb-1 first:mt-0"
                  style={{ borderTop: def.level > 1 ? '1px solid rgba(255,255,255,0.05)' : undefined }}
                >
                  <span className="text-base">{def.tier.icon}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: def.tier.color }}>
                    {def.tier.name} — Stages {def.tier.from}–{def.tier.to}
                  </span>
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${def.tier.color}30, transparent)` }} />
                </div>
              )}

              {/* Stage row */}
              <div
                ref={isCurrent ? activeRef : undefined}
                className="rounded-xl overflow-hidden transition-all"
                style={{
                  background: isCurrent
                    ? `${def.tier.color}12`
                    : isCompleted
                      ? 'rgba(52,211,153,0.04)'
                      : 'rgba(255,255,255,0.02)',
                  border: isCurrent
                    ? `1px solid ${def.tier.color}35`
                    : isCompleted
                      ? '1px solid rgba(52,211,153,0.12)'
                      : '1px solid rgba(255,255,255,0.04)',
                  boxShadow: isCurrent ? `0 0 16px ${def.tier.glow}` : 'none',
                }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Status icon */}
                  <div
                    className="w-9 h-9 rounded-[12px] flex flex-col items-center justify-center shrink-0"
                    style={{
                      background: isCompleted ? 'rgba(52,211,153,0.15)' :
                                  isCurrent   ? `${def.tier.color}20` : 'rgba(255,255,255,0.04)',
                      border: isCompleted ? '1px solid rgba(52,211,153,0.3)' :
                              isCurrent   ? `1px solid ${def.tier.color}40` : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : isLocked ? (
                      <Lock className="w-3.5 h-3.5 text-white/20" />
                    ) : (
                      <>
                        <span className="text-[8px]" style={{ color: def.tier.color }}>{def.tier.icon}</span>
                        <span className="text-[11px] font-black" style={{ color: def.tier.color }}>{def.level}</span>
                      </>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[13px] font-black ${isLocked ? 'text-white/25' : 'text-white'}`}>
                        {def.name}
                      </span>
                      {isCurrent && (
                        <span
                          className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: `${def.tier.color}25`, color: def.tier.color }}
                        >
                          Current
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-[8px] font-bold text-primary/60">✓</span>
                      )}
                    </div>

                    {/* Requirements + rewards */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* SKP requirement */}
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-bold"
                        style={{ color: isCompleted || skpMet ? 'rgba(52,211,153,0.7)' : isLocked ? 'rgba(255,255,255,0.2)' : def.tier.color }}
                      >
                        <Zap className="w-2.5 h-2.5" />
                        {def.skpRequired === 0 ? 'Start' : `${formatSkpShort(def.skpRequired)} SKP`}
                        {(isCompleted || skpMet) && ' ✓'}
                      </span>

                      {/* Video requirement */}
                      {def.videosRequired > 0 && (
                        <span
                          className="flex items-center gap-0.5 text-[10px] font-bold"
                          style={{ color: isCompleted || videosMet ? 'rgba(52,211,153,0.7)' : isLocked ? 'rgba(255,255,255,0.15)' : '#38bdf8' }}
                        >
                          <Video className="w-2.5 h-2.5" />
                          {def.videosRequired} videos
                          {(isCompleted || videosMet) && ' ✓'}
                        </span>
                      )}

                      {/* Feature unlock badge */}
                      {def.unlocks && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{
                            background: isCompleted ? 'rgba(52,211,153,0.15)' : `${def.tier.color}12`,
                            color: isCompleted ? '#34d399' : isLocked ? 'rgba(255,255,255,0.2)' : def.tier.color,
                          }}
                        >
                          {def.unlocks.icon} Unlocks {def.unlocks.feature}
                        </span>
                      )}

                      {/* Mining bonus badge */}
                      {def.miningBonus && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{
                            background: isCompleted ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)',
                            color: isCompleted ? '#34d399' : isLocked ? 'rgba(255,255,255,0.15)' : '#fbbf24',
                          }}
                        >
                          ⚡ +{def.miningBonus}% Mining
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right side: skip button or status indicator */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    {/* Stars skip button — locked stages only, Telegram users only */}
                    {isLocked && isTelegramUser && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSkip(def.level); }}
                        disabled={skippingLevel !== null}
                        className="flex items-center gap-0.5 px-2 py-1 rounded-lg active:scale-95 transition-all"
                        style={{
                          background: 'rgba(250,204,21,0.1)',
                          border: '1px solid rgba(250,204,21,0.22)',
                          opacity: skippingLevel !== null ? 0.5 : 1,
                        }}
                      >
                        <Star className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] font-black text-amber-400">
                          {skippingLevel === def.level ? '…' : def.starsSkipCost}
                        </span>
                      </button>
                    )}

                    {/* Current stage pulse */}
                    {isCurrent && (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: `${def.tier.color}25` }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: def.tier.color }} />
                      </div>
                    )}

                    {/* Max level star */}
                    {def.level === 100 && isCompleted && (
                      <Star className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Bottom padding */}
        <div className="h-8" />
      </div>
    </div>
  );
}
