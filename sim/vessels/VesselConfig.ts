import type { BoatType } from '@/store/useSimStore';

export interface VesselConfig {
  type: BoatType;
  massKg: number;
  principalInertiaKgM2: readonly [number, number, number];
  angularDampingPerSecond: readonly [number, number, number];
  centerOfMassLocal: readonly [number, number, number];
  engineForceMaxN: number;
  forwardDragCoefficient: number;
  keelDragMultiplier: number;
  windAreaCoefficient: number;
  sideAreaMultiplier: number;
  turnForceMax: number;
  angularDragCoefficient: number;
  halfLengthM: number;
  halfWidthM: number;
  baseDraftM: number;
  deepestDraftM: number;
  buoyancyStiffness: number;
  verticalDamping: number;
  idleRpm: number;
  maxRpmDelta: number;
  maxRudderAngleRad: number;
  rotationResponse: number;
  planingCapable: boolean;
  planingReferenceSpeedMps: number;
  propellerPointLocal: readonly [number, number, number];
  rudderPointLocal: readonly [number, number, number];
  windPointLocal: readonly [number, number, number];
}

const VESSEL_CONFIGS = {
  trawler: {
    type: 'trawler',
    massKg: 1_500,
    // Box-derived starting values, tuned to keep the heavier trawler stable
    // while still allowing visible pitch, roll, and yaw response.
    principalInertiaKgM2: [3_300, 3_800, 1_050],
    angularDampingPerSecond: [3.8, 2.8, 4.2],
    centerOfMassLocal: [0, -0.15, 0.2],
    engineForceMaxN: 12_000,
    forwardDragCoefficient: 250,
    keelDragMultiplier: 6,
    windAreaCoefficient: 15,
    sideAreaMultiplier: 4.5,
    turnForceMax: 1.5,
    angularDragCoefficient: 4,
    halfLengthM: 2,
    halfWidthM: 1,
    baseDraftM: -0.8,
    deepestDraftM: 0.6,
    buoyancyStiffness: 35,
    verticalDamping: 8,
    idleRpm: 1_000,
    maxRpmDelta: 3_500,
    maxRudderAngleRad: 0.8,
    rotationResponse: 3,
    planingCapable: false,
    planingReferenceSpeedMps: 15,
    propellerPointLocal: [0, -0.45, 2.25],
    rudderPointLocal: [0, -0.35, 2.1],
    windPointLocal: [0, 1.65, 0.7],
  },
  speedboat: {
    type: 'speedboat',
    massKg: 800,
    principalInertiaKgM2: [1_150, 1_250, 250],
    angularDampingPerSecond: [3.2, 2.2, 3.6],
    centerOfMassLocal: [0, -0.1, 0.35],
    engineForceMaxN: 25_000,
    forwardDragCoefficient: 180,
    keelDragMultiplier: 3,
    windAreaCoefficient: 5,
    sideAreaMultiplier: 2,
    turnForceMax: 3.5,
    angularDragCoefficient: 3,
    halfLengthM: 1.6,
    halfWidthM: 0.6,
    baseDraftM: -0.4,
    deepestDraftM: 0.3,
    buoyancyStiffness: 40,
    verticalDamping: 6,
    idleRpm: 1_000,
    maxRpmDelta: 6_000,
    maxRudderAngleRad: 0.7,
    rotationResponse: 5,
    planingCapable: true,
    planingReferenceSpeedMps: 15,
    propellerPointLocal: [0, -0.35, 1.95],
    rudderPointLocal: [0, -0.3, 1.8],
    windPointLocal: [0, 0.85, 0.35],
  },
} as const satisfies Readonly<Record<BoatType, VesselConfig>>;

export function getVesselConfig(type: BoatType) {
  return VESSEL_CONFIGS[type];
}
