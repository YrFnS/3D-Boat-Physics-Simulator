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

export interface DecayProbeResult {
  initialOffsetDeg: number;
  durationSeconds: number;
  timeStepSeconds: number;
  finalOffsetDeg: number;
  maximumAbsoluteOffsetDeg: number;
  recoveryTimeSeconds: number | null;
  zeroCrossingTimesSeconds: readonly number[];
  signedPeakOffsetsDeg: readonly number[];
  measuredPeriodSeconds: number | null;
  measuredDampingRatio: number | null;
  behavior: 'oscillatory' | 'aperiodic-within-window';
  checks: {
    finite: boolean;
    amplitudeBounded: boolean;
    recovered: boolean;
    finalOffsetSettled: boolean;
    periodPlausible: boolean;
    dampingPlausible: boolean;
  };
  passed: boolean;
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
  decay: DecayProbeResult;
  checks: {
    equilibriumFound: boolean;
    equilibriumTorqueBounded: boolean;
    allSamplesRestoring: boolean;
    symmetryBounded: boolean;
    positiveStiffness: boolean;
    finiteLinearizedDynamics: boolean;
    decayPassed: boolean;
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

function average(values: readonly number[]) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : Number.NaN;
}

function interpolateZeroCrossing(
  previousTimeSeconds: number,
  previousOffsetRad: number,
  timeSeconds: number,
  offsetRad: number,
) {
  const denominator = Math.abs(previousOffsetRad) + Math.abs(offsetRad);
  if (denominator <= Number.EPSILON) return timeSeconds;
  return (
    previousTimeSeconds +
    ((timeSeconds - previousTimeSeconds) * Math.abs(previousOffsetRad)) /
      denominator
  );
}

function estimateMeasuredDampingRatio(
  signedPeaksDeg: readonly number[],
) {
  const decrements: number[] = [];
  for (const sign of [-1, 1] as const) {
    const amplitudes = signedPeaksDeg
      .filter((value) => Math.sign(value) === sign)
      .map(Math.abs)
      .filter((value) => value > 1e-4);
    for (let index = 1; index < amplitudes.length; index += 1) {
      if (amplitudes[index] >= amplitudes[index - 1]) continue;
      decrements.push(Math.log(amplitudes[index - 1] / amplitudes[index]));
    }
  }
  if (decrements.length === 0) return null;
  const decrement = average(decrements);
  return decrement / Math.sqrt((Math.PI * 2) ** 2 + decrement ** 2);
}

function runDecayProbe(
  vessel: VesselConfig,
  axis: StabilityAxis,
  equilibriumAngleDeg: number,
  effectiveInertiaKgM2: number,
): DecayProbeResult {
  const initialOffsetDeg = 10;
  const durationSeconds = 36;
  const timeStepSeconds = 1 / 120;
  const axisIndex = axis === 'roll' ? 2 : 0;
  const linearDampingNmPerRadPerSecond =
    vessel.hydrodynamics.angularLinearDampingNmPerRadPerSecond[axisIndex];
  const quadraticDampingNmPerRad2PerSecond2 =
    vessel.hydrodynamics.angularQuadraticDampingNmPerRad2PerSecond2[
      axisIndex
    ];
  const bodyDampingPerSecond = vessel.angularDampingPerSecond[axisIndex];

  let offsetRad = initialOffsetDeg * DEG_TO_RAD;
  let angularVelocityRadPerSecond = 0;
  let previousOffsetRad = offsetRad;
  let previousAngularVelocityRadPerSecond = angularVelocityRadPerSecond;
  let previousTimeSeconds = 0;
  let maximumAbsoluteOffsetDeg = Math.abs(initialOffsetDeg);
  let recoveryTimeSeconds: number | null = null;
  let finite = true;
  const zeroCrossingTimesSeconds: number[] = [];
  const signedPeakOffsetsDeg: number[] = [initialOffsetDeg];

  const totalSteps = Math.ceil(durationSeconds / timeStepSeconds);
  for (let step = 1; step <= totalSteps; step += 1) {
    const timeSeconds = step * timeStepSeconds;
    const absoluteAngleDeg =
      equilibriumAngleDeg + offsetRad * RAD_TO_DEG;
    const hydrostaticState = solveStaticHydrostaticState(
      vessel,
      axis,
      absoluteAngleDeg,
    );
    const dampingTorqueNm =
      linearDampingNmPerRadPerSecond * angularVelocityRadPerSecond +
      quadraticDampingNmPerRad2PerSecond2 *
        angularVelocityRadPerSecond *
        Math.abs(angularVelocityRadPerSecond);
    const angularAccelerationRadPerSecond2 =
      (hydrostaticState.axisTorqueNm - dampingTorqueNm) /
      Math.max(Number.EPSILON, effectiveInertiaKgM2);

    angularVelocityRadPerSecond +=
      angularAccelerationRadPerSecond2 * timeStepSeconds;
    angularVelocityRadPerSecond *= Math.exp(
      -bodyDampingPerSecond * timeStepSeconds,
    );
    offsetRad += angularVelocityRadPerSecond * timeStepSeconds;

    const offsetDeg = offsetRad * RAD_TO_DEG;
    maximumAbsoluteOffsetDeg = Math.max(
      maximumAbsoluteOffsetDeg,
      Math.abs(offsetDeg),
    );
    finite &&= [
      timeSeconds,
      offsetRad,
      angularVelocityRadPerSecond,
      hydrostaticState.axisTorqueNm,
      angularAccelerationRadPerSecond2,
    ].every(Number.isFinite);

    if (
      previousOffsetRad !== 0 &&
      Math.sign(previousOffsetRad) !== Math.sign(offsetRad)
    ) {
      zeroCrossingTimesSeconds.push(
        interpolateZeroCrossing(
          previousTimeSeconds,
          previousOffsetRad,
          timeSeconds,
          offsetRad,
        ),
      );
    }
    if (
      previousAngularVelocityRadPerSecond !== 0 &&
      Math.sign(previousAngularVelocityRadPerSecond) !==
        Math.sign(angularVelocityRadPerSecond)
    ) {
      signedPeakOffsetsDeg.push(previousOffsetRad * RAD_TO_DEG);
    }
    if (
      recoveryTimeSeconds === null &&
      Math.abs(offsetDeg) <= 2 &&
      Math.abs(angularVelocityRadPerSecond) <= 0.1
    ) {
      recoveryTimeSeconds = timeSeconds;
    }

    previousOffsetRad = offsetRad;
    previousAngularVelocityRadPerSecond = angularVelocityRadPerSecond;
    previousTimeSeconds = timeSeconds;
    if (!finite) break;
  }

  const fullPeriodSamplesSeconds: number[] = [];
  for (
    let index = 2;
    index < zeroCrossingTimesSeconds.length;
    index += 1
  ) {
    fullPeriodSamplesSeconds.push(
      zeroCrossingTimesSeconds[index] -
        zeroCrossingTimesSeconds[index - 2],
    );
  }
  const measuredPeriodSeconds =
    fullPeriodSamplesSeconds.length > 0
      ? average(fullPeriodSamplesSeconds)
      : null;
  const measuredDampingRatio = estimateMeasuredDampingRatio(
    signedPeakOffsetsDeg,
  );
  const finalOffsetDeg = offsetRad * RAD_TO_DEG;
  const behavior =
    zeroCrossingTimesSeconds.length >= 2
      ? 'oscillatory'
      : 'aperiodic-within-window';
  const checks = {
    finite,
    amplitudeBounded: maximumAbsoluteOffsetDeg <= initialOffsetDeg * 1.05,
    recovered:
      recoveryTimeSeconds !== null && recoveryTimeSeconds <= durationSeconds,
    finalOffsetSettled: Math.abs(finalOffsetDeg) <= 0.5,
    periodPlausible:
      measuredPeriodSeconds === null ||
      (measuredPeriodSeconds >= 0.25 && measuredPeriodSeconds <= 30),
    dampingPlausible:
      measuredDampingRatio === null ||
      (measuredDampingRatio >= 0 && measuredDampingRatio < 1),
  };

  return {
    initialOffsetDeg,
    durationSeconds,
    timeStepSeconds,
    finalOffsetDeg,
    maximumAbsoluteOffsetDeg,
    recoveryTimeSeconds,
    zeroCrossingTimesSeconds,
    signedPeakOffsetsDeg,
    measuredPeriodSeconds,
    measuredDampingRatio,
    behavior,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
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
  const decay = runDecayProbe(
    vessel,
    axis,
    equilibrium.angleDeg,
    effectiveInertiaKgM2,
  );

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
    decayPassed: decay.passed,
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
    decay,
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
        'The time-domain decay probe uses the same nonlinear sectional righting moment with configured linear, quadratic, and body angular damping; it is still simulator-model evidence rather than a full-scale decay trial.',
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
