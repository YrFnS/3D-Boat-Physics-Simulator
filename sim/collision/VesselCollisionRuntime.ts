import type { RapierContactSummary } from './RapierCollisionWorld.ts';
import type { VesselConfig } from '../vessels/VesselConfig.ts';
import type { VesselDamageEvent } from '../vessels/VesselDamagePolicy.ts';

export type VesselImpactKind = 'terrain' | 'obstacle';

export interface VesselCollisionTelemetryTarget {
  collisionReady: number;
  collisionSequence: number;
  terrainCollisionSequence: number;
  obstacleCollisionSequence: number;
  debugProbeCollisionSequence: number;
  collisionMaxImpactSpeed: number;
  collisionMaxImpulse: number;
  collisionMaxPenetration: number;
}

export interface VesselCollisionConditionSink {
  applyDamage(event: VesselDamageEvent): unknown;
}

export interface VesselCollisionFloodingSink {
  registerBreach(
    vessel: VesselConfig,
    compartmentId: string,
    severity: number,
  ): void;
}

export interface VesselCollisionAudioSink {
  playImpact(severity: number, kind: VesselImpactKind): void;
}

export interface VesselCollisionRandomSource {
  next(): number;
}

export interface VesselCollisionRuntimeStep {
  summary: RapierContactSummary;
  scenarioRunId: number;
  vesselGeneration: number;
  simulationTimeSeconds: number;
  effectiveMassKg: number;
  forwardWaterRelativeSpeedMps: number;
  vessel: VesselConfig;
  condition: VesselCollisionConditionSink;
  flooding: VesselCollisionFloodingSink;
  telemetry: VesselCollisionTelemetryTarget;
  random: VesselCollisionRandomSource;
  audio: VesselCollisionAudioSink;
}

export interface AppliedCollisionImpact {
  kind: VesselImpactKind;
  speedMps: number;
  damage: number;
  compartmentId: string;
  breachSeverity: number;
}

export interface VesselCollisionRuntimeResult {
  terrainImpact: AppliedCollisionImpact | null;
  obstacleImpact: AppliedCollisionImpact | null;
}

export const VESSEL_COLLISION_RESPONSE_POLICY = Object.freeze({
  terrainImpactThresholdMps: 1.8,
  terrainImpactCooldownSeconds: 0.25,
  terrainMaximumDamage: 24,
  obstacleImpactThresholdMps: 0.65,
  obstacleImpactCooldownSeconds: 0.2,
  obstacleMaximumDamage: 28,
});

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteCount(value: number) {
  return Math.floor(finiteNonNegative(value));
}

function normalizeIdentity(value: number) {
  return Number.isFinite(value) ? Math.trunc(value) : -1;
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedMass(value: number, fallback: number) {
  if (Number.isFinite(value) && value > 0) return value;
  if (Number.isFinite(fallback) && fallback > 0) return fallback;
  return 1;
}

function chooseObstacleCompartment(
  vessel: VesselConfig,
  headOnFactor: number,
  random: VesselCollisionRandomSource,
) {
  if (headOnFactor > 0.45) return 'bow';
  const randomValue = clamp(random.next(), 0, 1);
  if (vessel.type === 'trawler') {
    return randomValue < 0.5 ? 'port' : 'starboard';
  }
  return randomValue < 0.5
    ? 'cockpit-port'
    : 'cockpit-starboard';
}

/**
 * Owns all post-Rapier collision effects for one mounted vessel.
 *
 * Rapier remains the authoritative contact solver. This runtime turns
 * its summary into stable gameplay counters, diagnostic maxima,
 * cooldown-gated condition damage, breach selection, and impact audio.
 */
export class VesselCollisionRuntime {
  private lastTerrainImpactTime = Number.NEGATIVE_INFINITY;
  private lastObstacleImpactTime = Number.NEGATIVE_INFINITY;
  private scenarioRunId = -1;
  private vesselGeneration = -1;

  reset(telemetry?: VesselCollisionTelemetryTarget) {
    this.scenarioRunId = -1;
    this.vesselGeneration = -1;
    this.resetImpactCooldowns();
    if (telemetry) {
      telemetry.collisionReady = 0;
      telemetry.collisionSequence = 0;
      telemetry.terrainCollisionSequence = 0;
      telemetry.obstacleCollisionSequence = 0;
      telemetry.debugProbeCollisionSequence = 0;
      telemetry.collisionMaxImpactSpeed = 0;
      telemetry.collisionMaxImpulse = 0;
      telemetry.collisionMaxPenetration = 0;
    }
  }

  setReady(
    telemetry: VesselCollisionTelemetryTarget,
    ready: boolean,
  ) {
    telemetry.collisionReady = ready ? 1 : 0;
  }

  process(
    input: VesselCollisionRuntimeStep,
  ): VesselCollisionRuntimeResult {
    const simulationTimeSeconds = Number.isFinite(
      input.simulationTimeSeconds,
    )
      ? input.simulationTimeSeconds
      : 0;
    this.synchronizeIdentity(
      input.scenarioRunId,
      input.vesselGeneration,
      simulationTimeSeconds,
    );
    this.publishTelemetry(input.summary, input.telemetry);

    const massKg = normalizedMass(
      input.effectiveMassKg,
      input.vessel.massKg,
    );
    const terrainImpact = this.applyTerrainImpact(
      input,
      massKg,
      simulationTimeSeconds,
    );
    const obstacleImpact = this.applyObstacleImpact(
      input,
      massKg,
      simulationTimeSeconds,
    );

    return { terrainImpact, obstacleImpact };
  }

  private synchronizeIdentity(
    scenarioRunId: number,
    vesselGeneration: number,
    simulationTimeSeconds: number,
  ) {
    const normalizedRunId = normalizeIdentity(scenarioRunId);
    const normalizedGeneration = normalizeIdentity(
      vesselGeneration,
    );
    const identityChanged =
      this.scenarioRunId !== normalizedRunId ||
      this.vesselGeneration !== normalizedGeneration;
    const clockMovedBackward =
      simulationTimeSeconds < this.lastTerrainImpactTime ||
      simulationTimeSeconds < this.lastObstacleImpactTime;

    if (identityChanged || clockMovedBackward) {
      this.scenarioRunId = normalizedRunId;
      this.vesselGeneration = normalizedGeneration;
      this.resetImpactCooldowns();
    }
  }

  private resetImpactCooldowns() {
    this.lastTerrainImpactTime = Number.NEGATIVE_INFINITY;
    this.lastObstacleImpactTime = Number.NEGATIVE_INFINITY;
  }

  private publishTelemetry(
    summary: RapierContactSummary,
    telemetry: VesselCollisionTelemetryTarget,
  ) {
    this.setReady(telemetry, true);
    telemetry.collisionMaxImpactSpeed = Math.max(
      finiteNonNegative(telemetry.collisionMaxImpactSpeed),
      finiteNonNegative(summary.maxTerrainImpactSpeedMps),
      finiteNonNegative(summary.maxObstacleImpactSpeedMps),
    );
    telemetry.collisionMaxImpulse = Math.max(
      finiteNonNegative(telemetry.collisionMaxImpulse),
      finiteNonNegative(summary.maxTerrainImpulseNs),
      finiteNonNegative(summary.maxObstacleImpulseNs),
    );
    telemetry.collisionMaxPenetration = Math.max(
      finiteNonNegative(telemetry.collisionMaxPenetration),
      finiteNonNegative(summary.maxPenetrationM),
    );
    telemetry.collisionSequence =
      finiteCount(telemetry.collisionSequence) +
      finiteCount(summary.contactStartCount);
    telemetry.terrainCollisionSequence =
      finiteCount(telemetry.terrainCollisionSequence) +
      finiteCount(summary.terrainContactStartCount);
    telemetry.obstacleCollisionSequence =
      finiteCount(telemetry.obstacleCollisionSequence) +
      finiteCount(summary.obstacleContactStartCount);
    telemetry.debugProbeCollisionSequence =
      finiteCount(telemetry.debugProbeCollisionSequence) +
      finiteCount(summary.debugProbeContactStartCount);
  }

  private applyTerrainImpact(
    input: VesselCollisionRuntimeStep,
    massKg: number,
    simulationTimeSeconds: number,
  ): AppliedCollisionImpact | null {
    const speedMps = finiteNonNegative(
      input.summary.maxTerrainImpactSpeedMps,
    );
    if (
      speedMps <=
        VESSEL_COLLISION_RESPONSE_POLICY.terrainImpactThresholdMps ||
      simulationTimeSeconds - this.lastTerrainImpactTime <
        VESSEL_COLLISION_RESPONSE_POLICY.terrainImpactCooldownSeconds
    ) {
      return null;
    }

    this.lastTerrainImpactTime = simulationTimeSeconds;
    const normalizedImpulse =
      finiteNonNegative(input.summary.maxTerrainImpulseNs) /
      massKg;
    const severity =
      speedMps -
      VESSEL_COLLISION_RESPONSE_POLICY.terrainImpactThresholdMps;
    const damage = Math.min(
      VESSEL_COLLISION_RESPONSE_POLICY.terrainMaximumDamage,
      severity * 3.6 + normalizedImpulse * 0.42,
    );
    input.condition.applyDamage({
      source: 'terrain-impact',
      hullDamage: damage,
      engineDamage: severity > 2.5 ? damage * 0.22 : 0,
      rudderDamage: severity > 2.5 ? damage * 0.32 : 0,
    });

    const compartmentId =
      input.forwardWaterRelativeSpeedMps >= 0
        ? 'bow'
        : input.vessel.type === 'trawler'
          ? 'machinery'
          : 'engine';
    const breachSeverity = clamp(damage / 180, 0, 0.2);
    input.flooding.registerBreach(
      input.vessel,
      compartmentId,
      breachSeverity,
    );
    input.audio.playImpact(speedMps, 'terrain');

    return {
      kind: 'terrain',
      speedMps,
      damage,
      compartmentId,
      breachSeverity,
    };
  }

  private applyObstacleImpact(
    input: VesselCollisionRuntimeStep,
    massKg: number,
    simulationTimeSeconds: number,
  ): AppliedCollisionImpact | null {
    const speedMps = finiteNonNegative(
      input.summary.maxObstacleImpactSpeedMps,
    );
    if (
      speedMps <=
        VESSEL_COLLISION_RESPONSE_POLICY.obstacleImpactThresholdMps ||
      simulationTimeSeconds - this.lastObstacleImpactTime <
        VESSEL_COLLISION_RESPONSE_POLICY.obstacleImpactCooldownSeconds
    ) {
      return null;
    }

    this.lastObstacleImpactTime = simulationTimeSeconds;
    const normalizedImpulse =
      finiteNonNegative(input.summary.maxObstacleImpulseNs) /
      massKg;
    const severity =
      speedMps -
      VESSEL_COLLISION_RESPONSE_POLICY.obstacleImpactThresholdMps;
    const headOnFactor = clamp(
      input.summary.maxObstacleHeadOnFactor,
      0,
      1,
    );
    const damage = Math.min(
      VESSEL_COLLISION_RESPONSE_POLICY.obstacleMaximumDamage,
      severity * 1.75 + normalizedImpulse * 0.28,
    );
    const glancingFactor = 1 - headOnFactor;
    const glancingRudderStrike =
      severity > 2.1 &&
      glancingFactor > 0.3 &&
      normalizedImpulse > 1;
    input.condition.applyDamage({
      source: 'obstacle-impact',
      hullDamage: damage,
      engineDamage:
        severity > 4 && headOnFactor > 0.35
          ? damage * 0.18 * headOnFactor
          : 0,
      rudderDamage:
        severity > 2.5 || glancingRudderStrike
          ? damage * 0.2 * (1 - headOnFactor * 0.35)
          : 0,
    });

    const compartmentId = chooseObstacleCompartment(
      input.vessel,
      headOnFactor,
      input.random,
    );
    const breachSeverity = clamp(damage / 200, 0, 0.18);
    input.flooding.registerBreach(
      input.vessel,
      compartmentId,
      breachSeverity,
    );
    input.audio.playImpact(speedMps, 'obstacle');

    return {
      kind: 'obstacle',
      speedMps,
      damage,
      compartmentId,
      breachSeverity,
    };
  }
}
