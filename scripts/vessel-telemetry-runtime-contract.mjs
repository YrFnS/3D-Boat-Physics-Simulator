import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Quaternion, Vector3 } from 'three';
import { SixDofBody } from '../sim/core/SixDofBody.ts';
import {
  VesselTelemetryRuntime,
} from '../sim/vessels/VesselTelemetryRuntime.ts';

function createSharedTelemetry() {
  return {
    boatPos: new Vector3(),
    boatDir: new Vector3(0, 0, -1),
    boatQuaternion: new Quaternion(),
    boatLinearVelocity: new Vector3(),
    boatAngularVelocity: new Vector3(),
    boatSpeed: 0,
    submergedRatio: 0,
    displacedVolumeM3: 0,
    floodingRatio: 0,
    floodedVolumeM3: 0,
    physicalMassKg: 0,
    displacementBalanceErrorRatio: 0,
    centerOfBuoyancy: new Vector3(),
    averageWaterVelocity: new Vector3(),
    maximumSlamSeverity: 0,
    engineRpm: 0,
    shaftRpm: 0,
    deliveredShaftPowerW: 0,
    absorbedShaftPowerW: 0,
    propellerThrustN: 0,
    propellerAdvanceRatio: 0,
    propellerLoadRatio: 0,
    cavitationFactor: 1,
    ventilationFactor: 1,
    propWashSpeedMps: 0,
    rudderAngleRad: 0,
    rudderForceN: 0,
    rudderFlowSpeedMps: 0,
    rudderAngleOfAttackRad: 0,
    calibrationReady: 0,
    calibrationPassed: 0,
    calibrationProgress: 0,
    calibrationResult: '',
  };
}

const runtime = new VesselTelemetryRuntime();
const body = new SixDofBody();
body.position.set(4, 2, -7);
body.quaternion.setFromAxisAngle(
  new Vector3(0, 1, 0),
  -Math.PI / 2,
);
body.linearVelocity.set(3, 0, 4);
body.angularVelocity.set(0.1, 0.2, 0.3);
const telemetry = createSharedTelemetry();
const motion = runtime.sampleMotion({ body, telemetry });
const repeatedMotion = runtime.sampleMotion({ body, telemetry });
assert.equal(
  motion,
  repeatedMotion,
  'Motion telemetry must reuse its hot-path result object.',
);
assert.equal(motion.speedMps, 5);
assert.ok(Math.abs(motion.speedKnots - 5 / 0.514444) < 1e-9);
assert.ok(Math.abs(motion.headingDegrees - 90) < 1e-9);
assert.deepEqual(telemetry.boatPos.toArray(), [4, 2, -7]);
assert.ok(Math.abs(telemetry.boatDir.x - 1) < 1e-9);

const condition = {
  hullHealth: 88,
  engineHealth: 77,
  engineTemperature: 66,
  rudderHealth: 55,
};
const flooding = {
  totalFloodedVolumeM3: 1.25,
  floodingRatio: 0.2,
};
const dynamics = {
  massKg: 1_600,
  submergedRatio: 0.72,
  displacementBalanceErrorRatio: 0.03,
  rudderAngleRad: 0.2,
  appliedRudderForceN: 900,
  rudderHydrodynamics: {
    flowSpeedMps: 4.2,
    angleOfAttackRad: 0.12,
  },
  hydrostaticResult: {
    displacedVolumeM3: 1.6,
    centerOfBuoyancyWorld: new Vector3(0, -0.7, 0.2),
    averageWaterVelocityWorld: new Vector3(0.5, 0, -0.25),
    maximumSlamSeverity: 0.45,
  },
  propulsionResult: {
    engineRpm: 2_000,
    shaftRpm: 950,
    deliveredShaftPowerW: 70_000,
    absorbedShaftPowerW: 65_000,
    propellerThrustN: 8_500,
    advanceRatio: 0.7,
    loadRatio: 0.93,
    cavitationFactor: 0.9,
    ventilationFactor: 0.8,
    propWashSpeedMps: 5.5,
  },
};
const missionStatistics = {
  runId: 4,
  vesselGeneration: 2,
  elapsedSeconds: 10,
  distanceTravelledM: 30,
  maximumSpeedKnots: 12,
  fixedStepCount: 600,
  repairActiveSeconds: 2,
  repairActivationCount: 1,
  engineConditionRestored: 0.6,
  rudderConditionRestored: 0.9,
};
const storeEvents = {
  telemetry: [],
  flooding: [],
  repair: [],
};
const store = {
  setTelemetry(...values) {
    storeEvents.telemetry.push(values);
  },
  setFloodingTelemetry(...values) {
    storeEvents.flooding.push(values);
  },
  setFieldRepairTelemetry(value) {
    storeEvents.repair.push(value);
  },
};

runtime.publishCalibration({
  progress: 0.5,
  result: { passed: true, label: 'complete' },
  motion,
  condition,
  flooding,
  telemetry,
  store,
});
assert.equal(telemetry.calibrationProgress, 0.5);
assert.equal(telemetry.calibrationReady, 1);
assert.equal(telemetry.calibrationPassed, 1);
assert.match(telemetry.calibrationResult, /complete/);
assert.equal(storeEvents.telemetry.length, 1);

runtime.publishFixedStep({
  deltaSeconds: 0.05,
  calibrationActive: false,
  body,
  motion,
  dynamics,
  flooding,
  condition,
  missionStatistics,
  repairActive: true,
  telemetry,
  store,
});
assert.equal(storeEvents.telemetry.length, 1);
runtime.publishFixedStep({
  deltaSeconds: 0.05,
  calibrationActive: false,
  body,
  motion,
  dynamics,
  flooding,
  condition,
  missionStatistics,
  repairActive: true,
  telemetry,
  store,
});
assert.equal(
  storeEvents.telemetry.length,
  2,
  'Zustand telemetry must publish at deterministic 10 Hz.',
);
assert.equal(storeEvents.flooding.length, 2);
assert.equal(storeEvents.repair.length, 1);
assert.equal(storeEvents.repair[0].active, true);
assert.ok(storeEvents.repair[0].penaltyPoints > 0);
assert.equal(telemetry.engineRpm, 2_000);
assert.equal(telemetry.rudderAngleRad, 0.2);
assert.equal(telemetry.physicalMassKg, 1_600);
assert.equal(telemetry.maximumSlamSeverity, 0.45);
assert.deepEqual(
  telemetry.averageWaterVelocity.toArray(),
  [0.5, 0, -0.25],
);

const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const fixedStepStart = boatSource.indexOf(
  '  const stepSimulation =',
);
const fixedStepEnd = boatSource.indexOf(
  '\n  useFrame(',
  fixedStepStart,
);
assert.ok(fixedStepStart >= 0 && fixedStepEnd > fixedStepStart);
const fixedStepSource = boatSource.slice(
  fixedStepStart,
  fixedStepEnd,
);
const runtimeSource = await fs.readFile(
  new URL(
    '../sim/vessels/VesselTelemetryRuntime.ts',
    import.meta.url,
  ),
  'utf8',
);
assert.match(boatSource, /new VesselTelemetryRuntime\(\)/);
assert.match(
  boatSource,
  /telemetryRuntime\.current\.sampleMotion\(\{/,
);
assert.match(
  boatSource,
  /telemetryRuntime\.current\.publishCalibration\(\{/,
);
assert.match(
  boatSource,
  /telemetryRuntime\.current\.publishFixedStep\(\{/,
);
assert.doesNotMatch(boatSource, /telemetryAccumulator/);
assert.doesNotMatch(fixedStepSource, /sharedPhysics\.engineRpm\s*=/);
assert.doesNotMatch(fixedStepSource, /sharedPhysics\.rudderAngleRad\s*=/);
assert.doesNotMatch(boatSource, /calculateFieldRepairPenalty/);
assert.match(runtimeSource, /TELEMETRY_INTERVAL_SECONDS = 0\.1/);
assert.match(runtimeSource, /calculateFieldRepairPenalty/);
assert.match(runtimeSource, /worldDirectionToHeadingDegrees/);

console.log('Vessel telemetry runtime contract passed.');
