"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";

/**
 * Animated scalars the scene reads every frame. Held in a ref by the parent so
 * the eruption never triggers a React re-render.
 */
export type VolcanoDrive = {
  /** 0 dormant, 1 fully lit. Drives crack glow and crater light. */
  heat: number;
  /** 0 no column, 1 full plume. Drives the jet height and the core sphere. */
  erupt: number;
  /** 0 still, 1 violent. Drives camera shake. */
  shake: number;
};

/* --------------------------------------------------------------------------
   Shared GLSL. Hash-based value noise: short, dependency-free, and compiles
   everywhere. Good enough for lava, which wants churn rather than accuracy.
   -------------------------------------------------------------------------- */

const NOISE = /* glsl */ `
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

/* --------------------------------------------------------------------------
   Cone. Dark basalt with fissures that run down from the summit and brighten
   with heat. The cracks are a ridged fbm stretched vertically so they read as
   flows rather than blotches.
   -------------------------------------------------------------------------- */

function Cone({ drive }: { drive: React.RefObject<VolcanoDrive> }) {
  const mat = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHeat: { value: 0.22 },
      uMagma: { value: new THREE.Color("#ff5a1f") },
      uCore: { value: new THREE.Color("#ffb245") },
      uRock: { value: new THREE.Color("#0d0b10") },
    }),
    [],
  );

  useFrame((_, dt) => {
    if (!mat.current || !drive.current) return;
    uniforms.uTime.value += dt;
    uniforms.uHeat.value = drive.current.heat;
  });

  return (
    <mesh position={[0, -1.25, 0]}>
      <coneGeometry args={[2.9, 2.05, 128, 48]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vPos;
          varying vec2 vUv;
          varying vec3 vNormal;
          ${NOISE}
          void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            // Roughen the silhouette so it does not read as a geometric cone.
            float bump = fbm(position * 2.6) * 0.085;
            vec3 p = position + normal * bump;
            vPos = p;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uTime;
          uniform float uHeat;
          uniform vec3 uMagma;
          uniform vec3 uCore;
          uniform vec3 uRock;
          varying vec3 vPos;
          varying vec2 vUv;
          varying vec3 vNormal;
          ${NOISE}

          void main() {
            float h = clamp(vUv.y, 0.0, 1.0);

            // Stretch the noise vertically so fissures run downhill.
            vec3 q = vec3(vPos.x * 3.4, vPos.y * 0.75 - uTime * 0.035, vPos.z * 3.4);
            float n = fbm(q);
            float ridge = 1.0 - abs(n * 2.0 - 1.0);
            float cracks = pow(clamp(ridge, 0.0, 1.0), 7.0);

            // Secondary finer network, so the flanks are not one scale only.
            float fine = pow(clamp(1.0 - abs(fbm(q * 2.7) * 2.0 - 1.0), 0.0, 1.0), 11.0);
            cracks = clamp(cracks + fine * 0.6, 0.0, 1.0);

            // Hotter toward the summit, where the vent feeds them.
            cracks *= mix(0.18, 1.0, pow(h, 1.6));

            // Rock form from a fixed key light, kept dim: the cone is a
            // silhouette and the lava does the lighting.
            float lambert = clamp(dot(vNormal, normalize(vec3(-0.4, 0.75, 0.55))), 0.0, 1.0);
            vec3 rock = uRock + vec3(0.055, 0.045, 0.05) * lambert;
            rock += vec3(0.03, 0.012, 0.004) * fbm(vPos * 7.0);

            vec3 glow = mix(uMagma, uCore, cracks) * cracks * (0.9 + 2.6 * uHeat);

            // Crater lip stays warm even at rest.
            float lip = smoothstep(0.86, 1.0, h);
            glow += uMagma * lip * (0.35 + 1.9 * uHeat);

            gl_FragColor = vec4(rock + glow, 1.0);
          }
        `}
      />
    </mesh>
  );
}

/* --------------------------------------------------------------------------
   Lava column. A tapered jet whose height is driven by `erupt`, displaced by
   noise so it churns instead of standing still.
   -------------------------------------------------------------------------- */

function Column({ drive }: { drive: React.RefObject<VolcanoDrive> }) {
  const group = useRef<THREE.Group>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uErupt: { value: 0 },
      uMagma: { value: new THREE.Color("#ff5a1f") },
      uCore: { value: new THREE.Color("#fff1d6") },
    }),
    [],
  );

  useFrame((_, dt) => {
    if (!drive.current || !group.current) return;
    uniforms.uTime.value += dt;
    const e = drive.current.erupt;
    uniforms.uErupt.value = e;
    group.current.scale.set(
      0.82 + 0.18 * e,
      Math.max(0.0001, e),
      0.82 + 0.18 * e,
    );
    group.current.visible = e > 0.004;
  });

  return (
    <group ref={group} position={[0, -0.22, 0]}>
      <mesh position={[0, 0.92, 0]}>
        <cylinderGeometry args={[0.46, 0.2, 1.85, 64, 40, true]} />
        <shaderMaterial
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          vertexShader={/* glsl */ `
            uniform float uTime;
            uniform float uErupt;
            varying vec2 vUv;
            varying vec3 vPos;
            ${NOISE}
            void main() {
              vUv = uv;
              vec3 p = position;
              // Churn grows with height: tight at the vent, ragged at the top.
              float swell = fbm(vec3(p.xz * 3.2, uTime * 1.25)) - 0.5;
              p.xz += normalize(p.xz + 0.0001) * swell * 0.34 * uv.y;
              vPos = p;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }
          `}
          fragmentShader={/* glsl */ `
            uniform float uTime;
            uniform float uErupt;
            uniform vec3 uMagma;
            uniform vec3 uCore;
            varying vec2 vUv;
            varying vec3 vPos;
            ${NOISE}
            void main() {
              float h = vUv.y;

              // Rising turbulence, sampled in world-ish space so it reads as
              // material moving upward through the jet.
              float t = fbm(vec3(vPos.xz * 2.6, vPos.y * 1.5 - uTime * 2.1));

              // Hot core, cooler skin.
              float r = clamp(length(vPos.xz) / 0.5, 0.0, 1.0);
              float core = pow(1.0 - r, 2.2);

              vec3 c = mix(uMagma, uCore, clamp(core * 1.25 + t * 0.35, 0.0, 1.0));

              // Fade out at the top so the jet dissolves into the sphere
              // rather than ending on a hard edge.
              float fade = smoothstep(1.0, 0.42, h) * smoothstep(0.0, 0.1, h);
              float a = fade * (0.42 + 0.58 * t) * uErupt;

              gl_FragColor = vec4(c * (1.4 + 1.6 * core), a);
            }
          `}
        />
      </mesh>
    </group>
  );
}

/* --------------------------------------------------------------------------
   Core sphere. The matched defect itself. Emissive with a fresnel rim so it
   reads as a body of light rather than a flat disc.
   -------------------------------------------------------------------------- */

function Core({ drive }: { drive: React.RefObject<VolcanoDrive> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uErupt: { value: 0 },
      uMagma: { value: new THREE.Color("#ff5a1f") },
      uCore: { value: new THREE.Color("#ffd79a") },
    }),
    [],
  );

  useFrame((_, dt) => {
    if (!mesh.current || !drive.current) return;
    uniforms.uTime.value += dt;
    const e = drive.current.erupt;
    uniforms.uErupt.value = e;
    // Overshoot then settle, with a slow breath once resolved.
    const breath = 1 + Math.sin(uniforms.uTime.value * 1.1) * 0.016 * e;
    mesh.current.scale.setScalar(Math.max(0.0001, e * breath));
    mesh.current.visible = e > 0.004;
  });

  return (
    <mesh ref={mesh} position={[0, 1.52, 0]}>
      <sphereGeometry args={[0.78, 64, 64]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={/* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uTime;
          uniform float uErupt;
          uniform vec3 uMagma;
          uniform vec3 uCore;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float facing = clamp(dot(vNormal, vView), 0.0, 1.0);
            float rim = pow(1.0 - facing, 2.4);
            vec3 c = mix(uMagma, uCore, pow(facing, 1.5));
            float a = (0.72 * pow(facing, 0.75) + rim * 0.9) * uErupt;
            gl_FragColor = vec4(c * 1.9, a);
          }
        `}
      />
    </mesh>
  );
}

/* --------------------------------------------------------------------------
   Embers. Positions are computed entirely in the vertex shader from a per
   particle seed, so there is no per-frame CPU work.
   -------------------------------------------------------------------------- */

function Embers({ drive, count = 1400 }: { drive: React.RefObject<VolcanoDrive>; count?: number }) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHeat: { value: 0.22 },
      uErupt: { value: 0 },
      uMagma: { value: new THREE.Color("#ff7a2f") },
      uCore: { value: new THREE.Color("#ffd79a") },
    }),
    [],
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      seeds[i * 3 + 0] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
    }
    // position is required by three even though the shader ignores it.
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    return g;
  }, [count]);

  useFrame((_, dt) => {
    if (!drive.current) return;
    uniforms.uTime.value += dt;
    uniforms.uHeat.value = drive.current.heat;
    uniforms.uErupt.value = drive.current.erupt;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={/* glsl */ `
          uniform float uTime;
          uniform float uHeat;
          uniform float uErupt;
          attribute vec3 aSeed;
          varying float vLife;
          varying float vSeed;

          void main() {
            vSeed = aSeed.z;

            // Each ember has its own period and phase, so they never pulse
            // together.
            float speed = 0.16 + aSeed.x * 0.5 + uErupt * 0.75;
            float life = fract(uTime * speed + aSeed.y);
            vLife = life;

            float spread = 0.5 + aSeed.x * 2.4 + uErupt * 1.1;
            float ang = aSeed.y * 6.2831853;

            // Rise and drift outward, with a slow lateral sway.
            float y = -0.35 + life * (2.9 + uErupt * 1.9);
            float radius = spread * (0.22 + life * 0.85);
            float sway = sin(uTime * 0.7 + aSeed.z * 6.2831853) * 0.18 * life;

            vec3 p = vec3(cos(ang) * radius + sway, y, sin(ang) * radius * 0.9);

            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;

            float size = (1.6 + aSeed.x * 4.4) * (0.35 + uHeat) * (1.0 + uErupt);
            gl_PointSize = size * (26.0 / -mv.z);
          }
        `}
          fragmentShader={/* glsl */ `
          uniform vec3 uMagma;
          uniform vec3 uCore;
          uniform float uHeat;
          varying float vLife;
          varying float vSeed;
          void main() {
            vec2 d = gl_PointCoord - 0.5;
            float r = length(d);
            if (r > 0.5) discard;

            float soft = pow(1.0 - r * 2.0, 1.9);
            // Embers cool as they rise.
            vec3 c = mix(uCore, uMagma, clamp(vLife * 1.5, 0.0, 1.0));
            float a = soft * (1.0 - vLife) * (0.3 + 0.8 * uHeat) * (0.4 + vSeed * 0.6);
            gl_FragColor = vec4(c, a);
          }
        `}
      />
    </points>
  );
}

/* --------------------------------------------------------------------------
   Camera shake. Applied here rather than in CSS so the whole scene, including
   bloom, moves together. The DOM chrome deliberately stays still.
   -------------------------------------------------------------------------- */

function Shake({ drive }: { drive: React.RefObject<VolcanoDrive> }) {
  const { camera } = useThree();
  const base = useRef(new THREE.Vector3(0, 0.55, 5.45));
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt;
    const s = drive.current?.shake ?? 0;
    if (s < 0.001) {
      camera.position.copy(base.current);
    } else {
      // Two incommensurate frequencies read as rumble rather than vibration.
      const x = Math.sin(t.current * 47.3) * 0.5 + Math.sin(t.current * 91.7) * 0.5;
      const y = Math.sin(t.current * 61.1) * 0.5 + Math.sin(t.current * 113.3) * 0.5;
      camera.position.set(
        base.current.x + x * 0.085 * s,
        base.current.y + y * 0.07 * s,
        base.current.z,
      );
    }
    camera.lookAt(0, 0.3, 0);
  });

  return null;
}

/* -------------------------------------------------------------------------- */

export default function VolcanoCanvas({
  drive,
  reducedMotion = false,
}: {
  drive: React.RefObject<VolcanoDrive>;
  reducedMotion?: boolean;
}) {
  return (
    <Canvas
      className="stage-canvas"
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.55, 5.45], fov: 42, near: 0.1, far: 50 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping;
        gl.setClearColor(0x000000, 0);
      }}
    >
      {!reducedMotion && <Shake drive={drive} />}
      <Cone drive={drive} />
      <Column drive={drive} />
      <Core drive={drive} />
      <Embers drive={drive} count={reducedMotion ? 260 : 1400} />
      <EffectComposer>
        <Bloom
          intensity={1.5}
          luminanceThreshold={0.22}
          luminanceSmoothing={0.5}
          mipmapBlur
          radius={0.82}
        />
      </EffectComposer>
    </Canvas>
  );
}