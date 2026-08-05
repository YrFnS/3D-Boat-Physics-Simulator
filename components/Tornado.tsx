'use client';

import { useFrame } from '@react-three/fiber';
import { canAdvanceAuthoritativeSimulation } from '@/sim/core/SimulationRuntimeAuthority';
import { useMemo, useRef } from 'react';
import { DoubleSide, Group, MathUtils, ShaderMaterial } from 'three';
import {
  type RenderQuality,
  sharedPhysics,
  useSimStore,
} from '@/store/useSimStore';

interface TornadoQualityConfig {
  radialSegments: number;
  heightSegments: number;
  shaderDetail: 0 | 1 | 2;
  maxDistance: number;
  updateHz: number;
}

const QUALITY_CONFIG: Record<RenderQuality, TornadoQualityConfig> = {
  low: {
    radialSegments: 12,
    heightSegments: 20,
    shaderDetail: 0,
    maxDistance: 480,
    updateHz: 24,
  },
  medium: {
    radialSegments: 18,
    heightSegments: 32,
    shaderDetail: 1,
    maxDistance: 650,
    updateHz: 30,
  },
  high: {
    radialSegments: 24,
    heightSegments: 48,
    shaderDetail: 2,
    maxDistance: 900,
    updateHz: 45,
  },
  ultra: {
    radialSegments: 32,
    heightSegments: 64,
    shaderDetail: 2,
    maxDistance: 1200,
    updateHz: 60,
  },
};

const simplex3D = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0)) +
    i.y + vec4(0.0, i1.y, i2.y, 1.0)) +
    i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(
    dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)
  ));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(
    dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)
  ), 0.0);
  m *= m;
  return 42.0 * dot(m * m, vec4(
    dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)
  ));
}
`;

function createVertexShader(detail: TornadoQualityConfig['shaderDetail']) {
  const noiseSource = detail === 0 ? '' : simplex3D;
  const bendCode =
    detail === 0
      ? `
    float bendX = sin(normalizedY * 0.035 - uTime * 0.7) * 0.3;
    float bendZ = cos(normalizedY * 0.03 - uTime * 0.55) * 0.3;`
      : detail === 1
        ? `
    float bendX = snoise(vec3(0.0, normalizedY * 0.01 - uTime * 0.5, uTime * 0.2));
    float bendZ = snoise(vec3(uTime * 0.2, normalizedY * 0.01 - uTime * 0.5, 0.0));`
        : `
    float bendX =
      snoise(vec3(0.0, normalizedY * 0.01 - uTime * 0.5, uTime * 0.2)) * 0.72 +
      snoise(vec3(12.0, normalizedY * 0.024 + uTime * 0.18, 4.0)) * 0.28;
    float bendZ =
      snoise(vec3(uTime * 0.2, normalizedY * 0.01 - uTime * 0.5, 0.0)) * 0.72 +
      snoise(vec3(7.0, normalizedY * 0.021 - uTime * 0.16, 16.0)) * 0.28;`;

  return `
uniform float uTime;
varying vec2 vUv;
varying float vElevation;
varying vec3 vWorldNormal;

${noiseSource}

void main() {
  vUv = uv;
  vec3 pos = position;
  float normalizedY = pos.y + 150.0;
  float angle = normalizedY * 0.05 - uTime * 10.0;
  float sineAngle = sin(angle);
  float cosineAngle = cos(angle);
  pos.xz = mat2(cosineAngle, -sineAngle, sineAngle, cosineAngle) * pos.xz;
${bendCode}
  pos.x += bendX * normalizedY * 0.15;
  pos.z += bendZ * normalizedY * 0.15;
  vElevation = normalizedY;
  vWorldNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;
}

function createFragmentShader(detail: TornadoQualityConfig['shaderDetail']) {
  const noiseSource = detail === 0 ? '' : simplex3D;
  const noiseCode =
    detail === 0
      ? `
  float bandA = sin(scrolledUv1.x + sin(scrolledUv1.y * 0.75));
  float bandB = cos(scrolledUv1.y * 0.72 - scrolledUv1.x * 0.35);
  float combinedNoise = (bandA * 0.32 + bandB * 0.18) + 0.5;`
      : detail === 1
        ? `
  float noise1 = snoise(vec3(scrolledUv1, uTime * 0.5));
  float combinedNoise = noise1 * 0.5 + 0.5;`
        : `
  float noise1 = snoise(vec3(scrolledUv1, uTime * 0.5));
  float noise2 = snoise(vec3(scrolledUv2, uTime * 0.8));
  float combinedNoise = (noise1 * 0.6 + noise2 * 0.4) * 0.5 + 0.5;`;

  return `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
varying float vElevation;
varying vec3 vWorldNormal;

${noiseSource}

void main() {
  vec2 scrolledUv1 = vec2(
    vUv.x * 8.0 - uTime * 6.0,
    vUv.y * 12.0 - uTime * 10.0
  );
  vec2 scrolledUv2 = vec2(
    vUv.x * 5.0 - uTime * 8.0,
    vUv.y * 8.0 - uTime * 14.0
  );
${noiseCode}
  float edgeFade = smoothstep(
    0.0,
    0.4,
    clamp(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0, 1.0)
  );
  float heightFade =
    smoothstep(-5.0, 10.0, vElevation) *
    (1.0 - smoothstep(180.0, 280.0, vElevation));
  vec3 darkWater = vec3(0.08, 0.12, 0.18);
  vec3 wash = vec3(0.7, 0.8, 0.9);
  vec3 color = mix(darkWater, wash, combinedNoise * 0.8);
  float tearing = smoothstep(0.8, 1.0, combinedNoise);
  color += tearing * 0.5;
  float alphaMask = clamp(
    combinedNoise * edgeFade * heightFade * 2.0,
    0.0,
    1.0
  );
  gl_FragColor = vec4(color, alphaMask * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
}

export default function Tornado() {
  const materialRef = useRef<ShaderMaterial>(null);
  const groupRef = useRef<Group>(null);
  const opacityRef = useRef(0);
  const updateAccumulatorRef = useRef(0);
  const renderQuality = useSimStore((state) => state.renderQuality);
  const config = QUALITY_CONFIG[renderQuality];

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    }),
    [],
  );
  const vertexShader = useMemo(
    () => createVertexShader(config.shaderDetail),
    [config.shaderDetail],
  );
  const fragmentShader = useMemo(
    () => createFragmentShader(config.shaderDetail),
    [config.shaderDetail],
  );


useFrame((state, delta) => {
  const store = useSimStore.getState();
  const simulationRunning = canAdvanceAuthoritativeSimulation(
    store.sessionPhase,
  );
  const simulationDelta = simulationRunning
    ? Math.min(delta, 0.1)
    : 0;
  const stormStrength = MathUtils.clamp(
    (store.windSpeed - 24) / 18,
    0,
    1,
  );
  const deltaX =
    state.camera.position.x - sharedPhysics.tornadoPos.x;
  const deltaZ =
    state.camera.position.z - sharedPhysics.tornadoPos.z;
  const distance = Math.hypot(deltaX, deltaZ);
  const distanceFade =
    1 -
    MathUtils.smoothstep(
      distance,
      config.maxDistance * 0.65,
      config.maxDistance,
    );
  const targetOpacity = stormStrength * distanceFade * 0.9;

  opacityRef.current = simulationRunning
    ? MathUtils.damp(
        opacityRef.current,
        targetOpacity,
        2.4,
        simulationDelta,
      )
    : targetOpacity;

  const group = groupRef.current;
  if (group) {
    group.position.set(
      sharedPhysics.tornadoPos.x,
      -2,
      sharedPhysics.tornadoPos.z,
    );
    group.visible =
      opacityRef.current > 0.01 &&
      distance < config.maxDistance;
  }

  const material = materialRef.current;
  if (!simulationRunning) {
    updateAccumulatorRef.current = 0;
    if (material) {
      material.uniforms.uTime.value = sharedPhysics.renderTime;
      material.uniforms.uOpacity.value = opacityRef.current;
    }
    return;
  }

  if (!group?.visible) return;

  updateAccumulatorRef.current += simulationDelta;
  const updateInterval = 1 / config.updateHz;
  if (updateAccumulatorRef.current < updateInterval) return;
  updateAccumulatorRef.current %= updateInterval;

  if (material) {
    material.uniforms.uTime.value = sharedPhysics.renderTime;
    material.uniforms.uOpacity.value = opacityRef.current;
  }
});

  return (
    <group ref={groupRef}>
      <mesh frustumCulled>
        <cylinderGeometry
          key={`tornado-geometry-${renderQuality}`}
          args={[
            100,
            3,
            300,
            config.radialSegments,
            config.heightSegments,
            true,
          ]}
        />
        <shaderMaterial
          key={`tornado-material-${renderQuality}`}
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
