import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "./useGameStore";

function FishingRod({
  phase,
  chargeLevel,
}: {
  phase: string;
  chargeLevel: number;
}) {
  const rodRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!rodRef.current) return;
    const t = clock.getElapsedTime();
    if (phase === "IDLE") {
      rodRef.current.rotation.x = -0.3 + Math.sin(t * 0.8) * 0.03;
    } else if (phase === "CASTING") {
      rodRef.current.rotation.x = -0.8;
    } else if (phase === "WAITING" || phase === "BITING") {
      rodRef.current.rotation.x = -0.5 + Math.sin(t * 2) * 0.04;
    } else if (phase === "REELING") {
      rodRef.current.rotation.x = -0.6 + Math.sin(t * 8) * 0.1;
    }
    if (phase === "IDLE") {
      rodRef.current.rotation.x = -0.3 - chargeLevel * 0.6;
    }
  });

  return (
    <group ref={rodRef} position={[0.35, 1.7, 0]} rotation={[0, 0, 0.15]}>
      {/* Rod segments */}
      {[0, 0.5, 1.0, 1.5, 1.9].map((offset, i) => (
        <mesh key={i} position={[0, offset + 0.25, 0]}>
          <cylinderGeometry args={[0.022 - i * 0.003, 0.028 - i * 0.003, 0.5, 6]} />
          <meshStandardMaterial color="#4a3520" roughness={0.7} metalness={0.1} />
        </mesh>
      ))}
      {/* Tip ring */}
      <mesh position={[0, 2.45, 0]}>
        <torusGeometry args={[0.03, 0.006, 6, 12]} />
        <meshStandardMaterial color="#aaa" metalness={0.8} />
      </mesh>
    </group>
  );
}

export function PlayerCharacter() {
  const phase = useGameStore((s) => s.phase);
  const chargeLevel = useGameStore((s) => s.chargeLevel);
  const groupRef = useRef<THREE.Group>(null);

  const skinId = useMemo(() => {
    try { return parseInt(localStorage.getItem("equippedSkinId") ?? "1", 10) || 1; } catch { return 1; }
  }, []);

  const accentColor = useMemo(() => {
    const map: Record<number, string> = {
      1: "#f5c518",
      2: "#22d3ee",
      3: "#34d399",
      4: "#fb923c",
      5: "#f472b6",
    };
    return map[skinId] ?? "#f5c518";
  }, [skinId]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    if (phase === "IDLE") {
      groupRef.current.position.y = Math.sin(t * 1.2) * 0.015;
      groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.03;
    } else if (phase === "REELING") {
      groupRef.current.rotation.z = Math.sin(t * 8) * 0.04;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.08, 2.2]}>
      {/* Shadow blob */}
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.2, 0.55, 1]}>
        <circleGeometry args={[0.4, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.15} />
      </mesh>

      {/* Shoes */}
      <mesh position={[-0.2, 0.08, 0.1]} castShadow>
        <boxGeometry args={[0.22, 0.1, 0.35]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
      </mesh>
      <mesh position={[0.2, 0.08, 0.1]} castShadow>
        <boxGeometry args={[0.22, 0.1, 0.35]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.18, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.09, 0.7, 8]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.7} />
      </mesh>
      <mesh position={[0.18, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.09, 0.7, 8]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.7} />
      </mesh>

      {/* Body */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.62, 0.72, 0.38]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.7} />
      </mesh>

      {/* Vest */}
      <mesh position={[0, 1.0, 0.01]}>
        <boxGeometry args={[0.48, 0.66, 0.22]} />
        <meshStandardMaterial color={accentColor} roughness={0.5} metalness={0.2} />
      </mesh>

      {/* Left arm (idle) */}
      <mesh position={[-0.42, 1.0, 0]} rotation={[0, 0, 0.4]} castShadow>
        <cylinderGeometry args={[0.09, 0.08, 0.55, 8]} />
        <meshStandardMaterial color="#f4c7a0" roughness={0.8} />
      </mesh>

      {/* Right arm (holds rod) */}
      <mesh position={[0.42, 1.15, 0]} rotation={[0, 0, -0.3]} castShadow>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
        <meshStandardMaterial color="#f4c7a0" roughness={0.8} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.46, 0]}>
        <cylinderGeometry args={[0.12, 0.13, 0.18, 8]} />
        <meshStandardMaterial color="#f4c7a0" roughness={0.8} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.72, 0]} castShadow>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color="#f4c7a0" roughness={0.8} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.1, 1.76, 0.24]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[0.1, 1.76, 0.24]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      {/* Eye shine */}
      <mesh position={[-0.09, 1.78, 0.265]}>
        <sphereGeometry args={[0.014, 6, 6]} />
        <meshStandardMaterial color="white" />
      </mesh>
      <mesh position={[0.11, 1.78, 0.265]}>
        <sphereGeometry args={[0.014, 6, 6]} />
        <meshStandardMaterial color="white" />
      </mesh>

      {/* Smile */}
      <mesh position={[0, 1.65, 0.265]} rotation={[0.2, 0, 0]}>
        <torusGeometry args={[0.08, 0.013, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#c0523a" />
      </mesh>

      {/* Hat */}
      <mesh position={[0, 1.96, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.1, 12]} />
        <meshStandardMaterial color={accentColor} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 2.06, 0]}>
        <cylinderGeometry args={[0.16, 0.19, 0.26, 12]} />
        <meshStandardMaterial color={accentColor} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Hat band */}
      <mesh position={[0, 2.0, 0]}>
        <cylinderGeometry args={[0.195, 0.195, 0.06, 12]} />
        <meshStandardMaterial color="#111" metalness={0.4} />
      </mesh>

      {/* Glowing coin emblem on hat */}
      <mesh position={[0, 2.06, 0.16]}>
        <circleGeometry args={[0.065, 12]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={1.5} metalness={1} />
      </mesh>

      {/* Fishing rod */}
      <FishingRod phase={phase} chargeLevel={chargeLevel} />
    </group>
  );
}
