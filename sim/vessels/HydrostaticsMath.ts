import type { VesselConfig } from '@/sim/vessels/VesselConfig';

const EPSILON = 1e-8;
const GRAVITY_MPS2 = 9.81;

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function immersionFraction(
  depthM: number,
  maxImmersionDepthM: number,
) {
  const safeDepth = Number.isFinite(depthM) ? Math.max(0, depthM) : 0;
  const safeMaximum = Math.max(
    EPSILON,
    Number.isFinite(maxImmersionDepthM) ? maxImmersionDepthM : 0,
  );
  return clamp01(safeDepth / safeMaximum);
}

/**
 * Browser-scale sectional displacement model. Each hydrostatic cell is a
 * vertical volume column whose submerged volume grows with immersion. An
 * exponent above one approximates a V-shaped lower section while retaining an
 * analytic, allocation-free calculation at 60 Hz.
 */
export function displacedColumnVolumeM3(
  waterplaneAreaM2: number,
  depthM: number,
  maxImmersionDepthM: number,
  volumeExponent: number,
  buoyancyAvailability = 1,
) {
  const areaM2 = Math.max(
    0,
    Number.isFinite(waterplaneAreaM2) ? waterplaneAreaM2 : 0,
  );
  const maximumDepthM = Math.max(
    EPSILON,
    Number.isFinite(maxImmersionDepthM) ? maxImmersionDepthM : 0,
  );
  const exponent = Math.max(
    0.5,
    Number.isFinite(volumeExponent) ? volumeExponent : 1,
  );
  const immersion = immersionFraction(depthM, maximumDepthM);
  return (
    areaM2 *
    maximumDepthM *
    Math.pow(immersion, exponent) *
    clamp01(buoyancyAvailability)
  );
}

/** Centroid height above a cell's lower reference for V(h) proportional h^p. */
export function displacedColumnCentroidDepthM(
  depthM: number,
  maxImmersionDepthM: number,
  volumeExponent: number,
) {
  const wetDepthM = Math.min(
    Math.max(0, Number.isFinite(depthM) ? depthM : 0),
    Math.max(0, maxImmersionDepthM),
  );
  const exponent = Math.max(
    0.5,
    Number.isFinite(volumeExponent) ? volumeExponent : 1,
  );
  return wetDepthM * (exponent / (exponent + 1));
}

export function hydrodynamicDampingForceN(
  velocityMps: number,
  linearNPerMps: number,
  quadraticNPerMps2: number,
) {
  const velocity = Number.isFinite(velocityMps) ? velocityMps : 0;
  const linear = Math.max(
    0,
    Number.isFinite(linearNPerMps) ? linearNPerMps : 0,
  );
  const quadratic = Math.max(
    0,
    Number.isFinite(quadraticNPerMps2) ? quadraticNPerMps2 : 0,
  );
  return -velocity * (linear + quadratic * Math.abs(velocity));
}

export function dampingPowerW(
  velocityMps: number,
  linearNPerMps: number,
  quadraticNPerMps2: number,
) {
  return (
    hydrodynamicDampingForceN(
      velocityMps,
      linearNPerMps,
      quadraticNPerMps2,
    ) * velocityMps
  );
}

export function slamForceN({
  waterDensityKgM3,
  slamAreaM2,
  relativeEntrySpeedMps,
  wettingRatePerSecond,
  deadriseDeg,
  slamCoefficient,
  maximumForceN,
}: {
  waterDensityKgM3: number;
  slamAreaM2: number;
  relativeEntrySpeedMps: number;
  wettingRatePerSecond: number;
  deadriseDeg: number;
  slamCoefficient: number;
  maximumForceN: number;
}) {
  const entrySpeedMps = Math.max(
    0,
    Number.isFinite(relativeEntrySpeedMps)
      ? relativeEntrySpeedMps
      : 0,
  );
  const wettingFactor = clamp01(
    (Number.isFinite(wettingRatePerSecond)
      ? wettingRatePerSecond
      : 0) / 5,
  );
  const deadriseRadians =
    (Math.max(0, Math.min(80, deadriseDeg)) * Math.PI) / 180;
  const deadriseFactor = Math.max(
    0.12,
    Math.cos(deadriseRadians) ** 2,
  );
  const forceN =
    0.5 *
    Math.max(0, waterDensityKgM3) *
    Math.max(0, slamAreaM2) *
    entrySpeedMps *
    entrySpeedMps *
    Math.max(0, slamCoefficient) *
    wettingFactor *
    deadriseFactor;
  return Math.min(
    Math.max(0, Number.isFinite(maximumForceN) ? maximumForceN : 0),
    forceN,
  );
}

export function estimateHydrostaticRestingOriginY(
  vessel: VesselConfig,
  supportedMassKg = vessel.massKg,
  flatWaterHeightM = -1,
) {
  const targetVolumeM3 =
    Math.max(0, supportedMassKg) /
    Math.max(EPSILON, vessel.waterDensityKgM3);
  let lowerY = flatWaterHeightM - 4;
  let upperY = flatWaterHeightM + 2;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const originY = (lowerY + upperY) * 0.5;
    let displacedVolumeM3 = 0;

    for (const cell of vessel.hydrostaticCells) {
      const lowerReferenceY =
        originY + cell.localPosition[1] + vessel.baseDraftM;
      const depthM = flatWaterHeightM - lowerReferenceY;
      displacedVolumeM3 += displacedColumnVolumeM3(
        cell.waterplaneAreaM2,
        depthM,
        cell.maxImmersionDepthM,
        cell.volumeExponent,
      );
    }

    if (displacedVolumeM3 > targetVolumeM3) {
      lowerY = originY;
    } else {
      upperY = originY;
    }
  }

  return (lowerY + upperY) * 0.5;
}

export function displacementBalanceErrorRatio(
  displacedVolumeM3: number,
  supportedMassKg: number,
  waterDensityKgM3: number,
) {
  const targetMassKg =
    Math.max(0, displacedVolumeM3) * Math.max(EPSILON, waterDensityKgM3);
  return (
    Math.abs(targetMassKg - Math.max(0, supportedMassKg)) /
    Math.max(1, supportedMassKg)
  );
}

export function hydrostaticForceN(
  displacedVolumeM3: number,
  waterDensityKgM3: number,
) {
  return (
    Math.max(0, displacedVolumeM3) *
    Math.max(0, waterDensityKgM3) *
    GRAVITY_MPS2
  );
}
