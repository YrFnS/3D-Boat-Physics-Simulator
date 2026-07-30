'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BackSide, MathUtils, Mesh, ShaderMaterial } from 'three';
import {
  type RenderQuality,
  sharedPhysics,
  useSimStore,
} from '@/store/useSimStore';

interface CloudQualityConfig {
  widthSegments: number;
  heightSegments: number;
  octaves: 2 | 3 | 4;
  updateHz: number;
}

const QUALITY_CONFIG: Record<RenderQuality, CloudQualityConfig> = {
  low: {
    widthSegments: 24,
    heightSegments: 12,
    octaves: 2,
    updateHz: 20,
  },
  medium: {
    widthSegments: 36,
    heightSegments: 18,
    octaves: 3,
    updateHz: 30,
  },
  high: {
    widthSegments: 48,
    heightSegments: 24,
    octaves: 4,
    updateHz: 45,
  },
  ultra: {
    widthSegments: 64,
    heightSegments: 32,
    octaves: 4,
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

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

function createFbmBody(octaves: CloudQualityConfig['octaves']) {
  const lines = [
    '  float value = 0.0;',
    '  float amplitude = 0.5;',
    '  vec3 point = source;',
  ];

  for (let octave = 0; octave < octaves; octave += 1) {
    lines.push('  value += amplitude * snoise(point);');
    if (octave < octaves - 1) {
      lines.push('  point = point * 2.0 + vec3(100.0);');
      lines.push('  amplitude *= 0.5;');
    }
  }

  lines.push('  return value;');
  return lines.join('\n');
}

function createFragmentShader(octaves: CloudQualityConfig['octaves']) {
  const lightningCode =
    octaves === 2
      ? `
  float flashMask = max(
    0.0,
    sin(samplePosition.x * 11.0 + samplePosition.y * 7.0 + uTime * 8.0)
  );`
      : `
  float flashMask = max(
    0.0,
    snoise(vec3(samplePosition * 4.0, uTime * 4.0))
  );`;

  return `
uniform float uTime;
uniform float uOpacity;
uniform float uLightning;
varying vec2 vUv;

${simplex3D}

float fbm(vec3 source) {
${createFbmBody(octaves)}
}

void main() {
  float distanceFromZenith = 1.0 - vUv.y;
  float angle = vUv.x * 6.28318530718;
  float swirl =
    angle -
    uTime * 0.15 -
    pow(distanceFromZenith, 0.5) * 6.0;
  vec2 samplePosition =
    vec2(cos(swirl), sin(swirl)) * distanceFromZenith;
  float noiseValue = fbm(vec3(samplePosition * 5.0, uTime * 0.05));
  float eyeMask = smoothstep(0.015, 0.12, distanceFromZenith);
  float horizonFade = smoothstep(1.0, 0.5, distanceFromZenith);
  float rawDensity =
    (noiseValue * 0.5 + 0.5) * eyeMask * horizonFade;
  float density = smoothstep(0.25, 0.8, rawDensity);
  vec3 darkCloud = vec3(0.05, 0.08, 0.12);
  vec3 midCloud = vec3(0.12, 0.16, 0.22);
  vec3 lightCloud = vec3(0.25, 0.3, 0.35);
  vec3 color = mix(
    darkCloud,
    midCloud,
    smoothstep(0.0, 0.5, noiseValue)
  );
  color = mix(
    color,
    lightCloud,
    smoothstep(0.5, 1.0, noiseValue)
  );
${lightningCode}
  color +=
    vec3(0.8, 0.9, 1.0) *
    flashMask *
    uLightning *
    density *
    2.0;
  gl_FragColor = vec4(color, clamp(density * uOpacity, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

export default function HurricaneClouds() {
  const materialRef = useRef<ShaderMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const opacityRef = useRef(0);
  const updateAccumulatorRef = useRef(0);
  const renderQuality = useSimStore((state) => state.renderQuality);
  const config = QUALITY_CONFIG[renderQuality];

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uLightning: { value: 0 },
    }),
    [],
  );
  const fragmentShader = useMemo(
    () => createFragmentShader(config.octaves),
    [config.octaves],
  );

  useFrame((state, delta) => {
    const safeDelta = Math.min(delta, 0.1);
    const windSpeed = useSimStore.getState().windSpeed;
    const targetOpacity =
      MathUtils.clamp((windSpeed - 28) / 17, 0, 1) * 0.98;

    opacityRef.current = MathUtils.damp(
      opacityRef.current,
      targetOpacity,
      2.1,
      safeDelta,
    );

    const mesh = meshRef.current;
    if (mesh) {
      mesh.visible = opacityRef.current > 0.01;
      mesh.position.set(
        state.camera.position.x,
        0,
        state.camera.position.z,
      );
    }

    if (!mesh?.visible) return;

    updateAccumulatorRef.current += safeDelta;
    const updateInterval = 1 / config.updateHz;
    if (updateAccumulatorRef.current < updateInterval) return;
    updateAccumulatorRef.current %= updateInterval;

    const material = materialRef.current;
    if (material) {
      material.uniforms.uTime.value = state.clock.elapsedTime;
      material.uniforms.uOpacity.value = opacityRef.current;
      material.uniforms.uLightning.value = sharedPhysics.lightningFlash;
    }
  });

  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <sphereGeometry
        key={`hurricane-geometry-${renderQuality}`}
        args={[
          800,
          config.widthSegments,
          config.heightSegments,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        ]}
      />
      <shaderMaterial
        key={`hurricane-material-${renderQuality}`}
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}
