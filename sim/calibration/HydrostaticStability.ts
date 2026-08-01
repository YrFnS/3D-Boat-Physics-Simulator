import {
  displacedColumnCentroidDepthM,
  displacedColumnVolumeM3,
  displacementBalanceErrorRatio,
} from '../vessels/HydrostaticsMath.ts';
import type {
  VesselConfig,
  VesselType,
} from '../vessels/VesselConfig.ts';

const GRAVITY_MPS2 = 9.81;
const FLAT_WATER_HEIGHT_M = -1;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const SMALL_ANGLE_DEG = [2, 5] as const;
const RIGHTING_SAMPLE_DEG = [-10, -5, -2, 2, 5, 10] as const;

export type StabilityAxis = 'roll' | 'pitch';

interface Vector3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface StaticHydrostaticState {
  axis: StabilityAxis;
  angleDeg: number;
  originYM: number;
  displacedVolumeM3: number;
  displacementBalanceErrorRatio: number;
  deepestImmersedDraftM: number;
  centerOfMassWorld: Vector3Tuple;
  centerOfBuoyancyWorld: Vector3Tuple;
  hydrostaticTorqueNm: Vector3Tuple;
  axisTorqueNm: number;
}

export interface RightingSample {
  offsetDeg: number;
  absoluteAngleDeg: number;
  axisTorqueNm: number;
  rightingMomentNm: number;
  normalizedRightingMoment: number;
  restoring: boolean;
  originYM: number;
  deepestImmersedDraftM: number;
}

export interface AxisStabilityResult {
  axis: StabilityAxis;
  equilibriumAngleDeg: number;
  equilibriumTorqueNm: number;
  equilibriumOriginYM: number;
  equilibriumDraftM: number;
  rightingSamples: readonly RightingSample[];
  linearizedStiffnessNmPerRad: number;
  effectiveInertiaKgM2: number;
  effectiveLinearDampingNmPerRadPerSecond: number;
  undampedNaturalPeriodSeconds: number | null;
  dampingRatio: number | null;
  dampedNaturalPeriodSeconds: number | null;
  behavior: 'underdamped' | 'critical-or-overdamped' | 'invalid';
  maximumSymmetryErrorRatio: number;
  symmetryLimitRatio: number;
  checks: {
    equilibriumFound: boolean;
    equilibriumTorqueBounded: boolean;
    allSamplesRestoring: boolean;
    symmetryBounded: boolean;
    positiveStiffness: boolean;
    finiteLinearizedDynamics: boolean;
  };
  passed: boolean;
}

export interface HydrostaticStabilityResult {
  version: 1;
  vessel: VesselType;
  evidenceClass: 'engineering-derived';
  methodology: {
    description: string;
    waterSurface: 'flat';
    waterHeightM: number;
    rightingOffsetsDeg: readonly number[];
    limitations: readonly string[];
  };
  upright: StaticHydrostaticState;
  roll: AxisStabilityResult;
  pitch: AxisStabilityResult;
  checks: {
    finite: boolean;
    displacementBalanced: boolean;
    configuredDraftPlausible: boolean;
    rollStable: boolean;
    pitchStable: boolean;
  };
  passed: boolean;
}

function rotateLocal(
  vector: readonly [number, number, number],
  axis: StabilityAxis,
  angleRad: number,
): Vector3Tuple {
  const [x, y, z] = vector;
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);

  if (axis === 'roll') {
    return {
      x: cosine * x - sine * y,
      y: sine * x + cosine * y,
      z,
    };
  }

  return {
    x,
    y: cosine * y - sine * z,
    z: sine * y + cosine * z,
  };
}

function finiteVector(vector: Vector3Tuple) {
  return [vector.x, vector.y, vector.z].every(Number.isFinite);
}

function evaluateAtOrigin(
  vessel: VesselConfig,
  axis: StabilityAxis,
  angleDeg: number,
  originYM: number,
): StaticHydrostaticState {
  const angleRad = angleDeg * DEG_TO_RAD;
  const rotatedCenterOfMass = rotateLocal(
    vessel.centerOfMassLocal,
    axis,
    angleRad,
  );
  const centerOfMassWorld = {
    x: rotatedCenterOfMass.x,
    y: originYM + rotatedCenterOfMass.y,
    z: rotatedCenterOfMass.z,
  };

  let displacedVolumeM3 = 0;
  let deepestImmersedDraftM = 0;
  let weightedBuoyancyX = 0;
  let weightedBuoyancyY = 0;
  let weightedBuoyancyZ = 0;
  let torqueXNm = 0;
  let torqueZNm = 0;

  for (const cell of vessel.hydrostaticCells) {
    const rotatedBottom = rotateLocal(
      [
        cell.localPosition[0],
        cell.localPosition[1] + vessel.baseDraftM,
        cell.localPosition[2],
      ],
      axis,
      angleRad,
    );
    const bottomWorld = {
      x: rotatedBottom.x,
      y: originYM + rotatedBottom.y,
      z: rotatedBottom.z,
    };
    const depthM = FLAT_WATER_HEIGHT_M - bottomWorld.y;
    const volumeM3 = displacedColumnVolumeM3(
      cell.waterplaneAreaM2,
      depthM,
      cell.maxImmersionDepthM,
      cell.volumeExponent,
    );
    if (volumeM3 <= 0) continue;

    const centroidDepthM = displacedColumnCentroidDepthM(
      depthM,
      cell.maxImmersionDepthM,
      cell.volumeExponent,
    );
    const buoyancyPoint = {
      x: bottomWorld.x,
      y: bottomWorld.y + centroidDepthM,
      z: bottomWorld.z,
    };
    const buoyancyForceN =
      volumeM3 * vessel.waterDensityKgM3 * GRAVITY_MPS2;
    const leverX = buoyancyPoint.x - centerOfMassWorld.x;
    const leverZ = buoyancyPoint.z - centerOfMassWorld.z;

    // r × (0, Fy, 0) = (-rz*Fy, 0, rx*Fy)
    torqueXNm += -leverZ * buoyancyForceN;
    torqueZNm += leverX * buoyancyForceN;
    displacedVolumeM3 += volumeM3;
    deepestImmersedDraftM = Math.max(
      deepestImmersedDraftM,
      Math.max(0, depthM),
    );
    weightedBuoyancyX += buoyancyPoint.x * volumeM3;
    weightedBuoyancyY += buoyancyPoint.y * volumeM3;
    weightedBuoyancyZ += buoyancyPoint.z * volumeM3;
  }

  const safeVolumeM3 = Math.max(displacedVolumeM3, Number.EPSILON);
  const centerOfBuoyancyWorld = {
    x: weightedBuoyancyX / safeVolumeM3,
    y: weightedBuoyancyY / safeVolumeM3,
    z: weightedBuoyancyZ / safeVolumeM3,
  };
  const hydrostaticTorqueNm = {
    x: torqueXNm,
    y: 0,
    z: torqueZNm,
  };

  return {
    axis,
    angleDeg,
    originYM,
    displacedVolumeM3,
    displacementBalanceErrorRatio: displacementBalanceErrorRatio(
      displacedVolumeM3,
      vessel.massKg,
      vessel.waterDensityKgM3,
    ),
    deepestImmersedDraftM,
    centerOfMassWorld,
    centerOfBuoyancyWorld,
    hydrostaticTorqueNm,
    axisTorqueNm: axis === 'roll' ? torqueZNm : torqueXNm,
  };
}

export function solveStaticHydrostaticState(
  vessel: VesselConfig,
  axis: StabilityAxis,
  angleDeg: number,
): StaticHydrostaticState {
  const targetVolumeM3 = vessel.massKg / vessel.waterDensityKgM3;
  let lowerY = FLAT_WATER_HEIGHT_M - 4;
  let upperY = FLAT_WATER_HEIGHT_M + 2;

  for (let iteration = 0; iteration < 90; iteration += 1) {
    const originYM = (lowerY + upperY) * 0.5;
    const state = evaluateAtOrigin(vessel, axis, angleDeg, originYM);
    if (state.displacedVolumeM3 > targetVolumeM3) {
      lowerY = originYM;
    } else {
      upperY = originYM;
    }
  }

  return evaluateAtOrigin(
    vessel,
    axis,
    angleDeg,
    (lowerY + upperY) * 0.5,
  );
}

function solveEquilibriumAngle(
  vessel: VesselConfig,
  axis: StabilityAxis,
): StaticHydrostaticState {
  const minimumAngleDeg = axis === 'roll' ? -8 : -15;
  const maximumAngleDeg = axis === 'roll' ? 8 : 15;
  const scanSteps = 120;
  let best = solveStaticHydrostaticState(vessel, axis, minimumAngleDeg);
  let previous = best;
  let bracket: [StaticHydrostaticState, StaticHydrostaticState] | null = null;

  for (let index = 1; index <= scanSteps; index += 1) {
    const angleDeg =
      minimumAngleDeg +
      ((maximumAngleDeg - minimumAngleDeg) * index) / scanSteps;
    const state = solveStaticHydrostaticState(vessel, axis, angleDeg);
    if (Math.abs(state.axisTorqueNm) < Math.abs(best.axisTorqueNm)) {
      best = state;
    }
    if (
      Math.sign(previous.axisTorqueNm) !== Math.sign(state.axisTorqueNm) ||
      state.axisTorqueNm === 0
    ) {
      bracket = [previous, state];
      break;
    }
    previous = state;
  }

  if (!bracket) return best;

  let [left, right] = bracket;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = solveStaticHydrostaticState(
      vessel,
      axis,
      (left.angleDeg + right.angleDeg) * 0.5,
    );
    if (Math.abs(middle.axisTorqueNm) < Math.abs(best.axisTorqueNm)) {
      best = middle;
    }
    if (Math.sign(left.axisTorqueNm) === Math.sign(middle.axisTorqueNm)) {
      left = middle;
    } else {
      right = middle;
    }
  }
  return best;
}

function rightingReferenceLengthM(
  vessel: VesselConfig,
  axis: StabilityAxis,
) {
  return axis === 'roll' ? vessel.halfWidthM * 2 : vessel.halfLengthM * 2;
}

function pairSymmetryError(
  negative: RightingSample,
  positive: RightingSample,
) {
  return (
    Math.abs(
      Math.abs(negative.rightingMomentNm) -
        Math.abs(positive.rightingMomentNm),
    ) /
    Math.max(
      1,
      Math.abs(negative.rightingMomentNm),
      Math.abs(positive.rightingMomentNm),
    )
  );
}

function evaluateAxis(
  vessel: VesselConfig,
  axis: StabilityAxis,
): AxisStabilityResult {
  const equilibrium = solveEquilibriumAngle(vessel, axis);
  const referenceLengthM = rightingReferenceLengthM(vessel, axis);
  const rightingSamples = RIGHTING_SAMPLE_DEG.map((offsetDeg) => {
    const state = solveStaticHydrostaticState(
      vessel,
      axis,
      equilibrium.angleDeg + offsetDeg,
    );
    const rightingMomentNm = -Math.sign(offsetDeg) * state.axisTorqueNm;
    const normalizedRightingMoment =
      rightingMomentNm /
      Math.max(1, vessel.massKg * GRAVITY_MPS2 * referenceLengthM);
    return {
      offsetDeg,
      absoluteAngleDeg: state.angleDeg,
      axisTorqueNm: state.axisTorqueNm,
      rightingMomentNm,
      normalizedRightingMoment,
      restoring: Number.isFinite(rightingMomentNm) && rightingMomentNm > 0,
      originYM: state.originYM,
      deepestImmersedDraftM: state.deepestImmersedDraftM,
    } satisfies RightingSample;
  });

  const stiffnessSamples = SMALL_ANGLE_DEG.map((offsetDeg) => {
    const negative = rightingSamples.find(
      (sample) => sample.offsetDeg === -offsetDeg,
    );
    const positive = rightingSamples.find(
      (sample) => sample.offsetDeg === offsetDeg,
    );
    if (!negative || !positive) return Number.NaN;
    const offsetRad = offsetDeg * DEG_TO_RAD;
    return (
      -(positive.axisTorqueNm - negative.axisTorqueNm) /
      (2 * offsetRad)
    );
  });
  const linearizedStiffnessNmPerRad =
    stiffnessSamples.reduce((sum, value) => sum + value, 0) /
    stiffnessSamples.length;

  const axisIndex = axis === 'roll' ? 2 : 0;
  const effectiveInertiaKgM2 =
    vessel.principalInertiaKgM2[axisIndex] +
    vessel.hydrodynamics.addedInertiaKgM2[axisIndex];
  const effectiveLinearDampingNmPerRadPerSecond =
    vessel.hydrodynamics.angularLinearDampingNmPerRadPerSecond[
      axisIndex
    ] +
    effectiveInertiaKgM2 * vessel.angularDampingPerSecond[axisIndex];
  const undampedAngularFrequency = Math.sqrt(
    linearizedStiffnessNmPerRad /
      Math.max(Number.EPSILON, effectiveInertiaKgM2),
  );
  const undampedNaturalPeriodSeconds =
    Number.isFinite(undampedAngularFrequency) && undampedAngularFrequency > 0
      ? (Math.PI * 2) / undampedAngularFrequency
      : null;
  const dampingRatio =
    Number.isFinite(linearizedStiffnessNmPerRad) &&
    linearizedStiffnessNmPerRad > 0 &&
    effectiveInertiaKgM2 > 0
      ? effectiveLinearDampingNmPerRadPerSecond /
        (2 *
          Math.sqrt(
            linearizedStiffnessNmPerRad * effectiveInertiaKgM2,
          ))
      : null;
  const dampedNaturalPeriodSeconds =
    dampingRatio !== null &&
    dampingRatio >= 0 &&
    dampingRatio < 1 &&
    undampedAngularFrequency > 0
      ? (Math.PI * 2) /
        (undampedAngularFrequency * Math.sqrt(1 - dampingRatio ** 2))
      : null;
  const maximumSymmetryErrorRatio = Math.max(
    ...SMALL_ANGLE_DEG.map((offsetDeg) => {
      const negative = rightingSamples.find(
        (sample) => sample.offsetDeg === -offsetDeg,
      );
      const positive = rightingSamples.find(
        (sample) => sample.offsetDeg === offsetDeg,
      );
      return negative && positive
        ? pairSymmetryError(negative, positive)
        : Number.POSITIVE_INFINITY;
    }),
  );

  const symmetryLimitRatio = axis === 'roll' ? 0.05 : 0.35;

  const torqueReferenceNm = Math.max(
    1,
    vessel.massKg * GRAVITY_MPS2 * referenceLengthM,
  );
  const checks = {
    equilibriumFound:
      Number.isFinite(equilibrium.angleDeg) &&
      Math.abs(equilibrium.angleDeg) <= (axis === 'roll' ? 8 : 15),
    equilibriumTorqueBounded:
      Math.abs(equilibrium.axisTorqueNm) / torqueReferenceNm <= 1e-4,
    allSamplesRestoring: rightingSamples.every(
      (sample) => sample.restoring,
    ),
    symmetryBounded: maximumSymmetryErrorRatio <= symmetryLimitRatio,
    positiveStiffness:
      Number.isFinite(linearizedStiffnessNmPerRad) &&
      linearizedStiffnessNmPerRad > 0,
    finiteLinearizedDynamics:
      undampedNaturalPeriodSeconds !== null &&
      Number.isFinite(undampedNaturalPeriodSeconds) &&
      dampingRatio !== null &&
      Number.isFinite(dampingRatio) &&
      dampingRatio >= 0,
  };

  return {
    axis,
    equilibriumAngleDeg: equilibrium.angleDeg,
    equilibriumTorqueNm: equilibrium.axisTorqueNm,
    equilibriumOriginYM: equilibrium.originYM,
    equilibriumDraftM: equilibrium.deepestImmersedDraftM,
    rightingSamples,
    linearizedStiffnessNmPerRad,
    effectiveInertiaKgM2,
    effectiveLinearDampingNmPerRadPerSecond,
    undampedNaturalPeriodSeconds,
    dampingRatio,
    dampedNaturalPeriodSeconds,
    behavior:
      dampingRatio === null
        ? 'invalid'
        : dampingRatio < 1
          ? 'underdamped'
          : 'critical-or-overdamped',
    maximumSymmetryErrorRatio,
    symmetryLimitRatio,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

export function evaluateHydrostaticStability(
  vessel: VesselConfig,
): HydrostaticStabilityResult {
  const upright = solveStaticHydrostaticState(vessel, 'roll', 0);
  const roll = evaluateAxis(vessel, 'roll');
  const pitch = evaluateAxis(vessel, 'pitch');
  const finite = [
    upright.originYM,
    upright.displacedVolumeM3,
    upright.displacementBalanceErrorRatio,
    upright.deepestImmersedDraftM,
    upright.axisTorqueNm,
    roll.equilibriumAngleDeg,
    roll.linearizedStiffnessNmPerRad,
    pitch.equilibriumAngleDeg,
    pitch.linearizedStiffnessNmPerRad,
  ].every(Number.isFinite) &&
    finiteVector(upright.centerOfMassWorld) &&
    finiteVector(upright.centerOfBuoyancyWorld);
  const checks = {
    finite,
    displacementBalanced:
      upright.displacementBalanceErrorRatio <= 1e-9,
    configuredDraftPlausible:
      upright.deepestImmersedDraftM > 0 &&
      upright.deepestImmersedDraftM <=
        Math.max(2, vessel.deepestDraftM * 4),
    rollStable: roll.passed,
    pitchStable: pitch.passed,
  };

  return {
    version: 1,
    vessel: vessel.type,
    evidenceClass: 'engineering-derived',
    methodology: {
      description:
        'Static heave equilibrium and sectional righting moments derived from the simulator hydrostatic cells; linearized periods and damping ratios use the configured inertia, added inertia, angular drag, and body damping.',
      waterSurface: 'flat',
      waterHeightM: FLAT_WATER_HEIGHT_M,
      rightingOffsetsDeg: [...RIGHTING_SAMPLE_DEG],
      limitations: [
        'This is simulator-model evidence, not a manufacturer hydrostatic table or full-scale inclining experiment.',
        'The equilibrium solver holds yaw fixed and evaluates one angular axis at a time.',
        'Roll uses a strict port-starboard symmetry check; pitch permits bounded fore-aft asymmetry from the configured hull stations.',
        'Linearized period and damping values are engineering diagnostics; time-domain decay trials remain a separate checkpoint.',
      ],
    },
    upright,
    roll,
    pitch,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

export function roundHydrostaticStabilityReport(
  report: HydrostaticStabilityResult,
  digits = 6,
): HydrostaticStabilityResult {
  const scale = 10 ** digits;
  const round = (value: number | null) =>
    value === null || !Number.isFinite(value)
      ? value
      : Math.round(value * scale) / scale;

  return JSON.parse(
    JSON.stringify(report, (_key, value) =>
      typeof value === 'number' ? round(value) : value,
    ),
  ) as HydrostaticStabilityResult;
}

export const HYDROSTATIC_STABILITY_AXES = ['roll', 'pitch'] as const;
export const HYDROSTATIC_STABILITY_OFFSETS_DEG = RIGHTING_SAMPLE_DEG;
export const radiansToDegrees = (value: number) => value * RAD_TO_DEG;
