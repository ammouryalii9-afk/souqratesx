import React from 'react';
import { Lock } from 'lucide-react';
import { useLevel } from '../context/LevelContext';
import { getLevelDef, FEATURE_LEVEL_REQUIRED, formatSkpShort } from '../lib/levels';
import { haptic } from '../lib/telegram';

interface LevelGateProps {
  feature: string;
  children: React.ReactNode;
  onUnlockClick?: () => void;
}

export function LevelGate({ feature, children, onUnlockClick }: LevelGateProps) {
  const { isFeatureUnlocked, level, levelDef } = useLevel();
  if (isFeatureUnlocked(feature)) return <>{children}</>;

  const required = FEATURE_LEVEL_REQUIRED[feature] ?? 1;
  const reqDef = getLevelDef(required);
  const skpNeeded = reqDef.skpRequired;

  return (
    <LockedScreen
      currentLevel={level}
      currentTierIcon={levelDef.tier.icon}
      requiredLevel={required}
      requiredName={reqDef.name}
      requiredNameAr={reqDef.nameAr}
      requiredTierIcon={reqDef.tier.icon}
      requiredTierColor={reqDef.tier.color}
      skpNeeded={skpNeeded}
      onUnlockClick={onUnlockClick}
    />
  );
}

interface LockedScreenProps {
  currentLevel: number;
  currentTierIcon: string;
  requiredLevel: number;
  requiredName: string;
  requiredNameAr: string;
  requiredTierIcon: string;
  requiredTierColor: string;
  skpNeeded: number;
  onUnlockClick?: () => void;
}

function LockedScreen({
  currentLevel,
  currentTierIcon,
  requiredLevel,
  requiredName,
  requiredNameAr,
  requiredTierIcon,
  requiredTierColor,
  skpNeeded,
  onUnlockClick,
}: LockedScreenProps) {
  const levelsAway = requiredLevel - currentLevel;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-12 animate-in fade-in duration-300">
      {/* Lock icon */}
      <div
        className="w-20 h-20 rounded-[24px] flex items-center justify-center mb-6 relative"
        style={{
          background: `linear-gradient(135deg, ${requiredTierColor}22, ${requiredTierColor}10)`,
          border: `2px solid ${requiredTierColor}44`,
          boxShadow: `0 0 40px ${requiredTierColor}20`,
        }}
      >
        <Lock className="w-9 h-9" style={{ color: requiredTierColor }} />
        <div
          className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-lg font-black border-2"
          style={{ background: '#0a0f1a', borderColor: requiredTierColor }}
        >
          {requiredTierIcon}
        </div>
      </div>

      {/* Locked text */}
      <h2 className="text-xl font-black text-white mb-1 text-center">محتوى مقفل</h2>
      <p className="text-sm text-white/50 text-center mb-6">هذا التبويب يفتح عند الوصول لـ</p>

      {/* Required level badge */}
      <div
        className="flex items-center gap-3 px-5 py-3 rounded-2xl mb-2"
        style={{
          background: `${requiredTierColor}14`,
          border: `1px solid ${requiredTierColor}40`,
        }}
      >
        <span className="text-2xl">{requiredTierIcon}</span>
        <div>
          <div className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">المرحلة المطلوبة</div>
          <div className="font-black text-white text-lg">
            المرحلة {requiredLevel} — {requiredNameAr}
          </div>
        </div>
      </div>

      {/* SKP needed */}
      <div className="text-[13px] text-white/40 mb-8 text-center">
        تحتاج <span className="text-primary font-bold">{formatSkpShort(skpNeeded)}</span> نقطة مدى الحياة
      </div>

      {/* Progress hint */}
      <div
        className="w-full rounded-2xl p-4 flex items-center gap-3"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <span className="text-2xl">{currentTierIcon}</span>
        <div className="flex-1">
          <div className="text-[11px] text-white/40 mb-0.5">مرحلتك الحالية</div>
          <div className="text-sm font-bold text-white">المرحلة {currentLevel}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/30">{levelsAway} مرحلة متبقية</div>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => { haptic('light'); onUnlockClick?.(); }}
        className="mt-6 w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.97]"
        style={{
          background: `linear-gradient(135deg, ${requiredTierColor}, ${requiredTierColor}bb)`,
          color: '#0a0f1a',
          boxShadow: `0 4px 20px ${requiredTierColor}40`,
        }}
      >
        ارفع مستواك الآن ⚡
      </button>
    </div>
  );
}
