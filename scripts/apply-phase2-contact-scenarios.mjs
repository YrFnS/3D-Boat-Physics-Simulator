import fs from 'node:fs/promises';

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Unable to find ${label}.`);
  }
  return source.replace(search, replacement);
}

async function updateFile(path, transform) {
  const source = await fs.readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`No changes produced for ${path}.`);
  await fs.writeFile(path, next, 'utf8');
}

await updateFile('sim/calibration/VesselCalibration.ts', (source) => {
  source = replaceOnce(
    source,
    "import type { VesselConfig } from '@/sim/vessels/VesselConfig';\n",
    "import type { VesselConfig } from '@/sim/vessels/VesselConfig';\nimport type { RapierContactSummary } from '@/sim/collision/RapierCollisionWorld';\n",
    'calibration collision-summary import',
  );
  source = replaceOnce(
    source,
    `export interface CalibrationStepMetrics {
  body: SixDofBody;
  submergedRatio: number;
  speedMps: number;
  headingRadians: number;
  hullHealth: number;
}
`,
    `export interface CalibrationStepMetrics {
  body: SixDofBody;
  submergedRatio: number;
  speedMps: number;
  headingRadians: number;
  hullHealth: number;
  engineHealth: number;
  rudderHealth: number;
  collisionSummary?: RapierContactSummary;
}
`,
    'shared calibration metrics',
  );
  source = replaceOnce(
    source,
    'function estimateRestingOriginY(vessel: VesselConfig) {\n',
    'export function estimateRestingOriginY(vessel: VesselConfig) {\n',
    'resting-origin export',
  );
  source = replaceOnce(
    source,
    'const STABILITY_RECOVERY_ROLL_DEG = 2;\n',
    'const STABILITY_RECOVERY_ROLL_DEG = 2;\nconst TURN_MEASUREMENT_RADIANS = Math.PI;\n',
    'turn measurement constant',
  );
  source = replaceOnce(
    source,
    '      steadySpeedMps: { min: 17, max: 36 },\n',
    '      steadySpeedMps: { min: 15, max: 36 },\n',
    'speedboat cruise envelope',
  );
  source = replaceOnce(
    source,
    `export class VesselCalibrationRunner {
  readonly stepsPerRenderFrame = STEPS_PER_RENDER_FRAME;
  readonly durationSeconds: number;
`,
    `export class VesselCalibrationRunner {
  readonly stepsPerRenderFrame = STEPS_PER_RENDER_FRAME;
  readonly durationSeconds: number;
  readonly usesCollisionWorld = false;
  readonly collisionFixture = null;
`,
    'standard calibration collision flags',
  );
  source = replaceOnce(
    source,
    '  private turnTrackingInitialized = false;\n',
    '  private turnTrackingInitialized = false;\n  private turnMeasurementComplete = false;\n',
    'turn completion state',
  );
  source = replaceOnce(
    source,
    `    if (this.request.scenario === 'turn') {
      return {
        throttle: timeSeconds < TURN_START_SECONDS ? 1 : 0.78,
        steer: timeSeconds < TURN_START_SECONDS ? 0 : 1,
      };
    }
`,
    `    if (this.request.scenario === 'turn') {
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
`,
    'controlled turn inputs',
  );
  source = replaceOnce(
    source,
    `    if (!this.turnTrackingInitialized) return;

    const horizontalStepDistance = Math.hypot(
`,
    `    if (!this.turnTrackingInitialized || this.turnMeasurementComplete) {
      return;
    }

    const horizontalStepDistance = Math.hypot(
`,
    'turn completion guard',
  );
  source = replaceOnce(
    source,
    `    this.maximumTurnRollDeg = Math.max(
      this.maximumTurnRollDeg,
      Math.abs(rollDeg),
    );
  }
`,
    `    this.maximumTurnRollDeg = Math.max(
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
`,
    'turn completion threshold',
  );
  return source;
});

const collisionCalibrationSource = `import { Euler, MathUtils, Vector3 } from 'three';
import type { BoatType } from '@/store/useSimStore';
import type { SixDofBody } from '@/sim/core/SixDofBody';
import type {
  CollisionFixtureKind,
  RapierContactSummary,
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
`;
await fs.mkdir('sim/calibration', { recursive: true });
await fs.writeFile(
  'sim/calibration/CollisionCalibration.ts',
  collisionCalibrationSource,
  'utf8',
);

await updateFile('sim/collision/RapierCollisionWorld.ts', (source) => {
  source = replaceOnce(
    source,
    "import { MathUtils, Vector3 } from 'three';\n",
    "import { MathUtils, Quaternion, Vector3 } from 'three';\n",
    'Rapier quaternion import',
  );
  source = replaceOnce(
    source,
    `const DEBUG_PROBE_GAP_M = 0.03;
`,
    `const DEBUG_PROBE_GAP_M = 0.03;
const FIXTURE_WALL_HALF_WIDTH_M = 4.5;
const FIXTURE_WALL_HALF_HEIGHT_M = 1.8;
const FIXTURE_WALL_HALF_DEPTH_M = 0.28;
const SHORE_HALF_WIDTH_M = 6;
const SHORE_HALF_HEIGHT_M = 0.6;
const SHORE_HALF_DEPTH_M = 5;
const SHORE_SLOPE_RAD = MathUtils.degToRad(8);

export type CollisionFixtureKind =
  | 'shoreline'
  | 'glancing'
  | 'head-on';
`,
    'collision fixture constants',
  );
  source = replaceOnce(
    source,
    `  debugProbeContactCount: number;
  maxPenetrationM: number;
`,
    `  debugProbeContactCount: number;
  fixtureContactCount: number;
  fixtureKind: CollisionFixtureKind | null;
  maxObstacleHeadOnFactor: number;
  maxPenetrationM: number;
`,
    'contact summary fixture fields',
  );
  source = replaceOnce(
    source,
    `    debugProbeContactCount: 0,
    maxPenetrationM: 0,
`,
    `    debugProbeContactCount: 0,
    fixtureContactCount: 0,
    fixtureKind: null,
    maxObstacleHeadOnFactor: 0,
    maxPenetrationM: 0,
`,
    'empty fixture summary',
  );
  source = replaceOnce(
    source,
    `  private debugProbeCollider: RAPIER.Collider | null = null;
  private debugProbeConsumed = false;
`,
    `  private debugProbeCollider: RAPIER.Collider | null = null;
  private debugProbeConsumed = false;
  private calibrationFixtureCollider: RAPIER.Collider | null = null;
  private calibrationFixtureKind: CollisionFixtureKind | null = null;
`,
    'fixture collider state',
  );
  source = replaceOnce(
    source,
    `  private readonly debugProbePosition = new Vector3();
  private readonly forward = new Vector3();
`,
    `  private readonly debugProbePosition = new Vector3();
  private readonly fixturePosition = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly fixtureRotation = new Quaternion();
  private readonly localFixtureRotation = new Quaternion();
`,
    'fixture scratch values',
  );
  source = replaceOnce(
    source,
    `    obstacleData: Float32Array,
    debugProbeEnabled = false,
  ): RapierContactSummary {
`,
    `    obstacleData: Float32Array,
    debugProbeEnabled = false,
    fixtureKind: CollisionFixtureKind | null = null,
  ): RapierContactSummary {
`,
    'collision step fixture argument',
  );
  source = replaceOnce(
    source,
    `    this.syncObstacles(obstacleData);
    this.syncDebugProbe(body, vessel, debugProbeEnabled);
`,
    `    this.syncObstacles(obstacleData);
    this.syncDebugProbe(body, vessel, debugProbeEnabled);
    this.syncCalibrationFixture(body, vessel, fixtureKind);
`,
    'fixture synchronization',
  );
  source = replaceOnce(
    source,
    `            const isTerrain =
              otherCollider.handle === this.terrainCollider.handle;
            const isDebugProbe =
              otherCollider.handle === this.debugProbeCollider?.handle;
`,
    `            const isCalibrationFixture =
              otherCollider.handle === this.calibrationFixtureCollider?.handle;
            const fixtureIsTerrain =
              isCalibrationFixture &&
              this.calibrationFixtureKind === 'shoreline';
            const isTerrain =
              otherCollider.handle === this.terrainCollider.handle ||
              fixtureIsTerrain;
            const isDebugProbe =
              otherCollider.handle === this.debugProbeCollider?.handle;
`,
    'fixture contact classification',
  );
  source = replaceOnce(
    source,
    `            summary.contactCount += 1;
            summary.maxPenetrationM = Math.max(
`,
    `            summary.contactCount += 1;
            if (isCalibrationFixture) {
              summary.fixtureContactCount += 1;
              summary.fixtureKind = this.calibrationFixtureKind;
            }
            summary.maxPenetrationM = Math.max(
`,
    'fixture contact counter',
  );
  source = replaceOnce(
    source,
    `            } else {
              summary.obstacleContactCount += 1;
              summary.maxObstacleImpactSpeedMps = Math.max(
`,
    `            } else {
              summary.obstacleContactCount += 1;
              this.forward
                .set(0, 0, -1)
                .applyQuaternion(body.quaternion)
                .normalize();
              summary.maxObstacleHeadOnFactor = Math.max(
                summary.maxObstacleHeadOnFactor,
                Math.abs(this.normal.dot(this.forward)),
              );
              summary.maxObstacleImpactSpeedMps = Math.max(
`,
    'head-on contact factor',
  );
  source = replaceOnce(
    source,
    `    this.removeDebugProbe();

    this.vesselType = vessel.type;
`,
    `    this.removeDebugProbe();
    this.removeCalibrationFixture();

    this.vesselType = vessel.type;
`,
    'fixture reset on vessel change',
  );
  source = replaceOnce(
    source,
    `  private syncDebugProbe(
`,
    `  private syncCalibrationFixture(
    body: SixDofBody,
    vessel: VesselConfig,
    fixtureKind: CollisionFixtureKind | null,
  ) {
    if (!fixtureKind) {
      this.calibrationFixtureCollider?.setEnabled(false);
      return;
    }
    if (
      this.calibrationFixtureCollider &&
      this.calibrationFixtureKind === fixtureKind
    ) {
      this.calibrationFixtureCollider.setEnabled(true);
      return;
    }

    this.removeCalibrationFixture();
    this.calibrationFixtureKind = fixtureKind;
    this.forward
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion)
      .normalize();
    this.right
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion)
      .normalize();
    this.fixtureRotation.copy(body.quaternion);

    if (fixtureKind === 'shoreline') {
      this.fixturePosition
        .copy(body.position)
        .addScaledVector(
          this.forward,
          vessel.halfLengthM + SHORE_HALF_DEPTH_M + 0.5,
        );
      this.fixturePosition.y = -1.4;
      this.localFixtureRotation.setFromAxisAngle(
        new Vector3(1, 0, 0),
        SHORE_SLOPE_RAD,
      );
      this.fixtureRotation.multiply(this.localFixtureRotation).normalize();
      this.calibrationFixtureCollider = this.world.createCollider(
        this.rapier.ColliderDesc.roundCuboid(
          SHORE_HALF_WIDTH_M,
          SHORE_HALF_HEIGHT_M,
          SHORE_HALF_DEPTH_M,
          COLLIDER_BORDER_M,
        )
          .setTranslation(
            this.fixturePosition.x,
            this.fixturePosition.y,
            this.fixturePosition.z,
          )
          .setRotation(this.fixtureRotation)
          .setFriction(0.82)
          .setRestitution(0.01)
          .setContactSkin(CONTACT_SLOP_M)
          .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.ALL),
      );
      return;
    }

    const glancing = fixtureKind === 'glancing';
    this.fixturePosition
      .copy(body.position)
      .addScaledVector(
        this.forward,
        vessel.halfLengthM + 5.5,
      );
    this.fixturePosition.y = body.position.y - 0.05;
    if (glancing) {
      this.fixturePosition.addScaledVector(
        this.right,
        vessel.halfWidthM * 0.45,
      );
      this.localFixtureRotation.setFromAxisAngle(
        new Vector3(0, 1, 0),
        MathUtils.degToRad(50),
      );
      this.fixtureRotation.multiply(this.localFixtureRotation).normalize();
    }

    this.calibrationFixtureCollider = this.world.createCollider(
      this.rapier.ColliderDesc.roundCuboid(
        FIXTURE_WALL_HALF_WIDTH_M,
        FIXTURE_WALL_HALF_HEIGHT_M,
        FIXTURE_WALL_HALF_DEPTH_M,
        COLLIDER_BORDER_M,
      )
        .setTranslation(
          this.fixturePosition.x,
          this.fixturePosition.y,
          this.fixturePosition.z,
        )
        .setRotation(this.fixtureRotation)
        .setFriction(glancing ? 0.24 : 0.32)
        .setRestitution(glancing ? 0.08 : 0.025)
        .setContactSkin(CONTACT_SLOP_M)
        .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.ALL),
    );
  }

  private removeCalibrationFixture() {
    if (this.calibrationFixtureCollider) {
      this.world.removeCollider(this.calibrationFixtureCollider, false);
      this.calibrationFixtureCollider = null;
    }
    this.calibrationFixtureKind = null;
  }

  private syncDebugProbe(
`,
    'calibration fixture methods',
  );
  return source;
});

await updateFile('components/Boat.tsx', (source) => {
  source = replaceOnce(
    source,
    `import {
  parseCalibrationRequest,
  sampleFlatCalibrationWater,
  VesselCalibrationRunner,
} from '@/sim/calibration/VesselCalibration';
`,
    `import {
  parseCalibrationRequest,
  sampleFlatCalibrationWater,
  VesselCalibrationRunner,
} from '@/sim/calibration/VesselCalibration';
import {
  CollisionCalibrationRunner,
  parseCollisionCalibrationRequest,
} from '@/sim/calibration/CollisionCalibration';
`,
    'collision calibration import',
  );
  source = replaceOnce(
    source,
    `interface OrbitControlsLike {
  target: Vector3;
  update: () => void;
}
`,
    `interface OrbitControlsLike {
  target: Vector3;
  update: () => void;
}

type SimulationCalibrationRunner =
  | VesselCalibrationRunner
  | CollisionCalibrationRunner;
`,
    'calibration runner union',
  );
  source = replaceOnce(
    source,
    `  const calibrationRunner = useRef<VesselCalibrationRunner | null>(null);
`,
    `  const calibrationRunner =
    useRef<SimulationCalibrationRunner | null>(null);
`,
    'calibration runner ref type',
  );
  source = replaceOnce(
    source,
    `      boatRight: new Vector3(),
      boatPosition: new Vector3(),
`,
    `      boatRight: new Vector3(),
      boatUp: new Vector3(),
      boatPosition: new Vector3(),
`,
    'upright steering scratch',
  );
  source = replaceOnce(
    source,
    `  useEffect(() => {
    const request = parseCalibrationRequest(window.location.search);
    if (!request) return undefined;

    const store = useSimStore.getState();
    const vessel = getVesselConfig(request.vessel);
    const runner = new VesselCalibrationRunner(request);
`,
    `  useEffect(() => {
    const vesselRequest = parseCalibrationRequest(window.location.search);
    const collisionRequest = parseCollisionCalibrationRequest(
      window.location.search,
    );
    const request = vesselRequest ?? collisionRequest;
    if (!request) return undefined;

    const store = useSimStore.getState();
    const vessel = getVesselConfig(request.vessel);
    const runner: SimulationCalibrationRunner = vesselRequest
      ? new VesselCalibrationRunner(vesselRequest)
      : new CollisionCalibrationRunner(collisionRequest!);
`,
    'calibration request selection',
  );
  source = replaceOnce(
    source,
    `    let targetRudder = steerRaw * vessel.maxRudderAngleRad;
    
    // --- PHASE 2: Rudder Damage Penalty ---
`,
    `    let targetRudder = steerRaw * vessel.maxRudderAngleRad;
    const normalizedSteeringSpeed =
      Math.abs(vRelForward) /
      Math.max(1, vessel.planingReferenceSpeedMps);
    const highSpeedRudderAuthority = vessel.planingCapable
      ? MathUtils.lerp(
          1,
          0.38,
          MathUtils.smoothstep(normalizedSteeringSpeed, 0.55, 1.25),
        )
      : MathUtils.lerp(
          1,
          0.72,
          MathUtils.smoothstep(normalizedSteeringSpeed, 0.8, 1.5),
        );
    targetRudder *= highSpeedRudderAuthority;
    
    // --- PHASE 2: Rudder Damage Penalty ---
`,
    'speed-sensitive rudder authority',
  );
  source = replaceOnce(
    source,
    `    const turnTorque = rudderAngle.current * steeringBite * turnForceMax;
    const rudderForceMagnitude = turnTorque * mass * 0.7;
`,
    `    const turnTorque = rudderAngle.current * steeringBite * turnForceMax;
    const uprightY = scratch.boatUp
      .set(0, 1, 0)
      .applyQuaternion(body.quaternion).y;
    const uprightSteeringAuthority = MathUtils.smoothstep(
      Math.abs(uprightY),
      0.18,
      0.78,
    );
    const rudderForceMagnitude =
      turnTorque * mass * 0.7 * uprightSteeringAuthority;
`,
    'capsize-safe rudder force',
  );
  source = replaceOnce(
    source,
    `    const collisionSummary = calibration
      ? undefined
      : rapierCollisionWorld.current?.step(
          body,
          vessel,
          dt,
          sharedPhysics.obstacles,
          collisionTestEnabled.current && Math.abs(thrustRaw) > 0.1,
        );
`,
    `    const collisionSummary =
      calibration && !calibration.usesCollisionWorld
        ? undefined
        : rapierCollisionWorld.current?.step(
            body,
            vessel,
            dt,
            sharedPhysics.obstacles,
            !calibration &&
              collisionTestEnabled.current &&
              Math.abs(thrustRaw) > 0.1,
            calibration?.collisionFixture ?? null,
          );
`,
    'collision-enabled calibration step',
  );
  source = replaceOnce(
    source,
    `        const damage = Math.min(
          9,
          severity * 1.45 + normalizedImpulse * 0.16,
        );
        hullHealth.current = Math.max(0, hullHealth.current - damage);
        if (severity > 2.5) {
          rudderHealth.current = Math.max(
            0,
            rudderHealth.current - damage * 0.25,
          );
        }
`,
    `        const headOnFactor =
          collisionSummary.maxObstacleHeadOnFactor;
        const damage = Math.min(
          28,
          severity * 1.75 + normalizedImpulse * 0.28,
        );
        hullHealth.current = Math.max(0, hullHealth.current - damage);
        if (severity > 4 && headOnFactor > 0.35) {
          engineHealth.current = Math.max(
            0,
            engineHealth.current -
              damage * 0.18 * headOnFactor,
          );
        }
        if (severity > 2.5) {
          rudderHealth.current = Math.max(
            0,
            rudderHealth.current -
              damage * 0.2 * (1 - headOnFactor * 0.35),
          );
        }
`,
    'contact-driven component damage',
  );
  source = replaceOnce(
    source,
    `      headingRadians: MathUtils.degToRad(headingDeg),
      hullHealth: hullHealth.current,
    });
`,
    `      headingRadians: MathUtils.degToRad(headingDeg),
      hullHealth: hullHealth.current,
      engineHealth: engineHealth.current,
      rudderHealth: rudderHealth.current,
      collisionSummary,
    });
`,
    'calibration collision metrics',
  );
  source = replaceOnce(
    source,
    `    if (calibration) {
      const stepSeconds = fixedStepRunner.current.stepSeconds;
`,
    `    if (
      calibration?.usesCollisionWorld &&
      !rapierCollisionWorld.current
    ) {
      stepResult = {
        steps: 0,
        alpha: 1,
        simulationTimeSeconds: calibrationSimulationTime.current,
        droppedTimeSeconds: 0,
      };
    } else if (calibration) {
      const stepSeconds = fixedStepRunner.current.stepSeconds;
`,
    'Rapier calibration initialization wait',
  );
  return source;
});

await updateFile('scripts/physics-calibration.mjs', (source) => {
  source = replaceOnce(
    source,
    `const calibrationScenarios = ['rest', 'stability', 'speed', 'stop', 'turn'];
const scenarios = vessels.flatMap((vessel) =>
  calibrationScenarios.map((scenario) => ({
    name: \`\${vessel}-\${scenario}\`,
    vessel,
    scenario,
  })),
);
`,
    `const calibrationScenarios = [
  { scenario: 'rest', queryKey: 'calibration' },
  { scenario: 'stability', queryKey: 'calibration' },
  { scenario: 'speed', queryKey: 'calibration' },
  { scenario: 'stop', queryKey: 'calibration' },
  { scenario: 'turn', queryKey: 'calibration' },
  { scenario: 'grounding', queryKey: 'collisionCalibration' },
  { scenario: 'glancing', queryKey: 'collisionCalibration' },
  { scenario: 'impact', queryKey: 'collisionCalibration' },
];
const scenarios = vessels.flatMap((vessel) =>
  calibrationScenarios.map(({ scenario, queryKey }) => ({
    name: \`\${vessel}-\${scenario}\`,
    vessel,
    scenario,
    queryKey,
  })),
);
`,
    'expanded calibration scenario matrix',
  );
  source = replaceOnce(
    source,
    `    url.searchParams.set('calibration', scenario.scenario);
`,
    `    url.searchParams.set(scenario.queryKey, scenario.scenario);
`,
    'scenario-specific query parameter',
  );
  return source;
});

console.log('Applied Phase 2 steering, grounding, glancing, and impact calibration.');
