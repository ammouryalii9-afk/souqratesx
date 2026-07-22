import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function WaterSurface() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const shader = useMemo(
    () => ({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color("#0a2a4a") },
        uShallow: { value: new THREE.Color("#0e7490") },
        uFoam: { value: new THREE.Color("#7dd3fc") },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying float vWave;

        float wave(vec2 p, float freq, float speed, float amp) {
          return sin(p.x * freq + uTime * speed) * cos(p.y * freq * 0.8 + uTime * speed * 0.7) * amp;
        }

        void main() {
          vUv = uv;
          vec3 pos = position;
          float w  = wave(pos.xz, 1.2, 1.0, 0.12)
                   + wave(pos.xz, 2.5, 0.7, 0.06)
                   + wave(pos.xz, 4.0, 1.4, 0.03);
          pos.y += w;
          vWave = w;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        uniform float uTime;
        varying vec2 vUv;
        varying float vWave;

        void main() {
          float depth = smoothstep(-0.18, 0.18, vWave);
          vec3 col = mix(uDeep, uShallow, depth);

          float foam = smoothstep(0.10, 0.18, vWave);
          col = mix(col, uFoam, foam * 0.35);

          float sparkle = step(0.997, fract(sin(dot(vUv * 80.0 + uTime * 0.3, vec2(12.9898, 78.233))) * 43758.5453));
          col += vec3(sparkle) * 0.6;

          gl_FragColor = vec4(col, 0.88);
        }
      `,
    }),
    []
  );

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[40, 40, 80, 80]} />
      <shaderMaterial
        ref={materialRef}
        args={[shader]}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function UnderwaterFog() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial color="#061a2e" transparent opacity={0.7} />
    </mesh>
  );
}
