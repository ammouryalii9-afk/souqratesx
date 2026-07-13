import { useState } from 'react';
import { useVault, SKINS } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import { Check, Lock, Sparkles, ShoppingBag } from 'lucide-react';

type Rarity = 'شائع' | 'نادر' | 'ملحمي' | 'أسطوري';

const SKIN_META: Record<number, {
  emoji: string;
  rarity: Rarity;
  desc: string;
  rarityColor: string;
  rarityBg: string;
  cardGradient: string;
}> = {
  1: {
    emoji: '⛏️',
    rarity: 'شائع',
    desc: 'الجلد الأصلي',
    rarityColor: '#a3a3a3',
    rarityBg: 'rgba(163,163,163,0.15)',
    cardGradient: 'linear-gradient(135deg, rgba(245,197,24,0.12) 0%, rgba(20,20,24,0.95) 100%)',
  },
  2: {
    emoji: '⚡',
    rarity: 'نادر',
    desc: 'طاقة نيون مضيئة',
    rarityColor: '#22d3ee',
    rarityBg: 'rgba(34,211,238,0.12)',
    cardGradient: 'linear-gradient(135deg, rgba(34,211,238,0.14) 0%, rgba(12,20,30,0.97) 100%)',
  },
  3: {
    emoji: '💎',
    rarity: 'ملحمي',
    desc: 'جوهرة الزمرد النادرة',
    rarityColor: '#34d399',
    rarityBg: 'rgba(52,211,153,0.12)',
    cardGradient: 'linear-gradient(135deg, rgba(52,211,153,0.14) 0%, rgba(10,22,18,0.97) 100%)',
  },
  4: {
    emoji: '👑',
    rarity: 'أسطوري',
    desc: 'البنفسجي الملكي',
    rarityColor: '#f59e0b',
    rarityBg: 'rgba(245,158,11,0.12)',
    cardGradient: 'linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(15,10,28,0.97) 100%)',
  },
};

const RARITY_ORDER: Rarity[] = ['شائع', 'نادر', 'ملحمي', 'أسطوري'];

function PulseRing({ color }: { color: string }) {
  return (
    <span
      className="absolute inset-0 rounded-full animate-ping opacity-30"
      style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
    />
  );
}

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
    setTimeout(() => setPressedId(null), 150);

    if (isOwned) {
      equipSkin(skinId);
      toast({ title: '✅ تم التجهيز', description: SKINS[skinId]?.name });
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
      toast({ title: '🎨 تم الشراء!', description: `${SKINS[skinId]?.name} تم تجهيزه` });
    }
  }

  const ownedCount = Object.keys(SKINS).filter(id => owned.has(Number(id))).length;
  const totalCount = Object.keys(SKINS).length;

  return (
    <section className="pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-white">متجر الجلود</h2>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/8 rounded-full px-3 py-1">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-xs font-bold text-primary">{ownedCount}</span>
          <span className="text-xs text-muted-foreground">/ {totalCount}</span>
        </div>
      </div>

      {/* Cards Grid */}
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
              className="relative rounded-2xl overflow-hidden text-left transition-all duration-150 disabled:cursor-not-allowed"
              style={{
                background: meta.cardGradient,
                border: isEquipped
                  ? `1.5px solid ${skin.accent}`
                  : isOwned
                  ? `1.5px solid ${skin.accent}55`
                  : '1.5px solid rgba(255,255,255,0.06)',
                transform: isPressed ? 'scale(0.95)' : 'scale(1)',
                boxShadow: isEquipped
                  ? `0 0 20px ${skin.glow}, 0 0 40px ${skin.glow}55`
                  : 'none',
              }}
            >
              {/* Locked overlay */}
              {isLocked && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] z-10 flex items-end justify-center pb-3">
                  <div className="flex items-center gap-1 bg-black/60 rounded-full px-2.5 py-1">
                    <Lock className="w-3 h-3 text-white/60" />
                    <span className="text-[10px] text-white/60 font-semibold">{skin.price.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Equipped badge */}
              {isEquipped && (
                <div
                  className="absolute top-2 left-2 z-20 w-5 h-5 rounded-full flex items-center justify-center shadow-lg"
                  style={{ background: skin.accent }}
                >
                  <Check className="w-3 h-3 text-black" strokeWidth={3} />
                </div>
              )}

              {/* Rarity badge */}
              <div className="absolute top-2 right-2 z-20">
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ color: meta.rarityColor, background: meta.rarityBg }}
                >
                  {meta.rarity}
                </span>
              </div>

              {/* Skin orb / preview */}
              <div className="flex items-center justify-center pt-8 pb-3 px-4">
                <div className="relative flex items-center justify-center">
                  {/* Outer glow ring */}
                  <div
                    className="absolute w-16 h-16 rounded-full opacity-20"
                    style={{ background: `radial-gradient(circle, ${skin.accent} 0%, transparent 70%)` }}
                  />
                  {/* Pulse ring for equipped */}
                  {isEquipped && (
                    <div className="absolute w-16 h-16">
                      <PulseRing color={skin.accent} />
                    </div>
                  )}
                  {/* Inner orb */}
                  <div
                    className="relative w-14 h-14 rounded-full flex items-center justify-center"
                    style={{
                      background: `radial-gradient(circle at 35% 35%, ${skin.accent}cc 0%, ${skin.accent}44 60%, transparent 100%)`,
                      boxShadow: isOwned
                        ? `0 0 20px ${skin.glow}, inset 0 1px 1px rgba(255,255,255,0.2)`
                        : `0 0 8px ${skin.glow}55`,
                    }}
                  >
                    <span className="text-2xl" style={{ filter: isLocked ? 'grayscale(0.6) opacity(0.5)' : 'none' }}>
                      {meta.emoji}
                    </span>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="px-3 pb-3 flex flex-col gap-2">
                <div>
                  <p className="text-sm font-bold text-white leading-tight text-center">{skin.name}</p>
                  <p className="text-[10px] text-muted-foreground text-center mt-0.5">{meta.desc}</p>
                </div>

                {/* Action button */}
                <div
                  className="w-full h-7 rounded-xl flex items-center justify-center text-[11px] font-bold"
                  style={
                    isEquipped
                      ? { background: `${skin.accent}22`, color: skin.accent }
                      : isOwned
                      ? { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }
                      : canAfford
                      ? {
                          background: `linear-gradient(135deg, ${skin.accent} 0%, ${skin.accent}cc 100%)`,
                          color: '#000',
                          boxShadow: `0 2px 10px ${skin.glow}`,
                        }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }
                  }
                >
                  {isEquipped
                    ? '✓ مُجهَّز'
                    : isOwned
                    ? 'تجهيز'
                    : skin.price === 0
                    ? 'احصل مجاناً'
                    : `${skin.price.toLocaleString()} نقطة`}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Rarity legend */}
      <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
        {RARITY_ORDER.map((r) => {
          const meta = Object.values(SKIN_META).find(m => m.rarity === r);
          if (!meta) return null;
          return (
            <div key={r} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.rarityColor }} />
              <span className="text-[10px] text-muted-foreground">{r}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
