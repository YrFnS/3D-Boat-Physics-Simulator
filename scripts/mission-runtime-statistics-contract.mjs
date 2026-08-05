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
  });
}

let snapshot = capture(tracker);
approximatelyEqual(snapshot.elapsedSeconds, 1, 'fixed-step elapsed time');
approximatelyEqual(snapshot.distanceTravelledM, 1, 'fixed-step distance');
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
  snapshot.elapsedSeconds,
  beforeDisabled.elapsedSeconds + STEP_SECONDS,
  'resumed elapsed time',
);
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

tracker.advance({
  runId: 1,
  vesselGeneration: 11,
  enabled: true,
  deltaSeconds: STEP_SECONDS,
  boatX: -119,
  boatZ: 80,
  speedKnots: 6,
});
snapshot = capture(tracker);
approximatelyEqual(
  snapshot.distanceTravelledM,
  beforeRecovery.distanceTravelledM + 1,
  'post-recovery movement must resume distance accumulation',
);

const beforeOutlier = capture(tracker);
tracker.advance({
  runId: 1,
  vesselGeneration: 11,
  enabled: true,
  deltaSeconds: STEP_SECONDS,
  boatX: 500,
  boatZ: 500,
  speedKnots: 6,
});
snapshot = capture(tracker);
approximatelyEqual(
  snapshot.distanceTravelledM,
  beforeOutlier.distanceTravelledM,
  'an unannounced outlier sample must be rejected',
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
assert.equal(snapshot.vesselGeneration, 12);
approximatelyEqual(snapshot.elapsedSeconds, STEP_SECONDS, 'new-run elapsed time');
approximatelyEqual(snapshot.distanceTravelledM, 0, 'new-run distance reset');
assert.equal(snapshot.maximumSpeedKnots, 5);
assert.equal(snapshot.fixedStepCount, 1);

const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const directorSource = await fs.readFile(
  new URL('../components/ScenarioDirector.tsx', import.meta.url),
  'utf8',
);

assert.match(
  boatSource,
  /sharedMissionRuntimeStatistics\.advance\(\{/,
  'Boat fixed steps must advance the shared mission authority.',
);
assert.match(
  boatSource,
  /useNavigationPlanner\.getState\(\)\.mode === 'mission'/,
  'Only mission navigation may advance scored statistics.',
);
assert.match(
  directorSource,
  /sharedMissionRuntimeStatistics\.snapshot/,
  'ScenarioDirector must read fixed-step mission statistics.',
);
assert.doesNotMatch(
  directorSource,
  /statistics\.elapsedSeconds \+= frameDelta/,
  'ScenarioDirector must not accumulate elapsed time from render delta.',
);
assert.doesNotMatch(
  directorSource,
  /previousBoat[ZX]/,
  'ScenarioDirector must not integrate travelled distance from render samples.',
);

console.log('Mission runtime statistics contract passed.');
