import { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';

export type Exchange = {
  id: string;
  name: string;
  color: string;
  bg: string;
  abbr: string;
};

export const EXCHANGES: Exchange[] = [
  { id: 'binance',   name: 'Binance',   abbr: 'BNB', color: '#F0B90B', bg: 'rgba(240,185,11,0.15)' },
  { id: 'okx',       name: 'OKX',       abbr: 'OKX', color: '#E0E0E0', bg: 'rgba(224,224,224,0.10)' },
  { id: 'bybit',     name: 'Bybit',     abbr: 'BYB', color: '#F7A600', bg: 'rgba(247,166,0,0.12)' },
  { id: 'coinbase',  name: 'Coinbase',  abbr: 'CB',  color: '#0052FF', bg: 'rgba(0,82,255,0.13)' },
  { id: 'kucoin',    name: 'KuCoin',    abbr: 'KCS', color: '#23AF91', bg: 'rgba(35,175,145,0.12)' },
  { id: 'gate',      name: 'Gate.io',   abbr: 'GT',  color: '#2354E6', bg: 'rgba(35,84,230,0.12)' },
  { id: 'mexc',      name: 'MEXC',      abbr: 'MX',  color: '#1CACFF', bg: 'rgba(28,172,255,0.12)' },
  { id: 'bitget',    name: 'Bitget',    abbr: 'BG',  color: '#00F0FF', bg: 'rgba(0,240,255,0.10)' },
  { id: 'htx',       name: 'HTX',       abbr: 'HTX', color: '#3875F6', bg: 'rgba(56,117,246,0.12)' },
  { id: 'kraken',    name: 'Kraken',    abbr: 'KRK', color: '#5741D9', bg: 'rgba(87,65,217,0.13)' },
];

type Props = {
  selected: string | null;
  onSelect: (id: string) => void;
};

export function ExchangeSelector({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  const current = EXCHANGES.find((e) => e.id === selected);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all active:scale-95"
        style={{
          background: current ? current.bg : 'rgba(255,255,255,0.06)',
          border: `1px solid ${current ? current.color + '40' : 'rgba(255,255,255,0.1)'}`,
        }}
      >
        {current ? (
          <>
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black flex-shrink-0"
              style={{ background: current.color, color: '#000' }}
            >
              {current.abbr[0]}
            </span>
            <span className="text-[11px] font-bold" style={{ color: current.color }}>{current.name}</span>
          </>
        ) : (
          <>
            <span className="text-xs">📊</span>
            <span className="text-[11px] font-medium text-muted-foreground">Pick Exchange</span>
            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              background: 'hsl(224,71%,6%)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-white/5">
              <div>
                <h3 className="font-bold text-white text-base">Choose Your Exchange</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Cosmetic — shows on your profile</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 grid grid-cols-2 gap-2">
              {EXCHANGES.map((ex) => {
                const isSelected = selected === ex.id;
                return (
                  <button
                    key={ex.id}
                    onClick={() => { onSelect(ex.id); setOpen(false); }}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all active:scale-[0.97]"
                    style={{
                      background: isSelected ? ex.bg : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isSelected ? ex.color + '60' : 'rgba(255,255,255,0.06)'}`,
                      boxShadow: isSelected ? `0 0 12px ${ex.color}20` : 'none',
                    }}
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                      style={{ background: isSelected ? ex.color : ex.bg, color: isSelected ? '#000' : ex.color, border: `1px solid ${ex.color}40` }}
                    >
                      {ex.abbr.slice(0, 2)}
                    </span>
                    <div className="text-left">
                      <div className="text-sm font-semibold text-white leading-tight">{ex.name}</div>
                      {isSelected && <div className="text-[10px] font-bold" style={{ color: ex.color }}>Selected ✓</div>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="px-5 pb-5">
              <button
                onClick={() => setOpen(false)}
                className="w-full h-10 rounded-xl text-sm text-muted-foreground hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
