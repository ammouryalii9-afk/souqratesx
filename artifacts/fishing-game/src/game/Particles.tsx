import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "./useGameStore";

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number; color: string;
}

function CatchBurst({ x, z, color }: { x: number; z: number; color: string }) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 20 }, () => ({
        x, y: 0.2, z,
        vx: (Math.random() - 0.5) * 4,
        vy: 1.5 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 4,
        life: 1, maxLife: 0.6 + Math.random() * 0.4,
        size: 0.06 + Math.random() * 0.1,
        color,
      })),
    [x, z, color]
  );
  const startTime = useRef(performance.now());

  useFrame(() => {
    const elapsed = (performance.now() - startTime.current) / 1000;
    particles.forEach((p, i) => {
      const mesh = meshRefs.current[i];
      if (!mesh) return;
      const t = elapsed / p.maxLife;
      if (t >= 1) { mesh.visible = false; return; }
      mesh.visible = true;
      mesh.position.set(
        p.x + p.vx * elapsed * 0.5,
        p.y + p.vy * elapsed * 0.5 - 4.9 * elapsed * elapsed * 0.3,
        p.z + p.vz * elapsed * 0.5,
      );
      const alpha = 1 - t;
      (mesh.material as THREE.MeshBasicMaterial).opacity = alpha;
      mesh.scale.setScalar(1 - t * 0.5);
    });
  });

  return (
    <>
      {particles.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el; }}
          position={[p.x, p.y, p.z]}
        >
          <sphereGeometry args={[p.size, 6, 6]} />
          <meshBasicMaterial color={p.color} transparent opacity={1} />
        </mesh>
      ))}
    </>
  );
}

function StarBurst({ x, z }: { x: number; z: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const startTime = useRef(performance.now());

  useFrame(() => {
    if (!groupRef.current) return;
    const t = (performance.now() - startTime.current) / 1000;
    groupRef.current.rotation.y = t * 3;
    groupRef.current.position.y = 0.5 + t * 1.5;
    const alpha = Math.max(0, 1 - t * 1.2);
    groupRef.current.children.forEach((child) => {
      if ((child as THREE.Mesh).material) {
        ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = alpha;
      }
    });
  });

  return (
    <group ref={groupRef} position={[x, 0.5, z]}>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * 0.4, 0, Math.sin(angle) * 0.4]}>
            <octahedronGeometry args={[0.09]} />
            <meshBasicMaterial color="#f5c518" transparent opacity={1} />
          </mesh>
        );
      })}
    </group>
  );
}

export function CatchEffects() {
  const phase = useGameStore((s) => s.phase);
  const showCatchPopup = useGameStore((s) => s.showCatchPopup);
  const lastCatch = useGameStore((s) => s.lastCatch);
  const bobberX = useGameStore((s) => s.bobberX);
  const bobberZ = useGameStore((s) => s.bobberZ);

  if (!showCatchPopup || !lastCatch) return null;

  return (
    <>
      <CatchBurst x={bobberX * 0.2} z={bobberZ * 0.2} color={lastCatch.fish.color} />
      <CatchBurst x={bobberX * 0.2} z={bobberZ * 0.2} color="#ffffff" />
      <StarBurst x={bobberX * 0.2} z={bobberZ * 0.2} />
      {lastCatch.fish.rarity === "legendary" && (
        <>
          <CatchBurst x={bobberX * 0.2 + 0.5} z={bobberZ * 0.2} color="#f5c518" />
          <CatchBurst x={bobberX * 0.2 - 0.5} z={bobberZ * 0.2} color="#f5c518" />
        </>
      )}
    </>
  );
}

export function MissEffect() {
  const phase = useGameStore((s) => s.phase);
  const bobberX = useGameStore((s) => s.bobberX);
  const bobberZ = useGameStore((s) => s.bobberZ);
  const ref = useRef<THREE.Mesh>(null);
  const start = useRef(performance.now());

  useFrame(() => {
    if (!ref.current) return;
    const t = (performance.now() - start.current) / 1000;
    ref.current.scale.setScalar(1 + t * 3);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - t * 1.4);
  });

  if (phase !== "MISS") return null;

  return (
    <mesh ref={ref} position={[bobberX, 0.1, bobberZ]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.1, 0.25, 16]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.7} />
    </mesh>
  );
}
