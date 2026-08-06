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
  repairTrackingEnabled: true,
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
    repairTrackingEnabled: true,
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

const beforePaused = capture(tracker);
tracker.advance({
  runId: 1,
  vesselGeneration: 10,
  enabled: false,
  repairTrackingEnabled: false,
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
  beforePaused,
  'Paused and menu intervals must not alter mission or repair statistics.',
);

const beforeFreeNavigation = capture(tracker);
tracker.advance({
  runId: 1,
  vesselGeneration: 10,
  enabled: false,
  repairTrackingEnabled: true,
  deltaSeconds: 2,
  boatX: 30,
  boatZ: -10,
  speedKnots: 0,
  repairActive: true,
  engineConditionRestored: 0.5,
  rudderConditionRestored: 0.75,
});
snapshot = capture(tracker);
approximatelyEqual(
  snapshot.elapsedSeconds,
  beforeFreeNavigation.elapsedSeconds,
  'Free navigation must not advance scored mission time.',
);
approximatelyEqual(
  snapshot.distanceTravelledM,
  beforeFreeNavigation.distanceTravelledM,
  'Free navigation must not add scored mission distance.',
);
approximatelyEqual(
  snapshot.repairActiveSeconds,
  beforeFreeNavigation.repairActiveSeconds + 2,
  'Free-navigation repair time remains attributable to the active mission.',
);
approximatelyEqual(
  snapshot.engineConditionRestored,
  beforeFreeNavigation.engineConditionRestored + 0.5,
  'Free-navigation engine restoration must consume the mission budget.',
);
approximatelyEqual(
  snapshot.rudderConditionRestored,
  beforeFreeNavigation.rudderConditionRestored + 0.75,
  'Free-navigation rudder restoration must consume the mission budget.',
);
assert.equal(
  snapshot.repairActivationCount,
  beforeFreeNavigation.repairActivationCount + 1,
);

const beforeResume = capture(tracker);
tracker.advance({
  runId: 1,
  vesselGeneration: 10,
  enabled: true,
  repairTrackingEnabled: true,
  deltaSeconds: STEP_SECONDS,
  boatX: 30 + 1 / 60,
  boatZ: -10,
  speedKnots: 7,
});
snapshot = capture(tracker);
approximatelyEqual(
  snapshot.distanceTravelledM,
  beforeResume.distanceTravelledM + 1 / 60,
  'Free-navigation interval must reanchor scored distance.',
);

const beforeRecovery = capture(tracker);
tracker.advance({
  runId: 1,
  vesselGeneration: 11,
  enabled: true,
  repairTrackingEnabled: true,
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
  'Vessel recovery teleport must not add distance.',
);
approximatelyEqual(
  snapshot.elapsedSeconds,
  beforeRecovery.elapsedSeconds + STEP_SECONDS,
  'Vessel recovery must not reset mission time.',
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
  repairTrackingEnabled: true,
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
assert.match(boatSource, /repairTrackingEnabled:/);
assert.match(boatSource, /engineConditionRestored:/);
assert.match(directorSource, /sharedMissionRuntimeStatistics\.snapshot/);
assert.doesNotMatch(directorSource, /statistics\.elapsedSeconds \+= frameDelta/);

console.log('Mission runtime statistics contract passed.');
