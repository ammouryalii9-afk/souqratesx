import { memo, useCallback, useEffect, useState } from "react";
import { Shield, Clock, Star, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Play, X } from "lucide-react";
import { useVault } from "../context/VaultContext";
import { haptic } from "../lib/telegram";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "../lib/i18n";

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

const ROOMS: Record<Room, { label: string; size: number; multiplier: string; color: string; glow: string; viewportCols: number }> = {
  easy: {
    label: "Easy Grid",
    size: 100,
    multiplier: "1×",
    color: "#22c55e",
    glow: "rgba(34,197,94,0.4)",
    viewportCols: 12,
  },
  tactical: {
    label: "Tactical Grid",
    size: 50,
    multiplier: "1.5×",
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.4)",
    viewportCols: 15,
  },
  hardcore: {
    label: "Hardcore Arena",
    size: 20,
    multiplier: "3×",
    color: "#ef4444",
    glow: "rgba(239,68,68,0.4)",
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

// ── Utility ────────────────────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────────────────

function EntryGate({ status, onAdWatched, onStarsPaid, loading }: {
  status: ArcadeStatus;
  onAdWatched: () => void;
  onStarsPaid: () => void;
  loading: boolean;
}) {
  const { tr } = useLanguage();
  const progress = (status.adsWatched / status.adsNeeded) * 100;
  return (
    <div className="flex flex-col min-h-full">
      {/* Hero Image */}
      <div className="relative w-full h-52 overflow-hidden">
        <img
          src="/arcade-hero.jpeg"
          alt="SKX Arcade"
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#060b18]" />
        <div className="absolute bottom-4 left-0 right-0 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-[#22c55e]/30">
            <span className="text-[#22c55e] font-black text-xl tracking-wider" style={{ fontFamily: "monospace" }}>SKX</span>
            <span className="text-white font-black text-xl tracking-wider">ARCADE</span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 pb-6 flex flex-col gap-4">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-lg font-black text-white">{tr.arcade.entryTitle}</h2>
          <p className="text-xs text-muted-foreground mt-1">{tr.arcade.entrySubtitle}</p>
        </div>

        {/* Option A — Ads */}
        <div className="rounded-2xl border border-[#22c55e]/20 bg-[#22c55e]/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#22c55e]/20 flex items-center justify-center">
              <Play className="w-4 h-4 text-[#22c55e]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{tr.arcade.optionAdsTitle}</p>
              <p className="text-[10px] text-muted-foreground">{tr.arcade.optionAdsFree}</p>
            </div>
            <span className="ml-auto text-xs font-bold text-[#22c55e]">{status.adsWatched}/{status.adsNeeded}</span>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-[#22c55e] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: status.adsNeeded }, (_, i) => (
              <div
                key={i}
                className={`flex-1 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                  i < status.adsWatched
                    ? "bg-[#22c55e] text-black"
                    : "bg-white/5 text-muted-foreground"
                }`}
              >
                {i < status.adsWatched ? "✓" : i + 1}
              </div>
            ))}
          </div>
          {status.adsWatched < status.adsNeeded && (
            <button
              onClick={onAdWatched}
              disabled={loading}
              className="mt-3 w-full py-2.5 rounded-xl bg-[#22c55e] text-black font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
            >
              {loading ? tr.arcade.watchingAd : tr.arcade.watchAdBtn}
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-widest">{tr.arcade.dividerOr}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Option B — Stars */}
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <Star className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{tr.arcade.optionStarsTitle}</p>
              <p className="text-[10px] text-muted-foreground">{tr.arcade.optionStarsFast}</p>
            </div>
          </div>
          <button
            onClick={onStarsPaid}
            disabled={loading}
            className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#000" }}
          >
            {tr.arcade.payStarsBtn}
          </button>
        </div>

        {/* How it works teaser */}
        <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 flex gap-2">
          <span className="text-base">🗺️</span>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {tr.arcade.howItWorksText}
          </p>
        </div>
      </div>
    </div>
  );
}

function RoomSelector({ status, onRoomSelected }: {
  status: ArcadeStatus;
  onRoomSelected: (room: Room) => void;
}) {
  const { tr } = useLanguage();
  const hasActiveSessions = status.activeSessions.length > 0;
  return (
    <div className="flex flex-col min-h-full">
      {/* Banner */}
      <div className="relative w-full h-40 overflow-hidden">
        <img src="/arcade-4.jpeg" alt="Rooms" className="w-full h-full object-cover object-top" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#060b18]" />
        <div className="absolute bottom-3 left-4">
          <p className="text-xs text-[#22c55e] font-bold uppercase tracking-widest">{tr.arcade.ticketActive}</p>
          <h2 className="text-xl font-black text-white">{tr.arcade.roomTitle}</h2>
        </div>
      </div>

      <div className="px-4 pt-3 pb-6 flex flex-col gap-3">
        {/* Active sessions strip */}
        {hasActiveSessions && (
          <div className="rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/20 p-3">
            <p className="text-xs font-bold text-[#22c55e] mb-1.5">{tr.arcade.activeSessions}</p>
            {status.activeSessions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-1">
                <span className="text-[10px] text-muted-foreground capitalize">{s.roomType}</span>
                <span className="text-[10px] text-white/70">({s.gridX},{s.gridY})</span>
                <span className="ml-auto text-[10px] font-bold text-[#22c55e]">
                  {formatCountdown(s.expiresAt, tr.arcade.expired, tr.arcade.hoursUnit)}
                </span>
                {s.hasShield && <Shield className="w-3 h-3 text-cyan-400" />}
              </div>
            ))}
          </div>
        )}

        {(["easy", "tactical", "hardcore"] as Room[]).map((room) => {
          const r = ROOMS[room];
          const myRoomSessions = status.activeSessions.filter((s) => s.roomType === room);
          return (
            <button
              key={room}
              onClick={() => { haptic("light"); onRoomSelected(room); }}
              className="relative overflow-hidden rounded-2xl border text-left transition-all active:scale-[0.98]"
              style={{
                borderColor: r.color + "40",
                background: `linear-gradient(135deg, ${r.color}10 0%, ${r.color}05 100%)`,
              }}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-black text-white text-base">{r.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{roomDesc(room, tr)}</p>
                  </div>
                  <div
                    className="px-2.5 py-1 rounded-lg text-xs font-black"
                    style={{ background: r.color + "20", color: r.color }}
                  >
                    {r.multiplier}
                  </div>
                </div>
                {/* Duration prizes */}
                <div className="flex gap-1.5 mt-2">
                  {DURATION_OPTIONS.map((d) => {
                    const pts = Math.round((d.points * (room === "easy" ? 100 : room === "tactical" ? 150 : 300)) / 100);
                    return (
                      <div
                        key={d.hours}
                        className="flex-1 rounded-lg px-1.5 py-1.5 text-center"
                        style={{ background: r.color + "15" }}
                      >
                        <p className="text-[9px] text-muted-foreground">{d.hours}{tr.arcade.hoursUnit}</p>
                        <p className="text-[10px] font-bold" style={{ color: r.color }}>
                          {(pts / 1000).toFixed(0)}K
                        </p>
                      </div>
                    );
                  })}
                </div>
                {myRoomSessions.length > 0 && (
                  <div
                    className="mt-2 text-[10px] font-bold px-2 py-1 rounded-lg inline-block"
                    style={{ background: "#22c55e20", color: "#22c55e" }}
                  >
                    {tr.arcade.activeHere(myRoomSessions.length)}
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

interface ClaimDialogProps {
  cell: { x: number; y: number };
  room: Room;
  onConfirm: (hours: number) => void;
  onCancel: () => void;
  loading: boolean;
}

function ClaimDialog({ cell, room, onConfirm, onCancel, loading }: ClaimDialogProps) {
  const { tr } = useLanguage();
  const [selectedHours, setSelectedHours] = useState(6);
  const r = ROOMS[room];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-[#0d1526] border-t border-[#22c55e]/20 p-5 pb-8">
        <div className="w-8 h-1 bg-white/20 rounded-full mx-auto mb-4" />
        <h3 className="text-center font-black text-white mb-1">{tr.arcade.claimTitle(cell.x, cell.y)}</h3>
        <p className="text-center text-[11px] text-muted-foreground mb-4">{tr.arcade.claimDesc}</p>
        <div className="flex flex-col gap-2 mb-5">
          {DURATION_OPTIONS.map((d) => {
            const pts = Math.round((d.points * (room === "easy" ? 100 : room === "tactical" ? 150 : 300)) / 100);
            return (
              <button
                key={d.hours}
                onClick={() => setSelectedHours(d.hours)}
                className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                style={{
                  borderColor: selectedHours === d.hours ? r.color : "rgba(255,255,255,0.08)",
                  background: selectedHours === d.hours ? r.color + "15" : "transparent",
                }}
              >
                <Clock className="w-4 h-4" style={{ color: r.color }} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-white">{durationLabel(d.hours, tr)}</p>
                  <p className="text-[10px] text-muted-foreground">{tr.arcade.riskPrefix} {durationRisk(d.hours, tr)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black" style={{ color: r.color }}>{pts.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground">{tr.arcade.ptsLabel}</p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-white/5 text-muted-foreground text-sm font-bold">{tr.arcade.cancel}</button>
          <button
            onClick={() => onConfirm(selectedHours)}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-black text-sm font-black disabled:opacity-50 transition-all active:scale-95"
            style={{ background: r.color }}
          >
            {loading ? "..." : tr.arcade.claimBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

interface StrikeDialogProps {
  cell: { x: number; y: number };
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function StrikeDialog({ cell, onConfirm, onCancel, loading }: StrikeDialogProps) {
  const { tr } = useLanguage();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-[#0d1526] border-t border-red-500/20 p-5 pb-8">
        <div className="w-8 h-1 bg-white/20 rounded-full mx-auto mb-4" />
        <div className="flex flex-col items-center gap-2 mb-4">
          <img src="/arcade-3.jpeg" alt="Strike" className="w-20 h-20 rounded-2xl object-cover" />
          <h3 className="font-black text-white text-center">{tr.arcade.strikeTitle(cell.x, cell.y)}</h3>
          <p className="text-[11px] text-muted-foreground text-center">{tr.arcade.strikeDesc}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-white/5 text-muted-foreground text-sm font-bold">{tr.arcade.cancel}</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-black disabled:opacity-50 transition-all active:scale-95"
          >
            {loading ? "..." : tr.arcade.strikeBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ShopModalProps {
  starsBalance: number;
  activeSessions: ActiveSession[];
  onBuy: (itemType: string, sessionId?: number) => void;
  onClose: () => void;
  loading: boolean;
}

function ShopModal({ starsBalance, activeSessions, onBuy, onClose, loading }: ShopModalProps) {
  const { tr } = useLanguage();
  const [selectedSession, setSelectedSession] = useState<number | null>(activeSessions[0]?.id ?? null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-[#0d1526] border-t border-yellow-500/20 p-5 pb-8 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-white text-base">{tr.arcade.shopTitle}</h3>
            <p className="text-[10px] text-yellow-400">{tr.arcade.shopBalance(starsBalance)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Session selector for shield/decoy */}
        {activeSessions.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-muted-foreground mb-1.5">{tr.arcade.applyTo}</p>
            <div className="flex flex-wrap gap-1.5">
              {activeSessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSession(s.id)}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all"
                  style={{
                    borderColor: selectedSession === s.id ? "#22c55e" : "rgba(255,255,255,0.1)",
                    background: selectedSession === s.id ? "#22c55e20" : "transparent",
                    color: selectedSession === s.id ? "#22c55e" : "#888",
                  }}
                >
                  ({s.gridX},{s.gridY})
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {SHOP_ITEMS.map((item) => {
            const needsSession = item.type.startsWith("shield") || item.type === "decoy";
            const canBuy = starsBalance >= item.stars && (!needsSession || selectedSession !== null);
            return (
              <div
                key={item.type}
                className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02]"
              >
                <span className="text-2xl w-8 text-center">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{shopItemLabel(item.type, tr)}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{shopItemDesc(item.type, tr)}</p>
                </div>
                <button
                  onClick={() => onBuy(item.type, needsSession ? selectedSession ?? undefined : undefined)}
                  disabled={!canBuy || loading}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-black disabled:opacity-40 transition-all active:scale-95"
                  style={{ background: canBuy ? "#f59e0b" : "rgba(255,255,255,0.05)", color: canBuy ? "#000" : "#888" }}
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

// ── Grid View ─────────────────────────────────────────────────────────────────

interface GridViewProps {
  room: Room;
  status: ArcadeStatus;
  onBack: () => void;
  onStatusRefresh: () => void;
}

function GridView({ room, status, onBack, onStatusRefresh }: GridViewProps) {
  const { skxBalance } = useVault();
  const { toast } = useToast();
  const { tr } = useLanguage();
  const r = ROOMS[room];
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [viewOx, setViewOx] = useState(0);
  const [viewOy, setViewOy] = useState(0);
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

  // Center view on user's first cell if any
  useEffect(() => {
    if (!gridData) return;
    const myCells = gridData.cells.filter((c) => c.owner === "me");
    if (myCells.length > 0) {
      setViewOx(Math.max(0, myCells[0].x - Math.floor(vp / 2)));
      setViewOy(Math.max(0, myCells[0].y - Math.floor(vp / 2)));
    }
  }, [gridData, vp]);

  // Build cell map for fast lookup
  const cellMap = new Map<string, GridCell>();
  gridData?.cells.forEach((c) => cellMap.set(`${c.x},${c.y}`, c));

  function getCellStyle(cell: GridCell | undefined): React.CSSProperties {
    if (!cell) return { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" };
    if (cell.owner === "me") {
      if (cell.isDecoy) return { background: "#eab30820", border: "1px solid #eab308" };
      if (cell.hasShield) return { background: "#06b6d420", border: "1px solid #06b6d4" };
      return { background: "#22c55e25", border: "1px solid #22c55e" };
    }
    if (cell.hasShield) return { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)" };
    return { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" };
  }

  function getCellContent(cell: GridCell | undefined) {
    if (!cell) return null;
    if (cell.owner === "me") {
      if (cell.isDecoy) return <span className="text-[7px]">💥</span>;
      if (cell.hasShield) return <span className="text-[7px]">🛡️</span>;
      return <span className="text-[7px]">●</span>;
    }
    return <span className="text-[7px] opacity-50">●</span>;
  }

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
      const result = await apiPost<{ result: string; strikerReward?: number; penalty?: number; message: string }>(
        "/arcade/grid/strike",
        { room, x: strikeCell.x, y: strikeCell.y },
      );
      haptic(result.result === "shielded" ? "warning" : "success");
      toast({ title: result.message, description: result.strikerReward ? `+${result.strikerReward.toLocaleString()} ${tr.arcade.ptsLabel}` : undefined });
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/5"
        style={{ background: r.color + "12" }}
      >
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="text-sm font-black text-white">{r.label}</p>
          <p className="text-[10px]" style={{ color: r.color }}>
            {gridData ? tr.arcade.activeCells(gridData.totalActive) : tr.arcade.loadingGrid}
            {" · "}({viewOx}–{Math.min(viewOx + vp - 1, gridSize - 1)}, {viewOy}–{Math.min(viewOy + vp - 1, gridSize - 1)})
          </p>
        </div>
        <button
          onClick={() => { haptic("light"); setShopOpen(true); }}
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "#f59e0b20", border: "1px solid #f59e0b40" }}
        >
          <Star className="w-4 h-4 text-yellow-400" />
        </button>
      </div>

      {/* Grid container */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 py-2 gap-2">
        {/* Up arrow */}
        <button
          onClick={() => pan(0, -1)}
          disabled={viewOy === 0}
          className="w-8 h-6 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-20 transition-all active:scale-95"
        >
          <ChevronUp className="w-4 h-4 text-white/60" />
        </button>

        <div className="flex items-center gap-2 w-full">
          {/* Left arrow */}
          <button
            onClick={() => pan(-1, 0)}
            disabled={viewOx === 0}
            className="w-6 h-8 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-20 shrink-0 transition-all active:scale-95"
          >
            <ChevronLeft className="w-4 h-4 text-white/60" />
          </button>

          {/* Grid */}
          <div
            className="flex-1 relative"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${vp}, 1fr)`,
              gap: "2px",
              aspectRatio: "1",
            }}
          >
            {gridLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 rounded-xl">
                <div className="w-6 h-6 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {Array.from({ length: vp * vp }, (_, i) => {
              const col = i % vp;
              const row = Math.floor(i / vp);
              const absX = viewOx + col;
              const absY = viewOy + row;
              const cell = cellMap.get(`${absX},${absY}`);
              return (
                <button
                  key={i}
                  onClick={() => onCellTap(absX, absY)}
                  className="rounded-[2px] flex items-center justify-center transition-all active:scale-90"
                  style={getCellStyle(cell)}
                >
                  {getCellContent(cell)}
                </button>
              );
            })}
          </div>

          {/* Right arrow */}
          <button
            onClick={() => pan(1, 0)}
            disabled={viewOx >= gridSize - vp}
            className="w-6 h-8 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-20 shrink-0 transition-all active:scale-95"
          >
            <ChevronRight className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Down arrow */}
        <button
          onClick={() => pan(0, 1)}
          disabled={viewOy >= gridSize - vp}
          className="w-8 h-6 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-20 transition-all active:scale-95"
        >
          <ChevronDown className="w-4 h-4 text-white/60" />
        </button>

        {/* Legend */}
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#22c55e] inline-block" />{tr.arcade.legendMine}</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-white/20 inline-block" />{tr.arcade.legendOther}</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#06b6d4] inline-block" />{tr.arcade.legendShield}</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-white/4 inline-block border border-white/8" />{tr.arcade.legendEmpty}</div>
        </div>
      </div>

      {/* My sessions panel */}
      {mySessions.length > 0 && (
        <div className="shrink-0 border-t border-white/5 px-4 py-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{tr.arcade.mySessions}</p>
          <div className="flex flex-col gap-1.5">
            {mySessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "#22c55e10", border: "1px solid #22c55e20" }}
              >
                <span className="text-[10px] text-white/60">({s.gridX},{s.gridY})</span>
                <div className="flex-1">
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#22c55e] rounded-full"
                      style={{
                        width: `${Math.max(5, ((new Date(s.expiresAt).getTime() - Date.now()) / (s.durationHours * 3_600_000)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-[10px] font-bold text-[#22c55e]">
                  {formatCountdown(s.expiresAt, tr.arcade.expired, tr.arcade.hoursUnit)}
                </span>
                <span className="text-[10px] text-yellow-400">+{s.finalPoints.toLocaleString()}</span>
                {s.hasShield && <Shield className="w-3 h-3 text-cyan-400" />}
                {s.isDecoy && <span className="text-[10px]">💥</span>}
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
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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

  async function handleAdWatched() {
    setActionLoading(true);
    try {
      const result = await apiPost<{ granted: boolean; adsWatched: number }>("/arcade/ticket/watch-ad");
      haptic("light");
      if (result.granted) {
        haptic("success");
        toast({ title: tr.arcade.ticketGranted, description: tr.arcade.ticketGrantedDesc });
        await loadStatus();
      } else {
        const remaining = status?.adsNeeded ? status.adsNeeded - result.adsWatched : 0;
        toast({ title: tr.arcade.adsProgress(result.adsWatched, status?.adsNeeded ?? 5, remaining) });
        setStatus((s) => s ? { ...s, adsWatched: result.adsWatched } : s);
      }
    } catch (err: unknown) {
      toast({ title: tr.arcade.error, description: err instanceof Error ? err.message : tr.arcade.tryAgain, variant: "destructive" });
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
      toast({ title: tr.arcade.error, description: err instanceof Error ? err.message : tr.arcade.tryAgain, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  if (phase === "loading" || !status) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">{tr.arcade.loading}</p>
      </div>
    );
  }

  if (phase === "disabled") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-4xl">
          🔒
        </div>
        <div>
          <h3 className="text-lg font-black text-white mb-1">{tr.arcade.disabledTitle}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
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
      onAdWatched={handleAdWatched}
      onStarsPaid={handleStarsPurchase}
      loading={actionLoading}
    />
  );
}

export const ArcadeTab = memo(ArcadeTabInner);
