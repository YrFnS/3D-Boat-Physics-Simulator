import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { FixedStepRunner } from '../sim/core/FixedStepRunner.ts';
import { SixDofBody } from '../sim/core/SixDofBody.ts';
import { FloodingModel } from '../sim/vessels/FloodingModel.ts';
import {
  dampingPowerW,
  displacedColumnVolumeM3,
  displacementBalanceErrorRatio,
  estimateHydrostaticRestingOriginY,
  slamForceN,
} from '../sim/vessels/HydrostaticsMath.ts';
import {
  normalizedSurgeSpeed,
  planingSpeedRatio,
  projectOntoAxis,
  referenceForceForAcceleration,
  waterRelativeSurgeSpeed,
} from '../sim/vessels/PhysicsCorrectness.ts';
import { getVesselConfig } from '../sim/vessels/VesselConfig.ts';
import { sampleGerstnerSurface } from '../sim/water/GerstnerWater.ts';
import { createWaterSurfaceSample } from '../sim/water/WaterSurface.ts';

const TOLERANCE = 1e-9;

function approximatelyEqual(actual, expected, tolerance = TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function assertFiniteValues(values, label) {
  assert.ok(
    values.every(Number.isFinite),
    `${label} must contain only finite values: ${values.join(', ')}`,
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
  assert.ok(
    callbackTimes.every(
      (time, index) => index === 0 || time > callbackTimes[index - 1],
    ),
  );

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

function testReferenceFramesAndPlaning() {
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
  approximatelyEqual(projectOntoAxis(pitchedForward, pitchedForward), 1);
}

function displacedVolumeAtOrigin(vessel, originY, availability = {}) {
  let displacedVolumeM3 = 0;
  for (const cell of vessel.hydrostaticCells) {
    const lowerReferenceY =
      originY + cell.localPosition[1] + vessel.baseDraftM;
    const depthM = -1 - lowerReferenceY;
    displacedVolumeM3 += displacedColumnVolumeM3(
      cell.waterplaneAreaM2,
      depthM,
      cell.maxImmersionDepthM,
      cell.volumeExponent,
      availability[cell.compartmentId] ?? 1,
    );
  }
  return displacedVolumeM3;
}

function testSectionalHydrostaticEquilibrium() {
  for (const type of ['trawler', 'speedboat']) {
    const vessel = getVesselConfig(type);
    const restingOriginY = estimateHydrostaticRestingOriginY(vessel);
    const displacedVolumeM3 = displacedVolumeAtOrigin(
      vessel,
      restingOriginY,
    );
    const balanceError = displacementBalanceErrorRatio(
      displacedVolumeM3,
      vessel.massKg,
      vessel.waterDensityKgM3,
    );
    assert.ok(balanceError < 1e-7, `${type} static displacement must balance`);
    assert.ok(
      displacedVolumeAtOrigin(vessel, restingOriginY - 0.12) >
        displacedVolumeM3,
      `${type} displacement must increase as the hull settles`,
    );
    assert.ok(
      displacedVolumeAtOrigin(vessel, restingOriginY + 0.12) <
        displacedVolumeM3,
      `${type} displacement must decrease as the hull rises`,
    );

    const floodedCompartment = vessel.floodCompartments[0];
    const reducedSupport = displacedVolumeAtOrigin(vessel, restingOriginY, {
      [floodedCompartment.id]: 0.35,
    });
    assert.ok(
      reducedSupport < displacedVolumeM3,
      `${type} flooding must reduce sealed reserve buoyancy`,
    );
  }
}

function testWaterStateSampling() {
  const waves = [
    { x: 1, y: 0, z: 0.11, w: 18 },
    { x: 0.45, y: 0.893028, z: 0.07, w: 7 },
  ];
  const options = {
    baseHeightM: -1,
    dampening: 1,
    vortexX: 10_000,
    vortexZ: 10_000,
  };
  const x = 13.4;
  const z = -5.8;
  const time = 3.2;
  const sample = sampleGerstnerSurface(
    waves,
    x,
    z,
    time,
    options,
    createWaterSurfaceSample(),
  );
  assertFiniteValues(Object.values(sample), 'Gerstner water sample');
  approximatelyEqual(
    Math.hypot(sample.normalX, sample.normalY, sample.normalZ),
    1,
    1e-8,
  );

  const epsilon = 1e-4;
  const before = sampleGerstnerSurface(
    waves,
    x,
    z,
    time - epsilon,
    options,
    createWaterSurfaceSample(),
  );
  const after = sampleGerstnerSurface(
    waves,
    x,
    z,
    time + epsilon,
    options,
    createWaterSurfaceSample(),
  );
  const finiteDifferenceVerticalVelocity =
    (after.y - before.y) / (2 * epsilon);
  approximatelyEqual(
    sample.velocityY,
    finiteDifferenceVerticalVelocity,
    0.04,
  );

  const left = sampleGerstnerSurface(
    waves,
    x - epsilon,
    z,
    time,
    options,
    createWaterSurfaceSample(),
  );
  const right = sampleGerstnerSurface(
    waves,
    x + epsilon,
    z,
    time,
    options,
    createWaterSurfaceSample(),
  );
  const back = sampleGerstnerSurface(
    waves,
    x,
    z - epsilon,
    time,
    options,
    createWaterSurfaceSample(),
  );
  const front = sampleGerstnerSurface(
    waves,
    x,
    z + epsilon,
    time,
    options,
    createWaterSurfaceSample(),
  );
  const gradientNormal = new Vector3(
    -(right.y - left.y) / (2 * epsilon),
    1,
    -(front.y - back.y) / (2 * epsilon),
  ).normalize();
  const sampledNormal = new Vector3(
    sample.normalX,
    sample.normalY,
    sample.normalZ,
  );
  assert.ok(
    sampledNormal.dot(gradientNormal) > 0.985,
    'Analytic water normal must match the sampled surface gradient.',
  );
}

function testDampingAlwaysDissipatesEnergy() {
  for (const velocity of [-12, -2, -0.1, 0, 0.1, 2, 12]) {
    assert.ok(
      dampingPowerW(velocity, 850, 420) <= TOLERANCE,
      `Damping must not add energy at velocity ${velocity}`,
    );
  }
}

function testCompartmentFloodingAndPumping() {
  const vessel = getVesselConfig('trawler');
  const model = new FloodingModel();
  model.reset(vessel);
  model.registerBreach(vessel, 'port', 1);

  let flooded;
  for (let index = 0; index < 700; index += 1) {
    flooded = model.step({
      vessel,
      deltaSeconds: 0.1,
      hullHealth: 20,
      engineHealth: 100,
      compartmentExposure: { port: 1 },
      activePump: false,
      winterFactor: 0,
    });
  }
  assert.ok(flooded.floodingRatio > 0.05);
  assert.ok(flooded.floodWaterMassKg > 0);
  assert.ok(flooded.physicalMassKg > vessel.massKg);
  assert.ok(
    flooded.centerOfMassLocal[0] < vessel.centerOfMassLocal[0],
    'Port flooding must move the center of mass to port.',
  );
  assert.ok(flooded.buoyancyAvailabilityByCompartment.port < 1);

  const volumeBeforePumping = flooded.totalFloodedVolumeM3;
  let pumped = flooded;
  for (let index = 0; index < 500; index += 1) {
    pumped = model.step({
      vessel,
      deltaSeconds: 0.1,
      hullHealth: 100,
      engineHealth: 100,
      compartmentExposure: { port: 0 },
      activePump: true,
      winterFactor: 0,
    });
  }
  assert.ok(
    pumped.totalFloodedVolumeM3 < volumeBeforePumping,
    'Active pumping must remove compartment water.',
  );

  const winterModel = new FloodingModel();
  const winter = winterModel.step({
    vessel,
    deltaSeconds: 0,
    hullHealth: 100,
    engineHealth: 100,
    compartmentExposure: {},
    activePump: false,
    winterFactor: 1,
  });
  approximatelyEqual(
    winter.physicalMassKg,
    vessel.massKg + vessel.winterLoad.maximumMassKg,
  );
  assert.ok(
    winter.centerOfMassLocal[1] > vessel.centerOfMassLocal[1],
    'Deck icing must raise the center of mass.',
  );
}

function testLocalizedSlamScaling() {
  const common = {
    waterDensityKgM3: 1025,
    slamAreaM2: 0.8,
    relativeEntrySpeedMps: 5,
    wettingRatePerSecond: 4,
    slamCoefficient: 0.8,
    maximumForceN: 100_000_000,
  };
  const shallowDeadrise = slamForceN({ ...common, deadriseDeg: 10 });
  const deepDeadrise = slamForceN({ ...common, deadriseDeg: 35 });
  assert.ok(shallowDeadrise > deepDeadrise);
  assert.ok(
    slamForceN({
      ...common,
      relativeEntrySpeedMps: 8,
      deadriseDeg: 10,
    }) >
      shallowDeadrise,
  );
  assert.equal(
    slamForceN({ ...common, deadriseDeg: 10, maximumForceN: 100 }),
    100,
  );
}

function testMassAwareReferenceForcesAndAddedMass() {
  const forceN = referenceForceForAcceleration(10);
  approximatelyEqual(forceN, 10_000);
  const speedboatAcceleration = forceN / 800;
  const trawlerAcceleration = forceN / 1_500;
  assert.ok(speedboatAcceleration > trawlerAcceleration);

  const bareBody = new SixDofBody();
  bareBody.setMassProperties(1_000, [1_000, 1_000, 1_000], [0, 0, 0]);
  bareBody.beginStep();
  bareBody.addForce(new Vector3(1_000, 0, 0));
  bareBody.integrate(1);

  const addedMassBody = new SixDofBody();
  addedMassBody.setMassProperties(
    1_000,
    [1_000, 1_000, 1_000],
    [0, 0, 0],
    [0, 0, 0],
    [1_000, 0, 0],
  );
  addedMassBody.beginStep();
  addedMassBody.addForce(new Vector3(1_000, 0, 0));
  addedMassBody.integrate(1);
  assert.ok(
    addedMassBody.linearVelocity.x < bareBody.linearVelocity.x,
    'Added mass must reduce acceleration in its configured body axis.',
  );
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
testReferenceFramesAndPlaning();
testSectionalHydrostaticEquilibrium();
testWaterStateSampling();
testDampingAlwaysDissipatesEnergy();
testCompartmentFloodingAndPumping();
testLocalizedSlamScaling();
testMassAwareReferenceForcesAndAddedMass();
testLastValidStateAndMotionLimits();

console.log('Physics correctness regression tests passed.');
