import { useState } from 'react';
import { useVault, SKINS } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import { Check, Lock, Sparkles, Palette } from 'lucide-react';

type Rarity = 'Starter' | 'Rare' | 'Epic' | 'Legendary';

const SKIN_META: Record<number, {
  icon: string;
  rarity: Rarity;
  desc: string;
  cardFrom: string;
  cardMid: string;
  orbLight: string;
  orbMid: string;
  orbDark: string;
  rarityColor: string;
  rarityGlow: string;
  legendary: boolean;
}> = {
  1: {
    icon: '⛏️',
    rarity: 'Starter',
    desc: 'الإصدار الكلاسيكي الأصلي',
    cardFrom: 'rgba(245,197,24,0.20)', cardMid: 'rgba(180,130,10,0.07)',
    orbLight: '#fef3c7', orbMid: '#f5c518', orbDark: '#92400e',
    rarityColor: '#94a3b8', rarityGlow: 'rgba(148,163,184,0.0)',
    legendary: false,
  },
  2: {
    icon: '⚡',
    rarity: 'Rare',
    desc: 'طاقة نيون كهربائية متوهجة',
    cardFrom: 'rgba(34,211,238,0.22)', cardMid: 'rgba(6,182,212,0.07)',
    orbLight: '#cffafe', orbMid: '#22d3ee', orbDark: '#0e4f60',
    rarityColor: '#22d3ee', rarityGlow: 'rgba(34,211,238,0.35)',
    legendary: false,
  },
  3: {
    icon: '💎',
    rarity: 'Epic',
    desc: 'قوة الزمرد الملكية النادرة',
    cardFrom: 'rgba(52,211,153,0.22)', cardMid: 'rgba(16,185,129,0.07)',
    orbLight: '#d1fae5', orbMid: '#34d399', orbDark: '#064e3b',
    rarityColor: '#34d399', rarityGlow: 'rgba(52,211,153,0.45)',
    legendary: false,
  },
  4: {
    icon: '👑',
    rarity: 'Epic',
    desc: 'هيبة ملكية أرجوانية فاخرة',
    cardFrom: 'rgba(167,139,250,0.22)', cardMid: 'rgba(139,92,246,0.07)',
    orbLight: '#ede9fe', orbMid: '#a78bfa', orbDark: '#3b0764',
    rarityColor: '#a78bfa', rarityGlow: 'rgba(167,139,250,0.45)',
    legendary: false,
  },
  5: {
    icon: '❤️‍🔥',
    rarity: 'Epic',
    desc: 'غضب قرمزي محترق لا يُقاوم',
    cardFrom: 'rgba(248,113,113,0.24)', cardMid: 'rgba(239,68,68,0.08)',
    orbLight: '#fee2e2', orbMid: '#f87171', orbDark: '#7f1d1d',
    rarityColor: '#f87171', rarityGlow: 'rgba(248,113,113,0.45)',
    legendary: false,
  },
  6: {
    icon: '🧊',
    rarity: 'Legendary',
    desc: 'برودة مطلقة من أعماق الكون',
    cardFrom: 'rgba(125,211,252,0.26)', cardMid: 'rgba(56,189,248,0.09)',
    orbLight: '#f0f9ff', orbMid: '#7dd3fc', orbDark: '#0c4a6e',
    rarityColor: '#fde047', rarityGlow: 'rgba(253,224,71,0.55)',
    legendary: true,
  },
  7: {
    icon: '🪐',
    rarity: 'Legendary',
    desc: 'قوة المجرة اللانهائية',
    cardFrom: 'rgba(192,132,252,0.26)', cardMid: 'rgba(168,85,247,0.09)',
    orbLight: '#f3e8ff', orbMid: '#c084fc', orbDark: '#3b0764',
    rarityColor: '#fde047', rarityGlow: 'rgba(253,224,71,0.55)',
    legendary: true,
  },
  8: {
    icon: '🏆',
    rarity: 'Legendary',
    desc: 'سيادة مطلقة، ما وراء الحدود',
    cardFrom: 'rgba(251,191,36,0.30)', cardMid: 'rgba(245,158,11,0.10)',
    orbLight: '#fef9c3', orbMid: '#fbbf24', orbDark: '#78350f',
    rarityColor: '#fde047', rarityGlow: 'rgba(253,224,71,0.65)',
    legendary: true,
  },
};

const RARITY_ORDER: Rarity[] = ['Starter', 'Rare', 'Epic', 'Legendary'];

const RARITY_LABEL: Record<Rarity, string> = {
  Starter: 'STARTER',
  Rare: 'RARE',
  Epic: 'EPIC ✦',
  Legendary: '★ LEGENDARY',
};

export function SkinsShop() {
  const { ownedSkinIds, equippedSkinId, tempMiningPoints, buySkin, equipSkin } = useVault();
  const { toast } = useToast();
  const [pressedId, setPressedId] = useState<number | null>(null);

  const owned = new Set(ownedSkinIds);
  owned.add(1);
  const effectiveEquipped = equippedSkinId ?? 1;

  function handleAction(skinId: number, isOwned: boolean, price: number) {
    haptic('medium');
    setPressedId(skinId);
    setTimeout(() => setPressedId(null), 160);

    if (isOwned) {
      equipSkin(skinId);
      toast({ title: '✅ تم تفعيل الـ Skin', description: SKINS[skinId]?.name });
      return;
    }
    if (tempMiningPoints < price) {
      haptic('error');
      toast({
        title: 'نقاط غير كافية',
        description: `تحتاج ${price.toLocaleString()} نقطة`,
        variant: 'destructive',
      });
      return;
    }
    const ok = buySkin(skinId);
    if (ok) {
      haptic('success');
      toast({ title: '🎨 تم فتح الـ Skin!', description: `${SKINS[skinId]?.name} مفعّل الآن` });
    }
  }

  const ownedCount = Object.keys(SKINS).filter(id => owned.has(Number(id))).length;
  const totalCount = Object.keys(SKINS).length;

  return (
    <section className="pb-4">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.25) 0%, rgba(245,158,11,0.15) 100%)',
              border: '1px solid rgba(168,85,247,0.3)',
              boxShadow: '0 0 14px rgba(168,85,247,0.15)',
            }}
          >
            <Palette className="w-4.5 h-4.5" style={{ color: '#a78bfa' }} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white leading-tight">متجر الـ Skins</h2>
            <p className="text-[10px] text-white/40 leading-none mt-0.5">خصّص لون المنجم</p>
          </div>
        </div>
        {/* collection badge */}
        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
          style={{
            background: 'rgba(251,191,36,0.10)',
            border: '1px solid rgba(251,191,36,0.25)',
          }}
        >
          <Sparkles className="w-3 h-3" style={{ color: '#fbbf24' }} />
          <span className="text-xs font-bold" style={{ color: '#fbbf24' }}>{ownedCount}</span>
          <span className="text-xs text-white/35">/ {totalCount}</span>
        </div>
      </div>

      {/* ── Cards Grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(SKINS).map(([idStr, skin]) => {
          const id = Number(idStr);
          const meta = SKIN_META[id];
          const isOwned = owned.has(id);
          const isEquipped = effectiveEquipped === id;
          const canAfford = tempMiningPoints >= skin.price;
          const isLocked = !isOwned && !canAfford;
          const isPressed = pressedId === id;

          return (
            <button
              key={id}
              onClick={() => handleAction(id, isOwned, skin.price)}
              disabled={isLocked}
              className="relative rounded-2xl overflow-hidden text-left flex flex-col transition-all duration-150 disabled:cursor-not-allowed"
              style={{
                background: `linear-gradient(150deg, ${meta.cardFrom} 0%, ${meta.cardMid} 45%, rgba(4,6,14,0.99) 100%)`,
                border: isEquipped
                  ? `1.5px solid ${skin.accent}`
                  : isOwned
                  ? `1.5px solid ${skin.accent}55`
                  : `1px solid rgba(255,255,255,0.07)`,
                boxShadow: isEquipped
                  ? `0 0 28px ${skin.glow}, 0 0 56px ${skin.glow}55, inset 0 1px 0 rgba(255,255,255,0.05)`
                  : isOwned
                  ? `0 0 12px ${skin.glow}44`
                  : 'none',
                transform: isPressed ? 'scale(0.94)' : 'scale(1)',
              }}
            >
              {/* Legendary shimmer sweep */}
              {meta.legendary && (
                <div
                  className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-0"
                  aria-hidden
                >
                  <div
                    className="absolute inset-y-0 w-1/3"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(253,224,71,0.06) 50%, transparent 100%)',
                      animation: 'shimmer 3.5s ease-in-out infinite',
                    }}
                  />
                </div>
              )}

              {/* Equipped animated ring on card edge */}
              {isEquipped && (
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none z-0"
                  style={{
                    boxShadow: `inset 0 0 0 1.5px ${skin.accent}`,
                    animation: 'vaultPulse 2.5s ease-in-out infinite',
                  }}
                  aria-hidden
                />
              )}

              {/* ── Top badges row ─────────────────────────────────── */}
              <div className="relative z-10 flex items-center justify-between px-2.5 pt-2.5">
                {/* Rarity pill */}
                <span
                  className="text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full"
                  style={{
                    color: meta.rarityColor,
                    background: `${meta.rarityColor}18`,
                    border: `1px solid ${meta.rarityColor}35`,
                    textShadow: meta.legendary ? `0 0 8px ${meta.rarityGlow}` : 'none',
                  }}
                >
                  {RARITY_LABEL[meta.rarity]}
                </span>
                {/* Equipped check */}
                {isEquipped && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shadow-lg"
                    style={{ background: skin.accent, boxShadow: `0 0 8px ${skin.glow}` }}
                  >
                    <Check className="w-3 h-3 text-black" strokeWidth={3} />
                  </div>
                )}
              </div>

              {/* ── 3-D Orb ────────────────────────────────────────── */}
              <div className="relative z-10 flex items-center justify-center py-5 px-3">
                {/* outer soft glow ring */}
                <div
                  className="absolute rounded-full"
                  style={{
                    width: 86, height: 86,
                    background: `radial-gradient(circle, ${skin.accent}28 0%, transparent 70%)`,
                    filter: 'blur(6px)',
                  }}
                />
                {/* pulsing ring for equipped */}
                {isEquipped && (
                  <div
                    className="absolute rounded-full animate-ping"
                    style={{
                      width: 76, height: 76,
                      border: `1.5px solid ${skin.accent}55`,
                      animationDuration: '2s',
                    }}
                  />
                )}
                {/* owned glow ring */}
                {isOwned && !isEquipped && (
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 72, height: 72,
                      border: `1px solid ${skin.accent}35`,
                      boxShadow: `0 0 14px ${skin.glow}55`,
                    }}
                  />
                )}
                {/* 3-D sphere */}
                <div
                  className="relative flex items-center justify-center rounded-full"
                  style={{
                    width: 64, height: 64,
                    background: `radial-gradient(circle at 32% 28%, ${meta.orbLight} 0%, ${meta.orbMid} 48%, ${meta.orbDark} 100%)`,
                    boxShadow: isOwned
                      ? `0 4px 24px ${skin.glow}, 0 0 40px ${skin.glow}44, inset 0 -3px 8px rgba(0,0,0,0.5), inset 0 3px 6px rgba(255,255,255,0.12)`
                      : `0 2px 10px rgba(0,0,0,0.5), inset 0 -3px 8px rgba(0,0,0,0.5), inset 0 3px 6px rgba(255,255,255,0.08)`,
                    filter: isLocked ? 'grayscale(0.65) brightness(0.55)' : 'none',
                  }}
                >
                  {/* shine highlight */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 22, height: 14,
                      top: 9, left: 10,
                      background: 'rgba(255,255,255,0.30)',
                      filter: 'blur(3px)',
                      transform: 'rotate(-20deg)',
                    }}
                  />
                  {/* icon */}
                  <span
                    className="relative text-3xl select-none"
                    style={{
                      filter: isLocked ? 'none' : `drop-shadow(0 0 6px ${skin.glow})`,
                    }}
                  >
                    {meta.icon}
                  </span>
                </div>
              </div>

              {/* ── Text info ─────────────────────────────────────── */}
              <div className="relative z-10 px-3 pb-3 flex flex-col gap-2 flex-1">
                <div className="text-center">
                  <p
                    className="text-sm font-extrabold leading-tight"
                    style={{
                      color: isOwned ? skin.accent : 'rgba(255,255,255,0.85)',
                      textShadow: isOwned ? `0 0 12px ${skin.glow}` : 'none',
                    }}
                  >
                    {skin.name}
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5 leading-tight">{meta.desc}</p>
                </div>

                {/* ── CTA button ───────────────────────────────────── */}
                <div
                  className="w-full rounded-xl py-1.5 flex items-center justify-center gap-1.5 text-[11px] font-bold mt-auto"
                  style={
                    isEquipped
                      ? {
                          background: `${skin.accent}22`,
                          color: skin.accent,
                          border: `1px solid ${skin.accent}44`,
                          textShadow: `0 0 10px ${skin.glow}`,
                        }
                      : isOwned
                      ? {
                          background: 'rgba(255,255,255,0.07)',
                          color: 'rgba(255,255,255,0.65)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }
                      : canAfford
                      ? {
                          background: `linear-gradient(135deg, ${skin.accent} 0%, ${skin.accent}cc 100%)`,
                          color: '#000',
                          fontWeight: 900,
                          boxShadow: `0 3px 14px ${skin.glow}`,
                          border: 'none',
                        }
                      : {
                          background: 'rgba(255,255,255,0.04)',
                          color: 'rgba(255,255,255,0.25)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }
                  }
                >
                  {isEquipped ? (
                    <>
                      <Check className="w-3 h-3" strokeWidth={3} />
                      مفعّل
                    </>
                  ) : isOwned ? (
                    'تفعيل'
                  ) : isLocked ? (
                    <>
                      <Lock className="w-3 h-3" />
                      {skin.price.toLocaleString()}
                    </>
                  ) : skin.price === 0 ? (
                    'مجاناً'
                  ) : (
                    `${skin.price.toLocaleString()} نقطة`
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Rarity legend ──────────────────────────────────────────── */}
      <div className="mt-5 flex items-center justify-center gap-4 flex-wrap">
        {RARITY_ORDER.map((r) => {
          const meta = Object.values(SKIN_META).find(m => m.rarity === r);
          if (!meta) return null;
          return (
            <div key={r} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: meta.rarityColor,
                  boxShadow: meta.legendary ? `0 0 6px ${meta.rarityGlow}` : 'none',
                }}
              />
              <span className="text-[10px] font-semibold" style={{ color: meta.rarityColor }}>
                {r}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
