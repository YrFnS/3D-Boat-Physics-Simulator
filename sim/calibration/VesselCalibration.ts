import { Euler, MathUtils, Vector3 } from 'three';
import type { BoatType } from '@/store/useSimStore';
import type { SixDofBody } from '@/sim/core/SixDofBody';
import type { WaterHeightSampler } from '@/sim/vessels/DistributedHullForces';
import type { VesselConfig } from '@/sim/vessels/VesselConfig';
import type { RapierContactSummary } from '@/sim/collision/RapierCollisionWorld';

export const CALIBRATION_SCENARIOS = [
  'rest',
  'stability',
  'speed',
  'stop',
  'turn',
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

export interface VesselCalibrationTargets {
  rest: RestTargets;
  stability: StabilityTargets;
  speed: SpeedTargets;
  stop: StopTargets;
  turn: TurnTargets;
}

export interface CalibrationStepMetrics {
  body: SixDofBody;
  submergedRatio: number;
  speedMps: number;
  headingRadians: number;
  hullHealth: number;
  engineHealth: number;
  rudderHealth: number;
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
    | StopTargets
    | TurnTargets;
}

const FLAT_WATER_HEIGHT_M = -1;
const INITIAL_ROLL_DEG = 12;
const REST_SAMPLE_START_SECONDS = 10;
const SPEED_SAMPLE_START_SECONDS = 19;
const STOP_CUTOFF_SECONDS = 14;
const TURN_START_SECONDS = 12;
const STOP_SPEED_THRESHOLD_MPS = 0.5;
const STABILITY_RECOVERY_ROLL_DEG = 2;
const TURN_MEASUREMENT_RADIANS = Math.PI;
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
  },
  speedboat: {
    rest: {
      submergedRatio: { min: 0.5, max: 0.98 },
      meanOriginYM: { min: -1.45, max: -0.15 },
      verticalSpeedRmsMaxMps: 0.28,
      rollRmsMaxDeg: 2,
      pitchRmsMaxDeg: 2.2,
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

function averageHullPointY(vessel: VesselConfig) {
  let weightedY = 0;
  let totalWeight = 0;

  for (const point of vessel.hullForcePoints) {
    const weight = Math.max(0, point.weight);
    weightedY += point.localPosition[1] * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedY / totalWeight : 0;
}

export function estimateRestingOriginY(vessel: VesselConfig) {
  const averagePointY = averageHullPointY(vessel);
  const hydrostaticDepthM = 9.81 / Math.max(1, vessel.buoyancyStiffness);

  return (
    FLAT_WATER_HEIGHT_M -
    vessel.baseDraftM -
    averagePointY -
    hydrostaticDepthM
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

export const sampleFlatCalibrationWater: WaterHeightSampler = (
  x,
  z,
  _timeSeconds,
  target,
) => {
  target.x = x;
  target.y = FLAT_WATER_HEIGHT_M;
  target.z = z;
  return target;
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
  private readonly speedSteady = new RunningStatistics();

  private initialized = false;
  private completed = false;
  private resultValue: CalibrationResult | null = null;
  private peakRollDeg = 0;
  private finalRollDeg = 0;
  private recoveryTimeSeconds: number | null = null;
  private maximumSpeedMps = 0;
  private timeToMinimumCruiseSeconds: number | null = null;
  private cutoffSpeedMps = 0;
  private stoppingTimeSeconds: number | null = null;
  private stoppingDistanceM = 0;
  private finalSpeedMps = 0;
  private turnEntrySpeedMps = 0;
  private turnPathDistanceM = 0;
  private accumulatedHeadingRadians = 0;
  private previousHeadingRadians = 0;
  private maximumTurnRollDeg = 0;
  private stopTrackingInitialized = false;
  private turnTrackingInitialized = false;
  private turnMeasurementComplete = false;

  constructor(readonly request: CalibrationRequest) {
    this.durationSeconds =
      request.scenario === 'rest'
        ? 18
        : request.scenario === 'stability'
          ? 14
          : request.scenario === 'speed'
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
    if (this.request.scenario === 'stop') {
      return {
        throttle: timeSeconds < STOP_CUTOFF_SECONDS ? 1 : 0,
        steer: 0,
      };
    }
    if (this.request.scenario === 'turn') {
      const approachThrottle =
        this.request.vessel === 'speedboat' ? 0.72 : 0.82;
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

    this.euler.setFromQuaternion(metrics.body.quaternion, 'YXZ');
    const pitchDeg = MathUtils.radToDeg(this.euler.x);
    const rollDeg = MathUtils.radToDeg(this.euler.z);
    this.finalRollDeg = Math.abs(rollDeg);
    this.peakRollDeg = Math.max(this.peakRollDeg, Math.abs(rollDeg));

    switch (this.request.scenario) {
      case 'rest':
        if (timeSeconds >= REST_SAMPLE_START_SECONDS) {
          this.restY.push(metrics.body.position.y);
          this.restSubmersion.push(metrics.submergedRatio);
          this.restVerticalSpeed.push(metrics.body.linearVelocity.y);
          this.restRoll.push(rollDeg);
          this.restPitch.push(pitchDeg);
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
      case 'stop':
        this.recordStop(timeSeconds, metrics);
        break;
      case 'turn':
        this.recordTurn(timeSeconds, metrics, rollDeg);
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
  ) {
    if (
      !this.turnTrackingInitialized &&
      timeSeconds >= TURN_START_SECONDS
    ) {
      this.turnTrackingInitialized = true;
      this.turnEntrySpeedMps = metrics.speedMps;
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
    if (
      Math.abs(this.accumulatedHeadingRadians) >=
      TURN_MEASUREMENT_RADIANS
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
      finalMetrics.hullHealth,
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
    } else {
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
