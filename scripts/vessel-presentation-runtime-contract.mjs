import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Group, Quaternion, Vector3 } from 'three';
import { SixDofBody } from '../sim/core/SixDofBody.ts';
import {
  VesselPresentationRuntime,
} from '../sim/vessels/VesselPresentationRuntime.ts';

const runtime = new VesselPresentationRuntime();
const boat = new Group();
const body = new SixDofBody();
body.linearVelocity.set(2, 0, 0);
const previousPosition = new Vector3(0, 0, 0);
const currentPosition = new Vector3(10, 2, -4);
const previousQuaternion = new Quaternion();
const currentQuaternion = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  -Math.PI / 2,
);
const flag = new Group();
const trawlerEngine = new Group();
const speedboatEngineLeft = new Group();
const speedboatEngineRight = new Group();
const telemetry = {
  renderTime: 0,
  fixedStepAlpha: 0,
  fixedStepCount: 0,
  droppedSimulationTime: 0,
};
const damageUpdates = [];
const audioUpdates = [];
const commonInput = {
  boat,
  body,
  previousPosition,
  currentPosition,
  previousQuaternion,
  currentQuaternion,
  stepResult: {
    steps: 2,
    alpha: 0.5,
    simulationTimeSeconds: 4,
    droppedTimeSeconds: 0.02,
  },
  fixedStepSeconds: 1 / 60,
  simulationRunning: true,
  calibrationActive: false,
  deltaSeconds: 1 / 30,
  windSpeedMps: 8,
  windHeadingDegrees: 90,
  activeBoat: 'speedboat',
  flag,
  trawlerEngine,
  speedboatEngineLeft,
  speedboatEngineRight,
  condition: {
    hullHealth: 80,
    engineHealth: 70,
  },
  dynamics: {
    submergedRatio: 0.75,
    rudderAngleRad: 0.22,
    propulsionResult: { engineRpm: 2_100 },
  },
  cameraPosition: new Vector3(0, 4, 8),
  cameraQuaternion: new Quaternion(),
  telemetry,
  updateVisualDamage(...values) {
    damageUpdates.push(values);
  },
  audio: {
    updateFrame(...values) {
      audioUpdates.push(values);
    },
  },
};

const frame = runtime.updateFrame(commonInput);
const repeatedFrame = runtime.updateFrame(commonInput);
assert.equal(
  frame,
  repeatedFrame,
  'Presentation must reuse its render-frame result object.',
);
assert.deepEqual(boat.position.toArray(), [5, 1, -2]);
assert.ok(Math.abs(telemetry.renderTime - (4 + 0.5 / 60)) < 1e-9);
assert.equal(telemetry.fixedStepAlpha, 0.5);
assert.equal(telemetry.fixedStepCount, 2);
assert.equal(telemetry.droppedSimulationTime, 0.02);
assert.equal(trawlerEngine.rotation.y, 0.22);
assert.equal(speedboatEngineLeft.rotation.y, 0.22);
assert.equal(speedboatEngineRight.rotation.y, 0.22);
assert.ok(Number.isFinite(flag.rotation.y));
assert.equal(damageUpdates.length, 2);
assert.equal(audioUpdates.length, 2);
assert.equal(audioUpdates[0][5], true);
assert.equal(audioUpdates[0][4], 2_100);
assert.equal(frame.horizontalSpeedMps, 2);

runtime.updateFrame({
  ...commonInput,
  simulationRunning: false,
});
assert.equal(
  damageUpdates.at(-1)[2],
  0,
  'Paused/menu frames must not advance damage visuals.',
);
assert.equal(
  audioUpdates.length,
  2,
  'Audio must not update while simulation is not running.',
);

runtime.updateFrame({
  ...commonInput,
  calibrationActive: true,
});
assert.equal(
  audioUpdates.length,
  2,
  'Calibration frames must not update product audio.',
);

const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const runtimeSource = await fs.readFile(
  new URL(
    '../sim/vessels/VesselPresentationRuntime.ts',
    import.meta.url,
  ),
  'utf8',
);
assert.match(boatSource, /new VesselPresentationRuntime\(\)/);
assert.match(
  boatSource,
  /presentationRuntime\.current\.updateFrame\(\{/,
);
assert.doesNotMatch(boatSource, /audio\.updateFrame\(/);
assert.doesNotMatch(boatSource, /setWorldVectorFromHeading\(/);
assert.doesNotMatch(boatSource, /flagApparentWindLocal/);
assert.doesNotMatch(
  boatSource,
  /trawlerEngineRef\.current\.rotation\.y\s*=/,
);
assert.match(runtimeSource, /audio\.updateFrame\(/);
assert.match(runtimeSource, /setWorldVectorFromHeading\(/);
assert.match(runtimeSource, /input\.flag\.rotation\.y/);
assert.match(runtimeSource, /input\.updateVisualDamage\(/);

console.log('Vessel presentation runtime contract passed.');
