import { useEffect, useRef } from "react";
import { useGameStore, FISH_TYPES } from "./useGameStore";

const RARITY_COLORS: Record<string, string> = {
  common: "#94a3b8",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f5c518",
};

const RARITY_GLOW: Record<string, string> = {
  common: "none",
  rare: "0 0 18px #3b82f680",
  epic: "0 0 24px #a855f780",
  legendary: "0 0 32px #f5c51880, 0 0 64px #f5c51840",
};

function ChargeBar() {
  const charging = useGameStore((s) => s.charging);
  const chargeLevel = useGameStore((s) => s.chargeLevel);
  if (!charging) return null;
  const pct = chargeLevel * 100;
  const color = pct < 40 ? "#22c55e" : pct < 75 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{
      position: "absolute",
      bottom: 180,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      zIndex: 20,
    }}>
      <div style={{ color: "white", fontSize: 13, fontWeight: 600, textShadow: "0 1px 4px #000a" }}>
        POWER
      </div>
      <div style={{ width: 180, height: 14, background: "#ffffff20", borderRadius: 8, overflow: "hidden", border: "1px solid #ffffff30" }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: `linear-gradient(90deg, #22c55e, ${color})`,
          borderRadius: 8,
          transition: "width 0.05s",
          boxShadow: `0 0 8px ${color}80`,
        }} />
      </div>
      <div style={{ color, fontSize: 12, fontWeight: 700 }}>{Math.round(pct)}%</div>
    </div>
  );
}

function BiteAlert() {
  const phase = useGameStore((s) => s.phase);
  const reel = useGameStore((s) => s.reel);
  const pulseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "BITING" || !pulseRef.current) return;
    let frame: number;
    let t = 0;
    const animate = () => {
      t += 0.1;
      if (pulseRef.current) {
        const scale = 1 + Math.sin(t * 8) * 0.06;
        pulseRef.current.style.transform = `translate(-50%, -50%) scale(${scale})`;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  if (phase !== "BITING") return null;

  return (
    <div
      ref={pulseRef}
      onClick={reel}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 30,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div style={{
        background: "linear-gradient(135deg, #f5c518, #f97316)",
        border: "3px solid #fff",
        borderRadius: 20,
        padding: "14px 32px",
        boxShadow: "0 0 40px #f5c51880, 0 4px 20px #00000060",
        fontSize: 22,
        fontWeight: 800,
        color: "#1a1a1a",
        letterSpacing: 1,
        textTransform: "uppercase",
      }}>
        🎣 TAP NOW!
      </div>
      <div style={{ color: "#fef9c3", fontSize: 14, fontWeight: 600, textShadow: "0 1px 6px #000" }}>
        Fish is on the hook!
      </div>
    </div>
  );
}

function CatchPopup() {
  const showCatchPopup = useGameStore((s) => s.showCatchPopup);
  const lastCatch = useGameStore((s) => s.lastCatch);
  if (!showCatchPopup || !lastCatch) return null;

  const { fish, skp } = lastCatch;
  const rarityColor = RARITY_COLORS[fish.rarity] ?? "#fff";
  const glow = RARITY_GLOW[fish.rarity] ?? "none";

  return (
    <div style={{
      position: "absolute",
      top: "38%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 40,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      animation: "popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
    }}>
      <div style={{
        background: "linear-gradient(135deg, #0f172a, #1e293b)",
        border: `2px solid ${rarityColor}`,
        borderRadius: 24,
        padding: "20px 36px",
        boxShadow: glow,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        minWidth: 220,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: rarityColor, letterSpacing: 2, textTransform: "uppercase" }}>
          {fish.rarity} catch!
        </div>
        <div style={{ fontSize: 44 }}>{fish.emoji}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "white" }}>{fish.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#f5c518" }}>+{skp.toLocaleString()}</span>
          <span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>SKP</span>
        </div>
      </div>
    </div>
  );
}

function MissPopup() {
  const phase = useGameStore((s) => s.phase);
  if (phase !== "MISS") return null;
  return (
    <div style={{
      position: "absolute",
      top: "40%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 40,
      background: "linear-gradient(135deg, #450a0a, #7f1d1d)",
      border: "2px solid #ef4444",
      borderRadius: 20,
      padding: "16px 30px",
      color: "white",
      textAlign: "center",
      boxShadow: "0 0 24px #ef444440",
      animation: "popIn 0.3s ease",
    }}>
      <div style={{ fontSize: 28 }}>💨</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>Got Away!</div>
      <div style={{ fontSize: 13, color: "#fca5a5", marginTop: 2 }}>Too slow this time</div>
    </div>
  );
}

function TopHUD() {
  const sessionSkp = useGameStore((s) => s.sessionSkp);
  const dailyCount = useGameStore((s) => s.dailyCount);
  const DAILY_LIMIT = 25;

  return (
    <div style={{
      position: "absolute",
      top: 16,
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      padding: "0 16px",
      zIndex: 20,
      pointerEvents: "none",
    }}>
      {/* Session points */}
      <div style={{
        background: "linear-gradient(135deg, #0f172aee, #1e3a5fee)",
        border: "1px solid #f5c51840",
        borderRadius: 14,
        padding: "8px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}>
        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 1 }}>SESSION</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#f5c518" }}>
            +{sessionSkp.toLocaleString()}
          </span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>SKP</span>
        </div>
      </div>

      {/* Back button + daily counter */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, pointerEvents: "all" }}>
        <a
          href="/"
          style={{
            background: "#0f172aee",
            border: "1px solid #334155",
            borderRadius: 10,
            padding: "6px 12px",
            color: "#94a3b8",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← Back
        </a>
        <div style={{
          background: "#0f172aee",
          border: "1px solid #334155",
          borderRadius: 10,
          padding: "6px 12px",
          color: "#64748b",
          fontSize: 12,
          fontWeight: 600,
        }}>
          🐟 {dailyCount}/{DAILY_LIMIT} today
        </div>
      </div>
    </div>
  );
}

function DailyLimitBanner() {
  const dailyCount = useGameStore((s) => s.dailyCount);
  const DAILY_LIMIT = 25;
  if (dailyCount < DAILY_LIMIT) return null;
  return (
    <div style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 50,
      background: "#0f172a",
      border: "2px solid #334155",
      borderRadius: 24,
      padding: "28px 40px",
      textAlign: "center",
      color: "white",
    }}>
      <div style={{ fontSize: 48 }}>🌙</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>Daily Limit Reached</div>
      <div style={{ fontSize: 14, color: "#64748b", marginTop: 6 }}>
        Come back tomorrow for more fishing!
      </div>
      <div style={{ marginTop: 16, fontSize: 13, color: "#94a3b8" }}>
        You caught {DAILY_LIMIT} fish today 🎉
      </div>
    </div>
  );
}

function CastButton() {
  const phase = useGameStore((s) => s.phase);
  const dailyCount = useGameStore((s) => s.dailyCount);
  const DAILY_LIMIT = 25;
  const startCharge = useGameStore((s) => s.startCharge);
  const releaseCharge = useGameStore((s) => s.releaseCharge);
  const resetToIdle = useGameStore((s) => s.resetToIdle);
  const charging = useGameStore((s) => s.charging);

  if (dailyCount >= DAILY_LIMIT) return null;

  if (phase === "IDLE") {
    return (
      <button
        onPointerDown={startCharge}
        onPointerUp={releaseCharge}
        onPointerLeave={releaseCharge}
        style={{
          position: "absolute",
          bottom: 100,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          background: charging
            ? "linear-gradient(135deg, #f59e0b, #ef4444)"
            : "linear-gradient(135deg, #0ea5e9, #2563eb)",
          border: "none",
          borderRadius: 50,
          width: 90,
          height: 90,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: charging
            ? "0 0 30px #f59e0b80, 0 4px 20px #00000060"
            : "0 0 20px #0ea5e980, 0 4px 16px #00000060",
          fontSize: 28,
          transition: "transform 0.1s",
          touchAction: "none",
          color: "white",
          fontWeight: 800,
        }}
      >
        🎣
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginTop: 2 }}>
          {charging ? "RELEASE" : "HOLD"}
        </span>
      </button>
    );
  }

  if (phase === "WAITING" || phase === "CASTING") {
    return (
      <div style={{
        position: "absolute",
        bottom: 100,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}>
        <div style={{
          width: 90, height: 90,
          borderRadius: 50,
          background: "#0f172aaa",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          border: "2px solid #334155",
        }}>
          <span style={{ fontSize: 26 }}>⏳</span>
          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>
            {phase === "CASTING" ? "CASTING..." : "WAITING..."}
          </span>
        </div>
      </div>
    );
  }

  return null;
}

function FishDex() {
  const caughtHistory = useGameStore((s) => s.caughtHistory);
  if (caughtHistory.length === 0) return null;

  return (
    <div style={{
      position: "absolute",
      bottom: 16,
      left: 16,
      zIndex: 20,
      display: "flex",
      flexDirection: "column",
      gap: 4,
      maxHeight: 200,
      overflowY: "auto",
    }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: 1 }}>RECENT</div>
      {caughtHistory.slice(0, 5).map((c, i) => (
        <div key={i} style={{
          background: "#0f172acc",
          border: `1px solid ${RARITY_COLORS[c.fish.rarity]}40`,
          borderRadius: 10,
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
        }}>
          <span>{c.fish.emoji}</span>
          <span style={{ color: "white", fontWeight: 600 }}>{c.fish.name}</span>
          <span style={{ color: "#f5c518", fontWeight: 700, marginLeft: "auto" }}>+{c.skp}</span>
        </div>
      ))}
    </div>
  );
}

export function GameUI() {
  const phase = useGameStore((s) => s.phase);
  const tick = useGameStore((s) => s.tick);

  useEffect(() => {
    let last = performance.now();
    let raf: number;
    const loop = () => {
      const now = performance.now();
      tick(now - last);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tick]);

  return (
    <>
      <style>{`
        @keyframes popIn {
          from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          to   { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
        }
        * { box-sizing: border-box; }
        body { margin: 0; overflow: hidden; background: #0a1628; }
      `}</style>

      <TopHUD />
      <ChargeBar />
      <CastButton />
      <BiteAlert />
      <CatchPopup />
      <MissPopup />
      <DailyLimitBanner />
      <FishDex />
    </>
  );
}
