import { useState, useEffect } from 'react';
import { Star, Zap, Battery, Sprout, Gem, Rocket, Coins, CheckCircle2, Loader2, Crown, ChevronRight } from 'lucide-react';
import { useVault } from '../context/VaultContext';
import { useLanguage } from '../lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { getStarProducts, createStarsInvoice, type StarProduct } from '../lib/gameApi';
import { getTelegramWebApp, haptic } from '../lib/telegram';
import { StarsPurchaseSuccess } from '../components/StarsPurchaseSuccess';

// Maps effectType to an icon + colour for the product card
const EFFECT_META: Record<string, { icon: React.ElementType; color: string; bg: string; category: string }> = {
  energy_refill:       { icon: Battery,  color: 'text-green-300',  bg: 'from-green-400/20 to-green-400/5',   category: 'energy' },
  max_energy_boost:    { icon: Battery,  color: 'text-green-300',  bg: 'from-green-400/20 to-green-400/5',   category: 'energy' },
  turbo_boost:         { icon: Zap,      color: 'text-yellow-300', bg: 'from-yellow-400/20 to-yellow-400/5', category: 'boost' },
  farm_instant:        { icon: Sprout,   color: 'text-emerald-300',bg: 'from-emerald-400/20 to-emerald-400/5',category: 'farm' },
  skx_credit:          { icon: Gem,      color: 'text-amber-300',  bg: 'from-amber-400/20 to-amber-400/5',   category: 'skx' },
  mining_level_up:     { icon: Rocket,   color: 'text-blue-300',   bg: 'from-blue-400/20 to-blue-400/5',     category: 'upgrade' },
  permanent_multiplier:{ icon: Crown,    color: 'text-purple-300', bg: 'from-purple-400/20 to-purple-400/5', category: 'upgrade' },
  premium_days:        { icon: Crown,    color: 'text-purple-300', bg: 'from-purple-400/20 to-purple-400/5', category: 'premium' },
  points:              { icon: Coins,    color: 'text-primary',    bg: 'from-primary/20 to-primary/5',       category: 'points' },
  badge:               { icon: Star,     color: 'text-orange-300', bg: 'from-orange-400/20 to-orange-400/5', category: 'cosmetic' },
  skin:                { icon: Star,     color: 'text-pink-300',   bg: 'from-pink-400/20 to-pink-400/5',     category: 'cosmetic' },
};

const CATEGORY_LABELS: Record<string, { en: string; ar: string }> = {
  boost:    { en: 'Turbo Boosts',       ar: 'تسريع التعدين' },
  energy:   { en: 'Energy Upgrades',   ar: 'ترقية الطاقة' },
  farm:     { en: 'Farming',           ar: 'الزراعة' },
  skx:      { en: 'SKX Direct',        ar: 'شراء SKX مباشر' },
  upgrade:  { en: 'Upgrades',          ar: 'ترقيات التعدين' },
  premium:  { en: 'Premium',           ar: 'حساب مميز' },
  points:   { en: 'SKP Packs',         ar: 'حزم نقاط SKP' },
  cosmetic: { en: 'Cosmetics',         ar: 'مظاهر' },
};

function ProductCard({
  product,
  onBuy,
  buying,
}: {
  product: StarProduct;
  onBuy: (p: StarProduct) => void;
  buying: boolean;
}) {
  const { lang } = useLanguage();
  const meta = EFFECT_META[product.effectType] ?? EFFECT_META['points'];
  const Icon = meta.icon;
  const displayTitle = lang === 'ar' && product.titleAr ? product.titleAr : product.title;
  const displayDesc  = lang === 'ar' && product.descriptionAr ? product.descriptionAr : product.description;

  return (
    <button
      onClick={() => onBuy(product)}
      disabled={buying}
      className="w-full text-left rounded-2xl border border-white/8 overflow-hidden transition-all active:scale-[0.97] hover:border-white/20 relative"
      style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.2) 100%)' }}
    >
      <div className="flex items-center gap-3 p-3.5">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${meta.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-6 h-6 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-tight truncate">{displayTitle}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{displayDesc}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="flex items-center gap-1 text-sm font-black text-gold">
            <Star className="w-3.5 h-3.5 fill-gold text-gold" />
            {product.priceStars}
          </span>
          {buying ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <ChevronRight className="w-4 h-4 text-white/30" />
          )}
        </div>
      </div>
    </button>
  );
}

function ConfirmModal({
  product,
  onConfirm,
  onCancel,
  loading,
}: {
  product: StarProduct;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { lang } = useLanguage();
  const meta = EFFECT_META[product.effectType] ?? EFFECT_META['points'];
  const Icon = meta.icon;
  const rawBullets = lang === 'ar' && product.benefitsBulletsAr ? product.benefitsBulletsAr : product.benefitsBullets;
  const bullets = (rawBullets ?? '').split('\n').filter(Boolean);
  const displayTitle = lang === 'ar' && product.titleAr ? product.titleAr : product.title;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-[380px] rounded-[24px] glass-card p-6 shadow-2xl animate-in zoom-in-95 duration-200"
        style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px hsl(216 30% 14% / 0.6)' }}>
        <div className="flex flex-col items-center text-center mb-5">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${meta.bg} flex items-center justify-center mb-3`}>
            <Icon className={`w-8 h-8 ${meta.color}`} />
          </div>
          <h3 className="text-lg font-black text-white">{displayTitle}</h3>
          <p className="text-sm text-muted-foreground mt-1">{lang === 'ar' && product.descriptionAr ? product.descriptionAr : product.description}</p>
        </div>
        {bullets.length > 0 && (
          <div className="space-y-2 mb-5">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-white/80">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span>{b}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-center gap-2 mb-5 py-3 rounded-xl surface-gold">
          <Star className="w-5 h-5 fill-gold text-gold" />
          <span className="text-xl font-black text-gold">{product.priceStars} {lang === 'ar' ? 'نجمة' : 'Stars'}</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 font-bold text-sm hover:bg-white/5 transition-all"
          >
            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl font-black text-sm transition-all hover:opacity-90 flex items-center justify-center gap-2 text-gold-foreground"
            style={{ background: 'linear-gradient(135deg, hsl(43 96% 60%), hsl(43 96% 50%))' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4 fill-current" />}
            {lang === 'ar' ? 'شراء الآن' : 'Buy Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StarsTab() {
  const { refreshFromServer } = useVault();
  const { lang } = useLanguage();
  const { toast } = useToast();

  const [products, setProducts] = useState<StarProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmProduct, setConfirmProduct] = useState<StarProduct | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [successProduct, setSuccessProduct] = useState<StarProduct | null>(null);

  useEffect(() => {
    getStarProducts()
      .then(setProducts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async () => {
    if (!confirmProduct || purchasing) return;
    const product = confirmProduct;
    setConfirmProduct(null);
    setPurchasing(true);
    haptic('medium');
    try {
      const { invoiceUrl } = await createStarsInvoice(product.id);
      const webApp = getTelegramWebApp();
      if (webApp?.openInvoice) {
        webApp.openInvoice(invoiceUrl, (status) => {
          setPurchasing(false);
          if (status === 'paid') {
            setSuccessProduct(product);
            haptic('success');
            setTimeout(() => refreshFromServer(), 1500);
          } else if (status === 'failed') {
            toast({ title: lang === 'ar' ? 'فشل الدفع' : 'Payment failed', variant: 'destructive' });
          }
        });
      } else {
        window.open(invoiceUrl, '_blank');
        setPurchasing(false);
      }
    } catch (err) {
      setPurchasing(false);
      toast({ title: lang === 'ar' ? 'تعذّر بدء الشراء' : 'Could not start purchase', variant: 'destructive' });
    }
  };

  // Group products by category
  const grouped = products.reduce<Record<string, StarProduct[]>>((acc, p) => {
    const cat = EFFECT_META[p.effectType]?.category ?? 'points';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const categoryOrder = ['boost', 'energy', 'farm', 'skx', 'upgrade', 'premium', 'points', 'cosmetic'];

  return (
    <div className="pb-28 pt-4 px-4 space-y-6 min-h-screen">
      {/* Header */}
      <div className="text-center pb-2">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl mb-3 surface-gold">
          <Star className="w-5 h-5 fill-gold text-gold" />
          <span className="font-black text-gold text-base">
            {lang === 'ar' ? 'متجر النجوم' : 'Stars Store'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {lang === 'ar'
            ? 'اشترِ مميزات حقيقية بنجوم تيليجرام وعزّز تجربتك'
            : 'Buy real game upgrades with Telegram Stars and power up your mining'}
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && products.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          {lang === 'ar' ? 'لا توجد منتجات متاحة حالياً' : 'No products available right now'}
        </div>
      )}

      {!loading && categoryOrder.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        const label = CATEGORY_LABELS[cat];
        return (
          <div key={cat} className="space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/70">
                {lang === 'ar' ? label.ar : label.en}
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent" />
            </div>
            <div className="space-y-2">
              {items.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onBuy={setConfirmProduct}
                  buying={purchasing}
                />
              ))}
            </div>
          </div>
        );
      })}

      {confirmProduct && (
        <ConfirmModal
          product={confirmProduct}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmProduct(null)}
          loading={purchasing}
        />
      )}

      {successProduct && (
        <StarsPurchaseSuccess
          product={successProduct}
          onClose={() => setSuccessProduct(null)}
        />
      )}
    </div>
  );
}
