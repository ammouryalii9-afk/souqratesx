import { Suspense, Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "./Environment";
import { WaterSurface, UnderwaterFog } from "./WaterSurface";
import { PlayerCharacter } from "./PlayerCharacter";
import { FishingLineFixed } from "./FishingLine";
import { FishSchool } from "./Fish";
import { CatchEffects, MissEffect } from "./Particles";
import { GameUI } from "./UI";

function LoadingFallback() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a1628", color: "#f5c518",
      fontSize: 18, fontWeight: 700,
      fontFamily: "'Inter', sans-serif", gap: 12, flexDirection: "column",
    }}>
      <span style={{ fontSize: 48 }}>🎣</span>
      <span>Loading fishing scene…</span>
    </div>
  );
}

function NoWebGLFallback() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0a1628 0%, #0e2a4a 100%)",
      color: "white", fontFamily: "'Inter', sans-serif",
      textAlign: "center", padding: 32,
    }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>🎣</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: "#f5c518", margin: "0 0 8px" }}>
        SouqratesX Fishing
      </h2>
      <p style={{ color: "#94a3b8", fontSize: 15, maxWidth: 300, lineHeight: 1.5 }}>
        This game requires WebGL, which isn't supported in this preview environment.
      </p>
      <p style={{ color: "#64748b", fontSize: 13, marginTop: 12 }}>
        Open in Telegram or a real browser to play 🚀
      </p>
      <div style={{
        marginTop: 28,
        background: "#1e3a5f",
        border: "1px solid #f5c51840",
        borderRadius: 16,
        padding: "16px 24px",
        fontSize: 13,
        color: "#94a3b8",
        maxWidth: 280,
      }}>
        <div style={{ color: "#f5c518", fontWeight: 700, marginBottom: 8 }}>Game Features</div>
        🐟 7 fish types: Common → Legendary<br />
        💰 Earn up to 5,000 SKP per fish<br />
        🎮 3D world with animated water<br />
        ⚡ Power cast + bite-timing mechanics<br />
        📊 25 fish daily limit
      </div>
      <a href="/" style={{
        marginTop: 20, color: "#94a3b8", fontSize: 13,
        textDecoration: "none", border: "1px solid #334155",
        borderRadius: 8, padding: "6px 14px",
      }}>← Back to Bot</a>
    </div>
  );
}

interface ErrorBoundaryState { hasError: boolean; isWebGL: boolean; }
class GameErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, isWebGL: false };
  }
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      isWebGL: error.message.includes("WebGL") || error.message.includes("context"),
    };
  }
  render() {
    if (this.state.hasError) return <NoWebGLFallback />;
    return this.props.children;
  }
}

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      (canvas.getContext as (id: string) => unknown)("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function Scene3D() {
  if (!detectWebGL()) return <NoWebGLFallback />;
  return (
    <Canvas
      shadows
      camera={{ position: [0, 4.5, 10], fov: 55, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ background: "#0a1628" }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = 2; // PCFSoftShadowMap
      }}
    >
      <fog attach="fog" args={["#b0deff", 25, 60]} />
      <Suspense fallback={null}>
        <Environment />
        <WaterSurface />
        <UnderwaterFog />
        <PlayerCharacter />
        <FishingLineFixed />
        <FishSchool />
        <CatchEffects />
        <MissEffect />
      </Suspense>
    </Canvas>
  );
}

export function FishingScene() {
  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden" }}>
      <GameErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Scene3D />
        </Suspense>
      </GameErrorBoundary>
      <GameUI />
    </div>
  );
}
