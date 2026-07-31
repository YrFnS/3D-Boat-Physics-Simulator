import type { BoatType } from '@/store/useSimStore';

export interface HullForcePoint {
  localPosition: readonly [number, number, number];
  weight: number;
}

export interface VesselConfig {
  type: BoatType;
  massKg: number;
  principalInertiaKgM2: readonly [number, number, number];
  angularDampingPerSecond: readonly [number, number, number];
  centerOfMassLocal: readonly [number, number, number];
  maxAngularSpeedRadPerSecond: number;
  engineForceMaxN: number;
  forwardDragCoefficient: number;
  keelDragMultiplier: number;
  dragApplicationDepthM: number;
  maxLateralDragAccelerationMps2: number;
  windAreaCoefficient: number;
  sideAreaMultiplier: number;
  turnForceMax: number;
  halfLengthM: number;
  halfWidthM: number;
  baseDraftM: number;
  deepestDraftM: number;
  buoyancyStiffness: number;
  verticalDamping: number;
  buoyancyActivationDepthM: number;
  submersionResponsePerM: number;
  maxBuoyancyAccelerationMps2: number;
  hullForcePoints: readonly HullForcePoint[];
  idleRpm: number;
  maxRpmDelta: number;
  maxRudderAngleRad: number;
  planingCapable: boolean;
  planingReferenceSpeedMps: number;
  propellerPointLocal: readonly [number, number, number];
  rudderPointLocal: readonly [number, number, number];
  windPointLocal: readonly [number, number, number];
}

interface HullStation {
  longitudinalFraction: number;
  beamFraction: number;
  verticalOffsetM: number;
  weight: number;
}

const TRANSVERSE_DISTRIBUTION = [
  { fraction: -1, weight: 0.28 },
  { fraction: 0, weight: 0.44 },
  { fraction: 1, weight: 0.28 },
] as const;

function createHullForcePoints(
  halfLengthM: number,
  halfWidthM: number,
  stations: readonly HullStation[],
): readonly HullForcePoint[] {
  const stationWeightTotal = stations.reduce(
    (total, station) => total + Math.max(0, station.weight),
    0,
  );
  const stationNormalizer = stationWeightTotal > 0 ? 1 / stationWeightTotal : 0;
  const points: HullForcePoint[] = [];

  for (const station of stations) {
    const normalizedStationWeight =
      Math.max(0, station.weight) * stationNormalizer;

    for (const transverse of TRANSVERSE_DISTRIBUTION) {
      points.push({
        localPosition: [
          halfWidthM * station.beamFraction * transverse.fraction,
          station.verticalOffsetM,
          halfLengthM * station.longitudinalFraction,
        ],
        weight: normalizedStationWeight * transverse.weight,
      });
    }
  }

  return points;
}

const TRAWLER_HALF_LENGTH_M = 2;
const TRAWLER_HALF_WIDTH_M = 1;
const SPEEDBOAT_HALF_LENGTH_M = 1.6;
const SPEEDBOAT_HALF_WIDTH_M = 0.6;

const VESSEL_CONFIGS = {
  trawler: {
    type: 'trawler',
    massKg: 1_500,
    principalInertiaKgM2: [3_300, 3_800, 1_050],
    angularDampingPerSecond: [3.8, 2.8, 4.2],
    centerOfMassLocal: [0, -0.15, 0.2],
    maxAngularSpeedRadPerSecond: 3.5,
    engineForceMaxN: 12_000,
    forwardDragCoefficient: 250,
    keelDragMultiplier: 6,
    dragApplicationDepthM: 0,
    maxLateralDragAccelerationMps2: 40,
    windAreaCoefficient: 15,
    sideAreaMultiplier: 4.5,
    turnForceMax: 1.5,
    halfLengthM: TRAWLER_HALF_LENGTH_M,
    halfWidthM: TRAWLER_HALF_WIDTH_M,
    baseDraftM: -0.8,
    deepestDraftM: 0.6,
    buoyancyStiffness: 35,
    verticalDamping: 8,
    buoyancyActivationDepthM: 0.8,
    submersionResponsePerM: 1.5,
    maxBuoyancyAccelerationMps2: 38,
    hullForcePoints: createHullForcePoints(
      TRAWLER_HALF_LENGTH_M,
      TRAWLER_HALF_WIDTH_M,
      [
        {
          longitudinalFraction: -0.9,
          beamFraction: 0.5,
          verticalOffsetM: 0.12,
          weight: 0.14,
        },
        {
          longitudinalFraction: -0.35,
          beamFraction: 0.95,
          verticalOffsetM: 0.02,
          weight: 0.28,
        },
        {
          longitudinalFraction: 0.35,
          beamFraction: 1,
          verticalOffsetM: 0,
          weight: 0.34,
        },
        {
          longitudinalFraction: 0.88,
          beamFraction: 0.62,
          verticalOffsetM: 0.08,
          weight: 0.24,
        },
      ],
    ),
    idleRpm: 1_000,
    maxRpmDelta: 3_500,
    maxRudderAngleRad: 0.8,
    planingCapable: false,
    planingReferenceSpeedMps: 15,
    propellerPointLocal: [0, -0.45, 2.25],
    rudderPointLocal: [0, -0.35, 2.1],
    windPointLocal: [0, 1.65, 0.7],
  },
  speedboat: {
    type: 'speedboat',
    massKg: 800,
    principalInertiaKgM2: [1_600, 2_400, 900],
    angularDampingPerSecond: [4.6, 4.2, 7.2],
    centerOfMassLocal: [0, -0.1, 0.35],
    maxAngularSpeedRadPerSecond: 2.2,
    engineForceMaxN: 25_000,
    forwardDragCoefficient: 180,
    keelDragMultiplier: 3,
    dragApplicationDepthM: 0.35,
    maxLateralDragAccelerationMps2: 14,
    windAreaCoefficient: 5,
    sideAreaMultiplier: 2,
    turnForceMax: 1.7,
    halfLengthM: SPEEDBOAT_HALF_LENGTH_M,
    halfWidthM: SPEEDBOAT_HALF_WIDTH_M,
    baseDraftM: -0.4,
    deepestDraftM: 0.3,
    buoyancyStiffness: 40,
    verticalDamping: 6,
    buoyancyActivationDepthM: 0.7,
    submersionResponsePerM: 1.7,
    maxBuoyancyAccelerationMps2: 45,
    hullForcePoints: createHullForcePoints(
      SPEEDBOAT_HALF_LENGTH_M,
      SPEEDBOAT_HALF_WIDTH_M,
      [
        {
          longitudinalFraction: -0.92,
          beamFraction: 0.35,
          verticalOffsetM: 0.18,
          weight: 0.12,
        },
        {
          longitudinalFraction: -0.35,
          beamFraction: 0.85,
          verticalOffsetM: 0.05,
          weight: 0.28,
        },
        {
          longitudinalFraction: 0.3,
          beamFraction: 1,
          verticalOffsetM: 0,
          weight: 0.38,
        },
        {
          longitudinalFraction: 0.9,
          beamFraction: 0.55,
          verticalOffsetM: 0.1,
          weight: 0.22,
        },
      ],
    ),
    idleRpm: 1_000,
    maxRpmDelta: 6_000,
    maxRudderAngleRad: 0.55,
    planingCapable: true,
    planingReferenceSpeedMps: 15,
    propellerPointLocal: [0, -0.35, 1.95],
    rudderPointLocal: [0, -0.15, 1.8],
    windPointLocal: [0, 0.85, 0.35],
  },
} as const satisfies Readonly<Record<BoatType, VesselConfig>>;

export function getVesselConfig(type: BoatType): VesselConfig {
  return VESSEL_CONFIGS[type];
}
