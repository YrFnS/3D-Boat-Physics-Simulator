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
import {
  computeRudderHydrodynamics,
  evaluatePropellerOpenWater,
  MarinePropulsionSystem,
  propellerCavitationFactor,
  resolveRudderForceComponents,
} from '../sim/vessels/PropulsionSystem.ts';
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


function runPropulsionToSteadyState(
  vessel,
  throttle,
  engineHealthRatio = 1,
  propellerSubmergenceM = 1,
) {
  const system = new MarinePropulsionSystem();
  system.reset(vessel.engine);
  let result;
  for (let index = 0; index < 600; index += 1) {
    result = system.step(vessel.engine, vessel.propeller, {
      deltaSeconds: 1 / 60,
      throttle,
      engineHealthRatio,
      temperatureEfficiency: 1,
      combustionEfficiency: 1,
      waterDensityKgM3: vessel.waterDensityKgM3,
      propellerAdvanceSpeedMps: 0,
      propellerSubmergenceM,
    });
  }
  return { ...result };
}

function testPowerLimitedPropulsionAndSignedManeuvering() {
  for (const vesselType of ['trawler', 'speedboat']) {
    const vessel = getVesselConfig(vesselType);
    const ahead = runPropulsionToSteadyState(vessel, 1);
    assertFiniteValues(Object.values(ahead), `${vesselType} ahead drivetrain`);
    assert.ok(ahead.engineRpm > vessel.engine.idleRpm);
    assert.ok(ahead.shaftRpm > 0);
    assert.ok(ahead.propellerThrustN > 0);
    assert.ok(ahead.deliveredShaftPowerW <= vessel.engine.ratedPowerW * 1.01);
    assert.ok(
      ahead.absorbedShaftPowerW <= ahead.deliveredShaftPowerW * 1.01,
      `${vesselType} propeller load must remain within delivered shaft power`,
    );

    const astern = runPropulsionToSteadyState(vessel, -1);
    assertFiniteValues(Object.values(astern), `${vesselType} astern drivetrain`);
    assert.ok(astern.shaftRpm < 0);
    assert.ok(astern.propellerThrustN < 0);
    assert.ok(
      Math.abs(astern.deliveredShaftPowerW) <
        ahead.deliveredShaftPowerW,
      `${vesselType} astern power must respect the reverse-power limit`,
    );

    const damaged = runPropulsionToSteadyState(vessel, 1, 0.35);
    assert.ok(
      damaged.deliveredShaftPowerW < ahead.deliveredShaftPowerW * 0.5,
      `${vesselType} engine damage must reduce delivered shaft power`,
    );

    const submerged = evaluatePropellerOpenWater(
      vessel.propeller,
      vessel.waterDensityKgM3,
      ahead.shaftRpm,
      1,
      0,
      vessel.propeller.ventilationFullSubmergenceM,
    );
    const ventilated = evaluatePropellerOpenWater(
      vessel.propeller,
      vessel.waterDensityKgM3,
      ahead.shaftRpm,
      1,
      0,
      0,
    );
    assert.ok(
      Math.abs(ventilated.propellerThrustN) <
        Math.abs(submerged.propellerThrustN),
      `${vesselType} ventilation must reduce propeller thrust`,
    );

    const cavitating = propellerCavitationFactor(
      vessel.propeller,
      vessel.waterDensityKgM3,
      Math.abs(ahead.shaftRpm) / 30,
      vessel.propeller.maximumThrustN * 3,
    );
    assert.ok(cavitating < 1);
    assert.ok(cavitating >= vessel.propeller.minimumCavitationFactor);

    const noFlow = computeRudderHydrodynamics({
      config: vessel.rudder,
      waterDensityKgM3: vessel.waterDensityKgM3,
      forwardFlowMps: 0,
      rightFlowMps: 0,
      rudderAngleRad: vessel.rudder.maximumAngleRad,
      submergenceM: vessel.rudder.ventilationFullSubmergenceM,
      healthRatio: 1,
    });
    approximatelyEqual(noFlow.forceMagnitudeN, 0);

    const neutralAheadRudder = computeRudderHydrodynamics({
      config: vessel.rudder,
      waterDensityKgM3: vessel.waterDensityKgM3,
      forwardFlowMps: 6,
      rightFlowMps: 0,
      rudderAngleRad: 0,
      submergenceM: vessel.rudder.ventilationFullSubmergenceM,
      healthRatio: 1,
    });
    assert.ok(
      neutralAheadRudder.dragCoefficient <= 0.03,
      `${vesselType} streamlined neutral rudder drag must stay bounded`,
    );
    assert.ok(
      Number.isFinite(vessel.propeller.shaftAngleRad) &&
        Math.abs(vessel.propeller.shaftAngleRad) <= Math.PI / 6,
      `${vesselType} propeller shaft angle must stay physically bounded`,
    );

    const aheadRudder = computeRudderHydrodynamics({
      config: vessel.rudder,
      waterDensityKgM3: vessel.waterDensityKgM3,
      forwardFlowMps: 6,
      rightFlowMps: 0,
      rudderAngleRad: -vessel.rudder.maximumAngleRad * 0.6,
      submergenceM: vessel.rudder.ventilationFullSubmergenceM,
      healthRatio: 1,
    });
    const aheadComponents = resolveRudderForceComponents(
      aheadRudder,
      6,
      0,
    );
    assert.ok(aheadRudder.forceMagnitudeN > 0);
    assert.ok(aheadComponents.rightN < 0);

    const neutralSideslip = computeRudderHydrodynamics({
      config: vessel.rudder,
      waterDensityKgM3: vessel.waterDensityKgM3,
      forwardFlowMps: 6,
      rightFlowMps: 1.5,
      rudderAngleRad: 0,
      submergenceM: vessel.rudder.ventilationFullSubmergenceM,
      healthRatio: 1,
    });
    const neutralSideslipComponents = resolveRudderForceComponents(
      neutralSideslip,
      6,
      1.5,
    );
    assert.ok(
      neutralSideslipComponents.rightN < 0,
      `${vesselType} neutral rudder must damp starboard sideslip`,
    );

    const asternRudder = computeRudderHydrodynamics({
      config: vessel.rudder,
      waterDensityKgM3: vessel.waterDensityKgM3,
      forwardFlowMps: -6,
      rightFlowMps: 0,
      rudderAngleRad: -vessel.rudder.maximumAngleRad * 0.6,
      submergenceM: vessel.rudder.ventilationFullSubmergenceM,
      healthRatio: 1,
    });
    const asternComponents = resolveRudderForceComponents(
      asternRudder,
      -6,
      0,
    );
    assert.ok(
      Math.sign(asternComponents.rightN) ===
        -Math.sign(aheadComponents.rightN),
      `${vesselType} rudder side force must reverse in astern flow`,
    );
  }
}

function testSplitIntegrationAndExternalSolverState() {
  const configureBody = (body) => {
    body.position.set(3, -0.7, 8);
    body.quaternion
      .setFromAxisAngle(new Vector3(0, 1, 0), -0.35)
      .multiply(
        new Quaternion().setFromAxisAngle(
          new Vector3(1, 0, 0),
          0.12,
        ),
      )
      .multiply(
        new Quaternion().setFromAxisAngle(
          new Vector3(0, 0, 1),
          0.08,
        ),
      )
      .normalize();
    body.linearVelocity.set(2.5, -0.3, -4.2);
    body.angularVelocity.set(0.18, -0.22, 0.31);
    body.setMassProperties(
      1_250,
      [2_300, 2_900, 980],
      [0.2, 0.15, 0.25],
      [0.08, -0.12, 0.2],
      [260, 480, 180],
      [220, 160, 280],
    );
    body.beginStep();
    body.addForceAtPoint(
      new Vector3(1_800, 3_400, -2_100),
      new Vector3(3.7, -0.4, 6.9),
    );
    body.addTorque(new Vector3(420, -180, 260));
  };

  const composed = new SixDofBody();
  const split = new SixDofBody();
  configureBody(composed);
  configureBody(split);

  const deltaSeconds = 1 / 60;
  composed.integrate(deltaSeconds);
  assert.equal(split.integrateVelocities(deltaSeconds), true);
  assert.equal(split.integratePose(deltaSeconds), true);

  for (const [label, actual, expected] of [
    ['position', split.position.toArray(), composed.position.toArray()],
    ['quaternion', split.quaternion.toArray(), composed.quaternion.toArray()],
    [
      'linear velocity',
      split.linearVelocity.toArray(),
      composed.linearVelocity.toArray(),
    ],
    [
      'angular velocity',
      split.angularVelocity.toArray(),
      composed.angularVelocity.toArray(),
    ],
  ]) {
    assert.equal(actual.length, expected.length);
    actual.forEach((value, index) =>
      approximatelyEqual(
        value,
        expected[index],
        1e-10,
      ),
    );
    assertFiniteValues(actual, `split integration ${label}`);
  }

  const centerOfMass = split.getCenterOfMassLocal(new Vector3());
  const principalInertia = split.getPrincipalInertia(new Vector3());
  assert.deepEqual(centerOfMass.toArray(), [0.08, -0.12, 0.2]);
  assert.deepEqual(principalInertia.toArray(), [2_520, 3_060, 1_260]);

  const imported = split.importExternalSolverState({
    position: { x: 11, y: -2, z: 4 },
    quaternion: { x: 0, y: 0.2, z: 0, w: 0.98 },
    linearVelocity: { x: -1, y: 0.5, z: 2 },
    angularVelocity: { x: 0.1, y: -0.3, z: 0.2 },
  });
  assert.equal(imported, true);
  approximatelyEqual(split.quaternion.length(), 1, 1e-12);
  assert.deepEqual(split.position.toArray(), [11, -2, 4]);
  assert.deepEqual(split.linearVelocity.toArray(), [-1, 0.5, 2]);

  const validPosition = split.position.clone();
  assert.equal(
    split.importExternalSolverState({
      position: { x: Number.NaN, y: 0, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    }),
    false,
  );
  assert.deepEqual(split.position.toArray(), validPosition.toArray());
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
testPowerLimitedPropulsionAndSignedManeuvering();
testSplitIntegrationAndExternalSolverState();
testLastValidStateAndMotionLimits();

console.log('Physics correctness regression tests passed.');
