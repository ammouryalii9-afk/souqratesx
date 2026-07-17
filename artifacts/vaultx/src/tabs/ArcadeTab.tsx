import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Shield, Clock, Star, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X, Zap, Lock, Target } from "lucide-react";
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
import {
  arcadeSound,
  screenFlash,
  spawnFloatingText,
  particleExplosion,
  particleClaim,
  particleWin,
} from "../lib/arcadeEffects";

// ── Types ────────────────────────────────────────────────────────────────────

interface ArcadeStatus {
  enabled?: boolean;
  hasTicket: boolean;
  adsWatched: number;
  adsNeeded: number;
  starsBalance: number;
  skxBalance: number;
  extraCellCredits: number;
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
    gradient: string;
    viewportCols: number;
  }
> = {
  easy: {
    label: "Easy Grid",
    size: 100,
    multiplier: "1×",
    color: "#22c55e",
    gradient: "linear-gradient(135deg,#052e16 0%,#14532d 100%)",
    viewportCols: 14,   // big clear cells while keeping an open battlefield feel
  },
  tactical: {
    label: "Tactical Grid",
    size: 50,
    multiplier: "1.5×",
    color: "#f59e0b",
    gradient: "linear-gradient(135deg,#1c1003 0%,#451a03 100%)",
    viewportCols: 11,   // medium
  },
  hardcore: {
    label: "Hardcore Arena",
    size: 20,
    multiplier: "3×",
    color: "#ef4444",
    gradient: "linear-gradient(135deg,#1a0303 0%,#450a0a 100%)",
    viewportCols: 8,    // small viewport → fewer but larger cells = intense close combat
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
  { type: "extra_cells", stars: 500, icon: "🗺️" },
];

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }));
    throw Object.assign(new Error(err.error ?? `HTTP ${res.status}`), { status: res.status });
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
    throw Object.assign(new Error(err.error ?? `HTTP ${res.status}`), { status: res.status });
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
    extra_cells: tr.arcade.extraCellsLabel,
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
    extra_cells: tr.arcade.extraCellsDesc,
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

function finalPts(basePoints: number, room: Room): number {
  const mult = room === "easy" ? 100 : room === "tactical" ? 150 : 300;
  return Math.round((basePoints * mult) / 100);
}

// ── Cell rendering ─────────────────────────────────────────────────────────────
// IMPORTANT: enemy cells are intentionally INVISIBLE (look like empty cells).
// This is the core hidden-battle mechanic — you never know which cells are occupied.
// Discovery happens when a claim attempt hits a 409, which auto-triggers a strike.

function getCellStyle(
  cell: GridCell | undefined,
  isHovered: boolean,
  isRevealed: boolean,
  vp: number,
): {
  background: string; border: string;
  boxShadow?: string; transform?: string;
  animationClass?: string;
} {
  const bigCell = vp <= 12;

  if (cell?.owner === "me") {
    if (cell.isDecoy) {
      return {
        background: isHovered
          ? "linear-gradient(135deg,#fbbf24 0%,#ea7816 100%)"
          : "linear-gradient(135deg,#92400e 0%,#6b2d06 100%)",
        border: `${bigCell ? 2 : 1.5}px solid ${isHovered ? "#fde68a" : "#f59e0b"}`,
        boxShadow: isHovered ? "0 0 18px #f59e0bcc,0 0 36px #f59e0b55,inset 0 0 12px rgba(251,191,36,0.28)" : undefined,
        transform: isHovered ? "scale(1.15)" : "scale(1.03)",
        animationClass: isHovered ? undefined : "arcade-decoy",
      };
    }
    if (cell.hasShield) {
      return {
        background: isHovered
          ? "linear-gradient(135deg,#38bdf8 0%,#0284c7 100%)"
          : "linear-gradient(135deg,#164e63 0%,#082f49 100%)",
        border: `${bigCell ? 2 : 1.5}px solid ${isHovered ? "#7dd3fc" : "#22d3ee"}`,
        boxShadow: isHovered ? "0 0 20px #38bdf8cc,0 0 40px #38bdf855,inset 0 0 14px rgba(56,189,248,0.3)" : undefined,
        transform: isHovered ? "scale(1.15)" : "scale(1.03)",
        animationClass: isHovered ? undefined : "arcade-shield",
      };
    }
    return {
      background: isHovered
        ? "linear-gradient(135deg,#4ade80 0%,#16a34a 100%)"
        : "linear-gradient(135deg,#14532d 0%,#052e16 100%)",
      border: `${bigCell ? 2 : 1.5}px solid ${isHovered ? "#86efac" : "#22c55e"}`,
      boxShadow: isHovered ? "0 0 20px #22c55ecc,0 0 40px #22c55e55,inset 0 0 14px rgba(74,222,128,0.28)" : undefined,
      transform: isHovered ? "scale(1.15)" : "scale(1.03)",
      animationClass: isHovered ? undefined : "arcade-owned",
    };
  }

  if (cell?.owner === "other" && isRevealed) {
    return {
      background: "linear-gradient(135deg,#991b1b 0%,#450a0a 100%)",
      border: "2px solid #f87171",
      boxShadow: "0 0 22px #ef4444cc,0 0 44px #ef444455,inset 0 0 16px rgba(239,68,68,0.35)",
      transform: "scale(1.18)",
      animationClass: "arcade-enemy",
    };
  }

  // Empty / hidden enemy — identical visual (core mechanic)
  if (isHovered) {
    return {
      background: "rgba(255,255,255,0.09)",
      border: "1px solid rgba(255,255,255,0.3)",
      boxShadow: "0 0 6px rgba(255,255,255,0.06),inset 0 0 5px rgba(255,255,255,0.04)",
      transform: "scale(1.07)",
    };
  }
  return {
    background: "linear-gradient(135deg,rgba(18,32,70,0.65) 0%,rgba(8,15,38,0.5) 100%)",
    border: "1px solid rgba(70,100,190,0.1)",
  };
}

function getCellIcon(cell: GridCell | undefined, vp: number) {
  if (!cell || cell.owner !== "me") return null;
  const sz = vp <= 8 ? "15px" : vp <= 11 ? "12px" : "10px";
  const dotSz = vp <= 8 ? 9 : vp <= 11 ? 7 : 6;
  if (cell.isDecoy) return (
    <span style={{ fontSize: sz, lineHeight: 1, filter: "drop-shadow(0 0 4px #f59e0b)" }}>⚠️</span>
  );
  if (cell.hasShield) return (
    <span style={{ fontSize: sz, lineHeight: 1, filter: "drop-shadow(0 0 5px #22d3ee)" }}>🛡</span>
  );
  return (
    <div style={{
      width: dotSz, height: dotSz, borderRadius: "50%",
      background: "radial-gradient(circle,#fff 30%,rgba(74,222,128,0.8) 100%)",
      boxShadow: "0 0 6px #fff,0 0 14px rgba(74,222,128,0.9)",
    }} />
  );
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
  const progress = Math.min(1, status.adsWatched / status.adsNeeded) * 100;
  const hasAd =
    (config?.adsgram.enabled && config.adsgram.blockId) ||
    (config?.monetag.enabled && config.monetag.zoneId) ||
    (config?.onclicka.enabled && config.onclicka.spotId);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Hero — show center to display the face */}
      <div className="relative w-full flex-shrink-0" style={{ height: "230px" }}>
        <img
          src="/arcade-hero.jpeg"
          alt="SKX Arcade"
          className="w-full h-full object-cover"
          style={{ objectPosition: "50% 20%", filter: "brightness(0.8)" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom,transparent 30%,#060b18 100%)" }} />
        <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-1.5">
          <div
            className="inline-flex items-center gap-2 px-5 py-2 rounded-2xl"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(34,197,94,0.4)" }}
          >
            <span className="font-black text-2xl tracking-widest" style={{ color: "#22c55e", fontFamily: "monospace" }}>SKX</span>
            <span className="font-black text-2xl tracking-widest text-white">ARCADE</span>
          </div>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>{tr.arcade.entrySubtitle}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-4 pb-10 flex flex-col gap-4">

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
            <div className="flex gap-1.5 mb-3">
              {Array.from({ length: status.adsNeeded }, (_, i) => (
                <div
                  key={i}
                  className="flex-1 h-1.5 rounded-full transition-all duration-500"
                  style={{ background: i < status.adsWatched ? "#22c55e" : "rgba(255,255,255,0.1)" }}
                />
              ))}
            </div>

            {/* Progress bar */}
            <div className="h-8 bg-white/5 rounded-xl overflow-hidden relative">
              <div
                className="h-full rounded-xl transition-all duration-700"
                style={{ width: `${progress}%`, background: "linear-gradient(90deg,#16a34a,#22c55e)" }}
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
                background: hasAd ? "linear-gradient(135deg,#16a34a,#22c55e)" : "rgba(255,255,255,0.05)",
                color: hasAd ? "#000" : "#555",
              }}
            >
              {loading ? tr.arcade.watchingAd : hasAd ? tr.arcade.watchAdBtn : "Ads not configured"}
            </button>
          ) : (
            <div className="w-full py-3.5 text-center font-black text-sm" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
              ✅ {tr.arcade.ticketGrantedDesc}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>{tr.arcade.dividerOr}</span>
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
        </div>

        {/* Option B — Stars */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div className="px-4 pt-4 pb-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)" }}>
              <Star className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-white">{tr.arcade.optionStarsTitle}</p>
              <p className="text-[11px]" style={{ color: "#f59e0b99" }}>{tr.arcade.optionStarsFast}</p>
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
          <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            {tr.arcade.howItWorksText}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── RoomSelector ──────────────────────────────────────────────────────────────

function RoomSelector({ status, onRoomSelected }: {
  status: ArcadeStatus;
  onRoomSelected: (room: Room) => void;
}) {
  const { tr } = useLanguage();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Banner — use arcade-5.jpeg which shows a different angle */}
      <div className="relative w-full flex-shrink-0" style={{ height: "160px" }}>
        <img
          src="/arcade-5.jpeg"
          alt="Rooms"
          className="w-full h-full object-cover"
          style={{ objectPosition: "50% 35%", filter: "brightness(0.7)" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom,transparent 20%,#060b18 100%)" }} />
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: "#22c55e" }}>
            🎟️ {tr.arcade.ticketActive}
          </p>
          <h2 className="text-2xl font-black text-white">{tr.arcade.roomTitle}</h2>
        </div>
      </div>

      <div className="flex-1 px-4 pt-3 pb-8 flex flex-col gap-3">
        {/* Active sessions strip */}
        {status.activeSessions.length > 0 && (
          <div className="rounded-xl p-3" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <p className="text-xs font-black mb-2" style={{ color: "#22c55e" }}>{tr.arcade.activeSessions}</p>
            <div className="flex flex-col gap-1.5">
              {status.activeSessions.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                  <span className="text-[10px] capitalize text-white/70">{s.roomType}</span>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>({s.gridX},{s.gridY})</span>
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
              style={{
                background: r.gradient,
                border: `1px solid ${r.color}40`,
                boxShadow: `0 0 20px ${r.color}12,0 4px 16px rgba(0,0,0,0.4)`,
              }}
            >
              {/* Shine sweep animation */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                <div style={{
                  position: "absolute", top: 0, bottom: 0, width: "30%",
                  background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)",
                  animation: "arcadeRoomShine 5s ease-in-out infinite",
                  animationDelay: room === "easy" ? "0s" : room === "tactical" ? "1.8s" : "3.5s",
                }} />
              </div>
              {/* Corner accent */}
              <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none" style={{
                background: `radial-gradient(circle at top right,${r.color}22 0%,transparent 70%)`,
              }} />

              <div className="p-4 relative z-10">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-black text-white text-lg leading-tight">{r.label}</p>
                    </div>
                    <p className="text-[11px]" style={{ color: `${r.color}cc` }}>{roomDesc(room, tr)}</p>
                  </div>
                  <div
                    className="px-3 py-1.5 rounded-xl text-sm font-black shrink-0"
                    style={{
                      background: r.color,
                      color: "#000",
                      boxShadow: `0 0 12px ${r.color}66`,
                    }}
                  >
                    {r.multiplier}
                  </div>
                </div>

                <div className="flex gap-2">
                  {DURATION_OPTIONS.map((d) => {
                    const pts = finalPts(d.points, room);
                    const stake = Math.round(pts * 0.25);
                    return (
                      <div
                        key={d.hours}
                        className="flex-1 rounded-xl py-2 text-center"
                        style={{
                          background: `${r.color}14`,
                          border: `1px solid ${r.color}22`,
                        }}
                      >
                        <p className="text-[9px] font-bold" style={{ color: `${r.color}88` }}>{d.hours}{tr.arcade.hoursUnit}</p>
                        <p className="text-xs font-black" style={{ color: r.color }}>{(pts / 1000).toFixed(0)}K</p>
                        <p className="text-[8px]" style={{ color: `${r.color}66` }}>−{(stake / 1000).toFixed(0)}K</p>
                      </div>
                    );
                  })}
                </div>

                {myCount > 0 && (
                  <div
                    className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black"
                    style={{
                      background: `${r.color}1a`,
                      color: r.color,
                      border: `1px solid ${r.color}35`,
                      boxShadow: `0 0 8px ${r.color}22`,
                    }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: r.color, boxShadow: `0 0 4px ${r.color}`, animation: "vaultPulse 1.5s ease-in-out infinite" }} />
                    {tr.arcade.activeHere(myCount)}
                  </div>
                )}
              </div>
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
  skxBalance,
  onConfirm,
  onCancel,
  loading,
}: {
  cell: { x: number; y: number };
  room: Room;
  skxBalance: number;
  onConfirm: (hours: number) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { tr } = useLanguage();
  const [selectedHours, setSelectedHours] = useState(6);
  const r = ROOMS[room];
  const MIN_SKX = 100_000;
  const hasMinSkx = skxBalance >= MIN_SKX;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-md flex flex-col"
        style={{
          background: "#0a1628",
          borderRadius: "24px",
          border: `2px solid ${r.color}50`,
          maxHeight: "78vh",
        }}
      >
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${r.color}20` }}
            >
              <Target className="w-5 h-5" style={{ color: r.color }} />
            </div>
            <div>
              <h3 className="font-black text-white text-base leading-tight">{tr.arcade.claimTitle(cell.x, cell.y)}</h3>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{tr.arcade.claimDesc}</p>
            </div>
          </div>

          {/* SKX balance warning */}
          {!hasMinSkx && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 text-xs font-bold"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>{tr.arcade.needSkxMin(MIN_SKX)}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 mb-3">
            {DURATION_OPTIONS.map((d) => {
              const pts = finalPts(d.points, room);
              const stake = Math.round(pts * 0.25);
              const canAfford = skxBalance >= stake;
              const isSelected = selectedHours === d.hours;
              return (
                <button
                  key={d.hours}
                  onClick={() => setSelectedHours(d.hours)}
                  disabled={!hasMinSkx || !canAfford}
                  className="flex items-center gap-3 p-3 rounded-2xl transition-all disabled:opacity-40"
                  style={{
                    background: isSelected ? `${r.color}18` : "rgba(255,255,255,0.04)",
                    border: isSelected ? `1.5px solid ${r.color}` : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
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
                  <div className="text-right shrink-0">
                    <p className="text-base font-black" style={{ color: r.color }}>{pts.toLocaleString()}</p>
                    <p className="text-[9px]" style={{ color: "#f59e0b" }}>
                      {tr.arcade.stakeLabel} {stake.toLocaleString()} SKX
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Stake explanation */}
          {hasMinSkx && (
            <div
              className="px-3 py-2 rounded-xl text-[10px] mb-1"
              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "rgba(251,191,36,0.8)" }}
            >
              {tr.arcade.stakeExplain}
            </div>
          )}
        </div>

        {/* Sticky bottom buttons — always visible */}
        <div className="flex-shrink-0 flex gap-3 px-5 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3.5 rounded-2xl text-sm font-bold"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}
          >
            {tr.arcade.cancel}
          </button>
          <button
            onClick={() => onConfirm(selectedHours)}
            disabled={loading || !hasMinSkx}
            className="flex-1 py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50"
            style={{ background: r.color, color: "#000" }}
          >
            {loading ? "⏳" : tr.arcade.claimBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ShopModal ─────────────────────────────────────────────────────────────────
// Uses REAL Telegram Stars payments via openInvoice() — no internal balance,
// no scroll needed (compact 2-col grid fits on any phone without scrolling).

function ShopModal({
  activeSessions,
  onClose,
  onPurchased,
}: {
  activeSessions: ActiveSession[];
  onClose: () => void;
  onPurchased: (itemType: string) => void;
}) {
  const { tr } = useLanguage();
  const { toast } = useToast();
  const [selectedSession, setSelectedSession] = useState<number | null>(activeSessions[0]?.id ?? null);
  const [loadingItem, setLoadingItem] = useState<string | null>(null);

  async function buyItem(itemType: string) {
    type TgWebApp = { openInvoice?: (url: string, cb: (s: string) => void) => void };
    const tg = (window as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
    if (!tg?.openInvoice) {
      toast({ title: tr.arcade.openInTelegram, description: tr.arcade.starsRequireTelegram, variant: "destructive" });
      return;
    }
    const needsSession = itemType.startsWith("shield") || itemType === "decoy";
    const sid = needsSession ? selectedSession : undefined;
    if (needsSession && !sid) {
      toast({ title: tr.arcade.buyFailed, description: tr.arcade.applyTo, variant: "destructive" });
      return;
    }
    setLoadingItem(itemType);
    try {
      const { invoiceUrl } = await apiPost<{ invoiceUrl: string }>("/arcade/shop/invoice", { itemType, sessionId: sid });
      tg.openInvoice(invoiceUrl, (status: string) => {
        setLoadingItem(null);
        if (status === "paid") {
          haptic("success");
          onPurchased(itemType);
          onClose();
        } else if (status !== "cancelled") {
          toast({ title: tr.arcade.buyFailed, variant: "destructive" });
        }
      });
    } catch (err: unknown) {
      setLoadingItem(null);
      haptic("error");
      toast({ title: tr.arcade.buyFailed, description: err instanceof Error ? err.message : tr.arcade.tryAgain, variant: "destructive" });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-3xl px-4 pt-4 pb-5"
        style={{ background: "#0a1628", border: "1px solid rgba(245,158,11,0.3)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-black text-white text-base">{tr.arcade.shopTitle}</h3>
            <p className="text-[11px] font-bold" style={{ color: "rgba(245,158,11,0.8)" }}>Real Telegram Stars · Instant effect</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Session picker — only when multiple sessions exist */}
        {activeSessions.length > 1 && (
          <div className="mb-3">
            <p className="text-[10px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>{tr.arcade.applyTo}</p>
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

        {/* Items — single-row list, ~52px per row × 5 = fits any phone with zero scroll */}
        <div className="flex flex-col gap-2">
          {SHOP_ITEMS.map((item) => {
            const isLoading = loadingItem === item.type;
            const isBusy = loadingItem !== null;
            return (
              <button
                key={item.type}
                onClick={() => buyItem(item.type)}
                disabled={isBusy}
                className="flex items-center gap-3 px-3 py-2.5 rounded-2xl active:scale-[0.98] transition-all disabled:opacity-50 w-full"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
              >
                <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-black text-white leading-tight">{shopItemLabel(item.type, tr)}</p>
                  <p className="text-[10px] leading-tight truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {shopItemDesc(item.type, tr)}
                  </p>
                </div>
                <div
                  className="shrink-0 px-3.5 py-1.5 rounded-xl text-sm font-black"
                  style={{
                    background: isLoading ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#b45309,#f59e0b)",
                    color: isLoading ? "rgba(255,255,255,0.4)" : "#000",
                    minWidth: 64,
                    textAlign: "center",
                  }}
                >
                  {isLoading ? "⏳" : `${item.stars} ⭐`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── GridView ──────────────────────────────────────────────────────────────────

type SpecialMode =
  | { type: "radar" }
  | { type: "multi_strike"; remaining: number }
  | null;

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
  const { toast } = useToast();
  const { tr } = useLanguage();
  const r = ROOMS[room];

  const [gridData, setGridData] = useState<GridData | null>(null);
  const [viewOx, setViewOx] = useState(0);
  const [viewOy, setViewOy] = useState(0);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [claimCell, setClaimCell] = useState<{ x: number; y: number } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(true);
  const [specialMode, setSpecialMode] = useState<SpecialMode>(null);
  // Combo system
  const [combo, setCombo] = useState(0);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // cell button refs for effect anchoring
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  function bumpCombo() {
    setCombo((c) => {
      const next = c + 1;
      arcadeSound.combo(Math.min(next, 6));
      return next;
    });
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => setCombo(0), 3500);
  }

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
      const cx = Math.max(0, Math.min(gridSize - vp, myCells[0].x - Math.floor(vp / 2)));
      const cy = Math.max(0, Math.min(gridSize - vp, myCells[0].y - Math.floor(vp / 2)));
      setViewOx(cx);
      setViewOy(cy);
    }
  }, [gridData, gridSize, vp]);

  const cellMap = new Map<string, GridCell>();
  gridData?.cells.forEach((c) => cellMap.set(`${c.x},${c.y}`, c));

  // ── Radar scan ────────────────────────────────────────────────────────────────
  async function handleRadarScan(cx: number, cy: number) {
    setLoading(true);
    haptic("light");
    // Highlight the 3×3 area
    const scanKeys = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
          scanKeys.add(`${nx},${ny}`);
        }
      }
    }
    setRevealedKeys(scanKeys);
    try {
      const result = await apiPost<{ activeCount: number }>("/arcade/grid/radar", { room, cx, cy });
      haptic(result.activeCount > 0 ? "warning" : "success");
      toast({
        title: result.activeCount > 0
          ? `📡 ${result.activeCount} ${tr.arcade.radarHit ?? "active cells nearby!"}`
          : `📡 ${tr.arcade.radarClear ?? "Area clear — no active cells"}`,
        description: `(${cx}, ${cy}) ± 1`,
      });
    } catch (err) {
      toast({ title: "📡 Radar failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
      setSpecialMode(null);
      await new Promise((r) => setTimeout(r, 1200));
      setRevealedKeys(new Set());
    }
  }

  // ── Multi-Strike ─────────────────────────────────────────────────────────────
  async function handleMultiStrike(cx: number, cy: number) {
    const targets: { x: number; y: number }[] = [
      { x: cx, y: cy },
      { x: cx, y: cy - 1 },
      { x: cx, y: cy + 1 },
      { x: cx - 1, y: cy },
      { x: cx + 1, y: cy },
    ].filter((t) => t.x >= 0 && t.x < gridSize && t.y >= 0 && t.y < gridSize);

    setLoading(true);
    haptic("medium");

    // Flash all target cells
    const flashKeys = new Set(targets.map((t) => `${t.x},${t.y}`));
    setRevealedKeys(flashKeys);

    let hits = 0;
    let totalReward = 0;
    let totalPenalty = 0;

    for (const t of targets) {
      const tKey = `${t.x},${t.y}`;
      const tEl = cellRefs.current.get(tKey) ?? null;
      try {
        const result = await apiPost<{ result: string; strikerReward?: number; penalty?: number }>(
          "/arcade/grid/strike",
          { room, x: t.x, y: t.y },
        );
        if (result.result === "destroyed") {
          hits++;
          totalReward += result.strikerReward ?? 0;
          particleExplosion(tEl);
          spawnFloatingText(tEl, result.strikerReward ? `+${result.strikerReward.toLocaleString()}` : "💥", "#fbbf24");
          bumpCombo();
        } else if (result.result === "decoy_trap") {
          totalPenalty += result.penalty ?? 0;
          screenFlash("rgba(239,68,68,0.3)", 200);
          spawnFloatingText(tEl, "💥 DECOY!", "#ef4444");
          setCombo(0);
        }
      } catch {
        // cell was empty — skip
      }
      await new Promise((res) => setTimeout(res, 180));
    }

    const remaining = (specialMode as { type: "multi_strike"; remaining: number }).remaining - 1;
    setSpecialMode(remaining > 0 ? { type: "multi_strike", remaining } : null);

    haptic(hits > 0 ? "success" : "warning");
    toast({
      title: hits > 0 ? `⚡ ${hits} ${tr.arcade.multiStrikeHit ?? "hit(s)!"}` : `⚡ ${tr.arcade.multiStrikeMiss ?? "No enemies in range"}`,
      description: totalReward > 0
        ? `+${totalReward.toLocaleString()} ${tr.arcade.ptsLabel}`
        : totalPenalty > 0
          ? `−${totalPenalty.toLocaleString()} ${tr.arcade.ptsLabel} (decoy!)`
          : undefined,
    });

    setLoading(false);
    await Promise.all([loadGrid(), onStatusRefresh()]);
    await new Promise((res) => setTimeout(res, 900));
    setRevealedKeys(new Set());
  }

  function onCellTap(absX: number, absY: number) {
    const key = `${absX},${absY}`;
    const cell = cellMap.get(key);
    const el = cellRefs.current.get(key) ?? null;

    // Special modes intercept all taps
    if (specialMode?.type === "radar") {
      arcadeSound.radar();
      void handleRadarScan(absX, absY);
      return;
    }
    if (specialMode?.type === "multi_strike") {
      arcadeSound.multiStrike();
      void handleMultiStrike(absX, absY);
      return;
    }

    if (cell?.owner === "me") {
      arcadeSound.tap();
      haptic("light");
      setShopOpen(true);
      return;
    }

    arcadeSound.tap();
    haptic("medium");
    setClaimCell({ x: absX, y: absY });
  }

  // ── Claim handler ────────────────────────────────────────────────────────────
  async function handleClaim(hours: number) {
    if (!claimCell) return;
    const { x, y } = claimCell;
    const key = `${x},${y}`;
    const el = cellRefs.current.get(key) ?? null;
    setLoading(true);

    try {
      const claimResult = await apiPost<{ session: { finalPoints: number; stakeAmount: number }; newSkxBalance?: number }>(
        "/arcade/grid/claim", { room, x, y, durationHours: hours }
      );
      arcadeSound.claim();
      haptic("success");
      particleClaim(el);
      const stakeAmt = claimResult.session.stakeAmount;
      spawnFloatingText(el, `−${stakeAmt.toLocaleString()} SKX`, "#f59e0b");
      toast({ title: tr.arcade.claimed, description: tr.arcade.claimedDesc(x, y) });
      bumpCombo();
      setClaimCell(null);
      await Promise.all([loadGrid(), onStatusRefresh()]);
    } catch (claimErr: unknown) {
      const httpStatus = (claimErr as { status?: number }).status;
      const msg = claimErr instanceof Error ? claimErr.message : "";

      if (httpStatus === 409 && msg.toLowerCase().includes("already")) {
        // 🎯 DISCOVERY MOMENT
        setClaimCell(null);
        arcadeSound.enemyDetected();
        haptic("warning");
        screenFlash("rgba(239,68,68,0.35)", 300);

        const revKey = key;
        setRevealedKeys((prev) => new Set([...prev, revKey]));
        toast({ title: "⚔️ Enemy detected! Striking...", description: `(${x}, ${y})` });

        await new Promise((res) => setTimeout(res, 800));

        try {
          const result = await apiPost<{ result: string; strikerReward?: number; penalty?: number; message: string }>(
            "/arcade/grid/strike",
            { room, x, y },
          );

          if (result.result === "destroyed") {
            arcadeSound.explosion();
            haptic("success");
            screenFlash("rgba(251,191,36,0.25)", 250);
            particleExplosion(el);
            spawnFloatingText(el, result.strikerReward ? `+${result.strikerReward.toLocaleString()}` : "💥 DESTROYED", "#fbbf24");
            bumpCombo();
          } else if (result.result === "shielded") {
            arcadeSound.shielded();
            haptic("warning");
            screenFlash("rgba(34,211,238,0.2)", 200);
            spawnFloatingText(el, "🛡 SHIELDED", "#22d3ee");
          } else if (result.result === "decoy_trap") {
            arcadeSound.decoyTrap();
            haptic("error");
            screenFlash("rgba(239,68,68,0.45)", 350);
            particleExplosion(el);
            spawnFloatingText(el, result.penalty ? `−${result.penalty.toLocaleString()}` : "💥 DECOY!", "#ef4444");
            setCombo(0);
          }

          const icon = result.result === "shielded" ? "🛡️" : result.result === "decoy_trap" ? "💥" : "⚔️";
          const detail = result.strikerReward
            ? `+${result.strikerReward.toLocaleString()} ${tr.arcade.ptsLabel}`
            : result.penalty
              ? `−${result.penalty.toLocaleString()} ${tr.arcade.ptsLabel}`
              : undefined;
          toast({ title: `${icon} ${result.message}`, description: detail });
          await Promise.all([loadGrid(), onStatusRefresh()]);
        } catch (strikeErr: unknown) {
          toast({
            title: tr.arcade.strikeFailed,
            description: strikeErr instanceof Error ? strikeErr.message : tr.arcade.tryAgain,
            variant: "destructive",
          });
        }

        setRevealedKeys((prev) => {
          const next = new Set(prev);
          next.delete(revKey);
          return next;
        });
      } else {
        haptic("error");
        toast({
          title: tr.arcade.claimFailed,
          description: msg || tr.arcade.tryAgain,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  // Called by ShopModal after openInvoice() confirms "paid"
  async function handlePurchased(itemType: string) {
    toast({ title: tr.arcade.buySuccess, description: shopItemLabel(itemType, tr) });
    // Activate client-side special modes
    if (itemType === "radar") setSpecialMode({ type: "radar" });
    else if (itemType === "multi_strike") setSpecialMode({ type: "multi_strike", remaining: 5 });
    // Refresh grid + status from server (webhook already applied DB effect)
    await Promise.all([loadGrid(), onStatusRefresh()]);
  }

  function pan(dx: number, dy: number) {
    const step = Math.max(2, Math.floor(vp / 3));
    setViewOx((x) => Math.max(0, Math.min(gridSize - vp, x + dx * step)));
    setViewOy((y) => Math.max(0, Math.min(gridSize - vp, y + dy * step)));
    haptic("light");
  }

  const mySessions = status.activeSessions.filter((s) => s.roomType === room);

  return (
    <div className="flex flex-col h-full" style={{ background: "radial-gradient(ellipse at 50% 0%,#0b1830 0%,#060b18 50%,#030710 100%)" }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-2.5 px-3 py-2.5"
        style={{
          background: `linear-gradient(135deg,${r.color}18 0%,rgba(0,0,0,0.5) 100%)`,
          borderBottom: `1px solid ${r.color}35`,
          backdropFilter: "blur(8px)",
        }}
      >
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: r.color, boxShadow: `0 0 6px ${r.color}` }} />
            <p className="text-sm font-black text-white leading-none">{r.label}</p>
            <span
              className="text-[9px] font-black px-1.5 py-0.5 rounded-md"
              style={{ background: `${r.color}22`, color: r.color, border: `1px solid ${r.color}40` }}
            >
              {r.multiplier}
            </span>
          </div>
          <p className="text-[9px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.38)" }}>
            {gridData ? (
              <><span style={{ color: r.color }}>{gridData.totalActive}</span> {tr.arcade.activeCells(0).replace(/^0 /, "")} · [{viewOx},{viewOy}]</>
            ) : tr.arcade.loadingGrid}
          </p>
        </div>
        {/* SKX balance chip */}
        <div
          className="flex items-center gap-1 px-2 py-1 rounded-lg shrink-0"
          style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}
        >
          <span className="text-[9px] font-black" style={{ color: "#f59e0b" }}>SKX</span>
          <span className="text-[10px] font-black text-white">{(status.skxBalance / 1000).toFixed(0)}K</span>
        </div>
        <button
          onClick={() => loadGrid()}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
        >
          ↻
        </button>
        <button
          onClick={() => { haptic("light"); setShopOpen(true); }}
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.4)", boxShadow: "0 0 8px rgba(245,158,11,0.2)" }}
        >
          <Star className="w-3.5 h-3.5 text-yellow-400" />
        </button>
      </div>

      {/* Special mode banner */}
      {specialMode && (
        <div
          className="shrink-0 flex items-center justify-between px-4 py-2"
          style={{
            background: specialMode.type === "radar" ? "rgba(34,211,238,0.12)" : "rgba(245,158,11,0.12)",
            borderBottom: `1px solid ${specialMode.type === "radar" ? "rgba(34,211,238,0.3)" : "rgba(245,158,11,0.3)"}`,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{specialMode.type === "radar" ? "📡" : "⚡"}</span>
            <p className="text-xs font-black" style={{ color: specialMode.type === "radar" ? "#22d3ee" : "#f59e0b" }}>
              {specialMode.type === "radar"
                ? (tr.arcade.radarMode ?? "RADAR MODE — tap any cell to scan 3×3")
                : `MULTI-STRIKE ×${specialMode.remaining} — ${tr.arcade.multiStrikeMode ?? "tap any cell to strike 5 adjacent"}`}
            </p>
          </div>
          <button
            onClick={() => setSpecialMode(null)}
            className="text-xs px-2.5 py-1 rounded-lg font-bold"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Grid area — full-width square, nav arrows overlaid */}
      <div className="flex-1 flex flex-col min-h-0 px-3 pt-2 pb-1 gap-2">
        {/* Square grid wrapper: width drives height via padding-bottom trick */}
        <div className="relative w-full" style={{ paddingBottom: "100%" }}>
          {/* Absolute fill — the actual grid */}
          <div
            className="absolute inset-0 arcade-grid-glow"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${vp}, 1fr)`,
              gridAutoRows: "1fr",
              gap: "3px",
              padding: "5px",
              borderRadius: "18px",
              background: "linear-gradient(135deg,#04091c 0%,#060d26 50%,#030810 100%)",
              border: `1px solid ${r.color}22`,
              overflow: "hidden",
            }}
          >
            {/* Scan beam */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[16px] z-10"
              style={{ mixBlendMode: "screen" }}>
              <div style={{
                position: "absolute", left: 0, right: 0, height: "35%",
                background: `linear-gradient(to bottom,transparent,${r.color}07,transparent)`,
                animation: "arcadeScanBeam 8s linear infinite",
              }} />
            </div>
            {/* Scanline texture */}
            <div className="pointer-events-none absolute inset-0 z-[9] rounded-[16px]"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.007) 3px,rgba(255,255,255,0.007) 4px)",
              }} />
            {/* Loading overlay */}
            {gridLoading && (
              <div
                className="absolute inset-0 flex items-center justify-center z-20 rounded-[16px]"
                style={{ background: "rgba(4,9,28,0.9)", backdropFilter: "blur(4px)" }}
              >
                <div
                  className="w-10 h-10 rounded-full border-2 animate-spin"
                  style={{ borderColor: `${r.color}33`, borderTopColor: r.color, boxShadow: `0 0 16px ${r.color}88` }}
                />
              </div>
            )}
            {/* Cells */}
            {Array.from({ length: vp * vp }, (_, i) => {
              const col = i % vp;
              const row = Math.floor(i / vp);
              const absX = viewOx + col;
              const absY = viewOy + row;
              const key = `${absX},${absY}`;
              const cell = cellMap.get(key);
              const isHovered = hoveredKey === key;
              const isRevealed = revealedKeys.has(key);
              const style = getCellStyle(cell, isHovered, isRevealed, vp);
              const isFeverTarget = specialMode !== null && !cell;
              const radius = vp <= 8 ? "8px" : vp <= 11 ? "6px" : "4px";

              return (
                <button
                  key={i}
                  ref={(el) => {
                    if (el) cellRefs.current.set(key, el);
                    else cellRefs.current.delete(key);
                  }}
                  onClick={() => onCellTap(absX, absY)}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={`flex items-center justify-center transition-all duration-100 active:scale-75 ${style.animationClass ?? ""}`}
                  style={{
                    borderRadius: radius,
                    background: style.background,
                    border: isFeverTarget ? `1px solid rgba(245,158,11,0.45)` : style.border,
                    boxShadow: isFeverTarget
                      ? "inset 0 0 4px rgba(245,158,11,0.15)"
                      : (style.animationClass ? undefined : style.boxShadow),
                    transform: style.transform,
                    minWidth: 0,
                    minHeight: 0,
                  }}
                >
                  {getCellIcon(cell, vp)}
                </button>
              );
            })}
          </div>

          {/* Nav arrows — overlaid on grid edges */}
          <button
            onClick={() => pan(0, -1)}
            disabled={viewOy === 0}
            className="absolute top-1 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center disabled:opacity-0 active:scale-90"
            style={{
              width: 36, height: 28, borderRadius: 10,
              background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(4px)",
            }}
          >
            <ChevronUp className="w-4 h-4 text-white/80" />
          </button>
          <button
            onClick={() => pan(0, 1)}
            disabled={viewOy >= gridSize - vp}
            className="absolute bottom-1 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center disabled:opacity-0 active:scale-90"
            style={{
              width: 36, height: 28, borderRadius: 10,
              background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(4px)",
            }}
          >
            <ChevronDown className="w-4 h-4 text-white/80" />
          </button>
          <button
            onClick={() => pan(-1, 0)}
            disabled={viewOx === 0}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center disabled:opacity-0 active:scale-90"
            style={{
              width: 28, height: 36, borderRadius: 10,
              background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(4px)",
            }}
          >
            <ChevronLeft className="w-4 h-4 text-white/80" />
          </button>
          <button
            onClick={() => pan(1, 0)}
            disabled={viewOx >= gridSize - vp}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center disabled:opacity-0 active:scale-90"
            style={{
              width: 28, height: 36, borderRadius: 10,
              background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(4px)",
            }}
          >
            <ChevronRight className="w-4 h-4 text-white/80" />
          </button>
        </div>

        {/* Combo Meter */}
        {combo >= 2 && (
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-full"
            style={{
              background: combo >= 5
                ? "linear-gradient(90deg,rgba(239,68,68,0.25),rgba(245,158,11,0.25))"
                : "rgba(245,158,11,0.15)",
              border: combo >= 5
                ? "1px solid rgba(239,68,68,0.5)"
                : "1px solid rgba(245,158,11,0.35)",
              animation: "vaultPulse 0.6s ease-in-out infinite",
            }}
          >
            <span className="text-base leading-none">
              {combo >= 7 ? "🔥" : combo >= 5 ? "⚡" : "✨"}
            </span>
            <span
              className="text-xs font-black tracking-wider"
              style={{
                color: combo >= 5 ? "#ef4444" : "#f59e0b",
              }}
            >
              {combo >= 7 ? "FEVER! " : combo >= 5 ? "HOT! " : ""}
              COMBO ×{combo}
            </span>
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-4 pt-0.5 pb-0.5">
          {[
            { bg: "#16a34a", border: "#4ade80", label: tr.arcade.legendMine },
            { bg: "#0e7490", border: "#22d3ee", label: tr.arcade.legendShield },
            { bg: "#d97706", border: "#fbbf24", label: "Decoy" },
            { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.06)", label: tr.arcade.legendEmpty },
          ].map(({ bg, border, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-[2px]" style={{ background: bg, border: `1px solid ${border}` }} />
              <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* My sessions panel */}
      {mySessions.length > 0 && (
        <div
          className="shrink-0 px-3 py-2"
          style={{
            borderTop: `1px solid ${r.color}25`,
            background: `linear-gradient(to right,${r.color}0a,transparent,${r.color}08)`,
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: r.color }} />
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: `${r.color}88` }}>
              {tr.arcade.mySessions}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {mySessions.map((s) => {
              const elapsed = Date.now() - (new Date(s.expiresAt).getTime() - s.durationHours * 3_600_000);
              const pct = Math.max(2, Math.min(100, (elapsed / (s.durationHours * 3_600_000)) * 100));
              const isDecoy = s.isDecoy;
              const isShielded = s.hasShield;
              const accentColor = isDecoy ? "#f59e0b" : isShielded ? "#22d3ee" : r.color;
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                  style={{
                    background: `linear-gradient(135deg,${accentColor}10,${accentColor}06)`,
                    border: `1px solid ${accentColor}25`,
                    boxShadow: `0 0 8px ${accentColor}10`,
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor, boxShadow: `0 0 5px ${accentColor}` }} />
                  <span className="text-[9px] font-bold shrink-0" style={{ color: "rgba(255,255,255,0.45)" }}>
                    ({s.gridX},{s.gridY})
                  </span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg,${accentColor}99,${accentColor})`,
                        boxShadow: `0 0 4px ${accentColor}66`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-bold shrink-0" style={{ color: accentColor }}>
                    {formatCountdown(s.expiresAt, tr.arcade.expired, tr.arcade.hoursUnit)}
                  </span>
                  <span className="text-[10px] font-black shrink-0" style={{ color: "#fbbf24", textShadow: "0 0 6px #f59e0b66" }}>
                    +{(s.finalPoints / 1000).toFixed(0)}K
                  </span>
                  {isShielded && <span className="text-[9px] shrink-0" style={{ filter: "drop-shadow(0 0 3px #22d3ee)" }}>🛡</span>}
                  {isDecoy && <span className="text-[9px] shrink-0">⚠️</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialogs */}
      {claimCell && (
        <ClaimDialog
          cell={claimCell}
          room={room}
          skxBalance={status.skxBalance}
          onConfirm={handleClaim}
          onCancel={() => setClaimCell(null)}
          loading={loading}
        />
      )}
      {shopOpen && (
        <ShopModal
          activeSessions={status.activeSessions}
          onClose={() => setShopOpen(false)}
          onPurchased={handlePurchased}
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

  useEffect(() => {
    getPublicConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiGet<ArcadeStatus>("/arcade/status");
      setStatus(data);
      if (data.enabled === false) { setPhase("disabled"); return; }
      if (data.wonSessionsAwarded > 0) {
        toast({ title: tr.arcade.wonPoints(data.wonSessionsAwarded), description: tr.arcade.wonPointsDesc });
        refreshFromServer();
      }
      setPhase(data.hasTicket ? "rooms" : "gate");
    } catch {
      setPhase("gate");
    }
  }, [toast, refreshFromServer, tr]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // ── Watch real ad ──────────────────────────────────────────────────────────
  async function handleAdWatched() {
    const hasAny =
      (config?.adsgram.enabled && config.adsgram.blockId) ||
      (config?.monetag.enabled && config.monetag.zoneId) ||
      (config?.onclicka.enabled && config.onclicka.spotId);
    if (!hasAny || actionLoading) return;
    setActionLoading(true);
    try {
      await watchRewardedAdWithFallback(config);
      const result = await apiPost<{ granted: boolean; adsWatched: number; adsNeeded?: number }>("/arcade/ticket/watch-ad");
      haptic("light");
      if (result.granted) {
        haptic("success");
        toast({ title: tr.arcade.ticketGranted, description: tr.arcade.ticketGrantedDesc });
        await loadStatus();
      } else {
        const needed = result.adsNeeded ?? status?.adsNeeded ?? 5;
        const remaining = needed - result.adsWatched;
        toast({ title: tr.arcade.adsProgress(result.adsWatched, needed, remaining) });
        setStatus((s) => (s ? { ...s, adsWatched: result.adsWatched } : s));
      }
    } catch (err: unknown) {
      haptic("error");
      toast({ title: tr.arcade.error, description: err instanceof Error ? err.message : tr.arcade.tryAgain, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStarsPurchase() {
    setActionLoading(true);
    try {
      const { invoiceUrl } = await apiPost<{ invoiceUrl: string }>("/arcade/ticket/stars");
      const tg = (window as { Telegram?: { WebApp?: { openInvoice?: (url: string, cb: (s: string) => void) => void } } }).Telegram?.WebApp;
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
      toast({ title: tr.arcade.error, description: err instanceof Error ? err.message : tr.arcade.tryAgain, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === "loading" || !status) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}
        >
          <div
            className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "#22c55e", borderTopColor: "transparent" }}
          />
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
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>{tr.arcade.disabledDesc}</p>
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
