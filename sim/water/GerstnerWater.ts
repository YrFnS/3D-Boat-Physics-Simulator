import type { WaterSurfaceSample } from '@/sim/water/WaterSurface';

const GRAVITY_MPS2 = 9.8;
const EPSILON = 1e-8;

export interface GerstnerWaveDefinition {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface GerstnerSurfaceOptions {
  baseHeightM: number;
  dampening: number;
  vortexX: number;
  vortexZ: number;
  vortexRadiusM?: number;
  vortexDepthM?: number;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number, edge0: number, edge1: number) {
  const range = Math.max(EPSILON, edge1 - edge0);
  const normalized = clamp01((value - edge0) / range);
  return normalized * normalized * (3 - 2 * normalized);
}

function normalize3(x: number, y: number, z: number) {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= EPSILON) {
    return [0, 1, 0] as const;
  }
  return [x / length, y / length, z / length] as const;
}

/**
 * Samples the same four-wave Gerstner surface used by the ocean shader.
 * Horizontal displacement is inverted so the result describes the surface at
 * the requested world-space x/z coordinate instead of at the undisplaced
 * material vertex. Analytic time derivatives provide local orbital velocity
 * and acceleration for hydrodynamic relative-velocity calculations.
 */
export function sampleGerstnerSurface(
  waves: readonly GerstnerWaveDefinition[],
  x: number,
  z: number,
  timeSeconds: number,
  options: GerstnerSurfaceOptions,
  target: WaterSurfaceSample,
) {
  let restingX = x;
  let restingZ = z;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    let offsetX = 0;
    let offsetZ = 0;

    for (const wave of waves) {
      const waveNumber = (2 * Math.PI) / Math.max(EPSILON, wave.w);
      const phaseSpeed = Math.sqrt(GRAVITY_MPS2 / waveNumber);
      const phase =
        waveNumber *
        (wave.x * restingX + wave.y * restingZ - phaseSpeed * timeSeconds);
      const amplitude = wave.z / waveNumber;
      const cosine = Math.cos(phase);
      offsetX += wave.x * amplitude * cosine * 0.4;
      offsetZ += wave.y * amplitude * cosine * 0.4;
    }

    restingX = x - offsetX;
    restingZ = z - offsetZ;
  }

  let offsetY = 0;
  let velocityX = 0;
  let velocityY = 0;
  let velocityZ = 0;
  let accelerationX = 0;
  let accelerationY = 0;
  let accelerationZ = 0;

  let tangentX = 1;
  let tangentY = 0;
  let tangentZ = 0;
  let binormalX = 0;
  let binormalY = 0;
  let binormalZ = 1;

  for (const wave of waves) {
    const waveNumber = (2 * Math.PI) / Math.max(EPSILON, wave.w);
    const phaseSpeed = Math.sqrt(GRAVITY_MPS2 / waveNumber);
    const phase =
      waveNumber *
      (wave.x * restingX + wave.y * restingZ - phaseSpeed * timeSeconds);
    const amplitude = wave.z / waveNumber;
    const sine = Math.sin(phase);
    const cosine = Math.cos(phase);
    const steepnessAmplitude = waveNumber * amplitude;

    offsetY += amplitude * sine;

    tangentX +=
      -wave.x * wave.x * steepnessAmplitude * sine;
    tangentY += wave.x * steepnessAmplitude * cosine;
    tangentZ +=
      -wave.x * wave.y * steepnessAmplitude * sine;
    binormalX +=
      -wave.x * wave.y * steepnessAmplitude * sine;
    binormalY += wave.y * steepnessAmplitude * cosine;
    binormalZ +=
      -wave.y * wave.y * steepnessAmplitude * sine;

    velocityX += wave.x * wave.z * phaseSpeed * sine * 0.4;
    velocityY += -wave.z * phaseSpeed * cosine;
    velocityZ += wave.y * wave.z * phaseSpeed * sine * 0.4;

    accelerationX += -wave.x * wave.z * GRAVITY_MPS2 * cosine * 0.4;
    accelerationY += -wave.z * GRAVITY_MPS2 * sine;
    accelerationZ += -wave.y * wave.z * GRAVITY_MPS2 * cosine * 0.4;
  }

  const safeDampening = clamp01(options.dampening);
  const vortexRadiusM = Math.max(EPSILON, options.vortexRadiusM ?? 160);
  const vortexDepthM = Math.max(0, options.vortexDepthM ?? 80);
  const vortexDeltaX = x - options.vortexX;
  const vortexDeltaZ = z - options.vortexZ;
  const vortexDistanceM = Math.hypot(vortexDeltaX, vortexDeltaZ);
  const vortex =
    vortexDistanceM < vortexRadiusM
      ? 1 - smoothstep(vortexDistanceM, 0, vortexRadiusM)
      : 0;
  const waveScale =
    safeDampening * (1 - Math.pow(vortex, 1.5));

  const rawNormalX =
    binormalY * tangentZ - binormalZ * tangentY;
  const rawNormalY =
    binormalZ * tangentX - binormalX * tangentZ;
  const rawNormalZ =
    binormalX * tangentY - binormalY * tangentX;
  const [surfaceNormalX, surfaceNormalY, surfaceNormalZ] = normalize3(
    rawNormalX,
    rawNormalY,
    rawNormalZ,
  );
  let [normalX, normalY, normalZ] = normalize3(
    surfaceNormalX * safeDampening,
    1 + (surfaceNormalY - 1) * safeDampening,
    surfaceNormalZ * safeDampening,
  );

  if (vortex > 0.001) {
    const inverseDistance = 1 / Math.max(EPSILON, vortexDistanceM);
    const directionX = vortexDeltaX * inverseDistance;
    const directionZ = vortexDeltaZ * inverseDistance;
    const vortexSlope = 1.5 * vortex * vortex;
    const [vortexNormalX, vortexNormalY, vortexNormalZ] = normalize3(
      directionX * vortexSlope,
      1,
      directionZ * vortexSlope,
    );
    const blend = vortex * safeDampening;
    [normalX, normalY, normalZ] = normalize3(
      normalX + (vortexNormalX - normalX) * blend,
      normalY + (vortexNormalY - normalY) * blend,
      normalZ + (vortexNormalZ - normalZ) * blend,
    );
  }

  target.x = x;
  target.y =
    options.baseHeightM +
    offsetY * waveScale -
    Math.pow(vortex, 3) * vortexDepthM * safeDampening;
  target.z = z;
  target.normalX = normalX;
  target.normalY = normalY;
  target.normalZ = normalZ;
  target.velocityX = velocityX * waveScale;
  target.velocityY = velocityY * waveScale;
  target.velocityZ = velocityZ * waveScale;
  target.accelerationX = accelerationX * waveScale;
  target.accelerationY = accelerationY * waveScale;
  target.accelerationZ = accelerationZ * waveScale;
  return target;
}
