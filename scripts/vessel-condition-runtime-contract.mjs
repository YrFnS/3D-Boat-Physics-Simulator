import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  VesselConditionRuntime,
} from '../sim/vessels/VesselConditionRuntime.ts';

const EPSILON = 1e-9;

function approximatelyEqual(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

const runtime = new VesselConditionRuntime({
  hullHealth: 72,
  engineHealth: 35,
  engineTemperature: 78,
  rudderHealth: 42,
});
assert.deepEqual(runtime.snapshot, {
  hullHealth: 72,
  engineHealth: 35,
  engineTemperature: 78,
  rudderHealth: 42,
});

runtime.applyDamage({
  source: 'terrain-impact',
  hullDamage: 2,
  engineDamage: 1,
  rudderDamage: 3,
});
assert.deepEqual(runtime.snapshot, {
  hullHealth: 70,
  engineHealth: 34,
  engineTemperature: 78,
  rudderHealth: 39,
});

const repairResult = runtime.applyFieldRepair({
  active: true,
  deltaSeconds: 1,
  engineConditionRestoredThisRun: 0,
  rudderConditionRestoredThisRun: 0,
});
assert.equal(repairResult.hullHealth, 70);
approximatelyEqual(runtime.engineHealth, 34.6, 'engine field repair');
approximatelyEqual(runtime.rudderHealth, 39.9, 'rudder field repair');
approximatelyEqual(runtime.engineTemperature, 74, 'repair cooling');

const overheated = new VesselConditionRuntime({
  engineTemperature: 104,
});
overheated.stepThermalAndFlooding({
  deltaSeconds: 1,
  engineRpm: 0,
  ratedEngineRpm: 3_000,
  absorbedShaftPowerW: 0,
  ratedEnginePowerW: 500_000,
  ventilationFactor: 1,
  submergedRatio: 0.5,
  engineCompartmentFloodingRatio: 0,
  simulationTimeSeconds: 3,
});
assert.ok(overheated.engineTemperature < 104);
assert.ok(
  overheated.engineHealth < 100,
  'Engine overheating must route through explicit condition damage.',
);

const flooded = new VesselConditionRuntime({
  engineHealth: 80,
});
flooded.stepThermalAndFlooding({
  deltaSeconds: 1,
  engineRpm: 0,
  ratedEngineRpm: 3_000,
  absorbedShaftPowerW: 0,
  ratedEnginePowerW: 500_000,
  ventilationFactor: 1,
  submergedRatio: 0.5,
  engineCompartmentFloodingRatio: 0.5,
  simulationTimeSeconds: 3,
});
approximatelyEqual(
  flooded.engineHealth,
  71.25,
  'machinery-space flooding damage',
);

runtime.reset();
assert.deepEqual(runtime.snapshot, {
  hullHealth: 100,
  engineHealth: 100,
  engineTemperature: 20,
  rudderHealth: 100,
});

const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const runtimeSource = await fs.readFile(
  new URL('../sim/vessels/VesselConditionRuntime.ts', import.meta.url),
  'utf8',
);
const dynamicsSource = await fs.readFile(
  new URL(
    '../sim/vessels/VesselDynamicsRuntime.ts',
    import.meta.url,
  ),
  'utf8',
);

assert.match(boatSource, /VesselConditionRuntime/);
assert.match(
  boatSource,
  /condition:\s*conditionRuntime\.current/,
  'Boat must pass condition authority into vessel dynamics.',
);
assert.match(
  dynamicsSource,
  /condition\.applyDamage\(\{/,
  'Dynamics damage must delegate to condition authority.',
);
assert.match(dynamicsSource, /source: 'slamming'/);
assert.match(dynamicsSource, /source: 'environmental-impact'/);
assert.match(boatSource, /conditionRuntime\.current\.applyFieldRepair/);
assert.match(boatSource, /conditionRuntime\.current\.stepThermalAndFlooding/);
assert.doesNotMatch(boatSource, /applyVesselDamage/);
assert.doesNotMatch(boatSource, /applyFieldRepairStep/);
assert.doesNotMatch(boatSource, /let targetTemp/);
assert.match(runtimeSource, /applyVesselDamage/);
assert.match(runtimeSource, /applyFieldRepairStep/);
assert.match(runtimeSource, /source: 'engine-overheat'/);
assert.match(runtimeSource, /source: 'machinery-flooding'/);

console.log('Vessel condition runtime contract passed.');
