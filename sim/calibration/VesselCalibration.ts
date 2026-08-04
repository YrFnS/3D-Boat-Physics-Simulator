import { Euler, MathUtils, Vector3 } from 'three';
import type { BoatType } from '@/store/useSimStore';
import type { SixDofBody } from '@/sim/core/SixDofBody';
import type { WaterSurfaceSampler } from '@/sim/water/WaterSurface';
import { setFlatWaterSample } from '@/sim/water/WaterSurface';
import {
  estimateHydrostaticRestingOriginY,
} from '@/sim/vessels/HydrostaticsMath';
import type { VesselConfig } from '@/sim/vessels/VesselConfig';
import type { RapierContactSummary } from '@/sim/collision/RapierCollisionWorld';

export const CALIBRATION_SCENARIOS = [
  'rest',
  'stability',
  'speed',
  'reverse-speed',
  'stop',
  'turn',
  'reverse-turn',
] as const;

export type CalibrationScenario = (typeof CALIBRATION_SCENARIOS)[number];

export interface CalibrationRequest {
  scenario: CalibrationScenario;
  vessel: BoatType;
}

interface NumericRange {
  min: number;
  max: number;
}

interface RestTargets {
  submergedRatio: NumericRange;
  meanOriginYM: NumericRange;
  verticalSpeedRmsMaxMps: number;
  rollRmsMaxDeg: number;
  pitchRmsMaxDeg: number;
  displacementBalanceErrorMaxRatio: number;
}

interface StabilityTargets {
  recoveryTimeMaxSeconds: number;
  finalRollMaxDeg: number;
  peakRollMaxDeg: number;
}

interface SpeedTargets {
  steadySpeedMps: NumericRange;
  maximumSpeedMaxMps: number;
  timeToMinimumCruiseMaxSeconds: number;
  maximumRollDeg: number;
  maximumPitchDeg: number;
}

interface ReverseSpeedTargets {
  steadyAsternSpeedMps: NumericRange;
  maximumAsternSpeedMaxMps: number;
  timeToMinimumAsternMaxSeconds: number;
  maximumWrongWayForwardSpeedMps: number;
  maximumRollDeg: number;
  maximumPitchDeg: number;
}

interface StopTargets {
  cutoffSpeedMps: NumericRange;
  stoppingTimeSeconds: NumericRange;
  stoppingDistanceM: NumericRange;
  finalSpeedMaxMps: number;
}

interface TurnTargets {
  entrySpeedMps: NumericRange;
  headingChangeMinDeg: number;
  turnRadiusM: NumericRange;
  maximumRollDeg: number;
}

interface ReverseTurnTargets {
  entryAsternSpeedMps: NumericRange;
  headingChangeMinDeg: number;
  turnRadiusM: NumericRange;
  maximumRollDeg: number;
  maximumPitchDeg: number;
}

export interface VesselCalibrationTargets {
  rest: RestTargets;
  stability: StabilityTargets;
  speed: SpeedTargets;
  'reverse-speed': ReverseSpeedTargets;
  stop: StopTargets;
  turn: TurnTargets;
  'reverse-turn': ReverseTurnTargets;
}

export interface CalibrationStepMetrics {
  body: SixDofBody;
  submergedRatio: number;
  speedMps: number;
  forwardSpeedMps: number;
  headingRadians: number;
  hullHealth: number;
  engineHealth: number;
  rudderHealth: number;
  displacedVolumeM3: number;
  physicalMassKg: number;
  floodingRatio: number;
  displacementBalanceErrorRatio: number;
  collisionSummary?: RapierContactSummary;
}

export interface CalibrationResult {
  version: 1;
  vessel: BoatType;
  scenario: CalibrationScenario;
  durationSeconds: number;
  passed: boolean;
  checks: Record<string, boolean>;
  metrics: Record<string, number | null>;
  targets:
    | RestTargets
    | StabilityTargets
    | SpeedTargets
    | ReverseSpeedTargets
    | StopTargets
    | TurnTargets
    | ReverseTurnTargets;
}

const FLAT_WATER_HEIGHT_M = -1;
const INITIAL_ROLL_DEG = 12;
const REST_SAMPLE_START_SECONDS = 10;
const SPEED_SAMPLE_START_SECONDS = 19;
const REVERSE_SPEED_SAMPLE_START_SECONDS = 19;
const STOP_CUTOFF_SECONDS = 14;
const TURN_START_SECONDS = 12;
const REVERSE_TURN_START_SECONDS = 12;
const STOP_SPEED_THRESHOLD_MPS = 0.5;
const STABILITY_RECOVERY_ROLL_DEG = 2;
const TURN_MEASUREMENT_RADIANS = Math.PI;
const REVERSE_TURN_MEASUREMENT_RADIANS = Math.PI / 2;
const STEPS_PER_RENDER_FRAME = 240;

export const VESSEL_CALIBRATION_TARGETS: Readonly<
  Record<BoatType, VesselCalibrationTargets>
> = {
  trawler: {
    rest: {
      submergedRatio: { min: 0.55, max: 0.98 },
      meanOriginYM: { min: -1.15, max: 0.1 },
      verticalSpeedRmsMaxMps: 0.22,
      rollRmsMaxDeg: 1.5,
      pitchRmsMaxDeg: 1.8,
      displacementBalanceErrorMaxRatio: 0.08,
    },
    stability: {
      recoveryTimeMaxSeconds: 9,
      finalRollMaxDeg: 2.5,
      peakRollMaxDeg: 18,
    },
    speed: {
      steadySpeedMps: { min: 9, max: 18 },
      maximumSpeedMaxMps: 20,
      timeToMinimumCruiseMaxSeconds: 18,
      maximumRollDeg: 10,
      maximumPitchDeg: 12,
    },
    'reverse-speed': {
      steadyAsternSpeedMps: { min: 4, max: 10 },
      maximumAsternSpeedMaxMps: 12,
      timeToMinimumAsternMaxSeconds: 20,
      maximumWrongWayForwardSpeedMps: 0.75,
      maximumRollDeg: 12,
      maximumPitchDeg: 15,
    },
    stop: {
      cutoffSpeedMps: { min: 8, max: 19 },
      stoppingTimeSeconds: { min: 1.5, max: 18 },
      stoppingDistanceM: { min: 5, max: 120 },
      finalSpeedMaxMps: 0.8,
    },
    turn: {
      entrySpeedMps: { min: 7, max: 19 },
      headingChangeMinDeg: 100,
      turnRadiusM: { min: 3, max: 24 },
      maximumRollDeg: 24,
    },
    'reverse-turn': {
      entryAsternSpeedMps: { min: 3, max: 10 },
      headingChangeMinDeg: 70,
      turnRadiusM: { min: 3, max: 35 },
      maximumRollDeg: 24,
      maximumPitchDeg: 18,
    },
  },
  speedboat: {
    rest: {
      submergedRatio: { min: 0.5, max: 0.98 },
      meanOriginYM: { min: -1.45, max: -0.15 },
      verticalSpeedRmsMaxMps: 0.28,
      rollRmsMaxDeg: 2,
      pitchRmsMaxDeg: 2.2,
      displacementBalanceErrorMaxRatio: 0.08,
    },
    stability: {
      recoveryTimeMaxSeconds: 8,
      finalRollMaxDeg: 3,
      peakRollMaxDeg: 20,
    },
    speed: {
      steadySpeedMps: { min: 15, max: 36 },
      maximumSpeedMaxMps: 40,
      timeToMinimumCruiseMaxSeconds: 18,
      maximumRollDeg: 25,
      maximumPitchDeg: 35,
    },
    'reverse-speed': {
      steadyAsternSpeedMps: { min: 6, max: 16 },
      maximumAsternSpeedMaxMps: 20,
      timeToMinimumAsternMaxSeconds: 20,
      maximumWrongWayForwardSpeedMps: 1,
      maximumRollDeg: 25,
      maximumPitchDeg: 35,
    },
    stop: {
      cutoffSpeedMps: { min: 15, max: 37 },
      stoppingTimeSeconds: { min: 1.5, max: 20 },
      stoppingDistanceM: { min: 10, max: 240 },
      finalSpeedMaxMps: 1,
    },
    turn: {
      entrySpeedMps: { min: 14, max: 37 },
      headingChangeMinDeg: 110,
      turnRadiusM: { min: 4, max: 34 },
      maximumRollDeg: 30,
    },
    'reverse-turn': {
      entryAsternSpeedMps: { min: 5, max: 16 },
      headingChangeMinDeg: 80,
      turnRadiusM: { min: 4, max: 45 },
      maximumRollDeg: 30,
      maximumPitchDeg: 40,
    },
  },
};

class RunningStatistics {
  private count = 0;
  private sum = 0;
  private squareSum = 0;
  private maximumAbsoluteValue = 0;

  push(value: number) {
    if (!Number.isFinite(value)) return;
    this.count += 1;
    this.sum += value;
    this.squareSum += value * value;
    this.maximumAbsoluteValue = Math.max(
      this.maximumAbsoluteValue,
      Math.abs(value),
    );
  }

  get mean() {
    return this.count > 0 ? this.sum / this.count : Number.NaN;
  }

  get rms() {
    return this.count > 0
      ? Math.sqrt(this.squareSum / this.count)
      : Number.NaN;
  }

  get maxAbs() {
    return this.maximumAbsoluteValue;
  }
}

function rangeContains(range: NumericRange, value: number) {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

function roundMetric(value: number | null, digits = 5) {
  if (value === null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function estimateRestingOriginY(vessel: VesselConfig) {
  return estimateHydrostaticRestingOriginY(
    vessel,
    vessel.massKg,
    FLAT_WATER_HEIGHT_M,
  );
}

function headingDelta(previous: number, current: number) {
  let delta = current - previous;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function parseCalibrationRequest(
  search: string,
): CalibrationRequest | null {
  const params = new URLSearchParams(search);
  const scenario = params.get('calibration');
  const vessel = params.get('vessel');

  if (
    !CALIBRATION_SCENARIOS.includes(
      scenario as CalibrationScenario,
    ) ||
    (vessel !== 'trawler' && vessel !== 'speedboat')
  ) {
    return null;
  }

  return {
    scenario: scenario as CalibrationScenario,
    vessel,
  };
}

export const sampleFlatCalibrationWater: WaterSurfaceSampler = (
  x,
  z,
  _timeSeconds,
  target,
) => {
  return setFlatWaterSample(target, x, FLAT_WATER_HEIGHT_M, z);
};

export class VesselCalibrationRunner {
  readonly stepsPerRenderFrame = STEPS_PER_RENDER_FRAME;
  readonly durationSeconds: number;
  readonly usesCollisionWorld = false;
  readonly collisionFixture = null;

  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly previousPosition = new Vector3();
  private readonly cutoffPosition = new Vector3();
  private readonly restY = new RunningStatistics();
  private readonly restSubmersion = new RunningStatistics();
  private readonly restVerticalSpeed = new RunningStatistics();
  private readonly restRoll = new RunningStatistics();
  private readonly restPitch = new RunningStatistics();
  private readonly restDisplacementError = new RunningStatistics();
  private readonly restFloodingRatio = new RunningStatistics();
  private readonly speedSteady = new RunningStatistics();
  private readonly reverseSpeedSteady = new RunningStatistics();

  private initialized = false;
  private completed = false;
  private resultValue: CalibrationResult | null = null;
  private peakRollDeg = 0;
  private maximumPitchDeg = 0;
  private finalRollDeg = 0;
  private recoveryTimeSeconds: number | null = null;
  private maximumSpeedMps = 0;
  private timeToMinimumCruiseSeconds: number | null = null;
  private maximumAsternSpeedMps = 0;
  private maximumWrongWayForwardSpeedMps = 0;
  private timeToMinimumAsternSeconds: number | null = null;
  private cutoffSpeedMps = 0;
  private stoppingTimeSeconds: number | null = null;
  private stoppingDistanceM = 0;
  private finalSpeedMps = 0;
  private turnEntrySpeedMps = 0;
  private reverseTurnEntryAsternSpeedMps = 0;
  private turnPathDistanceM = 0;
  private accumulatedHeadingRadians = 0;
  private previousHeadingRadians = 0;
  private maximumTurnRollDeg = 0;
  private maximumTurnPitchDeg = 0;
  private stopTrackingInitialized = false;
  private turnTrackingInitialized = false;
  private turnMeasurementComplete = false;

  constructor(readonly request: CalibrationRequest) {
    this.durationSeconds =
      request.scenario === 'rest'
        ? 18
        : request.scenario === 'stability'
          ? 14
          : request.scenario === 'speed' ||
            request.scenario === 'reverse-speed'
            ? 24
            : request.scenario === 'stop'
              ? 32
              : 26;
  }

  get isComplete() {
    return this.completed;
  }

  get progress() {
    if (this.completed) return 1;
    return MathUtils.clamp(
      this.lastRecordedTimeSeconds / this.durationSeconds,
      0,
      1,
    );
  }

  get result() {
    return this.resultValue;
  }

  private lastRecordedTimeSeconds = 0;

  initialize(body: SixDofBody, vessel: VesselConfig) {
    const restingY = estimateRestingOriginY(vessel);

    body.position.set(0, restingY, 0);
    body.quaternion.identity();
    body.linearVelocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);

    if (this.request.scenario === 'stability') {
      body.quaternion.setFromAxisAngle(
        new Vector3(0, 0, 1),
        MathUtils.degToRad(INITIAL_ROLL_DEG),
      );
    }

    this.previousPosition.copy(body.position);
    this.previousHeadingRadians = 0;
    this.initialized = true;
  }

  controls(timeSeconds: number) {
    if (this.request.scenario === 'speed') {
      return { throttle: 1, steer: 0 };
    }
    if (this.request.scenario === 'reverse-speed') {
      return { throttle: -1, steer: 0 };
    }
    if (this.request.scenario === 'stop') {
      return {
        throttle: timeSeconds < STOP_CUTOFF_SECONDS ? 1 : 0,
        steer: 0,
      };
    }
    if (this.request.scenario === 'turn') {
      // The physical drivetrain maps throttle to governed engine power rather
      // than directly to thrust. Use representative approach commands that
      // enter the unchanged maneuvering envelopes before helm application.
      const approachThrottle =
        this.request.vessel === 'speedboat' ? 1 : 0.82;
      if (this.turnMeasurementComplete) {
        return { throttle: 0.35, steer: 0 };
      }
      return {
        throttle:
          timeSeconds < TURN_START_SECONDS
            ? approachThrottle
            : approachThrottle * 0.82,
        steer: timeSeconds < TURN_START_SECONDS ? 0 : 1,
      };
    }
    if (this.request.scenario === 'reverse-turn') {
      const approachThrottle =
        this.request.vessel === 'speedboat' ? -0.76 : -0.85;
      if (this.turnMeasurementComplete) {
        return { throttle: -0.3, steer: 0 };
      }
      return {
        throttle: approachThrottle,
        steer: timeSeconds < REVERSE_TURN_START_SECONDS ? 0 : 1,
      };
    }
    return { throttle: 0, steer: 0 };
  }

  recordStep(
    timeSeconds: number,
    metrics: CalibrationStepMetrics,
  ): CalibrationResult | null {
    if (!this.initialized || this.completed) return null;

    this.lastRecordedTimeSeconds = timeSeconds;
    this.maximumSpeedMps = Math.max(
      this.maximumSpeedMps,
      metrics.speedMps,
    );
    this.maximumAsternSpeedMps = Math.max(
      this.maximumAsternSpeedMps,
      Math.max(0, -metrics.forwardSpeedMps),
    );
    this.maximumWrongWayForwardSpeedMps = Math.max(
      this.maximumWrongWayForwardSpeedMps,
      Math.max(0, metrics.forwardSpeedMps),
    );

    this.euler.setFromQuaternion(metrics.body.quaternion, 'YXZ');
    const pitchDeg = MathUtils.radToDeg(this.euler.x);
    const rollDeg = MathUtils.radToDeg(this.euler.z);
    this.finalRollDeg = Math.abs(rollDeg);
    this.peakRollDeg = Math.max(this.peakRollDeg, Math.abs(rollDeg));
    this.maximumPitchDeg = Math.max(
      this.maximumPitchDeg,
      Math.abs(pitchDeg),
    );

    switch (this.request.scenario) {
      case 'rest':
        if (timeSeconds >= REST_SAMPLE_START_SECONDS) {
          this.restY.push(metrics.body.position.y);
          this.restSubmersion.push(metrics.submergedRatio);
          this.restVerticalSpeed.push(metrics.body.linearVelocity.y);
          this.restRoll.push(rollDeg);
          this.restPitch.push(pitchDeg);
          this.restDisplacementError.push(
            metrics.displacementBalanceErrorRatio,
          );
          this.restFloodingRatio.push(metrics.floodingRatio);
        }
        break;
      case 'stability':
        if (
          timeSeconds >= 0.75 &&
          this.recoveryTimeSeconds === null &&
          Math.abs(rollDeg) <= STABILITY_RECOVERY_ROLL_DEG &&
          metrics.body.angularVelocity.length() <= 0.35
        ) {
          this.recoveryTimeSeconds = timeSeconds;
        }
        break;
      case 'speed': {
        const minimumCruiseSpeed =
          VESSEL_CALIBRATION_TARGETS[this.request.vessel].speed
            .steadySpeedMps.min;
        if (
          this.timeToMinimumCruiseSeconds === null &&
          metrics.speedMps >= minimumCruiseSpeed
        ) {
          this.timeToMinimumCruiseSeconds = timeSeconds;
        }
        if (timeSeconds >= SPEED_SAMPLE_START_SECONDS) {
          this.speedSteady.push(metrics.speedMps);
        }
        break;
      }
      case 'reverse-speed': {
        const asternSpeedMps = Math.max(0, -metrics.forwardSpeedMps);
        const minimumAsternSpeed =
          VESSEL_CALIBRATION_TARGETS[this.request.vessel][
            'reverse-speed'
          ].steadyAsternSpeedMps.min;
        if (
          this.timeToMinimumAsternSeconds === null &&
          asternSpeedMps >= minimumAsternSpeed
        ) {
          this.timeToMinimumAsternSeconds = timeSeconds;
        }
        if (timeSeconds >= REVERSE_SPEED_SAMPLE_START_SECONDS) {
          this.reverseSpeedSteady.push(asternSpeedMps);
        }
        break;
      }
      case 'stop':
        this.recordStop(timeSeconds, metrics);
        break;
      case 'turn':
        this.recordTurn(timeSeconds, metrics, rollDeg, pitchDeg, false);
        break;
      case 'reverse-turn':
        this.recordTurn(timeSeconds, metrics, rollDeg, pitchDeg, true);
        break;
    }

    this.previousPosition.copy(metrics.body.position);

    if (timeSeconds + Number.EPSILON < this.durationSeconds) {
      return null;
    }

    this.completed = true;
    this.resultValue = this.createResult(metrics);
    return this.resultValue;
  }

  private recordStop(
    timeSeconds: number,
    metrics: CalibrationStepMetrics,
  ) {
    if (
      !this.stopTrackingInitialized &&
      timeSeconds >= STOP_CUTOFF_SECONDS
    ) {
      this.stopTrackingInitialized = true;
      this.cutoffSpeedMps = metrics.speedMps;
      this.cutoffPosition.copy(metrics.body.position);
      this.previousPosition.copy(metrics.body.position);
    }

    if (!this.stopTrackingInitialized) return;

    const horizontalStepDistance = Math.hypot(
      metrics.body.position.x - this.previousPosition.x,
      metrics.body.position.z - this.previousPosition.z,
    );
    this.stoppingDistanceM += horizontalStepDistance;
    this.finalSpeedMps = metrics.speedMps;

    if (
      this.stoppingTimeSeconds === null &&
      timeSeconds >= STOP_CUTOFF_SECONDS + 0.5 &&
      metrics.speedMps <= STOP_SPEED_THRESHOLD_MPS
    ) {
      this.stoppingTimeSeconds =
        timeSeconds - STOP_CUTOFF_SECONDS;
    }
  }

  private recordTurn(
    timeSeconds: number,
    metrics: CalibrationStepMetrics,
    rollDeg: number,
    pitchDeg: number,
    reverse: boolean,
  ) {
    const turnStartSeconds = reverse
      ? REVERSE_TURN_START_SECONDS
      : TURN_START_SECONDS;
    if (
      !this.turnTrackingInitialized &&
      timeSeconds >= turnStartSeconds
    ) {
      this.turnTrackingInitialized = true;
      if (reverse) {
        this.reverseTurnEntryAsternSpeedMps = Math.max(
          0,
          -metrics.forwardSpeedMps,
        );
      } else {
        this.turnEntrySpeedMps = metrics.speedMps;
      }
      this.previousHeadingRadians = metrics.headingRadians;
      this.previousPosition.copy(metrics.body.position);
    }

    if (!this.turnTrackingInitialized || this.turnMeasurementComplete) {
      return;
    }

    const horizontalStepDistance = Math.hypot(
      metrics.body.position.x - this.previousPosition.x,
      metrics.body.position.z - this.previousPosition.z,
    );
    this.turnPathDistanceM += horizontalStepDistance;
    this.accumulatedHeadingRadians += headingDelta(
      this.previousHeadingRadians,
      metrics.headingRadians,
    );
    this.previousHeadingRadians = metrics.headingRadians;
    this.maximumTurnRollDeg = Math.max(
      this.maximumTurnRollDeg,
      Math.abs(rollDeg),
    );
    this.maximumTurnPitchDeg = Math.max(
      this.maximumTurnPitchDeg,
      Math.abs(pitchDeg),
    );
    if (
      Math.abs(this.accumulatedHeadingRadians) >=
      (reverse
        ? REVERSE_TURN_MEASUREMENT_RADIANS
        : TURN_MEASUREMENT_RADIANS)
    ) {
      this.turnMeasurementComplete = true;
    }
  }

  private createResult(
    finalMetrics: CalibrationStepMetrics,
  ): CalibrationResult {
    const targets =
      VESSEL_CALIBRATION_TARGETS[this.request.vessel][
        this.request.scenario
      ];
    const finiteState = [
      finalMetrics.body.position.x,
      finalMetrics.body.position.y,
      finalMetrics.body.position.z,
      finalMetrics.body.linearVelocity.x,
      finalMetrics.body.linearVelocity.y,
      finalMetrics.body.linearVelocity.z,
      finalMetrics.body.angularVelocity.x,
      finalMetrics.body.angularVelocity.y,
      finalMetrics.body.angularVelocity.z,
      finalMetrics.submergedRatio,
      finalMetrics.speedMps,
      finalMetrics.forwardSpeedMps,
      finalMetrics.hullHealth,
      finalMetrics.displacedVolumeM3,
      finalMetrics.physicalMassKg,
      finalMetrics.floodingRatio,
      finalMetrics.displacementBalanceErrorRatio,
    ].every(Number.isFinite);

    let metrics: Record<string, number | null>;
    let checks: Record<string, boolean>;

    if (this.request.scenario === 'rest') {
      const restTargets = targets as RestTargets;
      metrics = {
        meanOriginYM: roundMetric(this.restY.mean),
        meanSubmergedRatio: roundMetric(this.restSubmersion.mean),
        verticalSpeedRmsMps: roundMetric(this.restVerticalSpeed.rms),
        rollRmsDeg: roundMetric(this.restRoll.rms),
        pitchRmsDeg: roundMetric(this.restPitch.rms),
        displacementBalanceErrorRatio: roundMetric(
          this.restDisplacementError.mean,
        ),
        floodingRatio: roundMetric(this.restFloodingRatio.mean),
        physicalMassKg: roundMetric(finalMetrics.physicalMassKg),
        displacedVolumeM3: roundMetric(finalMetrics.displacedVolumeM3),
      };
      checks = {
        finiteState,
        originWithinEnvelope: rangeContains(
          restTargets.meanOriginYM,
          this.restY.mean,
        ),
        submersionWithinEnvelope: rangeContains(
          restTargets.submergedRatio,
          this.restSubmersion.mean,
        ),
        verticalMotionSettled:
          this.restVerticalSpeed.rms <=
          restTargets.verticalSpeedRmsMaxMps,
        rollSettled:
          this.restRoll.rms <= restTargets.rollRmsMaxDeg,
        pitchSettled:
          this.restPitch.rms <= restTargets.pitchRmsMaxDeg,
        displacementBalanced:
          this.restDisplacementError.mean <=
          restTargets.displacementBalanceErrorMaxRatio,
        calibrationRemainsDry: this.restFloodingRatio.mean <= 1e-6,
      };
    } else if (this.request.scenario === 'stability') {
      const stabilityTargets = targets as StabilityTargets;
      metrics = {
        initialRollDeg: INITIAL_ROLL_DEG,
        recoveryTimeSeconds: roundMetric(this.recoveryTimeSeconds),
        finalRollDeg: roundMetric(this.finalRollDeg),
        peakRollDeg: roundMetric(this.peakRollDeg),
      };
      checks = {
        finiteState,
        recovered:
          this.recoveryTimeSeconds !== null &&
          this.recoveryTimeSeconds <=
            stabilityTargets.recoveryTimeMaxSeconds,
        finalRollSettled:
          this.finalRollDeg <= stabilityTargets.finalRollMaxDeg,
        peakRollBounded:
          this.peakRollDeg <= stabilityTargets.peakRollMaxDeg,
      };
    } else if (this.request.scenario === 'speed') {
      const speedTargets = targets as SpeedTargets;
      metrics = {
        steadySpeedMps: roundMetric(this.speedSteady.mean),
        maximumSpeedMps: roundMetric(this.maximumSpeedMps),
        timeToMinimumCruiseSeconds: roundMetric(
          this.timeToMinimumCruiseSeconds,
        ),
        maximumRollDeg: roundMetric(this.peakRollDeg),
        maximumPitchDeg: roundMetric(this.maximumPitchDeg),
      };
      checks = {
        finiteState,
        steadySpeedWithinEnvelope: rangeContains(
          speedTargets.steadySpeedMps,
          this.speedSteady.mean,
        ),
        maximumSpeedBounded:
          this.maximumSpeedMps <=
          speedTargets.maximumSpeedMaxMps,
        reachedMinimumCruise:
          this.timeToMinimumCruiseSeconds !== null &&
          this.timeToMinimumCruiseSeconds <=
            speedTargets.timeToMinimumCruiseMaxSeconds,
        rollBounded:
          this.peakRollDeg <= speedTargets.maximumRollDeg,
        pitchBounded:
          this.maximumPitchDeg <= speedTargets.maximumPitchDeg,
      };
    } else if (this.request.scenario === 'reverse-speed') {
      const reverseSpeedTargets = targets as ReverseSpeedTargets;
      metrics = {
        steadyAsternSpeedMps: roundMetric(this.reverseSpeedSteady.mean),
        maximumAsternSpeedMps: roundMetric(this.maximumAsternSpeedMps),
        timeToMinimumAsternSeconds: roundMetric(
          this.timeToMinimumAsternSeconds,
        ),
        maximumWrongWayForwardSpeedMps: roundMetric(
          this.maximumWrongWayForwardSpeedMps,
        ),
        maximumRollDeg: roundMetric(this.peakRollDeg),
        maximumPitchDeg: roundMetric(this.maximumPitchDeg),
      };
      checks = {
        finiteState,
        steadyAsternSpeedWithinEnvelope: rangeContains(
          reverseSpeedTargets.steadyAsternSpeedMps,
          this.reverseSpeedSteady.mean,
        ),
        maximumAsternSpeedBounded:
          this.maximumAsternSpeedMps <=
          reverseSpeedTargets.maximumAsternSpeedMaxMps,
        reachedMinimumAsternSpeed:
          this.timeToMinimumAsternSeconds !== null &&
          this.timeToMinimumAsternSeconds <=
            reverseSpeedTargets.timeToMinimumAsternMaxSeconds,
        wrongWayForwardMotionBounded:
          this.maximumWrongWayForwardSpeedMps <=
          reverseSpeedTargets.maximumWrongWayForwardSpeedMps,
        rollBounded:
          this.peakRollDeg <= reverseSpeedTargets.maximumRollDeg,
        pitchBounded:
          this.maximumPitchDeg <= reverseSpeedTargets.maximumPitchDeg,
      };
    } else if (this.request.scenario === 'stop') {
      const stopTargets = targets as StopTargets;
      metrics = {
        cutoffSpeedMps: roundMetric(this.cutoffSpeedMps),
        stoppingTimeSeconds: roundMetric(this.stoppingTimeSeconds),
        stoppingDistanceM: roundMetric(this.stoppingDistanceM),
        finalSpeedMps: roundMetric(this.finalSpeedMps),
      };
      checks = {
        finiteState,
        cutoffSpeedWithinEnvelope: rangeContains(
          stopTargets.cutoffSpeedMps,
          this.cutoffSpeedMps,
        ),
        stoppedWithinTimeEnvelope:
          this.stoppingTimeSeconds !== null &&
          rangeContains(
            stopTargets.stoppingTimeSeconds,
            this.stoppingTimeSeconds,
          ),
        stoppingDistanceWithinEnvelope: rangeContains(
          stopTargets.stoppingDistanceM,
          this.stoppingDistanceM,
        ),
        finalSpeedBounded:
          this.finalSpeedMps <= stopTargets.finalSpeedMaxMps,
      };
    } else if (this.request.scenario === 'turn') {
      const turnTargets = targets as TurnTargets;
      const headingChangeDeg = Math.abs(
        MathUtils.radToDeg(this.accumulatedHeadingRadians),
      );
      const turnRadiusM =
        Math.abs(this.accumulatedHeadingRadians) > 0.1
          ? this.turnPathDistanceM /
            Math.abs(this.accumulatedHeadingRadians)
          : Number.NaN;
      metrics = {
        entrySpeedMps: roundMetric(this.turnEntrySpeedMps),
        headingChangeDeg: roundMetric(headingChangeDeg),
        pathDistanceM: roundMetric(this.turnPathDistanceM),
        turnRadiusM: roundMetric(turnRadiusM),
        maximumRollDeg: roundMetric(this.maximumTurnRollDeg),
      };
      checks = {
        finiteState,
        entrySpeedWithinEnvelope: rangeContains(
          turnTargets.entrySpeedMps,
          this.turnEntrySpeedMps,
        ),
        headingChangeReached:
          headingChangeDeg >= turnTargets.headingChangeMinDeg,
        turnRadiusWithinEnvelope: rangeContains(
          turnTargets.turnRadiusM,
          turnRadiusM,
        ),
        rollBounded:
          this.maximumTurnRollDeg <=
          turnTargets.maximumRollDeg,
      };
    } else {
      const reverseTurnTargets = targets as ReverseTurnTargets;
      const headingChangeDeg = Math.abs(
        MathUtils.radToDeg(this.accumulatedHeadingRadians),
      );
      const turnRadiusM =
        Math.abs(this.accumulatedHeadingRadians) > 0.1
          ? this.turnPathDistanceM /
            Math.abs(this.accumulatedHeadingRadians)
          : Number.NaN;
      metrics = {
        entryAsternSpeedMps: roundMetric(
          this.reverseTurnEntryAsternSpeedMps,
        ),
        headingChangeDeg: roundMetric(headingChangeDeg),
        pathDistanceM: roundMetric(this.turnPathDistanceM),
        turnRadiusM: roundMetric(turnRadiusM),
        maximumRollDeg: roundMetric(this.maximumTurnRollDeg),
        maximumPitchDeg: roundMetric(this.maximumTurnPitchDeg),
      };
      checks = {
        finiteState,
        asternEntrySpeedWithinEnvelope: rangeContains(
          reverseTurnTargets.entryAsternSpeedMps,
          this.reverseTurnEntryAsternSpeedMps,
        ),
        headingChangeReached:
          headingChangeDeg >= reverseTurnTargets.headingChangeMinDeg,
        turnRadiusWithinEnvelope: rangeContains(
          reverseTurnTargets.turnRadiusM,
          turnRadiusM,
        ),
        rollBounded:
          this.maximumTurnRollDeg <=
          reverseTurnTargets.maximumRollDeg,
        pitchBounded:
          this.maximumTurnPitchDeg <=
          reverseTurnTargets.maximumPitchDeg,
      };
    }

    return {
      version: 1,
      vessel: this.request.vessel,
      scenario: this.request.scenario,
      durationSeconds: this.durationSeconds,
      passed: Object.values(checks).every(Boolean),
      checks,
      metrics,
      targets,
    };
  }
}
