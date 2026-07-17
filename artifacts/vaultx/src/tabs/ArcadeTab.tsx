import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Shield, Clock, Star, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X, Zap, Trophy, Lock } from "lucide-react";
import { useVault } from "../context/VaultContext";
import { haptic } from "../lib/telegram";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "../lib/i18n";
import {
  getPublicConfig,
  claimAdsgramReward,
  claimMonetagReward,
  claimOnclickaReward,
  type PublicConfig,
} from "../lib/gameApi";
import { watchRewardedAdWithFallback } from "../lib/adFallback";

// ── Types ────────────────────────────────────────────────────────────────────

interface ArcadeStatus {
  enabled?: boolean;
  hasTicket: boolean;
  adsWatched: number;
  adsNeeded: number;
  activeSessions: ActiveSession[];
  wonSessionsAwarded: number;
}

interface ActiveSession {
  id: number;
  roomType: string;
  gridX: number;
  gridY: number;
  durationHours: number;
  finalPoints: number;
  expiresAt: string;
  hasShield: boolean;
  shieldExpiresAt: string | null;
  isDecoy: boolean;
}

interface GridCell {
  x: number;
  y: number;
  owner: "me" | "other";
  sessionId?: number;
  durationHours?: number;
  finalPoints?: number;
  expiresAt?: string;
  hasShield: boolean;
  isDecoy: boolean;
}

interface GridData {
  room: string;
  gridSize: number;
  totalActive: number;
  cells: GridCell[];
}

type Room = "easy" | "tactical" | "hardcore";
type Phase = "loading" | "disabled" | "gate" | "rooms" | "grid";

// ── Constants ────────────────────────────────────────────────────────────────

const ROOMS: Record<
  Room,
  {
    label: string;
    size: number;
    multiplier: string;
    color: string;
    colorDim: string;
    gradient: string;
    viewportCols: number;
  }
> = {
  easy: {
    label: "Easy Grid",
    size: 100,
    multiplier: "1×",
    color: "#22c55e",
    colorDim: "rgba(34,197,94,0.15)",
    gradient: "linear-gradient(135deg,#052e16 0%,#14532d 100%)",
    viewportCols: 12,
  },
  tactical: {
    label: "Tactical Grid",
    size: 50,
    multiplier: "1.5×",
    color: "#f59e0b",
    colorDim: "rgba(245,158,11,0.15)",
    gradient: "linear-gradient(135deg,#1c1003 0%,#451a03 100%)",
    viewportCols: 15,
  },
  hardcore: {
    label: "Hardcore Arena",
    size: 20,
    multiplier: "3×",
    color: "#ef4444",
    colorDim: "rgba(239,68,68,0.15)",
    gradient: "linear-gradient(135deg,#1a0303 0%,#450a0a 100%)",
    viewportCols: 20,
  },
};

const DURATION_OPTIONS: { hours: number; points: number }[] = [
  { hours: 6, points: 20_000 },
  { hours: 12, points: 50_000 },
  { hours: 24, points: 100_000 },
];

const SHOP_ITEMS: { type: string; stars: number; icon: string }[] = [
  { type: "shield_3h", stars: 20, icon: "🛡️" },
  { type: "shield_full", stars: 80, icon: "🔰" },
  { type: "decoy", stars: 50, icon: "💥" },
  { type: "radar", stars: 15, icon: "📡" },
  { type: "multi_strike", stars: 30, icon: "⚡" },
];

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(expiresAt: string, expiredText: string, hoursUnit: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return expiredText;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}${hoursUnit} ${m}m`;
  return `${m}m`;
}

function shopItemLabel(type: string, tr: ReturnType<typeof useLanguage>["tr"]): string {
  const map: Record<string, string> = {
    shield_3h: tr.arcade.shield3hLabel,
    shield_full: tr.arcade.shieldFullLabel,
    decoy: tr.arcade.decoyLabel,
    radar: tr.arcade.radarLabel,
    multi_strike: tr.arcade.multiStrikeLabel,
  };
  return map[type] ?? type;
}

function shopItemDesc(type: string, tr: ReturnType<typeof useLanguage>["tr"]): string {
  const map: Record<string, string> = {
    shield_3h: tr.arcade.shield3hDesc,
    shield_full: tr.arcade.shieldFullDesc,
    decoy: tr.arcade.decoyDesc,
    radar: tr.arcade.radarDesc,
    multi_strike: tr.arcade.multiStrikeDesc,
  };
  return map[type] ?? "";
}

function durationLabel(hours: number, tr: ReturnType<typeof useLanguage>["tr"]): string {
  if (hours === 6) return tr.arcade.dur6h;
  if (hours === 12) return tr.arcade.dur12h;
  return tr.arcade.dur24h;
}

function durationRisk(hours: number, tr: ReturnType<typeof useLanguage>["tr"]): string {
  if (hours === 6) return tr.arcade.riskLow;
  if (hours === 12) return tr.arcade.riskMed;
  return tr.arcade.riskHigh;
}

function roomDesc(room: Room, tr: ReturnType<typeof useLanguage>["tr"]): string {
  if (room === "easy") return tr.arcade.easyDesc;
  if (room === "tactical") return tr.arcade.tacticalDesc;
  return tr.arcade.hardcoreDesc;
}

// ── Cell color logic ──────────────────────────────────────────────────────────

function getCellBg(cell: GridCell | undefined, selected: boolean): string {
  if (!cell) {
    return selected ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.04)";
  }
  if (cell.owner === "me") {
    if (cell.isDecoy) return selected ? "#fbbf24" : "#d97706";
    if (cell.hasShield) return selected ? "#22d3ee" : "#0e7490";
    return selected ? "#4ade80" : "#16a34a";
  }
  // enemy
  if (cell.hasShield) return selected ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.28)";
  return selected ? "#f87171" : "#b91c1c";
}

function getCellBorder(cell: GridCell | undefined, selected: boolean): string {
  if (!cell) return selected ? "1.5px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.07)";
  if (cell.owner === "me") {
    if (cell.isDecoy) return "1.5px solid #fbbf24";
    if (cell.hasShield) return "1.5px solid #22d3ee";
    return selected ? "2px solid #86efac" : "1.5px solid #4ade80";
  }
  if (cell.hasShield) return "1.5px solid rgba(255,255,255,0.7)";
  return selected ? "2px solid #fca5a5" : "1px solid #ef4444";
}

function getCellIcon(cell: GridCell | undefined) {
  if (!cell) return null;
  if (cell.owner === "me") {
    if (cell.isDecoy) return <span className="text-[7px] drop-shadow">💥</span>;
    if (cell.hasShield) return <span className="text-[7px] drop-shadow">🛡</span>;
    return <span className="text-[7px] font-black text-white/80">●</span>;
  }
  return <span className="text-[7px] font-black text-white/60">●</span>;
}

// ── EntryGate ────────────────────────────────────────────────────────────────

function EntryGate({
  status,
  config,
  onAdWatched,
  onStarsPaid,
  loading,
}: {
  status: ArcadeStatus;
  config: PublicConfig | null;
  onAdWatched: () => void;
  onStarsPaid: () => void;
  loading: boolean;
}) {
  const { tr } = useLanguage();
  const progress = (status.adsWatched / status.adsNeeded) * 100;
  const hasAd =
    (config?.adsgram.enabled && config.adsgram.blockId) ||
    (config?.monetag.enabled && config.monetag.zoneId) ||
    (config?.onclicka.enabled && config.onclicka.spotId);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Hero */}
      <div className="relative w-full flex-shrink-0" style={{ height: "220px" }}>
        <img
          src="/arcade-hero.jpeg"
          alt="SKX Arcade"
          className="w-full h-full object-cover object-top"
          style={{ filter: "brightness(0.75)" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(6,11,24,0.1) 0%, rgba(6,11,24,0.7) 70%, #060b18 100%)" }} />
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-5 gap-2">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-2xl backdrop-blur-md" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(34,197,94,0.4)" }}>
            <span className="font-black text-2xl tracking-widest" style={{ color: "#22c55e", fontFamily: "monospace" }}>SKX</span>
            <span className="font-black text-2xl tracking-widest text-white">ARCADE</span>
          </div>
          <p className="text-xs text-white/60 tracking-wide">{tr.arcade.entrySubtitle}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-4 pb-8 flex flex-col gap-4">

        {/* Option A — Ads */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)" }}>
                <Zap className="w-5 h-5" style={{ color: "#22c55e" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-white">{tr.arcade.optionAdsTitle}</p>
                <p className="text-[11px]" style={{ color: "#22c55e" }}>{tr.arcade.optionAdsFree}</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-black" style={{ color: "#22c55e" }}>{status.adsWatched}</span>
                <span className="text-sm text-muted-foreground">/{status.adsNeeded}</span>
              </div>
            </div>

            {/* Step dots */}
            <div className="flex gap-2 mb-3">
              {Array.from({ length: status.adsNeeded }, (_, i) => (
                <div
                  key={i}
                  className="flex-1 h-1.5 rounded-full transition-all duration-500"
                  style={{ background: i < status.adsWatched ? "#22c55e" : "rgba(255,255,255,0.1)" }}
                />
              ))}
            </div>

            {/* Progress bar */}
            <div className="h-9 bg-white/5 rounded-xl overflow-hidden relative mb-0">
              <div
                className="h-full rounded-xl transition-all duration-700"
                style={{
                  width: `${progress}%`,
                  background: "linear-gradient(90deg,#16a34a,#22c55e)",
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-white/80">
                  {status.adsWatched < status.adsNeeded
                    ? `${status.adsWatched} / ${status.adsNeeded}`
                    : "✓ Ready!"}
                </span>
              </div>
            </div>
          </div>

          {status.adsWatched < status.adsNeeded ? (
            <button
              onClick={onAdWatched}
              disabled={loading || !hasAd}
              className="w-full py-3.5 font-black text-sm transition-all active:scale-[0.98] disabled:opacity-50"
              style={{
                background: hasAd
                  ? "linear-gradient(135deg,#16a34a,#22c55e)"
                  : "rgba(255,255,255,0.05)",
                color: hasAd ? "#000" : "#666",
              }}
            >
              {loading ? tr.arcade.watchingAd : hasAd ? tr.arcade.watchAdBtn : tr.arcade.starsRequireTelegram}
            </button>
          ) : (
            <div className="w-full py-3.5 text-center font-black text-sm" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
              ✓ {tr.arcade.ticketGrantedDesc}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>{tr.arcade.dividerOr}</span>
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
        </div>

        {/* Option B — Stars */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div className="px-4 pt-4 pb-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)" }}>
              <Star className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-white">{tr.arcade.optionStarsTitle}</p>
              <p className="text-[11px] text-yellow-500/80">{tr.arcade.optionStarsFast}</p>
            </div>
          </div>
          <button
            onClick={onStarsPaid}
            disabled={loading}
            className="w-full py-3.5 font-black text-sm transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#b45309,#d97706,#f59e0b)", color: "#000" }}
          >
            {tr.arcade.payStarsBtn}
          </button>
        </div>

        {/* How it works */}
        <div className="rounded-xl p-3.5 flex gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-xl shrink-0">🗺️</span>
          <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
            {tr.arcade.howItWorksText}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── RoomSelector ──────────────────────────────────────────────────────────────

function RoomSelector({
  status,
  onRoomSelected,
}: {
  status: ArcadeStatus;
  onRoomSelected: (room: Room) => void;
}) {
  const { tr } = useLanguage();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Banner */}
      <div className="relative w-full flex-shrink-0" style={{ height: "150px" }}>
        <img src="/arcade-4.jpeg" alt="Rooms" className="w-full h-full object-cover" style={{ filter: "brightness(0.65)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom,transparent 0%,#060b18 100%)" }} />
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: "#22c55e" }}>{tr.arcade.ticketActive}</p>
          <h2 className="text-2xl font-black text-white">{tr.arcade.roomTitle}</h2>
        </div>
      </div>

      <div className="flex-1 px-4 pt-3 pb-8 flex flex-col gap-3">
        {/* Active sessions strip */}
        {status.activeSessions.length > 0 && (
          <div className="rounded-xl p-3" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <p className="text-xs font-black mb-2" style={{ color: "#22c55e" }}>{tr.arcade.activeSessions}</p>
            <div className="flex flex-col gap-1">
              {status.activeSessions.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                  <span className="text-[10px] capitalize text-white/70">{s.roomType}</span>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>({s.gridX},{s.gridY})</span>
                  <span className="ml-auto text-[10px] font-bold" style={{ color: "#22c55e" }}>
                    {formatCountdown(s.expiresAt, tr.arcade.expired, tr.arcade.hoursUnit)}
                  </span>
                  {s.hasShield && <Shield className="w-3 h-3 text-cyan-400" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Room cards */}
        {(["easy", "tactical", "hardcore"] as Room[]).map((room) => {
          const r = ROOMS[room];
          const myCount = status.activeSessions.filter((s) => s.roomType === room).length;
          return (
            <button
              key={room}
              onClick={() => { haptic("light"); onRoomSelected(room); }}
              className="relative overflow-hidden rounded-2xl text-left transition-all active:scale-[0.97]"
              style={{ background: r.gradient, border: `1px solid ${r.color}35` }}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-black text-white text-lg leading-tight">{r.label}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: `${r.color}bb` }}>{roomDesc(room, tr)}</p>
                  </div>
                  <div
                    className="px-3 py-1.5 rounded-xl text-sm font-black"
                    style={{ background: r.color, color: "#000" }}
                  >
                    {r.multiplier}
                  </div>
                </div>

                {/* Duration prizes row */}
                <div className="flex gap-2">
                  {DURATION_OPTIONS.map((d) => {
                    const pts = Math.round((d.points * (room === "easy" ? 100 : room === "tactical" ? 150 : 300)) / 100);
                    return (
                      <div
                        key={d.hours}
                        className="flex-1 rounded-xl py-2 text-center"
                        style={{ background: `${r.color}18` }}
                      >
                        <p className="text-[9px] font-bold" style={{ color: `${r.color}99` }}>{d.hours}{tr.arcade.hoursUnit}</p>
                        <p className="text-xs font-black" style={{ color: r.color }}>{(pts / 1000).toFixed(0)}K</p>
                      </div>
                    );
                  })}
                </div>

                {myCount > 0 && (
                  <div
                    className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black"
                    style={{ background: `${r.color}22`, color: r.color }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: r.color }} />
                    {tr.arcade.activeHere(myCount)}
                  </div>
                )}
              </div>

              {/* Subtle right glow */}
              <div
                className="absolute right-0 top-0 bottom-0 w-20 pointer-events-none"
                style={{ background: `linear-gradient(to left,${r.color}18,transparent)` }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── ClaimDialog ───────────────────────────────────────────────────────────────

function ClaimDialog({
  cell,
  room,
  onConfirm,
  onCancel,
  loading,
}: {
  cell: { x: number; y: number };
  room: Room;
  onConfirm: (hours: number) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { tr } = useLanguage();
  const [selectedHours, setSelectedHours] = useState(6);
  const r = ROOMS[room];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div
        className="w-full max-w-md rounded-t-3xl p-5 pb-10"
        style={{ background: "#0a1628", borderTop: `2px solid ${r.color}40` }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }} />
        <h3 className="text-center font-black text-white text-base mb-1">{tr.arcade.claimTitle(cell.x, cell.y)}</h3>
        <p className="text-center text-xs mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>{tr.arcade.claimDesc}</p>

        <div className="flex flex-col gap-2 mb-5">
          {DURATION_OPTIONS.map((d) => {
            const pts = Math.round((d.points * (room === "easy" ? 100 : room === "tactical" ? 150 : 300)) / 100);
            const isSelected = selectedHours === d.hours;
            return (
              <button
                key={d.hours}
                onClick={() => setSelectedHours(d.hours)}
                className="flex items-center gap-3 p-3.5 rounded-2xl transition-all"
                style={{
                  background: isSelected ? `${r.color}18` : "rgba(255,255,255,0.04)",
                  border: isSelected ? `1.5px solid ${r.color}` : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: isSelected ? r.color : "rgba(255,255,255,0.06)" }}
                >
                  <Clock className="w-4 h-4" style={{ color: isSelected ? "#000" : r.color }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-black text-white">{durationLabel(d.hours, tr)}</p>
                  <p className="text-[10px]" style={{ color: isSelected ? `${r.color}bb` : "rgba(255,255,255,0.35)" }}>
                    {tr.arcade.riskPrefix} {durationRisk(d.hours, tr)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-black" style={{ color: r.color }}>{pts.toLocaleString()}</p>
                  <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>{tr.arcade.ptsLabel}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-2xl text-sm font-bold"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}
          >
            {tr.arcade.cancel}
          </button>
          <button
            onClick={() => onConfirm(selectedHours)}
            disabled={loading}
            className="flex-1 py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50"
            style={{ background: r.color, color: "#000" }}
          >
            {loading ? "..." : tr.arcade.claimBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── StrikeDialog ──────────────────────────────────────────────────────────────

function StrikeDialog({
  cell,
  onConfirm,
  onCancel,
  loading,
}: {
  cell: { x: number; y: number };
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { tr } = useLanguage();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-10" style={{ background: "#0a1628", borderTop: "2px solid rgba(239,68,68,0.4)" }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }} />
        <div className="flex flex-col items-center gap-3 mb-5">
          <div className="w-16 h-16 rounded-2xl overflow-hidden">
            <img src="/arcade-3.jpeg" alt="Strike" className="w-full h-full object-cover" />
          </div>
          <div className="text-center">
            <h3 className="font-black text-white text-base">{tr.arcade.strikeTitle(cell.x, cell.y)}</h3>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>{tr.arcade.strikeDesc}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-2xl text-sm font-bold"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}
          >
            {tr.arcade.cancel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#b91c1c,#ef4444)", color: "#fff" }}
          >
            {loading ? "..." : tr.arcade.strikeBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ShopModal ─────────────────────────────────────────────────────────────────

function ShopModal({
  starsBalance,
  activeSessions,
  onBuy,
  onClose,
  loading,
}: {
  starsBalance: number;
  activeSessions: ActiveSession[];
  onBuy: (itemType: string, sessionId?: number) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const { tr } = useLanguage();
  const [selectedSession, setSelectedSession] = useState<number | null>(activeSessions[0]?.id ?? null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div
        className="w-full max-w-md rounded-t-3xl p-5 pb-10"
        style={{ background: "#0a1628", borderTop: "2px solid rgba(245,158,11,0.35)", maxHeight: "85vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-black text-white text-base">{tr.arcade.shopTitle}</h3>
            <p className="text-xs font-bold text-yellow-400">{tr.arcade.shopBalance(starsBalance)}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Session selector */}
        {activeSessions.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>{tr.arcade.applyTo}</p>
            <div className="flex flex-wrap gap-2">
              {activeSessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSession(s.id)}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                  style={{
                    background: selectedSession === s.id ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)",
                    border: selectedSession === s.id ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.08)",
                    color: selectedSession === s.id ? "#22c55e" : "rgba(255,255,255,0.5)",
                  }}
                >
                  ({s.gridX},{s.gridY})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="flex flex-col gap-2.5">
          {SHOP_ITEMS.map((item) => {
            const needsSession = item.type.startsWith("shield") || item.type === "decoy";
            const canBuy = starsBalance >= item.stars && (!needsSession || selectedSession !== null);
            return (
              <div
                key={item.type}
                className="flex items-center gap-3 p-3.5 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <span className="text-2xl w-9 text-center">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white">{shopItemLabel(item.type, tr)}</p>
                  <p className="text-[10px] mt-0.5 leading-tight" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {shopItemDesc(item.type, tr)}
                  </p>
                </div>
                <button
                  onClick={() => onBuy(item.type, needsSession ? selectedSession ?? undefined : undefined)}
                  disabled={!canBuy || loading}
                  className="shrink-0 px-3.5 py-2 rounded-xl text-xs font-black transition-all active:scale-95 disabled:opacity-35"
                  style={{
                    background: canBuy ? "linear-gradient(135deg,#b45309,#f59e0b)" : "rgba(255,255,255,0.06)",
                    color: canBuy ? "#000" : "rgba(255,255,255,0.3)",
                  }}
                >
                  {item.stars} ⭐
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── GridView ──────────────────────────────────────────────────────────────────

function GridView({
  room,
  status,
  onBack,
  onStatusRefresh,
}: {
  room: Room;
  status: ArcadeStatus;
  onBack: () => void;
  onStatusRefresh: () => void;
}) {
  const { skxBalance } = useVault();
  const { toast } = useToast();
  const { tr } = useLanguage();
  const r = ROOMS[room];

  const [gridData, setGridData] = useState<GridData | null>(null);
  const [viewOx, setViewOx] = useState(0);
  const [viewOy, setViewOy] = useState(0);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [claimCell, setClaimCell] = useState<{ x: number; y: number } | null>(null);
  const [strikeCell, setStrikeCell] = useState<{ x: number; y: number } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(true);

  const vp = r.viewportCols;
  const gridSize = r.size;

  const loadGrid = useCallback(async () => {
    setGridLoading(true);
    try {
      const data = await apiGet<GridData>(`/arcade/grid/${room}`);
      setGridData(data);
    } catch {
      // silent
    } finally {
      setGridLoading(false);
    }
  }, [room]);

  useEffect(() => {
    loadGrid();
    const interval = setInterval(loadGrid, 15_000);
    return () => clearInterval(interval);
  }, [loadGrid]);

  useEffect(() => {
    if (!gridData) return;
    const myCells = gridData.cells.filter((c) => c.owner === "me");
    if (myCells.length > 0) {
      setViewOx(Math.max(0, myCells[0].x - Math.floor(vp / 2)));
      setViewOy(Math.max(0, myCells[0].y - Math.floor(vp / 2)));
    }
  }, [gridData, vp]);

  const cellMap = new Map<string, GridCell>();
  gridData?.cells.forEach((c) => cellMap.set(`${c.x},${c.y}`, c));

  function onCellTap(absX: number, absY: number) {
    haptic("light");
    const key = `${absX},${absY}`;
    const cell = cellMap.get(key);
    if (!cell) {
      setClaimCell({ x: absX, y: absY });
    } else if (cell.owner === "me") {
      setShopOpen(true);
    } else {
      setStrikeCell({ x: absX, y: absY });
    }
  }

  async function handleClaim(hours: number) {
    if (!claimCell) return;
    setLoading(true);
    try {
      await apiPost("/arcade/grid/claim", { room, x: claimCell.x, y: claimCell.y, durationHours: hours });
      haptic("success");
      toast({ title: tr.arcade.claimed, description: tr.arcade.claimedDesc(claimCell.x, claimCell.y) });
      setClaimCell(null);
      await Promise.all([loadGrid(), onStatusRefresh()]);
    } catch (err: unknown) {
      haptic("error");
      toast({ title: tr.arcade.claimFailed, description: err instanceof Error ? err.message : tr.arcade.tryAgain, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleStrike() {
    if (!strikeCell) return;
    setLoading(true);
    try {
      const result = await apiPost<{ result: string; strikerReward?: number; message: string }>(
        "/arcade/grid/strike",
        { room, x: strikeCell.x, y: strikeCell.y },
      );
      haptic(result.result === "shielded" ? "warning" : "success");
      toast({
        title: result.message,
        description: result.strikerReward ? `+${result.strikerReward.toLocaleString()} ${tr.arcade.ptsLabel}` : undefined,
      });
      setStrikeCell(null);
      await Promise.all([loadGrid(), onStatusRefresh()]);
    } catch (err: unknown) {
      haptic("error");
      toast({ title: tr.arcade.strikeFailed, description: err instanceof Error ? err.message : tr.arcade.tryAgain, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleShopBuy(itemType: string, sessionId?: number) {
    setLoading(true);
    try {
      await apiPost("/arcade/shop/buy", { itemType, sessionId });
      haptic("success");
      toast({ title: tr.arcade.buySuccess, description: shopItemLabel(itemType, tr) });
      setShopOpen(false);
      await Promise.all([loadGrid(), onStatusRefresh()]);
    } catch (err: unknown) {
      haptic("error");
      toast({ title: tr.arcade.buyFailed, description: err instanceof Error ? err.message : tr.arcade.tryAgain, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function pan(dx: number, dy: number) {
    const step = Math.max(3, Math.floor(vp / 3));
    setViewOx((x) => Math.max(0, Math.min(gridSize - vp, x + dx * step)));
    setViewOy((y) => Math.max(0, Math.min(gridSize - vp, y + dy * step)));
    haptic("light");
  }

  const mySessions = status.activeSessions.filter((s) => s.roomType === room);

  return (
    <div className="flex flex-col h-full" style={{ background: "#060b18" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3" style={{ background: r.gradient, borderBottom: `1px solid ${r.color}30` }}>
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.3)" }}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <p className="text-sm font-black text-white">{r.label}</p>
          <p className="text-[10px]" style={{ color: `${r.color}cc` }}>
            {gridData ? tr.arcade.activeCells(gridData.totalActive) : tr.arcade.loadingGrid}
            {" · "}({viewOx}–{Math.min(viewOx + vp - 1, gridSize - 1)}, {viewOy}–{Math.min(viewOy + vp - 1, gridSize - 1)})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadGrid()}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.25)" }}
          >
            <span className="text-sm">↻</span>
          </button>
          <button
            onClick={() => { haptic("light"); setShopOpen(true); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(245,158,11,0.25)", border: "1px solid rgba(245,158,11,0.4)" }}
          >
            <Star className="w-4 h-4 text-yellow-400" />
          </button>
        </div>
      </div>

      {/* Grid area */}
      <div className="flex-1 flex flex-col items-center justify-center px-2 py-2 gap-1.5 min-h-0">
        {/* Up */}
        <button
          onClick={() => pan(0, -1)}
          disabled={viewOy === 0}
          className="w-10 h-7 rounded-xl flex items-center justify-center disabled:opacity-20 transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.07)" }}
        >
          <ChevronUp className="w-4 h-4 text-white/70" />
        </button>

        <div className="flex items-center gap-1.5 w-full flex-1 min-h-0">
          {/* Left */}
          <button
            onClick={() => pan(-1, 0)}
            disabled={viewOx === 0}
            className="w-7 h-10 rounded-xl flex items-center justify-center disabled:opacity-20 shrink-0 transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <ChevronLeft className="w-4 h-4 text-white/70" />
          </button>

          {/* Grid */}
          <div className="flex-1 relative" style={{ aspectRatio: "1", maxWidth: "100%", maxHeight: "100%" }}>
            <div
              className="absolute inset-0"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${vp}, 1fr)`,
                gap: "2px",
                padding: "2px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: "12px",
              }}
            >
              {gridLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 rounded-xl" style={{ background: "rgba(6,11,24,0.7)" }}>
                  <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${r.color}`, borderTopColor: "transparent" }} />
                </div>
              )}
              {Array.from({ length: vp * vp }, (_, i) => {
                const col = i % vp;
                const row = Math.floor(i / vp);
                const absX = viewOx + col;
                const absY = viewOy + row;
                const key = `${absX},${absY}`;
                const cell = cellMap.get(key);
                const isHovered = hoveredKey === key;
                return (
                  <button
                    key={i}
                    onClick={() => onCellTap(absX, absY)}
                    onMouseEnter={() => setHoveredKey(key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    className="rounded-[3px] flex items-center justify-center transition-all duration-100 active:scale-90"
                    style={{
                      background: getCellBg(cell, isHovered),
                      border: getCellBorder(cell, isHovered),
                      boxShadow: isHovered && cell ? `0 0 6px ${cell.owner === "me" ? "#22c55e" : "#ef4444"}60` : undefined,
                    }}
                  >
                    {getCellIcon(cell)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right */}
          <button
            onClick={() => pan(1, 0)}
            disabled={viewOx >= gridSize - vp}
            className="w-7 h-10 rounded-xl flex items-center justify-center disabled:opacity-20 shrink-0 transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <ChevronRight className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Down */}
        <button
          onClick={() => pan(0, 1)}
          disabled={viewOy >= gridSize - vp}
          className="w-10 h-7 rounded-xl flex items-center justify-center disabled:opacity-20 transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.07)" }}
        >
          <ChevronDown className="w-4 h-4 text-white/70" />
        </button>

        {/* Legend */}
        <div className="flex gap-4 pt-1">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: "#16a34a", border: "1px solid #4ade80" }} />
            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.45)" }}>{tr.arcade.legendMine}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: "#b91c1c", border: "1px solid #f87171" }} />
            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.45)" }}>{tr.arcade.legendOther}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: "#0e7490", border: "1px solid #22d3ee" }} />
            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.45)" }}>{tr.arcade.legendShield}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }} />
            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.45)" }}>{tr.arcade.legendEmpty}</span>
          </div>
        </div>
      </div>

      {/* My sessions panel */}
      {mySessions.length > 0 && (
        <div className="shrink-0 px-4 py-3" style={{ borderTop: `1px solid ${r.color}20`, background: `${r.color}08` }}>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: `${r.color}80` }}>
            {tr.arcade.mySessions}
          </p>
          <div className="flex flex-col gap-1.5">
            {mySessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                style={{ background: `${r.color}10`, border: `1px solid ${r.color}20` }}
              >
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: r.color }} />
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>({s.gridX},{s.gridY})</span>
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(4, ((new Date(s.expiresAt).getTime() - Date.now()) / (s.durationHours * 3_600_000)) * 100)}%`,
                      background: r.color,
                    }}
                  />
                </div>
                <span className="text-[10px] font-bold" style={{ color: r.color }}>
                  {formatCountdown(s.expiresAt, tr.arcade.expired, tr.arcade.hoursUnit)}
                </span>
                <span className="text-[10px] font-black text-yellow-400">+{s.finalPoints.toLocaleString()}</span>
                {s.hasShield && <Shield className="w-3 h-3 text-cyan-400" />}
                {s.isDecoy && <span className="text-[9px]">💥</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialogs */}
      {claimCell && (
        <ClaimDialog
          cell={claimCell}
          room={room}
          onConfirm={handleClaim}
          onCancel={() => setClaimCell(null)}
          loading={loading}
        />
      )}
      {strikeCell && (
        <StrikeDialog
          cell={strikeCell}
          onConfirm={handleStrike}
          onCancel={() => setStrikeCell(null)}
          loading={loading}
        />
      )}
      {shopOpen && (
        <ShopModal
          starsBalance={skxBalance ?? 0}
          activeSessions={status.activeSessions}
          onBuy={handleShopBuy}
          onClose={() => setShopOpen(false)}
          loading={loading}
        />
      )}
    </div>
  );
}

// ── Main ArcadeTab ────────────────────────────────────────────────────────────

function ArcadeTabInner() {
  const { refreshFromServer } = useVault();
  const { toast } = useToast();
  const { tr } = useLanguage();

  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<ArcadeStatus | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Load public config once
  useEffect(() => {
    getPublicConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiGet<ArcadeStatus>("/arcade/status");
      setStatus(data);
      if (data.enabled === false) {
        setPhase("disabled");
        return;
      }
      if (data.wonSessionsAwarded > 0) {
        toast({ title: tr.arcade.wonPoints(data.wonSessionsAwarded), description: tr.arcade.wonPointsDesc });
        refreshFromServer();
      }
      setPhase(data.hasTicket ? "rooms" : "gate");
    } catch {
      setPhase("gate");
    }
  }, [toast, refreshFromServer, tr]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // ── Watch real ad, then record on backend ──────────────────────────────────
  async function handleAdWatched() {
    const hasAny =
      (config?.adsgram.enabled && config.adsgram.blockId) ||
      (config?.monetag.enabled && config.monetag.zoneId) ||
      (config?.onclicka.enabled && config.onclicka.spotId);

    if (!hasAny || actionLoading) return;
    setActionLoading(true);
    try {
      // 1. Show the real rewarded ad
      await watchRewardedAdWithFallback(config);

      // 2. Record the view on the arcade backend
      const result = await apiPost<{ granted: boolean; adsWatched: number }>("/arcade/ticket/watch-ad");
      haptic("light");

      if (result.granted) {
        haptic("success");
        toast({ title: tr.arcade.ticketGranted, description: tr.arcade.ticketGrantedDesc });
        await loadStatus();
      } else {
        const remaining = (status?.adsNeeded ?? 5) - result.adsWatched;
        toast({ title: tr.arcade.adsProgress(result.adsWatched, status?.adsNeeded ?? 5, remaining) });
        setStatus((s) => (s ? { ...s, adsWatched: result.adsWatched } : s));
      }
    } catch (err: unknown) {
      haptic("error");
      toast({
        title: tr.arcade.error,
        description: err instanceof Error ? err.message : tr.arcade.tryAgain,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStarsPurchase() {
    setActionLoading(true);
    try {
      const { invoiceUrl } = await apiPost<{ invoiceUrl: string }>("/arcade/ticket/stars");
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.openInvoice) {
        tg.openInvoice(invoiceUrl, async (payStatus: string) => {
          if (payStatus === "paid") {
            haptic("success");
            toast({ title: tr.arcade.starsPaid, description: tr.arcade.starsActivating });
            await new Promise((r) => setTimeout(r, 2000));
            await loadStatus();
          }
        });
      } else {
        toast({ title: tr.arcade.openInTelegram, description: tr.arcade.starsRequireTelegram });
      }
    } catch (err: unknown) {
      toast({
        title: tr.arcade.error,
        description: err instanceof Error ? err.message : tr.arcade.tryAgain,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }

  // ── Render phases ─────────────────────────────────────────────────────────

  if (phase === "loading" || !status) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#22c55e", borderTopColor: "transparent" }} />
        </div>
        <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>{tr.arcade.loading}</p>
      </div>
    );
  }

  if (phase === "disabled") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Lock className="w-10 h-10" style={{ color: "rgba(255,255,255,0.3)" }} />
        </div>
        <div>
          <h3 className="text-xl font-black text-white mb-2">{tr.arcade.disabledTitle}</h3>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
            {tr.arcade.disabledDesc}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "grid" && selectedRoom) {
    return (
      <GridView
        room={selectedRoom}
        status={status}
        onBack={() => setPhase("rooms")}
        onStatusRefresh={loadStatus}
      />
    );
  }

  if (phase === "rooms") {
    return (
      <RoomSelector
        status={status}
        onRoomSelected={(room) => { setSelectedRoom(room); setPhase("grid"); }}
      />
    );
  }

  return (
    <EntryGate
      status={status}
      config={config}
      onAdWatched={handleAdWatched}
      onStarsPaid={handleStarsPurchase}
      loading={actionLoading}
    />
  );
}

export const ArcadeTab = memo(ArcadeTabInner);
