import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface FishProps {
  id: string;
  color: string;
  size: number;
  startX: number;
  startZ: number;
  speed: number;
  depth: number;
}

export function SwimmingFish({ color, size, startX, startZ, speed, depth }: FishProps) {
  const groupRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  const radius = useMemo(() => 3 + Math.random() * 5, []);
  const dir = useMemo(() => (Math.random() > 0.5 ? 1 : -1), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phase;
    if (groupRef.current) {
      groupRef.current.position.x = startX + Math.cos(t * speed * dir) * radius;
      groupRef.current.position.z = startZ + Math.sin(t * speed * 0.7) * radius * 0.6;
      groupRef.current.position.y = depth + Math.sin(t * 1.3) * 0.12;
      groupRef.current.rotation.y = Math.atan2(
        -Math.sin(t * speed * dir) * radius * speed * dir,
        -Math.sin(t * speed * 0.7) * radius * 0.6 * speed * 0.7
      );
    }
    if (tailRef.current) {
      tailRef.current.rotation.y = Math.sin(t * 8) * 0.4;
    }
  });

  const s = size;
  return (
    <group ref={groupRef}>
      {/* Body */}
      <mesh castShadow>
        <sphereGeometry args={[s * 0.38, 10, 8]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 0, s * 0.35]}>
        <sphereGeometry args={[s * 0.22, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      {/* Tail */}
      <mesh ref={tailRef} position={[0, 0, -s * 0.36]}>
        <coneGeometry args={[s * 0.28, s * 0.45, 4]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {/* Dorsal fin */}
      <mesh position={[0, s * 0.3, 0]}>
        <coneGeometry args={[s * 0.1, s * 0.3, 4]} />
        <meshStandardMaterial color={color} roughness={0.6} transparent opacity={0.8} />
      </mesh>
      {/* Pectoral fins */}
      <mesh position={[s * 0.3, 0, 0.05]} rotation={[0, 0, 0.6]}>
        <coneGeometry args={[s * 0.08, s * 0.28, 4]} />
        <meshStandardMaterial color={color} roughness={0.6} transparent opacity={0.7} />
      </mesh>
      <mesh position={[-s * 0.3, 0, 0.05]} rotation={[0, 0, -0.6]}>
        <coneGeometry args={[s * 0.08, s * 0.28, 4]} />
        <meshStandardMaterial color={color} roughness={0.6} transparent opacity={0.7} />
      </mesh>
      {/* Eye */}
      <mesh position={[s * 0.18, s * 0.06, s * 0.3]}>
        <sphereGeometry args={[s * 0.07, 8, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[s * 0.2, s * 0.08, s * 0.33]}>
        <sphereGeometry args={[s * 0.02, 6, 6]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </group>
  );
}

const FISH_CONFIGS = [
  { id: "f1", color: "#78b4e0", size: 0.35, startX: -6, startZ: -5, speed: 0.4, depth: -0.8 },
  { id: "f2", color: "#f0c040", size: 0.5,  startX: 4,  startZ: -7, speed: 0.35, depth: -0.6 },
  { id: "f3", color: "#4a9b7f", size: 0.65, startX: -3, startZ: -9, speed: 0.28, depth: -1.2 },
  { id: "f4", color: "#e87060", size: 0.4,  startX: 7,  startZ: -6, speed: 0.45, depth: -0.7 },
  { id: "f5", color: "#1a6fa8", size: 0.8,  startX: -8, startZ: -8, speed: 0.22, depth: -1.5 },
  { id: "f6", color: "#7b5ea7", size: 0.55, startX: 2,  startZ: -11, speed: 0.32, depth: -1.0 },
  { id: "f7", color: "#22b8d1", size: 0.45, startX: -5, startZ: -4, speed: 0.5,  depth: -0.5 },
  { id: "f8", color: "#f5c518", size: 0.9,  startX: 6,  startZ: -12, speed: 0.2, depth: -2.0 },
];

export function FishSchool() {
  return (
    <>
      {FISH_CONFIGS.map((cfg) => (
        <SwimmingFish key={cfg.id} {...cfg} />
      ))}
    </>
  );
}
