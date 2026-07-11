import { useVault, SKINS } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import { Check, Lock } from 'lucide-react';

export function SkinsShop() {
  const { ownedSkinIds, equippedSkinId, tempMiningPoints, buySkin, equipSkin } = useVault();
  const { toast } = useToast();

  const owned = new Set(ownedSkinIds);
  owned.add(1);

  function handleAction(skinId: number, isOwned: boolean, price: number) {
    haptic('medium');
    if (isOwned) {
      equipSkin(skinId);
      toast({ title: 'Skin equipped', description: SKINS[skinId]?.name });
      return;
    }
    if (tempMiningPoints < price) {
      toast({
        title: 'Not enough points',
        description: `You need ${price.toLocaleString()} points`,
        variant: 'destructive',
      });
      return;
    }
    const ok = buySkin(skinId);
    if (ok) {
      toast({ title: '🎨 Skin unlocked!', description: `${SKINS[skinId]?.name} equipped` });
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Miner Skins</h2>
        <span className="text-xs font-semibold text-muted-foreground px-2.5 py-1 rounded-full bg-white/5 border border-white/8">
          {owned.size}/{Object.keys(SKINS).length}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {Object.entries(SKINS).map(([idStr, skin]) => {
          const id = Number(idStr);
          const isOwned = owned.has(id);
          const isEquipped = equippedSkinId === id || (equippedSkinId === null && id === 1);
          const canAfford = tempMiningPoints >= skin.price;

          return (
            <div
              key={id}
              className="rounded-2xl p-3.5 flex flex-col gap-3 relative overflow-hidden transition-all"
              style={{
                background: isEquipped
                  ? `linear-gradient(135deg, ${skin.glow} 0%, rgba(255,255,255,0.02) 100%)`
                  : 'rgba(255,255,255,0.03)',
                border: isEquipped
                  ? `1px solid ${skin.accent}`
                  : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {isEquipped && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: skin.accent, color: '#000' }}
                >
                  <Check className="w-3 h-3" strokeWidth={3} />
                </div>
              )}

              <div className="flex items-center justify-center py-2">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center relative"
                  style={{
                    background: `radial-gradient(circle, ${skin.accent} 0%, ${skin.accent}66 60%, transparent 100%)`,
                    boxShadow: `0 0 24px ${skin.glow}`,
                    filter: isOwned ? 'none' : 'grayscale(0.4) opacity(0.7)',
                  }}
                >
                  {!isOwned && <Lock className="w-4 h-4 text-white/80" />}
                </div>
              </div>

              <p className="text-sm font-bold text-white text-center leading-tight">{skin.name}</p>

              <button
                onClick={() => handleAction(id, isOwned, skin.price)}
                disabled={!isOwned && !canAfford}
                className="w-full h-8 rounded-lg text-[11px] font-bold transition-all active:scale-[0.97] disabled:opacity-40"
                style={
                  isEquipped
                    ? { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }
                    : isOwned
                    ? { background: 'rgba(255,255,255,0.1)', color: 'white' }
                    : {
                        background: `linear-gradient(135deg, ${skin.accent} 0%, ${skin.accent}cc 100%)`,
                        color: '#000',
                      }
                }
              >
                {isEquipped
                  ? 'Equipped'
                  : isOwned
                  ? 'Equip'
                  : skin.price === 0
                  ? 'Get Free'
                  : `${skin.price.toLocaleString()} pts`}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
