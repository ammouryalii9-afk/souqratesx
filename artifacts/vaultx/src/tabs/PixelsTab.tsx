import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ArcadeTab } from './ArcadeTab';
import { Grid3x3, Loader2, Minus, Plus, TrendingUp, Clock, Coins, Info, DollarSign, ArrowDownToLine } from 'lucide-react';
import { useVault } from '../context/VaultContext';
import { useLanguage } from '../lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import {
  getPixelMarket,
  getMyPixels,
  buyPixels,
  requestPixelUsdWithdrawal,
  ApiError,
  type PixelMarket,
  type PixelDividend,
} from '../lib/gameApi';

function formatCountdown(endDate: string, tr: ReturnType<typeof useLanguage>['tr']) {
  const ms = new Date(endDate).getTime() - Date.now();
  if (ms <= 0) return `0${tr.pixels.hours}`;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}${tr.pixels.days} ${hours}${tr.pixels.hours}`;
  if (hours > 0) return `${hours}${tr.pixels.hours} ${mins}${tr.pixels.mins}`;
  return `${mins}${tr.pixels.mins}`;
}

function PixelsTabInner() {
  const { skxBalance, isTelegramUser, refreshFromServer } = useVault();
  const { tr } = useLanguage();
  const { toast } = useToast();

  const [market, setMarket] = useState<PixelMarket | null>(null);
  const [noCycle, setNoCycle] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dividends, setDividends] = useState<PixelDividend[]>([]);
  const [myPixels, setMyPixels] = useState(0);
  const [pixelUsdCents, setPixelUsdCents] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [buying, setBuying] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  // Tick every 60s so the countdown display updates without needing parent re-renders
  const [, setTick] = useState(0);
  const [subTab, setSubTab] = useState<'pixels' | 'arcade'>('pixels');
  // Mount-once: ArcadeTab stays mounted after first visit (hidden via CSS) so
  // switching sub-tabs or any parent re-render never resets in-game state.
  const [arcadeMounted, setArcadeMounted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    // Fetch both in parallel — avoids two sequential renders mid-animation
    const [marketResult, meResult] = await Promise.allSettled([
      getPixelMarket(),
      getMyPixels(),
    ]);

    let newMarket: PixelMarket | null = null;
    let newNoCycle = false;
    let newLoadError = false;
    let newMyPixels = 0;
    let newDividends: PixelDividend[] = [];

    if (marketResult.status === 'fulfilled') {
      newMarket = marketResult.value;
      newMyPixels = marketResult.value.myPixels;
    } else {
      const err = marketResult.reason;
      if (err instanceof ApiError && err.status === 404) {
        newNoCycle = true;
      } else {
        newLoadError = true;
      }
    }

    if (meResult.status === 'fulfilled') {
      newDividends = meResult.value.dividends;
      if (meResult.value.myPixels > 0) newMyPixels = meResult.value.myPixels;
      setPixelUsdCents(meResult.value.pixelUsdCents ?? 0);
    }

    // Single batch update — one render instead of many
    setMarket(newMarket);
    setNoCycle(newNoCycle);
    setLoadError(newLoadError);
    setMyPixels(newMyPixels);
    setDividends(newDividends);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isTelegramUser) load();
    else setLoading(false);
  }, [isTelegramUser, load]);

  // Update the countdown display independently every 60s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Cost for the selected quantity, honoring tier boundaries (price steps up
  // as supply sells) — mirrors the server's tiered pricing so the preview
  // matches what will actually be charged.
  const totalCost = useMemo(() => {
    if (!market) return 0;
    let cost = 0;
    let sold = market.sold;
    for (let i = 0; i < quantity; i++) {
      const tier = market.tiers.find(t => sold < t.upTo);
      cost += tier ? tier.price : market.tiers[market.tiers.length - 1]?.price ?? 0;
      sold++;
    }
    return cost;
  }, [market, quantity]);

  const maxQty = market ? Math.min(market.maxPerPurchase, market.remaining) : 1;
  const canAfford = totalCost <= skxBalance;
  const soldPct = market && market.totalSupply > 0 ? (market.sold / market.totalSupply) * 100 : 0;

  const handleWithdraw = async () => {
    if (withdrawing || pixelUsdCents < 5000) return;
    setWithdrawing(true);
    try {
      await requestPixelUsdWithdrawal();
      haptic('medium');
      toast({ title: tr.pixels.withdrawalRequested, description: tr.pixels.withdrawalRequestedDesc });
      setPixelUsdCents(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      toast({ title: msg || tr.pixels.withdrawalFailed, variant: 'destructive' });
    } finally {
      setWithdrawing(false);
    }
  };

  const handleBuy = async () => {
    if (!market || buying || quantity < 1) return;
    setBuying(true);
    try {
      const res = await buyPixels(quantity);
      haptic('medium');
      toast({
        title: tr.pixels.boughtTitle,
        description: tr.pixels.bought(res.purchasedQuantity, res.pricePaidSkx.toLocaleString()),
      });
      setQuantity(1);
      await refreshFromServer();
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      toast({
        title: msg || tr.pixels.insufficientSkx,
        variant: 'destructive',
      });
    } finally {
      setBuying(false);
    }
  };

  if (!isTelegramUser) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-3 pb-24">
        <Grid3x3 className="w-10 h-10 text-primary/40" />
        <p className="text-sm text-muted-foreground">{tr.pixels.telegramOnly}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab navigation */}
      <div className="shrink-0 flex gap-1 p-1 mx-4 mt-3 mb-1 rounded-2xl bg-white/[0.04] border border-white/5">
        <button
          onClick={() => setSubTab('pixels')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${subTab === 'pixels' ? 'bg-primary text-black' : 'text-muted-foreground hover:text-white'}`}
        >
          🏛️ البكسلات
        </button>
        <button
          onClick={() => { setArcadeMounted(true); setSubTab('arcade'); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${subTab === 'arcade' ? 'text-white' : 'text-muted-foreground hover:text-white'}`}
          style={subTab === 'arcade' ? { background: 'linear-gradient(135deg,#22c55e,#16a34a)' } : {}}
        >
          🎮 SKX Arcade
        </button>
      </div>

      {arcadeMounted && (
        <div className={subTab === 'arcade' ? 'flex-1 overflow-y-auto overflow-x-hidden' : 'hidden'}>
          <ArcadeTab />
        </div>
      )}

      {subTab === 'pixels' && loading && (
        <div className="flex items-center justify-center flex-1 pb-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {subTab === 'pixels' && !loading && (
    <div className="flex flex-col space-y-4 pb-24 px-4 pt-2 animate-in fade-in duration-300 overflow-y-auto flex-1">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-black text-white flex items-center justify-center gap-2">
          <Grid3x3 className="w-6 h-6 text-primary" /> {tr.pixels.title}
        </h1>
        {market && (
          <p className="text-xs text-muted-foreground mt-1 px-4">{tr.pixels.subtitle(market.dividendPercent)}</p>
        )}
      </div>

      {/* Dollar balance — prominent card, always visible when > 0 or highlighted for awareness */}
      <div
        className="rounded-2xl p-4 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(250,204,21,0.12) 0%, rgba(245,158,11,0.08) 100%)',
          border: '1px solid rgba(250,204,21,0.30)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(250,204,21,0.15)', border: '1px solid rgba(250,204,21,0.25)' }}>
              <DollarSign className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-[10px] text-yellow-400/70 font-semibold uppercase tracking-wide">{tr.pixels.pixelDollarBalance}</p>
              <p className="text-2xl font-black text-yellow-300 leading-tight">
                ${(pixelUsdCents / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {pixelUsdCents >= 5000
                  ? tr.pixels.readyToWithdraw
                  : tr.pixels.moreToMinimum(((5000 - pixelUsdCents) / 100).toFixed(2))}
              </p>
            </div>
          </div>
          {pixelUsdCents >= 5000 && (
            <button
              onClick={handleWithdraw}
              disabled={withdrawing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(250,204,21,0.25), rgba(245,158,11,0.20))',
                border: '1px solid rgba(250,204,21,0.40)',
                color: '#fde68a',
              }}
            >
              {withdrawing
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ArrowDownToLine className="w-3.5 h-3.5" />}
              {withdrawing ? tr.pixels.processing : tr.pixels.withdrawBtn}
            </button>
          )}
        </div>
        {pixelUsdCents > 0 && pixelUsdCents < 5000 && (
          <div className="mt-3">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (pixelUsdCents / 5000) * 100)}%`,
                  background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* SKX balance */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
        <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Coins className="w-3.5 h-3.5 text-primary" /> {tr.pixels.balance}</span>
        <span className="text-sm font-bold text-primary">{skxBalance.toLocaleString()} SKX</span>
      </div>

      {noCycle && (
        <div className="rounded-2xl p-6 text-center border border-white/10 bg-white/5">
          <p className="text-sm text-muted-foreground">{tr.pixels.noCycle}</p>
        </div>
      )}

      {loadError && (
        <div className="rounded-2xl p-6 text-center border border-red-500/20 bg-red-500/5">
          <p className="text-sm text-muted-foreground mb-3">{tr.pixels.loadFailed}</p>
          <button
            onClick={() => load()}
            className="px-4 py-2 rounded-xl text-xs font-bold text-primary border border-primary/30 bg-primary/10"
          >
            {tr.pixels.retry}
          </button>
        </div>
      )}

      {market && (
        <>
          {/* Cycle stats */}
          <div className="rounded-2xl p-5 border border-white/10" style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.06), rgba(6,182,212,0.04))' }}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {tr.pixels.cycleEnds}</span>
              <span className="text-sm font-bold text-white tabular-nums">{formatCountdown(market.endDate, tr)}</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-2">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-400 transition-all" style={{ width: `${soldPct}%` }} />
            </div>
            <div className="flex justify-between text-[11px] font-semibold">
              <span className="text-primary">{tr.pixels.sold}: {market.sold.toLocaleString()}</span>
              <span className="text-muted-foreground">{tr.pixels.remaining}: {market.remaining.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mt-4 pt-3 border-t border-white/5">
              <span className="text-xs text-muted-foreground">{tr.pixels.currentPrice}</span>
              <span className="text-sm font-black text-white">{market.currentPrice.toLocaleString()} SKX <span className="text-[10px] text-muted-foreground font-semibold">{tr.pixels.perPixel}</span></span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-amber-400" /> {tr.pixels.estimatedPool}</span>
              <span className="text-sm font-bold text-amber-300">{market.estimatedPoolSkx.toLocaleString()} SKX</span>
            </div>
          </div>

          {/* My holdings */}
          {myPixels > 0 && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-primary/20 bg-primary/5">
              <span className="text-xs text-muted-foreground">{tr.pixels.yourPixels}</span>
              <div className="text-right">
                <span className="text-sm font-black text-primary">{myPixels.toLocaleString()}</span>
                {market.sold > 0 && (
                  <span className="text-[10px] text-muted-foreground ml-2">{tr.pixels.yourShare}: {((myPixels / market.sold) * 100).toFixed(2)}%</span>
                )}
              </div>
            </div>
          )}

          {/* Buy panel */}
          <div className="rounded-2xl p-5 border border-white/10 bg-card/50">
            <h3 className="text-sm font-bold text-white mb-3">{tr.pixels.buyTitle}</h3>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">{tr.pixels.quantity}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white active:scale-95 transition-all"
                  disabled={quantity <= 1}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maxQty}
                  value={quantity}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    setQuantity(Number.isNaN(v) ? 1 : Math.max(1, Math.min(maxQty, v)));
                  }}
                  className="w-16 h-8 text-center rounded-lg bg-white/5 border border-white/10 text-white font-bold text-sm focus:border-primary/50 focus:outline-none"
                />
                <button
                  onClick={() => setQuantity(q => Math.min(maxQty, q + 1))}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white active:scale-95 transition-all"
                  disabled={quantity >= maxQty}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mb-3 text-right">{tr.pixels.maxPerPurchase(maxQty)}</p>
            <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg bg-white/3 border border-white/5">
              <span className="text-xs text-muted-foreground">{tr.pixels.totalCost}</span>
              <span className={`text-sm font-black ${canAfford ? 'text-white' : 'text-red-400'}`}>{totalCost.toLocaleString()} SKX</span>
            </div>
            {!canAfford && (
              <p className="text-xs text-red-400 mb-3">{tr.pixels.insufficientSkx}</p>
            )}
            <button
              onClick={handleBuy}
              disabled={buying || !canAfford || market.remaining <= 0 || quantity < 1}
              className="w-full h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: canAfford && !buying
                  ? 'linear-gradient(135deg, hsl(152,76%,50%) 0%, hsl(152,76%,38%) 100%)'
                  : 'rgba(255,255,255,0.06)',
                color: canAfford && !buying ? 'hsl(224,71%,4%)' : 'rgba(255,255,255,0.3)',
              }}
            >
              {buying ? (<><Loader2 className="w-4 h-4 animate-spin" /> {tr.pixels.buying}</>) : tr.pixels.buyBtn}
            </button>
          </div>

          {/* Price tiers */}
          <div className="rounded-2xl p-4 border border-white/5 bg-white/[0.02]">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">{tr.pixels.priceTiers}</h4>
            <div className="flex flex-col gap-1.5">
              {market.tiers.map((tier, i) => {
                const from = i === 0 ? 1 : market.tiers[i - 1].upTo + 1;
                const active = market.sold + 1 >= from && market.sold < tier.upTo;
                return (
                  <div key={tier.upTo} className={`flex justify-between text-[11px] font-semibold px-2 py-1 rounded ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                    <span>{tr.pixels.tierRange(from, tier.upTo)}</span>
                    <span>{tier.price.toLocaleString()} SKX</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* How it works */}
          <div className="rounded-2xl p-4 border border-white/5 bg-white/[0.02] flex gap-2.5">
            <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-white mb-1">{tr.pixels.howItWorks}</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {tr.pixels.howItWorksDesc(market.dividendPercent, Math.max(1, Math.round((new Date(market.endDate).getTime() - Date.now()) / 86_400_000)))}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Dividend history */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{tr.pixels.dividendHistory}</h3>
        {dividends.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60 px-1">{tr.pixels.noDividends}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {dividends.map(d => (
              <div key={`${d.cycleId}-${d.paidAt}`} className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/5 bg-white/[0.03]">
                <div>
                  <p className="text-xs font-bold text-white">+{d.dividendSkx.toLocaleString()} SKX</p>
                  <p className="text-[10px] text-muted-foreground">{tr.pixels.dividendRow(d.pixelsHeld)}</p>
                </div>
                <span className="text-[10px] text-muted-foreground/50">{new Date(d.paidAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
      )}
    </div>
  );
}

export const PixelsTab = memo(PixelsTabInner);
