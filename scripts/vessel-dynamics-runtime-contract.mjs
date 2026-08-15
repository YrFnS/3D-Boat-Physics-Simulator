import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Vector3 } from 'three';
import { SixDofBody } from '../sim/core/SixDofBody.ts';
import { SeededRandom } from '../sim/core/SeededRandom.ts';
import {
  setFlatWaterSample,
} from '../sim/water/WaterSurface.ts';
import { getVesselConfig } from '../sim/vessels/VesselConfig.ts';
import {
  VesselDynamicsRuntime,
} from '../sim/vessels/VesselDynamicsRuntime.ts';

const vessel = getVesselConfig('trawler');
const runtime = new VesselDynamicsRuntime();
runtime.reset(vessel);
assert.equal(runtime.rudderAngleRad, 0);
assert.equal(runtime.submergedRatio, 0.75);
assert.equal(
  runtime.propulsionResult.engineRpm,
  vessel.engine.idleRpm,
);
assert.deepEqual(runtime.compartmentExposure, {});

const body = new SixDofBody();
body.position.set(0, -0.5, 0);
const damageEvents = [];
const breaches = [];
const slamEvents = [];
const buoyancyAvailabilityByCompartment = Object.fromEntries(
  vessel.floodCompartments.map((compartment) => [
    compartment.id,
    1,
  ]),
);
const flooding = {
  totalFloodedVolumeM3: 0,
  totalCapacityM3: 0,
  floodingRatio: 0,
  maximumCompartmentRatio: 0,
  floodWaterMassKg: 0,
  winterLoadMassKg: 0,
  physicalMassKg: vessel.massKg,
  centerOfMassLocal: [...vessel.centerOfMassLocal],
  principalInertiaKgM2: [...vessel.principalInertiaKgM2],
  buoyancyAvailabilityByCompartment,
  compartmentRatios: {},
  engineCompartmentFloodingRatio: 0,
};
const condition = {
  hullHealth: 100,
  engineHealth: 100,
  engineTemperature: 20,
  rudderHealth: 100,
  applyDamage(event) {
    damageEvents.push(event);
  },
};
const commonInput = {
  body,
  vessel,
  deltaSeconds: 1 / 60,
  throttle: 0.4,
  steering: 0.25,
  calibration: true,
  flooding,
  condition,
  floodingSink: {
    registerBreach(_vessel, compartmentId, severity) {
      breaches.push({ compartmentId, severity });
    },
  },
  random: new SeededRandom(0x12345678),
  sampleWater(x, z, _timeSeconds, target) {
    return setFlatWaterSample(target, x, -1, z);
  },
  windSpeedMps: 8,
  windHeadingDegrees: 90,
  currentSpeedMps: 1.5,
  currentHeadingDegrees: 45,
  winterFactor: 0,
  tornadoPosition: new Vector3(10_000, 0, 10_000),
  whirlpoolPosition: new Vector3(-10_000, 0, -10_000),
  audio: {
    playSlam(severity) {
      slamEvents.push(severity);
    },
  },
};

const firstResult = runtime.step({
  ...commonInput,
  timeSeconds: 1 / 60,
});
const secondResult = runtime.step({
  ...commonInput,
  timeSeconds: 2 / 60,
});
assert.equal(
  firstResult,
  secondResult,
  'The hot dynamics result object must be reused.',
);
for (const value of [
  secondResult.massKg,
  secondResult.submergedRatio,
  secondResult.forwardWaterRelativeSpeedMps,
  secondResult.activePlaningSpeedRatio,
  secondResult.displacementBalanceErrorRatio,
  secondResult.propulsionResult.engineRpm,
  secondResult.appliedRudderForceN,
  secondResult.rudderAngleRad,
]) {
  assert.ok(Number.isFinite(value));
}
assert.equal(damageEvents.length, 0);
assert.equal(breaches.length, 0);
assert.equal(slamEvents.length, 0);
assert.ok(
  Object.keys(runtime.compartmentExposure).length > 0,
  'Sectional exposure must remain available to the next flooding step.',
);

const scenarioBody = new SixDofBody();
const scenarioRuntime = new VesselDynamicsRuntime();
scenarioRuntime.reset(vessel);
let minimumUprightY = 1;
for (let frame = 1; frame <= 600; frame += 1) {
  scenarioRuntime.step({
    ...commonInput,
    body: scenarioBody,
    throttle: 0,
    steering: 0,
    calibration: false,
    currentHeadingDegrees: 15,
    timeSeconds: frame / 60,
  });
  scenarioBody.integrate(1 / 60);
  minimumUprightY = Math.min(
    minimumUprightY,
    new Vector3(0, 1, 0)
      .applyQuaternion(scenarioBody.quaternion).y,
  );
}
assert.ok(
  minimumUprightY > 0.85,
  `The trawler must remain upright after launch; minimum up-axis was ${minimumUprightY.toFixed(3)}.`,
);

const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const runtimeSource = await fs.readFile(
  new URL(
    '../sim/vessels/VesselDynamicsRuntime.ts',
    import.meta.url,
  ),
  'utf8',
);

assert.match(boatSource, /new VesselDynamicsRuntime\(\)/);
assert.match(
  boatSource,
  /dynamicsRuntime\.current\.step\(\{/,
  'Boat must delegate continuous force orchestration.',
);
assert.match(
  boatSource,
  /dynamicsRuntime\.current\.compartmentExposure/,
  'Flooding must consume exposure from the dynamics runtime.',
);
for (const removedAuthority of [
  /new SectionalHydrostatics\(\)/,
  /new MarinePropulsionSystem\(\)/,
  /new EnvironmentalForces\(\)/,
  /computeRudderHydrodynamics/,
  /resolveRudderForceComponents/,
  /previousCompartmentExposure/,
  /rudderAngle\.current/,
  /propulsionSystem\.current/,
]) {
  assert.doesNotMatch(
    boatSource,
    removedAuthority,
    'Boat must not retain extracted dynamics authority.',
  );
}
assert.match(runtimeSource, /sectionalHydrostatics\.apply\(\{/);
assert.match(runtimeSource, /propulsionSystem\.step\(/);
assert.match(runtimeSource, /computeRudderHydrodynamics\(\{/);
assert.match(runtimeSource, /environmentalForces\.apply\(\{/);
assert.match(runtimeSource, /source: 'slamming'/);
assert.match(runtimeSource, /source: 'environmental-impact'/);
assert.match(runtimeSource, /playSlam\(/);
assert.match(runtimeSource, /registerBreach\(/);

console.log('Vessel dynamics runtime contract passed.');
