import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  MissionRuntimeStatistics,
} from '../sim/scenarios/MissionRuntimeStatistics.ts';

const EPSILON = 1e-9;
const STEP_SECONDS = 1 / 60;

function approximatelyEqual(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

function capture(tracker) {
  return { ...tracker.snapshot };
}

const tracker = new MissionRuntimeStatistics(5);
tracker.advance({
  runId: 1,
  vesselGeneration: 10,
  enabled: true,
  deltaSeconds: 0,
  boatX: 0,
  boatZ: 0,
  speedKnots: 0,
});

for (let step = 1; step <= 60; step += 1) {
  tracker.advance({
    runId: 1,
    vesselGeneration: 10,
    enabled: true,
    deltaSeconds: STEP_SECONDS,
    boatX: step / 60,
    boatZ: 0,
    speedKnots: step === 40 ? 14 : 8,
    repairActive: step <= 30,
    engineConditionRestored: step <= 30 ? 0.01 : 0,
    rudderConditionRestored: step <= 30 ? 0.02 : 0,
  });
}

let snapshot = capture(tracker);
approximatelyEqual(snapshot.elapsedSeconds, 1, 'fixed-step elapsed time');
approximatelyEqual(snapshot.distanceTravelledM, 1, 'fixed-step distance');
approximatelyEqual(snapshot.repairActiveSeconds, 0.5, 'repair duration');
approximatelyEqual(snapshot.engineConditionRestored, 0.3, 'engine restoration');
approximatelyEqual(snapshot.rudderConditionRestored, 0.6, 'rudder restoration');
assert.equal(snapshot.repairActivationCount, 1);
assert.equal(snapshot.maximumSpeedKnots, 14);
assert.equal(snapshot.fixedStepCount, 60);

const beforeDisabled = capture(tracker);
tracker.advance({
  runId: 1,
  vesselGeneration: 10,
  enabled: false,
  deltaSeconds: 4,
  boatX: 25,
  boatZ: -12,
  speedKnots: 40,
  repairActive: true,
  engineConditionRestored: 5,
});
snapshot = capture(tracker);
assert.deepEqual(
  snapshot,
  beforeDisabled,
  'Disabled/menu/free-navigation frames must not alter scored statistics.',
);

tracker.advance({
  runId: 1,
  vesselGeneration: 10,
  enabled: true,
  deltaSeconds: STEP_SECONDS,
  boatX: 25 + 1 / 60,
  boatZ: -12,
  speedKnots: 7,
});
snapshot = capture(tracker);
approximatelyEqual(
  snapshot.distanceTravelledM,
  beforeDisabled.distanceTravelledM + 1 / 60,
  'disabled interval must reanchor distance',
);

const beforeRecovery = capture(tracker);
tracker.advance({
  runId: 1,
  vesselGeneration: 11,
  enabled: true,
  deltaSeconds: STEP_SECONDS,
  boatX: -120,
  boatZ: 80,
  speedKnots: 6,
  repairActive: true,
  engineConditionRestored: 0.01,
});
snapshot = capture(tracker);
approximatelyEqual(
  snapshot.distanceTravelledM,
  beforeRecovery.distanceTravelledM,
  'vessel recovery teleport must not add distance',
);
approximatelyEqual(
  snapshot.elapsedSeconds,
  beforeRecovery.elapsedSeconds + STEP_SECONDS,
  'vessel recovery must not reset mission time',
);
assert.equal(
  snapshot.repairActivationCount,
  beforeRecovery.repairActivationCount + 1,
  'Recovery starts a new repair activation without resetting usage.',
);

tracker.advance({
  runId: 2,
  vesselGeneration: 12,
  enabled: true,
  deltaSeconds: STEP_SECONDS,
  boatX: 0,
  boatZ: 0,
  speedKnots: 5,
});
snapshot = capture(tracker);
assert.equal(snapshot.runId, 2);
approximatelyEqual(snapshot.elapsedSeconds, STEP_SECONDS, 'new-run elapsed time');
assert.equal(snapshot.repairActiveSeconds, 0);
assert.equal(snapshot.repairActivationCount, 0);
assert.equal(snapshot.engineConditionRestored, 0);
assert.equal(snapshot.rudderConditionRestored, 0);

const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const directorSource = await fs.readFile(
  new URL('../components/ScenarioDirector.tsx', import.meta.url),
  'utf8',
);

assert.match(boatSource, /sharedMissionRuntimeStatistics\.advance\(\{/);
assert.match(boatSource, /engineConditionRestored:/);
assert.match(directorSource, /sharedMissionRuntimeStatistics\.snapshot/);
assert.doesNotMatch(directorSource, /statistics\.elapsedSeconds \+= frameDelta/);

console.log('Mission runtime statistics contract passed.');
