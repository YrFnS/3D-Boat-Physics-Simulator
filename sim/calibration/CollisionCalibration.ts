import { Euler, MathUtils, Vector3 } from 'three';
import type { BoatType } from '@/store/useSimStore';
import type { SixDofBody } from '@/sim/core/SixDofBody';
import type {
  CollisionFixtureKind,
} from '@/sim/collision/RapierCollisionWorld';
import {
  estimateRestingOriginY,
  type CalibrationStepMetrics,
} from '@/sim/calibration/VesselCalibration';
import type { VesselConfig } from '@/sim/vessels/VesselConfig';

export const COLLISION_CALIBRATION_SCENARIOS = [
  'grounding',
  'glancing',
  'impact',
] as const;

export type CollisionCalibrationScenario =
  (typeof COLLISION_CALIBRATION_SCENARIOS)[number];

export interface CollisionCalibrationRequest {
  scenario: CollisionCalibrationScenario;
  vessel: BoatType;
}

interface NumericRange {
  min: number;
  max: number;
}

interface CollisionTargets {
  impactSpeedMps: NumericRange;
  impulseNs: NumericRange;
  maximumPenetrationM: number;
  maximumRollDeg: number;
  hullDamage: NumericRange;
  engineDamage: NumericRange;
  rudderDamage: NumericRange;
}

export interface CollisionCalibrationResult {
  version: 1;
  vessel: BoatType;
  scenario: CollisionCalibrationScenario;
  durationSeconds: number;
  passed: boolean;
  checks: Record<string, boolean>;
  metrics: Record<string, number | null>;
  targets: CollisionTargets;
}

const STEPS_PER_RENDER_FRAME = 180;
const RELEASE_COMMAND_SECONDS = 3.2;
const CONTACT_RELEASE_GRACE_SECONDS = 0.55;

const TARGETS: Readonly<
  Record<BoatType, Record<CollisionCalibrationScenario, CollisionTargets>>
> = {
  trawler: {
    grounding: {
      impactSpeedMps: { min: 0.25, max: 7.5 },
      impulseNs: { min: 25, max: 18_000 },
      maximumPenetrationM: 0.2,
      maximumRollDeg: 28,
      hullDamage: { min: 0, max: 18 },
      engineDamage: { min: 0, max: 6 },
      rudderDamage: { min: 0, max: 8 },
    },
    glancing: {
      impactSpeedMps: { min: 1, max: 10 },
      impulseNs: { min: 100, max: 18_000 },
      maximumPenetrationM: 0.16,
      maximumRollDeg: 35,
      hullDamage: { min: 0.5, max: 18 },
      engineDamage: { min: 0, max: 5 },
      rudderDamage: { min: 0.2, max: 8 },
    },
    impact: {
      impactSpeedMps: { min: 6, max: 18 },
      impulseNs: { min: 1_500, max: 18_000 },
      maximumPenetrationM: 0.18,
      maximumRollDeg: 40,
      hullDamage: { min: 6, max: 32 },
      engineDamage: { min: 0.5, max: 10 },
      rudderDamage: { min: 0.5, max: 10 },
    },
  },
  speedboat: {
    grounding: {
      impactSpeedMps: { min: 0.25, max: 8.5 },
      impulseNs: { min: 20, max: 9_600 },
      maximumPenetrationM: 0.2,
      maximumRollDeg: 30,
      hullDamage: { min: 0, max: 20 },
      engineDamage: { min: 0, max: 7 },
      rudderDamage: { min: 0, max: 9 },
    },
    glancing: {
      impactSpeedMps: { min: 1.2, max: 12 },
      impulseNs: { min: 80, max: 9_600 },
      maximumPenetrationM: 0.16,
      maximumRollDeg: 38,
      hullDamage: { min: 0.5, max: 20 },
      engineDamage: { min: 0, max: 6 },
      rudderDamage: { min: 0.2, max: 9 },
    },
    impact: {
      impactSpeedMps: { min: 9, max: 24 },
      impulseNs: { min: 1_000, max: 9_600 },
      maximumPenetrationM: 0.18,
      maximumRollDeg: 42,
      hullDamage: { min: 8, max: 34 },
      engineDamage: { min: 0.75, max: 12 },
      rudderDamage: { min: 0.5, max: 12 },
    },
  },
};

function rangeContains(range: NumericRange, value: number) {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

function roundMetric(value: number | null, digits = 5) {
  if (value === null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function parseCollisionCalibrationRequest(
  search: string,
): CollisionCalibrationRequest | null {
  const params = new URLSearchParams(search);
  const scenario = params.get('collisionCalibration');
  const vessel = params.get('vessel');

  if (
    !COLLISION_CALIBRATION_SCENARIOS.includes(
      scenario as CollisionCalibrationScenario,
    ) ||
    (vessel !== 'trawler' && vessel !== 'speedboat')
  ) {
    return null;
  }

  return {
    scenario: scenario as CollisionCalibrationScenario,
    vessel,
  };
}

function fixtureForScenario(
  scenario: CollisionCalibrationScenario,
): CollisionFixtureKind {
  if (scenario === 'grounding') return 'shoreline';
  if (scenario === 'glancing') return 'glancing';
  return 'head-on';
}

function initialSpeedFor(
  vessel: BoatType,
  scenario: CollisionCalibrationScenario,
) {
  if (scenario === 'grounding') return vessel === 'speedboat' ? 5.5 : 4.5;
  if (scenario === 'glancing') return vessel === 'speedboat' ? 9.5 : 7;
  return vessel === 'speedboat' ? 16 : 11.5;
}

export class CollisionCalibrationRunner {
  readonly stepsPerRenderFrame = STEPS_PER_RENDER_FRAME;
  readonly usesCollisionWorld = true;
  readonly collisionFixture: CollisionFixtureKind;
  readonly durationSeconds: number;

  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly initialPosition = new Vector3();
  private initialized = false;
  private completed = false;
  private resultValue: CollisionCalibrationResult | null = null;
  private lastRecordedTimeSeconds = 0;
  private initialSpeedMps = 0;
  private contactCount = 0;
  private terrainContactCount = 0;
  private obstacleContactCount = 0;
  private firstContactTimeSeconds: number | null = null;
  private lastContactTimeSeconds: number | null = null;
  private maximumImpactSpeedMps = 0;
  private maximumImpulseNs = 0;
  private maximumPenetrationM = 0;
  private maximumRollDeg = 0;
  private maximumAngularSpeedRadPerSecond = 0;
  private minimumSpeedAfterContactMps = Number.POSITIVE_INFINITY;
  private finalSpeedMps = 0;
  private finalHullHealth = 100;
  private finalEngineHealth = 100;
  private finalRudderHealth = 100;
  private finalDistanceFromStartM = 0;
  private releasedAfterGrounding = false;

  constructor(readonly request: CollisionCalibrationRequest) {
    this.collisionFixture = fixtureForScenario(request.scenario);
    this.durationSeconds = request.scenario === 'grounding' ? 12 : 8;
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

  initialize(body: SixDofBody, vessel: VesselConfig) {
    body.position.set(0, estimateRestingOriginY(vessel), 0);
    body.quaternion.identity();
    this.initialSpeedMps = initialSpeedFor(
      this.request.vessel,
      this.request.scenario,
    );
    body.linearVelocity.set(0, 0, -this.initialSpeedMps);
    body.angularVelocity.set(0, 0, 0);
    this.initialPosition.copy(body.position);
    this.initialized = true;
  }

  controls(timeSeconds: number) {
    if (this.request.scenario === 'grounding') {
      return {
        throttle:
          timeSeconds >= RELEASE_COMMAND_SECONDS && timeSeconds < 9
            ? -0.72
            : 0,
        steer: 0,
      };
    }
    return { throttle: 0, steer: 0 };
  }

  recordStep(
    timeSeconds: number,
    metrics: CalibrationStepMetrics,
  ): CollisionCalibrationResult | null {
    if (!this.initialized || this.completed) return null;

    this.lastRecordedTimeSeconds = timeSeconds;
    this.euler.setFromQuaternion(metrics.body.quaternion, 'YXZ');
    this.maximumRollDeg = Math.max(
      this.maximumRollDeg,
      Math.abs(MathUtils.radToDeg(this.euler.z)),
    );
    this.maximumAngularSpeedRadPerSecond = Math.max(
      this.maximumAngularSpeedRadPerSecond,
      metrics.body.angularVelocity.length(),
    );
    this.finalSpeedMps = metrics.speedMps;
    this.finalHullHealth = metrics.hullHealth;
    this.finalEngineHealth = metrics.engineHealth;
    this.finalRudderHealth = metrics.rudderHealth;
    this.finalDistanceFromStartM = Math.hypot(
      metrics.body.position.x - this.initialPosition.x,
      metrics.body.position.z - this.initialPosition.z,
    );

    const collision = metrics.collisionSummary;
    const stepContactCount = collision?.contactCount ?? 0;
    if (stepContactCount > 0) {
      this.contactCount += stepContactCount;
      this.terrainContactCount += collision?.terrainContactCount ?? 0;
      this.obstacleContactCount += collision?.obstacleContactCount ?? 0;
      this.firstContactTimeSeconds ??= timeSeconds;
      this.lastContactTimeSeconds = timeSeconds;
      this.maximumImpactSpeedMps = Math.max(
        this.maximumImpactSpeedMps,
        collision?.maxTerrainImpactSpeedMps ?? 0,
        collision?.maxObstacleImpactSpeedMps ?? 0,
      );
      this.maximumImpulseNs = Math.max(
        this.maximumImpulseNs,
        collision?.maxTerrainImpulseNs ?? 0,
        collision?.maxObstacleImpulseNs ?? 0,
      );
      this.maximumPenetrationM = Math.max(
        this.maximumPenetrationM,
        collision?.maxPenetrationM ?? 0,
      );
    }

    if (this.firstContactTimeSeconds !== null) {
      this.minimumSpeedAfterContactMps = Math.min(
        this.minimumSpeedAfterContactMps,
        metrics.speedMps,
      );
    }
    if (
      this.request.scenario === 'grounding' &&
      this.lastContactTimeSeconds !== null &&
      timeSeconds - this.lastContactTimeSeconds >=
        CONTACT_RELEASE_GRACE_SECONDS &&
      timeSeconds >= RELEASE_COMMAND_SECONDS + 1
    ) {
      this.releasedAfterGrounding = true;
    }

    if (timeSeconds + Number.EPSILON < this.durationSeconds) return null;

    this.completed = true;
    this.resultValue = this.createResult(metrics);
    return this.resultValue;
  }

  private createResult(
    finalMetrics: CalibrationStepMetrics,
  ): CollisionCalibrationResult {
    const targets = TARGETS[this.request.vessel][this.request.scenario];
    const hullDamage = 100 - this.finalHullHealth;
    const engineDamage = 100 - this.finalEngineHealth;
    const rudderDamage = 100 - this.finalRudderHealth;
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
      this.maximumImpactSpeedMps,
      this.maximumImpulseNs,
      this.maximumPenetrationM,
      hullDamage,
      engineDamage,
      rudderDamage,
    ].every(Number.isFinite);
    const expectedTerrain = this.request.scenario === 'grounding';
    const speedReduced =
      this.minimumSpeedAfterContactMps < this.initialSpeedMps * 0.72;

    const checks: Record<string, boolean> = {
      finiteState,
      collisionRecorded: this.contactCount > 0,
      collisionClassRecorded: expectedTerrain
        ? this.terrainContactCount > 0
        : this.obstacleContactCount > 0,
      impactSpeedWithinEnvelope: rangeContains(
        targets.impactSpeedMps,
        this.maximumImpactSpeedMps,
      ),
      impulseWithinEnvelope: rangeContains(
        targets.impulseNs,
        this.maximumImpulseNs,
      ),
      penetrationBounded:
        this.maximumPenetrationM <= targets.maximumPenetrationM,
      rollBounded: this.maximumRollDeg <= targets.maximumRollDeg,
      angularSpeedBounded:
        this.maximumAngularSpeedRadPerSecond < 6,
      hullDamageWithinEnvelope: rangeContains(
        targets.hullDamage,
        hullDamage,
      ),
      engineDamageWithinEnvelope: rangeContains(
        targets.engineDamage,
        engineDamage,
      ),
      rudderDamageWithinEnvelope: rangeContains(
        targets.rudderDamage,
        rudderDamage,
      ),
      speedReduced,
    };

    if (this.request.scenario === 'grounding') {
      checks.releasedAfterReverse = this.releasedAfterGrounding;
      checks.releaseTravelRecorded = this.finalDistanceFromStartM >= 0.5;
    }

    return {
      version: 1,
      vessel: this.request.vessel,
      scenario: this.request.scenario,
      durationSeconds: this.durationSeconds,
      passed: Object.values(checks).every(Boolean),
      checks,
      metrics: {
        initialSpeedMps: roundMetric(this.initialSpeedMps),
        firstContactTimeSeconds: roundMetric(
          this.firstContactTimeSeconds,
        ),
        lastContactTimeSeconds: roundMetric(this.lastContactTimeSeconds),
        contactCount: roundMetric(this.contactCount),
        terrainContactCount: roundMetric(this.terrainContactCount),
        obstacleContactCount: roundMetric(this.obstacleContactCount),
        maximumImpactSpeedMps: roundMetric(this.maximumImpactSpeedMps),
        maximumImpulseNs: roundMetric(this.maximumImpulseNs),
        maximumPenetrationM: roundMetric(this.maximumPenetrationM),
        maximumRollDeg: roundMetric(this.maximumRollDeg),
        maximumAngularSpeedRadPerSecond: roundMetric(
          this.maximumAngularSpeedRadPerSecond,
        ),
        minimumSpeedAfterContactMps: roundMetric(
          Number.isFinite(this.minimumSpeedAfterContactMps)
            ? this.minimumSpeedAfterContactMps
            : null,
        ),
        finalSpeedMps: roundMetric(this.finalSpeedMps),
        finalDistanceFromStartM: roundMetric(this.finalDistanceFromStartM),
        hullDamage: roundMetric(hullDamage),
        engineDamage: roundMetric(engineDamage),
        rudderDamage: roundMetric(rudderDamage),
      },
      targets,
    };
  }
}
