import type { BoatType } from '@/store/useSimStore';

export interface VesselConfig {
  type: BoatType;
  massKg: number;
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
}

const VESSEL_CONFIGS: Readonly<Record<BoatType, Readonly<VesselConfig>>> = {
  trawler: Object.freeze({
    type: 'trawler',
    massKg: 1_500,
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
  }),
  speedboat: Object.freeze({
    type: 'speedboat',
    massKg: 800,
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
  }),
};

export function getVesselConfig(type: BoatType) {
  return VESSEL_CONFIGS[type];
}
