import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Cloud({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const speed = 0.002 + Math.random() * 0.003;
  useFrame(() => {
    if (ref.current) ref.current.position.x += speed;
    if (ref.current && ref.current.position.x > 22) ref.current.position.x = -22;
  });
  return (
    <group ref={ref} position={position}>
      {[
        [0, 0, 0, 1.8],
        [1.5, 0.3, 0, 1.3],
        [-1.5, 0.2, 0, 1.2],
        [0.7, 0.6, 0, 1.0],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 8, 8]} />
          <meshStandardMaterial color="white" transparent opacity={0.75} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

const CLOUD_POSITIONS: [number, number, number][] = [
  [-10, 9, -12],
  [5,   10, -14],
  [14,  8,  -10],
  [-4,  11, -18],
  [8,   9,  -16],
];

function Mountain({ x, z, h, c }: { x: number; z: number; h: number; c: string }) {
  return (
    <mesh position={[x, h / 2 - 0.2, z]} castShadow>
      <coneGeometry args={[h * 0.7, h, 8]} />
      <meshStandardMaterial color={c} roughness={0.9} />
    </mesh>
  );
}

function Dock() {
  const planks = Array.from({ length: 8 }, (_, i) => i);
  return (
    <group position={[0, -0.08, 1.8]}>
      {/* Main deck */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.12, 3.6]} />
        <meshStandardMaterial color="#8B6914" roughness={0.9} />
      </mesh>
      {/* Planks */}
      {planks.map((i) => (
        <mesh key={i} position={[0, 0.07, -1.6 + i * 0.46]} receiveShadow>
          <boxGeometry args={[2.4, 0.04, 0.36]} />
          <meshStandardMaterial color="#a0782a" roughness={0.85} />
        </mesh>
      ))}
      {/* Pylons */}
      {[[-1.0, -0.8], [1.0, -0.8], [-1.0, 1.4], [1.0, 1.4]].map(([px, pz], i) => (
        <mesh key={i} position={[px, -0.55, pz]} castShadow>
          <cylinderGeometry args={[0.1, 0.14, 1.2, 8]} />
          <meshStandardMaterial color="#6b4f1a" roughness={0.9} />
        </mesh>
      ))}
      {/* Railing */}
      {[[-1.1, 0.5], [1.1, 0.5]].map(([px], i) => (
        <group key={i} position={[px, 0.3, 0]}>
          <mesh>
            <boxGeometry args={[0.05, 0.6, 3.4]} />
            <meshStandardMaterial color="#7a5c20" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TreeGroup({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <coneGeometry args={[1.0, 3.0, 7]} />
        <meshStandardMaterial color="#2d7a3a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.22, 1.2, 6]} />
        <meshStandardMaterial color="#5c3317" roughness={0.9} />
      </mesh>
    </group>
  );
}

export function Environment() {
  return (
    <>
      {/* Sky */}
      <mesh>
        <sphereGeometry args={[50, 32, 32]} />
        <meshBasicMaterial
          color="#87ceeb"
          side={THREE.BackSide}
        />
      </mesh>

      {/* Gradient horizon */}
      <mesh position={[0, -2, 0]}>
        <sphereGeometry args={[49, 16, 16]} />
        <meshBasicMaterial color="#b0e0ff" side={THREE.BackSide} />
      </mesh>

      {/* Ground island */}
      <mesh position={[0, -0.35, 4]} receiveShadow>
        <cylinderGeometry args={[6, 7, 0.5, 16]} />
        <meshStandardMaterial color="#4a7c4e" roughness={1} />
      </mesh>
      <mesh position={[0, -0.55, 4]}>
        <cylinderGeometry args={[6.5, 6.5, 0.3, 16]} />
        <meshStandardMaterial color="#c8a96e" roughness={1} />
      </mesh>

      {/* Dock */}
      <Dock />

      {/* Trees */}
      <TreeGroup x={-2.5} z={4.5} />
      <TreeGroup x={2.8} z={4.2} />
      <TreeGroup x={-3.5} z={3.0} />

      {/* Mountains background */}
      <Mountain x={-18} z={-15} h={12} c="#5a7a6a" />
      <Mountain x={-10} z={-18} h={16} c="#4a6a5a" />
      <Mountain x={0}   z={-20} h={14} c="#3a5a4a" />
      <Mountain x={10}  z={-18} h={18} c="#4a6a5a" />
      <Mountain x={18}  z={-14} h={12} c="#5a7a6a" />

      {/* Clouds */}
      {CLOUD_POSITIONS.map((pos, i) => (
        <Cloud key={i} position={pos} />
      ))}

      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[8, 16, 4]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={60}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        color="#fffde7"
      />
      <pointLight position={[0, 3, 0]} intensity={0.3} color="#7dd3fc" />
      <hemisphereLight args={["#87ceeb", "#2d5a3d", 0.4]} />
    </>
  );
}
