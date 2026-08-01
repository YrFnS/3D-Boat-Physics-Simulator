export type VesselType = 'trawler' | 'speedboat';

export interface HydrostaticHullCell {
  id: string;
  compartmentId: string;
  localPosition: readonly [number, number, number];
  weight: number;
  waterplaneAreaM2: number;
  maxImmersionDepthM: number;
  volumeExponent: number;
  heaveLinearDampingNPerMps: number;
  heaveQuadraticDampingNPerMps2: number;
  slamAreaM2: number;
  deadriseDeg: number;
  slamCoefficient: number;
}

export interface HydrodynamicCoefficients {
  /** Local x/y/z correspond to sway, heave, and surge. */
  addedMassKg: readonly [number, number, number];
  /** Local x/y/z correspond to roll, yaw, and pitch inertia. */
  addedInertiaKgM2: readonly [number, number, number];
  linearDampingNPerMps: readonly [number, number, number];
  quadraticDampingNPerMps2: readonly [number, number, number];
  angularLinearDampingNmPerRadPerSecond:
    readonly [number, number, number];
  angularQuadraticDampingNmPerRad2PerSecond2:
    readonly [number, number, number];
}

export interface FloodCompartmentConfig {
  id: string;
  label: string;
  localPosition: readonly [number, number, number];
  capacityM3: number;
  leakAreaM2: number;
  damageThreshold: number;
  susceptibility: number;
  retainedMassFraction: number;
  buoyancyLossFraction: number;
  passivePumpRateM3PerSecond: number;
  activePumpRateM3PerSecond: number;
}

export interface WinterLoadConfig {
  maximumMassKg: number;
  localPosition: readonly [number, number, number];
}

export interface MarineEngineConfig {
  idleRpm: number;
  ratedRpm: number;
  maximumRpm: number;
  ratedPowerW: number;
  peakTorqueNm: number;
  rpmRisePerSecond: number;
  rpmFallPerSecond: number;
  loadDroopFraction: number;
  unloadedOverRevFraction: number;
  gearRatioAhead: number;
  gearRatioAstern: number;
  drivelineEfficiency: number;
  reversePowerFraction: number;
  throttleDeadband: number;
}

export interface PropellerConfig {
  pointLocal: readonly [number, number, number];
  diameterM: number;
  pitchRatio: number;
  bladeCount: number;
  expandedAreaRatio: number;
  wakeFraction: number;
  thrustDeductionFraction: number;
  rotationDirection: -1 | 1;
  hullReactionTorqueFraction: number;
  thrustCoefficient: readonly [number, number, number];
  torqueCoefficient: readonly [number, number, number];
  maximumAbsAdvanceRatio: number;
  maximumThrustCoefficient: number;
  maximumReverseThrustCoefficient: number;
  minimumTorqueCoefficient: number;
  maximumTorqueCoefficient: number;
  maximumThrustN: number;
  cavitationTipSpeedMps: number;
  cavitationReferenceSpeedMps: number;
  cavitationLoadingThreshold: number;
  minimumCavitationFactor: number;
  ventilationStartSubmergenceM: number;
  ventilationFullSubmergenceM: number;
  minimumVentilationFactor: number;
  propWashGain: number;
}

export interface RudderConfig {
  pointLocal: readonly [number, number, number];
  maximumAngleRad: number;
  rateRadPerSecond: number;
  areaM2: number;
  aspectRatio: number;
  liftSlopePerRad: number;
  maximumLiftCoefficient: number;
  stallAngleRad: number;
  postStallLiftLossFraction: number;
  baseDragCoefficient: number;
  inducedDragFactor: number;
  stallDragCoefficient: number;
  maximumDragCoefficient: number;
  maximumForceN: number;
  propWashFraction: number;
  ventilationStartSubmergenceM: number;
  ventilationFullSubmergenceM: number;
  minimumVentilationFactor: number;
}

export interface VesselConfig {
  type: VesselType;
  massKg: number;
  principalInertiaKgM2: readonly [number, number, number];
  angularDampingPerSecond: readonly [number, number, number];
  centerOfMassLocal: readonly [number, number, number];
  maxAngularSpeedRadPerSecond: number;
  engine: MarineEngineConfig;
  propeller: PropellerConfig;
  rudder: RudderConfig;
  windAreaCoefficient: number;
  sideAreaMultiplier: number;
  halfLengthM: number;
  halfWidthM: number;
  baseDraftM: number;
  deepestDraftM: number;
  waterDensityKgM3: number;
  hydrostaticCells: readonly HydrostaticHullCell[];
  hydrodynamics: HydrodynamicCoefficients;
  floodCompartments: readonly FloodCompartmentConfig[];
  winterLoad: WinterLoadConfig;
  planingCapable: boolean;
  planingReferenceSpeedMps: number;
  windPointLocal: readonly [number, number, number];
}

interface HullStation {
  id: string;
  longitudinalFraction: number;
  beamFraction: number;
  verticalOffsetM: number;
  weight: number;
  compartmentIds: readonly [string, string, string];
  deadriseDeg: number;
  slamCoefficient: number;
}

const TRANSVERSE_DISTRIBUTION = [
  { suffix: 'port', fraction: -1, weight: 0.28 },
  { suffix: 'center', fraction: 0, weight: 0.44 },
  { suffix: 'starboard', fraction: 1, weight: 0.28 },
] as const;

function createHydrostaticCells(
  halfLengthM: number,
  halfWidthM: number,
  waterplaneAreaM2: number,
  maxImmersionDepthM: number,
  volumeExponent: number,
  totalHeaveLinearDampingNPerMps: number,
  totalHeaveQuadraticDampingNPerMps2: number,
  totalSlamAreaM2: number,
  stations: readonly HullStation[],
): readonly HydrostaticHullCell[] {
  const stationWeightTotal = stations.reduce(
    (total, station) => total + Math.max(0, station.weight),
    0,
  );
  const stationNormalizer = stationWeightTotal > 0 ? 1 / stationWeightTotal : 0;
  const cells: HydrostaticHullCell[] = [];

  for (const station of stations) {
    const normalizedStationWeight =
      Math.max(0, station.weight) * stationNormalizer;

    for (let index = 0; index < TRANSVERSE_DISTRIBUTION.length; index += 1) {
      const transverse = TRANSVERSE_DISTRIBUTION[index];
      const weight = normalizedStationWeight * transverse.weight;
      cells.push({
        id: `${station.id}-${transverse.suffix}`,
        compartmentId: station.compartmentIds[index],
        localPosition: [
          halfWidthM * station.beamFraction * transverse.fraction,
          station.verticalOffsetM,
          halfLengthM * station.longitudinalFraction,
        ],
        weight,
        waterplaneAreaM2: waterplaneAreaM2 * weight,
        maxImmersionDepthM,
        volumeExponent,
        heaveLinearDampingNPerMps:
          totalHeaveLinearDampingNPerMps * weight,
        heaveQuadraticDampingNPerMps2:
          totalHeaveQuadraticDampingNPerMps2 * weight,
        slamAreaM2: totalSlamAreaM2 * weight,
        deadriseDeg: station.deadriseDeg,
        slamCoefficient: station.slamCoefficient,
      });
    }
  }

  return cells;
}

const TRAWLER_HALF_LENGTH_M = 2;
const TRAWLER_HALF_WIDTH_M = 1;
const SPEEDBOAT_HALF_LENGTH_M = 1.6;
const SPEEDBOAT_HALF_WIDTH_M = 0.6;
const SEA_WATER_DENSITY_KG_M3 = 1_025;

const VESSEL_CONFIGS = {
  trawler: {
    type: 'trawler',
    massKg: 1_500,
    principalInertiaKgM2: [3_300, 3_800, 1_050],
    angularDampingPerSecond: [1.15, 0.9, 1.35],
    centerOfMassLocal: [0, -0.15, 0.2],
    maxAngularSpeedRadPerSecond: 3.5,
    engine: {
      idleRpm: 900,
      ratedRpm: 3_600,
      maximumRpm: 4_500,
      ratedPowerW: 180_000,
      peakTorqueNm: 560,
      rpmRisePerSecond: 1_650,
      rpmFallPerSecond: 2_700,
      loadDroopFraction: 0.18,
      unloadedOverRevFraction: 0.6,
      gearRatioAhead: 2.4,
      gearRatioAstern: 2.8,
      drivelineEfficiency: 0.91,
      reversePowerFraction: 0.72,
      throttleDeadband: 0.035,
    },
    propeller: {
      pointLocal: [0, -0.45, 2.25],
      diameterM: 0.65,
      pitchRatio: 0.85,
      bladeCount: 4,
      expandedAreaRatio: 0.62,
      wakeFraction: 0.18,
      thrustDeductionFraction: 0.12,
      rotationDirection: 1,
      hullReactionTorqueFraction: 0.35,
      thrustCoefficient: [0.19, -0.11, -0.02],
      torqueCoefficient: [0.032, -0.015, -0.003],
      maximumAbsAdvanceRatio: 1.65,
      maximumThrustCoefficient: 0.24,
      maximumReverseThrustCoefficient: 0.16,
      minimumTorqueCoefficient: 0.006,
      maximumTorqueCoefficient: 0.04,
      maximumThrustN: 20_000,
      cavitationTipSpeedMps: 54,
      cavitationReferenceSpeedMps: 12,
      cavitationLoadingThreshold: 1.15,
      minimumCavitationFactor: 0.62,
      ventilationStartSubmergenceM: 0.03,
      ventilationFullSubmergenceM: 0.32,
      minimumVentilationFactor: 0.08,
      propWashGain: 0.9,
    },
    rudder: {
      pointLocal: [0, -0.35, 2.1],
      maximumAngleRad: 0.8,
      rateRadPerSecond: 1.8,
      areaM2: 0.42,
      aspectRatio: 1.8,
      liftSlopePerRad: 4.2,
      maximumLiftCoefficient: 1.15,
      stallAngleRad: 0.52,
      postStallLiftLossFraction: 0.62,
      baseDragCoefficient: 0.11,
      inducedDragFactor: 0.13,
      stallDragCoefficient: 0.72,
      maximumDragCoefficient: 1.25,
      maximumForceN: 8_000,
      propWashFraction: 0.72,
      ventilationStartSubmergenceM: 0.02,
      ventilationFullSubmergenceM: 0.28,
      minimumVentilationFactor: 0.05,
    },
    windAreaCoefficient: 15,
    sideAreaMultiplier: 4.5,
    halfLengthM: TRAWLER_HALF_LENGTH_M,
    halfWidthM: TRAWLER_HALF_WIDTH_M,
    baseDraftM: -0.8,
    deepestDraftM: 0.6,
    waterDensityKgM3: SEA_WATER_DENSITY_KG_M3,
    hydrostaticCells: createHydrostaticCells(
      TRAWLER_HALF_LENGTH_M,
      TRAWLER_HALF_WIDTH_M,
      6.15,
      0.82,
      1.08,
      13_500,
      8_500,
      4.4,
      [
        {
          id: 'bow',
          longitudinalFraction: -0.9,
          beamFraction: 0.5,
          verticalOffsetM: 0.12,
          weight: 0.14,
          compartmentIds: ['bow', 'bow', 'bow'],
          deadriseDeg: 28,
          slamCoefficient: 0.78,
        },
        {
          id: 'forward-midship',
          longitudinalFraction: -0.35,
          beamFraction: 0.95,
          verticalOffsetM: 0.02,
          weight: 0.28,
          compartmentIds: ['port', 'center', 'starboard'],
          deadriseDeg: 18,
          slamCoefficient: 0.62,
        },
        {
          id: 'aft-midship',
          longitudinalFraction: 0.35,
          beamFraction: 1,
          verticalOffsetM: 0,
          weight: 0.34,
          compartmentIds: ['port', 'center', 'starboard'],
          deadriseDeg: 14,
          slamCoefficient: 0.54,
        },
        {
          id: 'stern',
          longitudinalFraction: 0.88,
          beamFraction: 0.62,
          verticalOffsetM: 0.08,
          weight: 0.24,
          compartmentIds: ['machinery', 'machinery', 'machinery'],
          deadriseDeg: 10,
          slamCoefficient: 0.46,
        },
      ],
    ),
    hydrodynamics: {
      addedMassKg: [620, 980, 260],
      addedInertiaKgM2: [780, 620, 920],
      linearDampingNPerMps: [1_650, 2_200, 520],
      quadraticDampingNPerMps2: [1_050, 1_350, 240],
      angularLinearDampingNmPerRadPerSecond: [3_200, 2_100, 3_700],
      angularQuadraticDampingNmPerRad2PerSecond2: [1_150, 820, 1_350],
    },
    floodCompartments: [
      {
        id: 'bow',
        label: 'Bow void',
        localPosition: [0, -0.28, -1.55],
        capacityM3: 0.34,
        leakAreaM2: 0.0048,
        damageThreshold: 72,
        susceptibility: 0.9,
        retainedMassFraction: 0.78,
        buoyancyLossFraction: 0.82,
        passivePumpRateM3PerSecond: 0.0018,
        activePumpRateM3PerSecond: 0.018,
      },
      {
        id: 'port',
        label: 'Port hold',
        localPosition: [-0.58, -0.34, 0.05],
        capacityM3: 0.4,
        leakAreaM2: 0.0052,
        damageThreshold: 64,
        susceptibility: 1,
        retainedMassFraction: 0.84,
        buoyancyLossFraction: 0.76,
        passivePumpRateM3PerSecond: 0.0016,
        activePumpRateM3PerSecond: 0.017,
      },
      {
        id: 'center',
        label: 'Center bilge',
        localPosition: [0, -0.48, 0.2],
        capacityM3: 0.48,
        leakAreaM2: 0.0044,
        damageThreshold: 58,
        susceptibility: 0.8,
        retainedMassFraction: 0.9,
        buoyancyLossFraction: 0.7,
        passivePumpRateM3PerSecond: 0.0024,
        activePumpRateM3PerSecond: 0.024,
      },
      {
        id: 'starboard',
        label: 'Starboard hold',
        localPosition: [0.58, -0.34, 0.05],
        capacityM3: 0.4,
        leakAreaM2: 0.0052,
        damageThreshold: 64,
        susceptibility: 1,
        retainedMassFraction: 0.84,
        buoyancyLossFraction: 0.76,
        passivePumpRateM3PerSecond: 0.0016,
        activePumpRateM3PerSecond: 0.017,
      },
      {
        id: 'machinery',
        label: 'Machinery space',
        localPosition: [0, -0.32, 1.45],
        capacityM3: 0.3,
        leakAreaM2: 0.0036,
        damageThreshold: 48,
        susceptibility: 0.72,
        retainedMassFraction: 0.92,
        buoyancyLossFraction: 0.68,
        passivePumpRateM3PerSecond: 0.0012,
        activePumpRateM3PerSecond: 0.015,
      },
    ],
    winterLoad: {
      maximumMassKg: 110,
      localPosition: [0, 1.05, 0.15],
    },
    planingCapable: false,
    planingReferenceSpeedMps: 15,
    windPointLocal: [0, 1.65, 0.7],
  },
  speedboat: {
    type: 'speedboat',
    massKg: 800,
    principalInertiaKgM2: [1_600, 2_400, 1_600],
    angularDampingPerSecond: [1.25, 1.05, 1.8],
    centerOfMassLocal: [0, -0.22, 0.35],
    maxAngularSpeedRadPerSecond: 2,
    engine: {
      idleRpm: 900,
      ratedRpm: 6_200,
      maximumRpm: 7_000,
      ratedPowerW: 360_000,
      peakTorqueNm: 620,
      rpmRisePerSecond: 2_700,
      rpmFallPerSecond: 3_600,
      loadDroopFraction: 0.14,
      unloadedOverRevFraction: 0.72,
      gearRatioAhead: 1.65,
      gearRatioAstern: 1.9,
      drivelineEfficiency: 0.92,
      reversePowerFraction: 0.62,
      throttleDeadband: 0.035,
    },
    propeller: {
      pointLocal: [0, -0.35, 1.95],
      diameterM: 0.48,
      pitchRatio: 1.05,
      bladeCount: 3,
      expandedAreaRatio: 0.68,
      wakeFraction: 0.1,
      thrustDeductionFraction: 0.08,
      rotationDirection: -1,
      hullReactionTorqueFraction: 0.28,
      thrustCoefficient: [0.22, -0.12, -0.025],
      torqueCoefficient: [0.035, -0.016, -0.0035],
      maximumAbsAdvanceRatio: 1.75,
      maximumThrustCoefficient: 0.27,
      maximumReverseThrustCoefficient: 0.18,
      minimumTorqueCoefficient: 0.006,
      maximumTorqueCoefficient: 0.045,
      maximumThrustN: 28_000,
      cavitationTipSpeedMps: 78,
      cavitationReferenceSpeedMps: 22,
      cavitationLoadingThreshold: 1.25,
      minimumCavitationFactor: 0.55,
      ventilationStartSubmergenceM: 0.015,
      ventilationFullSubmergenceM: 0.22,
      minimumVentilationFactor: 0.05,
      propWashGain: 1,
    },
    rudder: {
      pointLocal: [0, -0.15, 1.8],
      maximumAngleRad: 0.5,
      rateRadPerSecond: 2.6,
      areaM2: 0.22,
      aspectRatio: 1.4,
      liftSlopePerRad: 3.8,
      maximumLiftCoefficient: 1.05,
      stallAngleRad: 0.45,
      postStallLiftLossFraction: 0.68,
      baseDragCoefficient: 0.12,
      inducedDragFactor: 0.16,
      stallDragCoefficient: 0.82,
      maximumDragCoefficient: 1.4,
      maximumForceN: 18_000,
      propWashFraction: 0.82,
      ventilationStartSubmergenceM: 0.01,
      ventilationFullSubmergenceM: 0.18,
      minimumVentilationFactor: 0.04,
    },
    windAreaCoefficient: 5,
    sideAreaMultiplier: 2,
    halfLengthM: SPEEDBOAT_HALF_LENGTH_M,
    halfWidthM: SPEEDBOAT_HALF_WIDTH_M,
    baseDraftM: -0.4,
    deepestDraftM: 0.3,
    waterDensityKgM3: SEA_WATER_DENSITY_KG_M3,
    hydrostaticCells: createHydrostaticCells(
      SPEEDBOAT_HALF_LENGTH_M,
      SPEEDBOAT_HALF_WIDTH_M,
      4.15,
      0.62,
      1.14,
      8_600,
      5_900,
      2.75,
      [
        {
          id: 'bow',
          longitudinalFraction: -0.92,
          beamFraction: 0.35,
          verticalOffsetM: 0.18,
          weight: 0.12,
          compartmentIds: ['bow', 'bow', 'bow'],
          deadriseDeg: 32,
          slamCoefficient: 0.92,
        },
        {
          id: 'forward-cockpit',
          longitudinalFraction: -0.35,
          beamFraction: 0.85,
          verticalOffsetM: 0.05,
          weight: 0.28,
          compartmentIds: ['cockpit-port', 'cockpit', 'cockpit-starboard'],
          deadriseDeg: 24,
          slamCoefficient: 0.78,
        },
        {
          id: 'aft-cockpit',
          longitudinalFraction: 0.3,
          beamFraction: 1,
          verticalOffsetM: 0,
          weight: 0.38,
          compartmentIds: ['cockpit-port', 'cockpit', 'cockpit-starboard'],
          deadriseDeg: 18,
          slamCoefficient: 0.66,
        },
        {
          id: 'transom',
          longitudinalFraction: 0.9,
          beamFraction: 0.55,
          verticalOffsetM: 0.1,
          weight: 0.22,
          compartmentIds: ['engine', 'engine', 'engine'],
          deadriseDeg: 14,
          slamCoefficient: 0.52,
        },
      ],
    ),
    hydrodynamics: {
      addedMassKg: [260, 520, 120],
      addedInertiaKgM2: [340, 260, 410],
      linearDampingNPerMps: [920, 1_250, 340],
      quadraticDampingNPerMps2: [540, 760, 145],
      angularLinearDampingNmPerRadPerSecond: [1_650, 1_350, 2_050],
      angularQuadraticDampingNmPerRad2PerSecond2: [620, 480, 780],
    },
    floodCompartments: [
      {
        id: 'bow',
        label: 'Bow locker',
        localPosition: [0, -0.2, -1.18],
        capacityM3: 0.18,
        leakAreaM2: 0.0035,
        damageThreshold: 70,
        susceptibility: 0.95,
        retainedMassFraction: 0.72,
        buoyancyLossFraction: 0.86,
        passivePumpRateM3PerSecond: 0.001,
        activePumpRateM3PerSecond: 0.012,
      },
      {
        id: 'cockpit-port',
        label: 'Port cockpit void',
        localPosition: [-0.34, -0.28, 0.05],
        capacityM3: 0.2,
        leakAreaM2: 0.0038,
        damageThreshold: 62,
        susceptibility: 1,
        retainedMassFraction: 0.82,
        buoyancyLossFraction: 0.78,
        passivePumpRateM3PerSecond: 0.0009,
        activePumpRateM3PerSecond: 0.011,
      },
      {
        id: 'cockpit',
        label: 'Center cockpit bilge',
        localPosition: [0, -0.34, 0.18],
        capacityM3: 0.24,
        leakAreaM2: 0.0034,
        damageThreshold: 56,
        susceptibility: 0.82,
        retainedMassFraction: 0.88,
        buoyancyLossFraction: 0.72,
        passivePumpRateM3PerSecond: 0.0014,
        activePumpRateM3PerSecond: 0.016,
      },
      {
        id: 'cockpit-starboard',
        label: 'Starboard cockpit void',
        localPosition: [0.34, -0.28, 0.05],
        capacityM3: 0.2,
        leakAreaM2: 0.0038,
        damageThreshold: 62,
        susceptibility: 1,
        retainedMassFraction: 0.82,
        buoyancyLossFraction: 0.78,
        passivePumpRateM3PerSecond: 0.0009,
        activePumpRateM3PerSecond: 0.011,
      },
      {
        id: 'engine',
        label: 'Engine bay',
        localPosition: [0, -0.24, 1.12],
        capacityM3: 0.17,
        leakAreaM2: 0.0031,
        damageThreshold: 46,
        susceptibility: 0.76,
        retainedMassFraction: 0.94,
        buoyancyLossFraction: 0.7,
        passivePumpRateM3PerSecond: 0.0008,
        activePumpRateM3PerSecond: 0.01,
      },
    ],
    winterLoad: {
      maximumMassKg: 48,
      localPosition: [0, 0.52, 0.05],
    },
    planingCapable: true,
    planingReferenceSpeedMps: 15,
    windPointLocal: [0, 0.85, 0.35],
  },
} as const satisfies Readonly<Record<VesselType, VesselConfig>>;

export function getVesselConfig(type: VesselType): VesselConfig {
  return VESSEL_CONFIGS[type];
}
