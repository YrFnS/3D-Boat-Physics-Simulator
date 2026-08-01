import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { FixedStepRunner } from '../sim/core/FixedStepRunner.ts';
import { SixDofBody } from '../sim/core/SixDofBody.ts';
import {
  effectiveDraftOffset,
  normalizedSurgeSpeed,
  planingSpeedRatio,
  projectOntoAxis,
  referenceForceForAcceleration,
  waterRelativeSurgeSpeed,
} from '../sim/vessels/PhysicsCorrectness.ts';

const TOLERANCE = 1e-9;

function approximatelyEqual(actual, expected, tolerance = TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function testFixedStepTimeAccounting() {
  const runner = new FixedStepRunner();
  assert.equal(runner.maxSubSteps, 6);

  const callbackTimes = [];
  const first = runner.advance(0.1, (_step, time) => {
    callbackTimes.push(time);
  });
  assert.equal(first.steps, 6);
  approximatelyEqual(first.simulationTimeSeconds, 0.1);
  approximatelyEqual(first.droppedTimeSeconds, 0);
  approximatelyEqual(first.alpha, 0);
  assert.equal(callbackTimes.length, 6);
  assert.ok(callbackTimes.every((time, index) => index === 0 || time > callbackTimes[index - 1]));

  for (let index = 0; index < 9; index += 1) {
    runner.advance(0.1, () => undefined);
  }
  approximatelyEqual(runner.simulationTimeSeconds, 1);
  approximatelyEqual(runner.droppedTimeSeconds, 0);

  const stalledRunner = new FixedStepRunner();
  const stalled = stalledRunner.advance(1, () => undefined);
  assert.equal(stalled.steps, 6);
  approximatelyEqual(stalled.simulationTimeSeconds, 0.1);
  approximatelyEqual(stalled.droppedTimeSeconds, 0.9);

  const interpolationRunner = new FixedStepRunner();
  const halfStep = interpolationRunner.advance(1 / 120, () => undefined);
  assert.equal(halfStep.steps, 0);
  approximatelyEqual(halfStep.alpha, 0.5);
  const completedStep = interpolationRunner.advance(1 / 120, () => undefined);
  assert.equal(completedStep.steps, 1);
  approximatelyEqual(completedStep.alpha, 0);

  const highRateRunner = new FixedStepRunner({ stepSeconds: 1 / 120 });
  assert.equal(highRateRunner.maxSubSteps, 12);
  assert.throws(
    () =>
      new FixedStepRunner({
        stepSeconds: 1 / 60,
        maxFrameDeltaSeconds: 0.1,
        maxSubSteps: 5,
      }),
    /must cover maxFrameDeltaSeconds/,
  );

  stalledRunner.reset(Number.NaN);
  approximatelyEqual(stalledRunner.simulationTimeSeconds, 0);
  approximatelyEqual(stalledRunner.droppedTimeSeconds, 0);
}

function testDraftAndPlaningConventions() {
  const intactDraft = effectiveDraftOffset(-0.8, 0, 0);
  const floodedDraft = effectiveDraftOffset(-0.8, 0.6, 0.15);
  assert.ok(floodedDraft > intactDraft);

  const waterHeight = -1;
  const fixedHullPointY = -1.2;
  const intactDepth = waterHeight - intactDraft - fixedHullPointY;
  const floodedDepth = waterHeight - floodedDraft - fixedHullPointY;
  assert.ok(
    floodedDepth < intactDepth,
    'Flooding must reduce support at a fixed position so the hull settles lower.',
  );

  const forward = { x: 0, y: 0, z: -1 };
  assert.equal(
    waterRelativeSurgeSpeed(
      { x: 0, y: 0, z: -12 },
      { x: 0, y: 0, z: -12 },
      forward,
    ),
    0,
  );
  assert.equal(
    planingSpeedRatio(
      waterRelativeSurgeSpeed(
        { x: 0, y: 0, z: -5 },
        { x: 0, y: 0, z: -10 },
        forward,
      ),
      15,
    ),
    0,
    'A following current faster than the boat cannot create planing lift.',
  );
  assert.equal(planingSpeedRatio(-8, 15), 0);
  approximatelyEqual(planingSpeedRatio(7.5, 15), 0.5);
  approximatelyEqual(normalizedSurgeSpeed(-7.5, 15), 0.5);

  const pitch = new Quaternion().setFromAxisAngle(
    new Vector3(1, 0, 0),
    Math.PI / 6,
  );
  const pitchedForward = new Vector3(0, 0, -1).applyQuaternion(pitch);
  assert.ok(Math.abs(pitchedForward.y) > 0.4);
  approximatelyEqual(
    projectOntoAxis(pitchedForward, pitchedForward),
    1,
  );
}

function testMassAwareReferenceForces() {
  const forceN = referenceForceForAcceleration(10);
  approximatelyEqual(forceN, 10_000);
  const speedboatAcceleration = forceN / 800;
  const trawlerAcceleration = forceN / 1_500;
  assert.ok(speedboatAcceleration > trawlerAcceleration);
}

function testLastValidStateAndMotionLimits() {
  const body = new SixDofBody();
  body.position.set(12, 3, -4);
  body.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 0.4);
  body.linearVelocity.set(4, 2, -1);
  body.angularVelocity.set(0.1, 0.2, 0.3);
  body.beginStep();

  const expectedPosition = body.position.clone();
  const expectedQuaternion = body.quaternion.clone();
  const expectedLinearVelocity = body.linearVelocity.clone();
  const expectedAngularVelocity = body.angularVelocity.clone();

  body.addForce(new Vector3(Number.NaN, 0, 0));
  body.integrate(1 / 60);
  assert.deepEqual(body.position.toArray(), expectedPosition.toArray());
  assert.deepEqual(body.quaternion.toArray(), expectedQuaternion.toArray());
  assert.deepEqual(
    body.linearVelocity.toArray(),
    expectedLinearVelocity.toArray(),
  );
  assert.deepEqual(
    body.angularVelocity.toArray(),
    expectedAngularVelocity.toArray(),
  );

  body.linearVelocity.set(60, 100, 80);
  body.angularVelocity.set(3, 4, 0);
  assert.equal(
    body.enforceMotionLimits({
      maxHorizontalSpeedMps: 80,
      maxVerticalSpeedMps: 40,
      maxAngularSpeedRadPerSecond: 2,
    }),
    true,
  );
  approximatelyEqual(
    Math.hypot(body.linearVelocity.x, body.linearVelocity.z),
    80,
  );
  approximatelyEqual(body.linearVelocity.y, 40);
  approximatelyEqual(body.angularVelocity.length(), 2);
}

testFixedStepTimeAccounting();
testDraftAndPlaningConventions();
testMassAwareReferenceForces();
testLastValidStateAndMotionLimits();

console.log('Physics correctness regression tests passed.');
