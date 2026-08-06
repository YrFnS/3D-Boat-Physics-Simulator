import { Group, Quaternion, Vector3 } from 'three';
import type { SixDofBody } from '../core/SixDofBody.ts';
import { setWorldVectorFromHeading } from '../world/WorldDirection.ts';

export interface VesselPresentationStepResult {
  steps: number;
  alpha: number;
  simulationTimeSeconds: number;
  droppedTimeSeconds: number;
}

export interface VesselPresentationTelemetrySink {
  renderTime: number;
  fixedStepAlpha: number;
  fixedStepCount: number;
  droppedSimulationTime: number;
}

export interface VesselPresentationConditionSource {
  readonly hullHealth: number;
  readonly engineHealth: number;
}

export interface VesselPresentationDynamicsSource {
  readonly submergedRatio: number;
  readonly rudderAngleRad: number;
  readonly propulsionResult: {
    readonly engineRpm: number;
  };
}

export interface VesselPresentationAudioSink {
  updateFrame(
    boatPosition: Vector3,
    forwardDirection: Vector3,
    cameraPosition: Vector3,
    cameraQuaternion: Quaternion,
    engineRpm: number,
    isSpeedboat: boolean,
    horizontalSpeed: number,
    submergedRatio: number,
  ): void;
}

export interface VesselPresentationUpdateInput {
  boat: Group;
  body: SixDofBody;
  previousPosition: Vector3;
  currentPosition: Vector3;
  previousQuaternion: Quaternion;
  currentQuaternion: Quaternion;
  stepResult: VesselPresentationStepResult;
  fixedStepSeconds: number;
  simulationRunning: boolean;
  calibrationActive: boolean;
  deltaSeconds: number;
  windSpeedMps: number;
  windHeadingDegrees: number;
  activeBoat: string;
  flag: Group | null;
  trawlerEngine: Group | null;
  speedboatEngineLeft: Group | null;
  speedboatEngineRight: Group | null;
  condition: VesselPresentationConditionSource;
  dynamics: VesselPresentationDynamicsSource;
  cameraPosition: Vector3;
  cameraQuaternion: Quaternion;
  telemetry: VesselPresentationTelemetrySink;
  updateVisualDamage(
    hullHealth: number,
    engineHealth: number,
    deltaSeconds: number,
  ): void;
  audio: VesselPresentationAudioSink;
}

export interface VesselPresentationFrame {
  horizontalSpeedMps: number;
  readonly forwardDirection: Vector3;
}

/**
 * Owns render-only vessel coordination after fixed-step advancement.
 *
 * It interpolates the visual root, publishes render timing, aligns the
 * flag and steering meshes, updates cached damage materials, and feeds
 * the Web Audio graph. It never advances authoritative simulation.
 */
export class VesselPresentationRuntime {
  private readonly forwardDirectionValue = new Vector3(0, 0, -1);
  private readonly windVelocity = new Vector3();
  private readonly apparentWind = new Vector3();
  private readonly localAirflow = new Vector3();
  private readonly inverseBoatQuaternion = new Quaternion();
  private readonly frameValue: VesselPresentationFrame = {
    horizontalSpeedMps: 0,
    forwardDirection: this.forwardDirectionValue,
  };

  updateFrame(input: VesselPresentationUpdateInput) {
    const alpha = Number.isFinite(input.stepResult.alpha)
      ? Math.max(0, Math.min(1, input.stepResult.alpha))
      : 1;
    const fixedStepSeconds = Number.isFinite(input.fixedStepSeconds)
      ? Math.max(0, input.fixedStepSeconds)
      : 0;
    const simulationTimeSeconds = Number.isFinite(
      input.stepResult.simulationTimeSeconds,
    )
      ? input.stepResult.simulationTimeSeconds
      : 0;

    input.telemetry.renderTime =
      simulationTimeSeconds + alpha * fixedStepSeconds;
    input.telemetry.fixedStepAlpha = alpha;
    input.telemetry.fixedStepCount = Number.isFinite(
      input.stepResult.steps,
    )
      ? Math.max(0, Math.trunc(input.stepResult.steps))
      : 0;
    input.telemetry.droppedSimulationTime = Number.isFinite(
      input.stepResult.droppedTimeSeconds,
    )
      ? Math.max(0, input.stepResult.droppedTimeSeconds)
      : 0;

    input.boat.position.lerpVectors(
      input.previousPosition,
      input.currentPosition,
      alpha,
    );
    input.boat.quaternion.slerpQuaternions(
      input.previousQuaternion,
      input.currentQuaternion,
      alpha,
    );

    const forwardDirection = this.forwardDirectionValue
      .set(0, 0, -1)
      .applyQuaternion(input.boat.quaternion);
    forwardDirection.y = 0;
    if (forwardDirection.lengthSq() > 1e-8) {
      forwardDirection.normalize();
    } else {
      forwardDirection.set(0, 0, -1);
    }

    setWorldVectorFromHeading(
      this.windVelocity,
      input.windHeadingDegrees,
      input.windSpeedMps,
    );
    this.apparentWind
      .copy(this.windVelocity)
      .sub(input.body.linearVelocity);

    if (input.flag && this.apparentWind.lengthSq() > 0.1) {
      this.localAirflow
        .copy(this.apparentWind)
        .applyQuaternion(
          this.inverseBoatQuaternion
            .copy(input.boat.quaternion)
            .invert(),
        );
      this.localAirflow.y = 0;
      if (this.localAirflow.lengthSq() > 1e-8) {
        input.flag.rotation.y = Math.atan2(
          this.localAirflow.x,
          this.localAirflow.z,
        );
      }
    }

    const rudderAngle = input.dynamics.rudderAngleRad;
    if (input.trawlerEngine) {
      input.trawlerEngine.rotation.y = rudderAngle;
    }
    if (input.speedboatEngineLeft) {
      input.speedboatEngineLeft.rotation.y = rudderAngle;
    }
    if (input.speedboatEngineRight) {
      input.speedboatEngineRight.rotation.y = rudderAngle;
    }

    const renderDelta = input.simulationRunning
      ? Math.min(
          Math.max(
            0,
            Number.isFinite(input.deltaSeconds)
              ? input.deltaSeconds
              : 0,
          ),
          0.1,
        )
      : 0;
    input.updateVisualDamage(
      input.condition.hullHealth,
      input.condition.engineHealth,
      renderDelta,
    );

    const horizontalSpeedMps = Math.hypot(
      input.body.linearVelocity.x,
      input.body.linearVelocity.z,
    );
    this.frameValue.horizontalSpeedMps = horizontalSpeedMps;

    if (
      !input.calibrationActive &&
      input.simulationRunning
    ) {
      input.audio.updateFrame(
        input.boat.position,
        forwardDirection,
        input.cameraPosition,
        input.cameraQuaternion,
        input.dynamics.propulsionResult.engineRpm,
        input.activeBoat === 'speedboat',
        horizontalSpeedMps,
        input.dynamics.submergedRatio,
      );
    }

    return this.frameValue;
  }
}
