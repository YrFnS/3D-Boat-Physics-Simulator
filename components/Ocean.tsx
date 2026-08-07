'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  DataTexture,
  Group,
  LinearFilter,
  MathUtils,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import {
  type RenderQuality,
  sharedPhysics,
  useSimStore,
} from '@/store/useSimStore';
import {
  getSharedTerrainHeightfield,
  sampleTerrainHeightfield,
} from '@/sim/terrain/TerrainHeightfield';
import { sharedWakeField } from './WakeField';
import {
  sampleGerstnerSurface,
  type GerstnerWaveDefinition,
} from '@/sim/water/GerstnerWater';
import type { WaterSurfaceSample } from '@/sim/water/WaterSurface';
import {
  normalizeHeadingDegrees,
  normalizeSignedHeadingDeltaDegrees,
  rotateWorldDirection,
} from '@/sim/world/WorldDirection';

interface OceanQualityConfig {
  innerSegments: number;
  radialSegments: number;
  detail: number;
}

const INNER_SIZE = 640;
const OUTER_SIZE = 2400;
const OCEAN_HEIGHT = -1;

const QUALITY_CONFIG: Record<RenderQuality, OceanQualityConfig> = {
  low: { innerSegments: 88, radialSegments: 8, detail: 0.35 },
  medium: { innerSegments: 128, radialSegments: 10, detail: 0.55 },
  high: { innerSegments: 184, radialSegments: 14, detail: 0.78 },
  ultra: { innerSegments: 256, radialSegments: 18, detail: 1 },
};

const REFERENCE_WAVE_WIND_HEADING_DEG = 90;
const BASE_WAVES: readonly GerstnerWaveDefinition[] = [
  { x: 0.894427, y: 0.447214, z: 0.12, w: 30 },
  { x: 0.707107, y: 0.707107, z: 0.1, w: 12 },
  { x: -0.196116, y: 0.980581, z: 0.08, w: 7 },
  { x: 0.707107, y: -0.707107, z: 0.05, w: 3 },
];
const CACHED_WAVES: GerstnerWaveDefinition[] = BASE_WAVES.map(
  (wave) => ({ ...wave }),
);
let cachedWindSpeed = Number.NaN;
let cachedWindDir = Number.NaN;

const vertexShader = `
#define PI 3.14159265359

uniform float uTime;
uniform vec4 uWaves[4];
uniform sampler2D tDampening;
uniform float uSeason;
uniform vec3 uWhirlpoolPos;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vFoam;
varying float vIce;

#include <fog_pars_vertex>

vec3 gerstnerWave(
  vec4 wave,
  vec3 point,
  inout vec3 tangent,
  inout vec3 binormal,
  inout float compression
) {
  vec2 direction = normalize(wave.xy);
  float waveNumber = 2.0 * PI / wave.w;
  float phaseSpeed = sqrt(9.8 / waveNumber);
  float phase = waveNumber * (dot(direction, point.xz) - phaseSpeed * uTime);
  float amplitude = wave.z / waveNumber;
  float sinePhase = sin(phase);
  float cosinePhase = cos(phase);
  float steepnessAmplitude = waveNumber * amplitude;

  tangent += vec3(
    -direction.x * direction.x * steepnessAmplitude * sinePhase,
    direction.x * steepnessAmplitude * cosinePhase,
    -direction.x * direction.y * steepnessAmplitude * sinePhase
  );
  binormal += vec3(
    -direction.x * direction.y * steepnessAmplitude * sinePhase,
    direction.y * steepnessAmplitude * cosinePhase,
    -direction.y * direction.y * steepnessAmplitude * sinePhase
  );
  compression += max(0.0, steepnessAmplitude * sinePhase);

  return vec3(
    direction.x * amplitude * cosinePhase * 0.4,
    amplitude * sinePhase,
    direction.y * amplitude * cosinePhase * 0.4
  );
}

void main() {
  vec4 baseWorldPosition = modelMatrix * vec4(position, 1.0);
  vec3 point = baseWorldPosition.xyz;

  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float compression = 0.0;
  vec3 offset = vec3(0.0);

  offset += gerstnerWave(uWaves[0], point, tangent, binormal, compression);
  offset += gerstnerWave(uWaves[1], point, tangent, binormal, compression);
  offset += gerstnerWave(uWaves[2], point, tangent, binormal, compression);
  offset += gerstnerWave(uWaves[3], point, tangent, binormal, compression);

  vec2 dampeningUv = point.xz / 3000.0 + 0.5;
  float shorelineDampening = 1.0;
  if (
    dampeningUv.x >= 0.0 && dampeningUv.x <= 1.0 &&
    dampeningUv.y >= 0.0 && dampeningUv.y <= 1.0
  ) {
    shorelineDampening = texture2D(tDampening, dampeningUv).r;
  }

  float winter = clamp(1.0 - abs(uSeason - 0.75) * 4.0, 0.0, 1.0);
  float iceNoise =
    sin(point.x * 0.01) * cos(point.z * 0.01) +
    sin(point.x * 0.05 + point.z * 0.04) * 0.5;
  float ice = clamp((iceNoise * 0.3 + winter * 1.5 - 1.0) * 2.0, 0.0, 1.0);
  vIce = ice;

  vec2 vortexDelta = point.xz - uWhirlpoolPos.xz;
  float vortexDistance = length(vortexDelta);
  float vortex = 1.0 - smoothstep(0.0, 160.0, vortexDistance);

  float dampening = shorelineDampening * (1.0 - ice * 0.95);
  offset *= dampening * (1.0 - pow(vortex, 1.5));
  offset.y -= pow(vortex, 3.0) * 80.0 * dampening;

  vec3 finalWorldPosition = point + offset;
  vec3 surfaceNormal = normalize(cross(binormal, tangent));
  surfaceNormal = normalize(mix(vec3(0.0, 1.0, 0.0), surfaceNormal, dampening));

  if (vortex > 0.001) {
    vec2 vortexDirection = normalize(vortexDelta + vec2(0.0001));
    float vortexSlope = 1.5 * vortex * vortex;
    vec3 vortexNormal = normalize(vec3(
      vortexDirection.x * vortexSlope,
      1.0,
      vortexDirection.y * vortexSlope
    ));
    surfaceNormal = normalize(mix(surfaceNormal, vortexNormal, vortex * dampening));
  }

  vWorldPosition = finalWorldPosition;
  vNormal = surfaceNormal;
  vFoam = clamp(compression * 1.8, 0.0, 1.0) * dampening;

  vec4 mvPosition = viewMatrix * vec4(finalWorldPosition, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const fragmentShader = `
#define PI 3.14159265359

uniform float uTime;
uniform float uSeason;
uniform float uLightningFlash;
uniform float uDetailLevel;
uniform float uWakeWorldSize;
uniform float uWakeEnabled;
uniform vec2 uWakeOrigin;
uniform vec3 uBaseColor;
uniform vec3 uShallowColor;
uniform vec3 uWhirlpoolPos;
uniform sampler2D tWake;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vFoam;
varying float vIce;

#include <fog_pars_fragment>

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));

  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 lightDirection = normalize(vec3(0.8, 0.6, -0.4));

  float rippleX =
    sin(vWorldPosition.x * 0.17 + uTime * 1.2) +
    sin(vWorldPosition.z * 0.31 - uTime * 0.7);
  float rippleZ =
    cos(vWorldPosition.z * 0.19 + uTime) +
    cos(vWorldPosition.x * 0.27 - uTime * 0.8);
  vec3 microNormal = normalize(vec3(
    rippleX * mix(0.025, 0.085, uDetailLevel),
    1.0,
    rippleZ * mix(0.025, 0.085, uDetailLevel)
  ));

  float distanceToCamera = length(cameraPosition - vWorldPosition);
  float normalFade = clamp(1.0 - distanceToCamera / 420.0, 0.0, 1.0);
  vec3 blendedNormal = normalize(
    mix(vNormal, vec3(0.0, 1.0, 0.0), vIce * 0.6) +
    microNormal * 0.28 * normalFade
  );

  float fresnel = pow(
    clamp(1.0 - dot(viewDirection, blendedNormal), 0.0, 1.0),
    4.5
  );
  vec3 waterColor = mix(uBaseColor, uShallowColor, fresnel * 0.85 + 0.15);

  float iceDetail = valueNoise(vWorldPosition.xz * mix(0.4, 1.6, uDetailLevel));
  vec3 iceColor = mix(
    vec3(0.72, 0.82, 0.9),
    vec3(0.98, 1.0, 1.0),
    iceDetail
  );
  waterColor = mix(waterColor, iceColor + fresnel * 0.25, vIce * 0.94);

  float foamNoise = valueNoise(vWorldPosition.xz * 0.32 + uTime * 0.15);
  float waveFoam = smoothstep(0.35, 0.85, vFoam) *
    smoothstep(0.25, 0.85, foamNoise) * normalFade;

  float wake = 0.0;
  vec2 wakeUv =
    (vWorldPosition.xz - uWakeOrigin) /
    max(uWakeWorldSize, 1.0) + 0.5;
  if (
    uWakeEnabled > 0.5 &&
    wakeUv.x >= 0.0 && wakeUv.x <= 1.0 &&
    wakeUv.y >= 0.0 && wakeUv.y <= 1.0
  ) {
    wake = texture2D(tWake, wakeUv).r;
    wake = pow(clamp(wake, 0.0, 1.0), 0.72) * 1.18;
  }
  wake *= (1.0 - vIce) * normalFade;
  float foamIntensity = clamp(waveFoam + wake, 0.0, 1.0);

  vec2 vortexDelta = vWorldPosition.xz - uWhirlpoolPos.xz;
  float vortexDistance = length(vortexDelta);
  float vortex = 1.0 - smoothstep(0.0, 160.0, vortexDistance);

  if (vortex > 0.001) {
    float angle = atan(vortexDelta.y, vortexDelta.x);
    float spiral = sin(
      angle * 18.0 +
      vortexDistance * 0.32 -
      uTime * 5.0 +
      valueNoise(vortexDelta * 0.12) * 5.0
    );
    float vortexFoam = smoothstep(0.35, 0.95, spiral) *
      (1.0 - smoothstep(20.0, 160.0, vortexDistance));
    float eyeRing =
      (1.0 - smoothstep(18.0, 38.0, vortexDistance)) *
      smoothstep(6.0, 15.0, vortexDistance);
    vortexFoam = max(vortexFoam, eyeRing);

    vec3 deepVortex = vec3(0.0, 0.008, 0.015);
    vec3 midVortex = vec3(0.01, 0.09, 0.12);
    vec3 vortexColor = mix(
      deepVortex,
      midVortex,
      smoothstep(8.0, 100.0, vortexDistance)
    );
    vortexColor = mix(vortexColor, vec3(0.82, 0.94, 1.0), vortexFoam);
    vortexColor *= smoothstep(5.0, 16.0, vortexDistance);

    waterColor = mix(waterColor, vortexColor, pow(vortex, 1.15));
    foamIntensity = mix(foamIntensity, vortexFoam, vortex);
  }

  vec3 halfVector = normalize(lightDirection + viewDirection);
  float summer = clamp(1.0 - abs(uSeason - 0.25) * 4.0, 0.0, 1.0);
  float specularPower = mix(260.0, 85.0, summer);
  float specularStrength = mix(1.8, 4.8, summer);
  float specular = pow(
    max(dot(blendedNormal, halfVector), 0.0),
    specularPower
  ) * specularStrength * normalFade;

  vec3 foamColor = mix(
    vec3(0.82, 0.9, 0.96),
    vec3(1.0),
    uLightningFlash
  );
  vec3 finalColor = mix(waterColor, foamColor, foamIntensity);
  finalColor += specular * (1.0 - foamIntensity * 0.6) *
    mix(vec3(1.0, 0.88, 0.72), vec3(1.0), summer);
  finalColor += vec3(0.65, 0.78, 1.0) * uLightningFlash *
    (0.2 + fresnel * 0.8);

  finalColor = mix(
    finalColor,
    uBaseColor,
    clamp((distanceToCamera - 220.0) / 400.0, 0.0, 0.65)
  );

  gl_FragColor = vec4(finalColor, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function createPatch(
  width: number,
  depth: number,
  widthSegments: number,
  depthSegments: number,
  x: number,
  z: number,
) {
  const geometry = new PlaneGeometry(
    width,
    depth,
    Math.max(1, widthSegments),
    Math.max(1, depthSegments),
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, 0, z);
  geometry.computeBoundingSphere();
  return geometry;
}

function createOceanGeometry(config: OceanQualityConfig) {
  const stripSize = (OUTER_SIZE - INNER_SIZE) / 2;
  const stripOffset = INNER_SIZE / 2 + stripSize / 2;

  return {
    inner: createPatch(
      INNER_SIZE,
      INNER_SIZE,
      config.innerSegments,
      config.innerSegments,
      0,
      0,
    ),
    north: createPatch(
      OUTER_SIZE,
      stripSize,
      config.innerSegments,
      config.radialSegments,
      0,
      stripOffset,
    ),
    south: createPatch(
      OUTER_SIZE,
      stripSize,
      config.innerSegments,
      config.radialSegments,
      0,
      -stripOffset,
    ),
    east: createPatch(
      stripSize,
      INNER_SIZE,
      config.radialSegments,
      config.innerSegments,
      stripOffset,
      0,
    ),
    west: createPatch(
      stripSize,
      INNER_SIZE,
      config.radialSegments,
      config.innerSegments,
      -stripOffset,
      0,
    ),
  };
}


function createDampeningMap() {
  const terrain = getSharedTerrainHeightfield();
  const size = terrain.pointsPerAxis;
  const data = new Uint8Array(size * size * 4);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const terrainHeight =
        terrain.heights[row * size + column];
      const dampening =
        terrainHeight > -10
          ? Math.max(0, Math.min(1, -terrainHeight / 10))
          : 1;
      const offset = (row * size + column) * 4;
      data[offset] = Math.round(dampening * 255);
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }
  }

  const texture = new DataTexture(
    data,
    size,
    size,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createWakeFallback() {
  const texture = new DataTexture(
    new Uint8Array([0, 0, 0, 255]),
    1,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export const getWaveData = () => {
  const { windSpeed, windDir } = useSimStore.getState();
  const normalizedWindDir = normalizeHeadingDegrees(windDir);
  const windHeadingChanged =
    !Number.isFinite(cachedWindDir) ||
    Math.abs(
      normalizeSignedHeadingDeltaDegrees(
        normalizedWindDir - cachedWindDir,
      ),
    ) >= 0.001;

  if (
    Math.abs(windSpeed - cachedWindSpeed) < 0.001 &&
    !windHeadingChanged
  ) {
    return CACHED_WAVES;
  }

  cachedWindSpeed = windSpeed;
  cachedWindDir = normalizedWindDir;
  let stormFactor = Math.max(0.1, windSpeed / 8);
  let rogueWaveBoost = 0;

  if (windSpeed > 35) {
    rogueWaveBoost = (windSpeed - 35) * 0.2;
    stormFactor += rogueWaveBoost;
  }

  const steepness = Math.min(stormFactor, 1.8);
  const waveScale = 1 + stormFactor * 1.2 + rogueWaveBoost * 1.5;
  const directionRotationDeg = normalizeSignedHeadingDeltaDegrees(
    normalizedWindDir - REFERENCE_WAVE_WIND_HEADING_DEG,
  );

  for (let index = 0; index < BASE_WAVES.length; index += 1) {
    const baseWave = BASE_WAVES[index];
    const wave = CACHED_WAVES[index];
    const direction = rotateWorldDirection(
      baseWave.x,
      baseWave.y,
      directionRotationDeg,
    );
    wave.x = direction.x;
    wave.y = direction.z;
  }

  CACHED_WAVES[0].z = BASE_WAVES[0].z * steepness;
  CACHED_WAVES[0].w = BASE_WAVES[0].w * waveScale;
  CACHED_WAVES[1].z = BASE_WAVES[1].z * steepness;
  CACHED_WAVES[1].w = BASE_WAVES[1].w * waveScale;
  CACHED_WAVES[2].z = BASE_WAVES[2].z * steepness;
  CACHED_WAVES[2].w =
    BASE_WAVES[2].w + stormFactor * 2 + rogueWaveBoost;
  CACHED_WAVES[3].z = BASE_WAVES[3].z * steepness;
  CACHED_WAVES[3].w =
    BASE_WAVES[3].w + stormFactor + rogueWaveBoost;

  return CACHED_WAVES;
};

export const sampleOceanSurface = (
  x: number,
  z: number,
  time: number,
  target: WaterSurfaceSample,
): WaterSurfaceSample => {
  const terrainHeight = sampleTerrainHeightfield(x, z);
  let dampening =
    terrainHeight > -10
      ? Math.max(0, Math.min(1, -terrainHeight / 10))
      : 1;

  const winter = Math.max(
    0,
    Math.min(1, 1 - Math.abs(sharedPhysics.season - 0.75) * 4),
  );
  const iceNoise =
    Math.sin(x * 0.01) * Math.cos(z * 0.01) +
    Math.sin(x * 0.05 + z * 0.04) * 0.5;
  const ice = Math.max(
    0,
    Math.min(1, (iceNoise * 0.3 + winter * 1.5 - 1) * 2),
  );
  dampening *= 1 - ice * 0.95;

  return sampleGerstnerSurface(
    getWaveData(),
    x,
    z,
    time,
    {
      baseHeightM: OCEAN_HEIGHT,
      dampening,
      vortexX: sharedPhysics.whirlpoolPos.x,
      vortexZ: sharedPhysics.whirlpoolPos.z,
      vortexRadiusM: 160,
      vortexDepthM: 80,
    },
    target,
  );
};

export default function Ocean() {
  const groupRef = useRef<Group>(null);
  const renderQuality = useSimStore((state) => state.renderQuality);
  const qualityConfig = QUALITY_CONFIG[renderQuality];

  const dampeningMap = useMemo(() => createDampeningMap(), []);
  const fallbackWakeTexture = useMemo(() => createWakeFallback(), []);
  const geometries = useMemo(
    () => createOceanGeometry(qualityConfig),
    [qualityConfig],
  );

  const colorCache = useMemo(
    () => ({
      calmBase: new Color('#021a28'),
      stormBase: new Color('#010508'),
      calmShallow: new Color('#0d6b7a'),
      stormShallow: new Color('#05252b'),
      workingBase: new Color(),
      workingShallow: new Color(),
    }),
    [],
  );

  const material = useMemo(() => {
    const waves = getWaveData();
    const uniforms = UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSeason: { value: 0 },
        uDetailLevel: { value: 1 },
        uWaves: {
          value: waves.map(
            (wave) => new Vector4(wave.x, wave.y, wave.z, wave.w),
          ),
        },
        tDampening: { value: dampeningMap },
        tWake: { value: fallbackWakeTexture },
        uWakeOrigin: { value: new Vector2() },
        uWakeWorldSize: { value: 1 },
        uWakeEnabled: { value: 0 },
        uBaseColor: { value: new Color('#021a28') },
        uShallowColor: { value: new Color('#0d6b7a') },
        uWhirlpoolPos: { value: new Vector3() },
        uLightningFlash: { value: 0 },
      },
    ]);

    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      fog: true,
    });
  }, [dampeningMap, fallbackWakeTexture]);

  useEffect(
    () => () => {
      dampeningMap.dispose();
      fallbackWakeTexture.dispose();
      material.dispose();
    },
    [dampeningMap, fallbackWakeTexture, material],
  );

  useEffect(
    () => () => {
      for (const geometry of Object.values(geometries)) {
        geometry.dispose();
      }
    },
    [geometries],
  );

  useFrame((state) => {
    const uniforms = material.uniforms;
    const store = useSimStore.getState();

    uniforms.uTime.value = sharedPhysics.renderTime;
    uniforms.uSeason.value = sharedPhysics.season;
    uniforms.uDetailLevel.value = QUALITY_CONFIG[store.renderQuality].detail;
    uniforms.uWhirlpoolPos.value.copy(sharedPhysics.whirlpoolPos);
    uniforms.uLightningFlash.value = sharedPhysics.lightningFlash;

    if (sharedWakeField.texture) {
      uniforms.tWake.value = sharedWakeField.texture;
      uniforms.uWakeOrigin.value.copy(sharedWakeField.origin);
      uniforms.uWakeWorldSize.value = sharedWakeField.worldSize;
      uniforms.uWakeEnabled.value = 1;
    } else {
      uniforms.tWake.value = fallbackWakeTexture;
      uniforms.uWakeEnabled.value = 0;
    }

    const waves = getWaveData();
    for (let index = 0; index < waves.length; index += 1) {
      uniforms.uWaves.value[index].set(
        waves[index].x,
        waves[index].y,
        waves[index].z,
        waves[index].w,
      );
    }

    const storm = MathUtils.clamp((store.windSpeed - 15) / 35, 0, 1);
    uniforms.uBaseColor.value.copy(
      colorCache.workingBase
        .copy(colorCache.calmBase)
        .lerp(colorCache.stormBase, storm),
    );
    uniforms.uShallowColor.value.copy(
      colorCache.workingShallow
        .copy(colorCache.calmShallow)
        .lerp(colorCache.stormShallow, storm),
    );

    if (groupRef.current) {
      const snap = 8;
      groupRef.current.position.set(
        Math.round(state.camera.position.x / snap) * snap,
        OCEAN_HEIGHT,
        Math.round(state.camera.position.z / snap) * snap,
      );
    }
  });

  return (
    <group ref={groupRef}>
      <mesh
        geometry={geometries.inner}
        material={material}
        frustumCulled={false}
      />
      <mesh
        geometry={geometries.north}
        material={material}
        frustumCulled={false}
      />
      <mesh
        geometry={geometries.south}
        material={material}
        frustumCulled={false}
      />
      <mesh
        geometry={geometries.east}
        material={material}
        frustumCulled={false}
      />
      <mesh
        geometry={geometries.west}
        material={material}
        frustumCulled={false}
      />
    </group>
  );
}
