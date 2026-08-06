import { Quaternion, Vector3 } from 'three';
import type { SixDofBody } from '../core/SixDofBody.ts';
import type { MissionRuntimeStatisticsSnapshot } from '../scenarios/MissionRuntimeStatistics.ts';
import { worldDirectionToHeadingDegrees } from '../world/WorldDirection.ts';
import { calculateFieldRepairPenalty } from './FieldRepairPolicy.ts';
import type { FloodingResult } from './FloodingModel.ts';
import type { VesselConditionState } from './VesselConditionRuntime.ts';
import type { VesselDynamicsStepResult } from './VesselDynamicsRuntime.ts';

const METERS_PER_SECOND_PER_KNOT = 0.514444;
const TELEMETRY_INTERVAL_SECONDS = 0.1;
const MAXIMUM_WAKE_SPEED_MPS = 35;

export interface VesselTelemetrySharedState {
  boatPos: Vector3;
  boatDir: Vector3;
  boatQuaternion: Quaternion;
  boatLinearVelocity: Vector3;
  boatAngularVelocity: Vector3;
  boatSpeed: number;
  submergedRatio: number;
  displacedVolumeM3: number;
  floodingRatio: number;
  floodedVolumeM3: number;
  physicalMassKg: number;
  displacementBalanceErrorRatio: number;
  centerOfBuoyancy: Vector3;
  averageWaterVelocity: Vector3;
  maximumSlamSeverity: number;
  engineRpm: number;
  shaftRpm: number;
  deliveredShaftPowerW: number;
  absorbedShaftPowerW: number;
  propellerThrustN: number;
  propellerAdvanceRatio: number;
  propellerLoadRatio: number;
  cavitationFactor: number;
  ventilationFactor: number;
  propWashSpeedMps: number;
  rudderAngleRad: number;
  rudderForceN: number;
  rudderFlowSpeedMps: number;
  rudderAngleOfAttackRad: number;
  calibrationReady: number;
  calibrationPassed: number;
  calibrationProgress: number;
  calibrationResult: string;
}

export interface VesselTelemetryStoreSink {
  setTelemetry(
    speedKnots: number,
    headingDegrees: number,
    hullHealth: number,
    engineHealth: number,
    engineTemperature: number,
    rudderHealth: number,
  ): void;
  setFloodingTelemetry(
    floodingRatio: number,
    floodedVolumeM3: number,
  ): void;
  setFieldRepairTelemetry(telemetry: {
    active: boolean;
    activeSeconds: number;
    activationCount: number;
    engineConditionRestored: number;
    rudderConditionRestored: number;
    penaltyPoints: number;
  }): void;
}

export interface VesselMotionTelemetry {
  speedMps: number;
  speedKnots: number;
  headingDegrees: number;
  readonly forwardDirection: Vector3;
}

export interface VesselCalibrationPublication {
  progress: number;
  result?: { passed: boolean } | null;
  motion: VesselMotionTelemetry;
  condition: Readonly<VesselConditionState>;
  flooding: FloodingResult;
  telemetry: VesselTelemetrySharedState;
  store: Pick<
    VesselTelemetryStoreSink,
    'setTelemetry' | 'setFloodingTelemetry'
  >;
}

export interface VesselFixedStepTelemetryPublication {
  deltaSeconds: number;
  calibrationActive: boolean;
  body: SixDofBody;
  motion: VesselMotionTelemetry;
  dynamics: VesselDynamicsStepResult;
  flooding: FloodingResult;
  condition: Readonly<VesselConditionState>;
  missionStatistics: Readonly<MissionRuntimeStatisticsSnapshot>;
  repairActive: boolean;
  telemetry: VesselTelemetrySharedState;
  store: VesselTelemetryStoreSink;
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Owns fixed-step motion sampling and publication.
 *
 * Physics, condition, flooding, mission, and collision remain separate
 * authorities. This runtime converts their outputs into one shared
 * high-frequency snapshot plus deterministic 10 Hz Zustand telemetry.
 */
export class VesselTelemetryRuntime {
  private telemetryAccumulatorSeconds = 0;
  private readonly forwardDirectionValue = new Vector3(0, 0, -1);
  private readonly motionValue: VesselMotionTelemetry = {
    speedMps: 0,
    speedKnots: 0,
    headingDegrees: 0,
    forwardDirection: this.forwardDirectionValue,
  };

  reset() {
    this.telemetryAccumulatorSeconds = 0;
    this.forwardDirectionValue.set(0, 0, -1);
    this.motionValue.speedMps = 0;
    this.motionValue.speedKnots = 0;
    this.motionValue.headingDegrees = 0;
    return this.motionValue;
  }

  sampleMotion(input: {
    body: SixDofBody;
    telemetry: VesselTelemetrySharedState;
  }) {
    const body = input.body;
    const forwardDirection = this.forwardDirectionValue
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion);
    forwardDirection.y = 0;
    if (forwardDirection.lengthSq() > 1e-8) {
      forwardDirection.normalize();
    } else {
      forwardDirection.set(0, 0, -1);
    }

    const speedMps = Math.hypot(
      body.linearVelocity.x,
      body.linearVelocity.z,
    );
    this.motionValue.speedMps = speedMps;
    this.motionValue.speedKnots =
      speedMps / METERS_PER_SECOND_PER_KNOT;
    this.motionValue.headingDegrees =
      worldDirectionToHeadingDegrees(
        forwardDirection.x,
        forwardDirection.z,
      );

    input.telemetry.boatPos.copy(body.position);
    input.telemetry.boatDir.copy(forwardDirection);
    input.telemetry.boatSpeed = Math.min(
      speedMps,
      MAXIMUM_WAKE_SPEED_MPS,
    );
    return this.motionValue;
  }

  publishCalibration(input: VesselCalibrationPublication) {
    input.telemetry.calibrationProgress = Number.isFinite(
      input.progress,
    )
      ? Math.max(0, Math.min(1, input.progress))
      : 0;
    if (!input.result) return;

    input.telemetry.calibrationReady = 1;
    input.telemetry.calibrationPassed = input.result.passed ? 1 : 0;
    input.telemetry.calibrationResult = JSON.stringify(input.result);
    input.store.setTelemetry(
      input.motion.speedKnots,
      input.motion.headingDegrees,
      input.condition.hullHealth,
      input.condition.engineHealth,
      input.condition.engineTemperature,
      input.condition.rudderHealth,
    );
    input.store.setFloodingTelemetry(
      input.flooding.floodingRatio,
      input.flooding.totalFloodedVolumeM3,
    );
  }

  publishFixedStep(input: VesselFixedStepTelemetryPublication) {
    const telemetry = input.telemetry;
    const dynamics = input.dynamics;
    const hydrostatics = dynamics.hydrostaticResult;
    const propulsion = dynamics.propulsionResult;

    if (!input.calibrationActive) {
      this.telemetryAccumulatorSeconds += finiteNonNegative(
        input.deltaSeconds,
      );
      if (
        this.telemetryAccumulatorSeconds >=
        TELEMETRY_INTERVAL_SECONDS
      ) {
        this.telemetryAccumulatorSeconds %=
          TELEMETRY_INTERVAL_SECONDS;
        input.store.setTelemetry(
          input.motion.speedKnots,
          input.motion.headingDegrees,
          input.condition.hullHealth,
          input.condition.engineHealth,
          input.condition.engineTemperature,
          input.condition.rudderHealth,
        );
        input.store.setFloodingTelemetry(
          input.flooding.floodingRatio,
          input.flooding.totalFloodedVolumeM3,
        );
        input.store.setFieldRepairTelemetry({
          active: input.repairActive,
          activeSeconds:
            input.missionStatistics.repairActiveSeconds,
          activationCount:
            input.missionStatistics.repairActivationCount,
          engineConditionRestored:
            input.missionStatistics.engineConditionRestored,
          rudderConditionRestored:
            input.missionStatistics.rudderConditionRestored,
          penaltyPoints: calculateFieldRepairPenalty(
            input.missionStatistics,
          ),
        });
      }
    }

    telemetry.boatPos.copy(input.body.position);
    telemetry.boatDir.copy(input.motion.forwardDirection);
    telemetry.boatQuaternion.copy(input.body.quaternion);
    telemetry.boatLinearVelocity.copy(input.body.linearVelocity);
    telemetry.boatAngularVelocity.copy(input.body.angularVelocity);
    telemetry.boatSpeed = Math.min(
      input.motion.speedMps,
      MAXIMUM_WAKE_SPEED_MPS,
    );
    telemetry.submergedRatio = dynamics.submergedRatio;
    telemetry.displacedVolumeM3 =
      hydrostatics.displacedVolumeM3;
    telemetry.floodingRatio = input.flooding.floodingRatio;
    telemetry.floodedVolumeM3 =
      input.flooding.totalFloodedVolumeM3;
    telemetry.physicalMassKg = dynamics.massKg;
    telemetry.displacementBalanceErrorRatio =
      dynamics.displacementBalanceErrorRatio;
    telemetry.centerOfBuoyancy.copy(
      hydrostatics.centerOfBuoyancyWorld,
    );
    telemetry.averageWaterVelocity.copy(
      hydrostatics.averageWaterVelocityWorld,
    );
    telemetry.maximumSlamSeverity = Math.max(
      telemetry.maximumSlamSeverity,
      hydrostatics.maximumSlamSeverity,
    );
    telemetry.engineRpm = propulsion.engineRpm;
    telemetry.shaftRpm = propulsion.shaftRpm;
    telemetry.deliveredShaftPowerW =
      propulsion.deliveredShaftPowerW;
    telemetry.absorbedShaftPowerW =
      propulsion.absorbedShaftPowerW;
    telemetry.propellerThrustN = propulsion.propellerThrustN;
    telemetry.propellerAdvanceRatio = propulsion.advanceRatio;
    telemetry.propellerLoadRatio = propulsion.loadRatio;
    telemetry.cavitationFactor = propulsion.cavitationFactor;
    telemetry.ventilationFactor = propulsion.ventilationFactor;
    telemetry.propWashSpeedMps = propulsion.propWashSpeedMps;
    telemetry.rudderAngleRad = dynamics.rudderAngleRad;
    telemetry.rudderForceN = dynamics.appliedRudderForceN;
    telemetry.rudderFlowSpeedMps =
      dynamics.rudderHydrodynamics.flowSpeedMps;
    telemetry.rudderAngleOfAttackRad =
      dynamics.rudderHydrodynamics.angleOfAttackRad;
  }
}
