import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  VesselCollisionRuntime,
  VESSEL_COLLISION_RESPONSE_POLICY,
} from '../sim/collision/VesselCollisionRuntime.ts';

function emptySummary(overrides = {}) {
  return {
    contactCount: 0,
    terrainContactCount: 0,
    obstacleContactCount: 0,
    debugProbeContactCount: 0,
    fixtureContactCount: 0,
    activeContactPairCount: 0,
    activeExternalContactCount: 0,
    contactStartCount: 0,
    terrainContactStartCount: 0,
    obstacleContactStartCount: 0,
    debugProbeContactStartCount: 0,
    fixtureContactStartCount: 0,
    contactEndCount: 0,
    fixtureKind: null,
    maxObstacleHeadOnFactor: 0,
    maxPenetrationM: 0,
    maxTerrainImpactSpeedMps: 0,
    maxObstacleImpactSpeedMps: 0,
    maxTerrainImpulseNs: 0,
    maxObstacleImpulseNs: 0,
    totalPositionCorrectionM: 0,
    ...overrides,
  };
}

function telemetry() {
  return {
    collisionReady: 1,
    collisionSequence: 9,
    terrainCollisionSequence: 8,
    obstacleCollisionSequence: 7,
    debugProbeCollisionSequence: 6,
    collisionMaxImpactSpeed: 5,
    collisionMaxImpulse: 4,
    collisionMaxPenetration: 3,
  };
}

function effects(randomValues = [0.25]) {
  const damageEvents = [];
  const breaches = [];
  const audioEvents = [];
  let randomIndex = 0;
  return {
    damageEvents,
    breaches,
    audioEvents,
    condition: {
      applyDamage(event) {
        damageEvents.push(event);
      },
    },
    flooding: {
      registerBreach(vessel, compartmentId, severity) {
        breaches.push({
          vesselType: vessel.type,
          compartmentId,
          severity,
        });
      },
    },
    audio: {
      playImpact(severity, kind) {
        audioEvents.push({ severity, kind });
      },
    },
    random: {
      next() {
        const value =
          randomValues[randomIndex] ??
          randomValues[randomValues.length - 1] ??
          0.5;
        randomIndex += 1;
        return value;
      },
    },
  };
}

const trawler = { type: 'trawler', massKg: 1_000 };
const speedboat = { type: 'speedboat', massKg: 1_000 };
const runtime = new VesselCollisionRuntime();
const collisionTelemetry = telemetry();
runtime.reset(collisionTelemetry);
assert.deepEqual(collisionTelemetry, {
  collisionReady: 0,
  collisionSequence: 0,
  terrainCollisionSequence: 0,
  obstacleCollisionSequence: 0,
  debugProbeCollisionSequence: 0,
  collisionMaxImpactSpeed: 0,
  collisionMaxImpulse: 0,
  collisionMaxPenetration: 0,
});
runtime.setReady(collisionTelemetry, true);
assert.equal(collisionTelemetry.collisionReady, 1);

const terrainEffects = effects();
const terrainSummary = emptySummary({
  contactStartCount: 2,
  terrainContactStartCount: 1,
  debugProbeContactStartCount: 1,
  maxTerrainImpactSpeedMps: 2.8,
  maxTerrainImpulseNs: 500,
  maxPenetrationM: 0.06,
});
const terrainResult = runtime.process({
  summary: terrainSummary,
  scenarioRunId: 1,
  vesselGeneration: 4,
  simulationTimeSeconds: 1,
  effectiveMassKg: 1_000,
  forwardWaterRelativeSpeedMps: 4,
  vessel: trawler,
  condition: terrainEffects.condition,
  flooding: terrainEffects.flooding,
  telemetry: collisionTelemetry,
  random: terrainEffects.random,
  audio: terrainEffects.audio,
});
assert.equal(collisionTelemetry.collisionSequence, 2);
assert.equal(collisionTelemetry.terrainCollisionSequence, 1);
assert.equal(collisionTelemetry.debugProbeCollisionSequence, 1);
assert.equal(collisionTelemetry.collisionMaxImpactSpeed, 2.8);
assert.equal(collisionTelemetry.collisionMaxImpulse, 500);
assert.equal(collisionTelemetry.collisionMaxPenetration, 0.06);
assert.equal(terrainResult.terrainImpact?.compartmentId, 'bow');
assert.equal(terrainEffects.damageEvents[0].source, 'terrain-impact');
assert.equal(terrainEffects.breaches[0].compartmentId, 'bow');
assert.deepEqual(terrainEffects.audioEvents[0], {
  severity: 2.8,
  kind: 'terrain',
});

const suppressed = runtime.process({
  summary: terrainSummary,
  scenarioRunId: 1,
  vesselGeneration: 4,
  simulationTimeSeconds: 1.1,
  effectiveMassKg: 1_000,
  forwardWaterRelativeSpeedMps: 4,
  vessel: trawler,
  condition: terrainEffects.condition,
  flooding: terrainEffects.flooding,
  telemetry: collisionTelemetry,
  random: terrainEffects.random,
  audio: terrainEffects.audio,
});
assert.equal(
  suppressed.terrainImpact,
  null,
  'Repeated terrain response inside the cooldown must be suppressed.',
);
assert.equal(terrainEffects.damageEvents.length, 1);

const generationReset = runtime.process({
  summary: terrainSummary,
  scenarioRunId: 1,
  vesselGeneration: 5,
  simulationTimeSeconds: 1.1,
  effectiveMassKg: 1_000,
  forwardWaterRelativeSpeedMps: -2,
  vessel: trawler,
  condition: terrainEffects.condition,
  flooding: terrainEffects.flooding,
  telemetry: collisionTelemetry,
  random: terrainEffects.random,
  audio: terrainEffects.audio,
});
assert.equal(
  generationReset.terrainImpact?.compartmentId,
  'machinery',
  'Recovery generation changes must reset cooldown identity.',
);

const obstacleRuntime = new VesselCollisionRuntime();
const obstacleTelemetry = telemetry();
obstacleRuntime.reset(obstacleTelemetry);
const obstacleEffects = effects([0.25]);
const obstacleResult = obstacleRuntime.process({
  summary: emptySummary({
    contactStartCount: 1,
    obstacleContactStartCount: 1,
    maxObstacleImpactSpeedMps: 3.2,
    maxObstacleImpulseNs: 1_500,
    maxObstacleHeadOnFactor: 0.2,
  }),
  scenarioRunId: 2,
  vesselGeneration: 1,
  simulationTimeSeconds: 3,
  effectiveMassKg: 1_000,
  forwardWaterRelativeSpeedMps: 6,
  vessel: speedboat,
  condition: obstacleEffects.condition,
  flooding: obstacleEffects.flooding,
  telemetry: obstacleTelemetry,
  random: obstacleEffects.random,
  audio: obstacleEffects.audio,
});
assert.equal(
  obstacleResult.obstacleImpact?.compartmentId,
  'cockpit-port',
);
assert.equal(
  obstacleEffects.damageEvents[0].source,
  'obstacle-impact',
);
assert.ok(obstacleEffects.damageEvents[0].rudderDamage > 0);
assert.equal(
  obstacleEffects.breaches[0].compartmentId,
  'cockpit-port',
);
assert.deepEqual(obstacleEffects.audioEvents[0], {
  severity: 3.2,
  kind: 'obstacle',
});
assert.equal(
  VESSEL_COLLISION_RESPONSE_POLICY.terrainImpactThresholdMps,
  1.8,
);
assert.equal(
  VESSEL_COLLISION_RESPONSE_POLICY.obstacleImpactThresholdMps,
  0.65,
);

const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const runtimeSource = await fs.readFile(
  new URL(
    '../sim/collision/VesselCollisionRuntime.ts',
    import.meta.url,
  ),
  'utf8',
);

assert.match(boatSource, /new VesselCollisionRuntime\(\)/);
assert.match(
  boatSource,
  /collisionRuntime\.current\.process\(\{/,
  'Boat must delegate post-solve collision effects.',
);
assert.doesNotMatch(boatSource, /lastTerrainImpactTime/);
assert.doesNotMatch(boatSource, /lastObstacleImpactTime/);
assert.doesNotMatch(
  boatSource,
  /sharedPhysics\.collisionSequence \+=/,
  'Boat must not own gameplay collision counters.',
);
assert.doesNotMatch(
  boatSource,
  /const terrainImpact = collisionSummary/,
  'Boat must not own terrain impact formulas.',
);
assert.match(runtimeSource, /source: 'terrain-impact'/);
assert.match(runtimeSource, /source: 'obstacle-impact'/);
assert.match(runtimeSource, /registerBreach\(/);
assert.match(runtimeSource, /playImpact\(/);
assert.match(runtimeSource, /summary\.contactStartCount/);

console.log('Vessel collision runtime contract passed.');
