import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "./useGameStore";

function Ripple({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.getElapsedTime() * 2) % 1;
    ref.current.scale.setScalar(0.5 + t * 1.5);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t);
  });
  return (
    <mesh ref={ref} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.08, 0.14, 16]} />
      <meshBasicMaterial color="#7dd3fc" transparent opacity={0.5} />
    </mesh>
  );
}

function Splash({ x, z }: { x: number; z: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        angle: (i / 10) * Math.PI * 2,
        r: 0.15 + Math.random() * 0.25,
        h: 0.3 + Math.random() * 0.6,
        speed: 1.5 + Math.random() * 1.5,
      })),
    []
  );
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const startTime = useRef(Date.now());

  useFrame(() => {
    const elapsed = (Date.now() - startTime.current) / 1000;
    particles.forEach((p, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      const t = (elapsed * p.speed) % 1;
      mesh.position.x = x + Math.cos(p.angle) * p.r * t;
      mesh.position.z = z + Math.sin(p.angle) * p.r * t;
      mesh.position.y = p.h * Math.sin(t * Math.PI) * 0.5;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
    });
  });

  return (
    <>
      {particles.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          position={[x, 0, z]}
        >
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshBasicMaterial color="#bae6fd" transparent />
        </mesh>
      ))}
    </>
  );
}

export function FishingLine() {
  const phase = useGameStore((s) => s.phase);
  const bobberX = useGameStore((s) => s.bobberX);
  const bobberZ = useGameStore((s) => s.bobberZ);
  const reelingProgress = useGameStore((s) => s.reelingProgress);

  const lineRef = useRef<THREE.Line>(null);
  const bobberRef = useRef<THREE.Group>(null);

  const lineGeometry = useMemo(() => new THREE.BufferGeometry(), []);

  const visible = phase !== "IDLE" && phase !== "CATCH" && phase !== "MISS";

  const reel = useGameStore((s) => s.reel);

  useFrame(({ clock }) => {
    if (!visible) return;
    const t = clock.getElapsedTime();

    // Rod tip position (relative to player at 0,0,2.2)
    const rodTip = new THREE.Vector3(0.42, 0.08 + 1.7 + 2.4, 2.2);

    let bx = bobberX;
    let bz = bobberZ;
    let by = 0.05;

    if (phase === "REELING") {
      const prog = reelingProgress;
      bx = bobberX * (1 - prog);
      bz = bobberZ * (1 - prog) + 2.2 * prog;
      by = prog * 2.0;
    }

    // Bob animation
    if (phase === "WAITING") {
      by = Math.sin(t * 1.5) * 0.06;
    }
    if (phase === "BITING") {
      by = -0.15 + Math.sin(t * 12) * 0.12;
    }

    const bobberPos = new THREE.Vector3(bx, by, bz);

    // Catenary-style line: 6 segments
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const frac = i / 12;
      const x = rodTip.x + (bobberPos.x - rodTip.x) * frac;
      const z = rodTip.z + (bobberPos.z - rodTip.z) * frac;
      const sag = Math.sin(frac * Math.PI) * -0.5;
      const y = rodTip.y + (bobberPos.y - rodTip.y) * frac + sag;
      pts.push(new THREE.Vector3(x, y, z));
    }
    lineGeometry.setFromPoints(pts);

    if (bobberRef.current) {
      bobberRef.current.position.set(bx, by, bz);
    }
  });

  if (!visible) return null;

  return null; // superseded by FishingLineFixed below
}

// Fix: React Three Fiber doesn't have line_ by default, let's use primitive
export function FishingLineFixed() {
  const phase = useGameStore((s) => s.phase);
  const bobberX = useGameStore((s) => s.bobberX);
  const bobberZ = useGameStore((s) => s.bobberZ);
  const reelingProgress = useGameStore((s) => s.reelingProgress);

  const lineRef = useRef<THREE.Line>(null);
  const bobberRef = useRef<THREE.Group>(null);
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: "#e0e0e0", transparent: true, opacity: 0.85 }), []);
  const lineGeom = useMemo(() => new THREE.BufferGeometry(), []);
  const lineObj = useMemo(() => new THREE.Line(lineGeom, lineMat), [lineGeom, lineMat]);

  const visible = phase !== "IDLE" && phase !== "CATCH" && phase !== "MISS";

  useFrame(({ clock }) => {
    if (!visible) return;
    const t = clock.getElapsedTime();

    const rodTip = new THREE.Vector3(0.42, 0.08 + 1.7 + 2.4, 2.2);
    let bx = bobberX;
    let bz = bobberZ;
    let by = 0.05;

    if (phase === "REELING") {
      const prog = reelingProgress;
      bx = bobberX * (1 - prog);
      bz = bobberZ * (1 - prog) + 2.2 * prog;
      by = prog * 2.0;
    }
    if (phase === "WAITING") by = Math.sin(t * 1.5) * 0.06;
    if (phase === "BITING") by = -0.15 + Math.sin(t * 12) * 0.12;

    const bobberPos = new THREE.Vector3(bx, by, bz);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const frac = i / 14;
      const x = rodTip.x + (bobberPos.x - rodTip.x) * frac;
      const z = rodTip.z + (bobberPos.z - rodTip.z) * frac;
      const sag = Math.sin(frac * Math.PI) * -0.55;
      const y = rodTip.y + (bobberPos.y - rodTip.y) * frac + sag;
      pts.push(new THREE.Vector3(x, y, z));
    }
    lineGeom.setFromPoints(pts);

    if (bobberRef.current) {
      bobberRef.current.position.set(bx, by, bz);
    }
  });

  if (!visible) return null;

  return (
    <>
      <primitive object={lineObj} />

      <group ref={bobberRef}>
        <mesh>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color="#ef4444" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.065, 10, 10]} />
          <meshStandardMaterial color="#f9fafb" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.18, 6]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        {phase === "BITING" && (
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.14, 0.26, 16]} />
            <meshBasicMaterial color="#f5c518" transparent opacity={0.75} />
          </mesh>
        )}
      </group>

      {(phase === "WAITING" || phase === "BITING") && (
        <Ripple x={bobberX} z={bobberZ} />
      )}
      {phase === "CASTING" && <Splash x={bobberX} z={bobberZ} />}
    </>
  );
}
