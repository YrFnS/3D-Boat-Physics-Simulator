import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  applyFieldRepairStep,
  calculateFieldRepairPenalty,
  FIELD_REPAIR_LIMITS,
  isFieldRepairEligible,
} from '../sim/vessels/FieldRepairPolicy.ts';

assert.equal(
  isFieldRepairEligible({
    requested: true,
    speedKnots: 1.5,
    throttle: 0,
    propulsionInputActive: false,
  }),
  true,
);
assert.equal(
  isFieldRepairEligible({
    requested: true,
    speedKnots: 2.1,
    throttle: 0,
    propulsionInputActive: false,
  }),
  false,
);
assert.equal(
  isFieldRepairEligible({
    requested: true,
    speedKnots: 0,
    throttle: 0.2,
    propulsionInputActive: false,
  }),
  false,
);

const oneSecond = applyFieldRepairStep({
  active: true,
  deltaSeconds: 1,
  hullHealth: 40,
  engineHealth: 30,
  rudderHealth: 35,
  engineTemperatureC: 80,
  engineConditionRestoredThisRun: 0,
  rudderConditionRestoredThisRun: 0,
});
assert.equal(oneSecond.hullHealth, 40);
assert.equal(
  oneSecond.engineHealth,
  30 + FIELD_REPAIR_LIMITS.engineRestoreRatePerSecond,
);
assert.equal(
  oneSecond.rudderHealth,
  35 + FIELD_REPAIR_LIMITS.rudderRestoreRatePerSecond,
);
assert.equal(oneSecond.engineTemperatureC, 76);

const capped = applyFieldRepairStep({
  active: true,
  deltaSeconds: 120,
  hullHealth: 25,
  engineHealth: 10,
  rudderHealth: 10,
  engineTemperatureC: 120,
  engineConditionRestoredThisRun: 0,
  rudderConditionRestoredThisRun: 0,
});
assert.equal(capped.hullHealth, 25);
assert.equal(capped.engineHealth, 22);
assert.equal(capped.rudderHealth, 28);
assert.equal(
  capped.engineConditionRestored,
  FIELD_REPAIR_LIMITS.maximumEngineRestorePerRun,
);
assert.equal(
  capped.rudderConditionRestored,
  FIELD_REPAIR_LIMITS.maximumRudderRestorePerRun,
);

const ceiling = applyFieldRepairStep({
  active: true,
  deltaSeconds: 120,
  hullHealth: 90,
  engineHealth: 54,
  rudderHealth: 64.5,
  engineTemperatureC: 20,
  engineConditionRestoredThisRun: 0,
  rudderConditionRestoredThisRun: 0,
});
assert.equal(
  ceiling.engineHealth,
  FIELD_REPAIR_LIMITS.engineConditionCeiling,
);
assert.equal(
  ceiling.rudderHealth,
  FIELD_REPAIR_LIMITS.rudderConditionCeiling,
);

assert.equal(
  calculateFieldRepairPenalty({
    repairActiveSeconds: 20,
    repairActivationCount: 1,
    engineConditionRestored: 12,
    rudderConditionRestored: 18,
  }),
  160,
);

const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const conditionRuntimeSource = await fs.readFile(
  new URL(
    '../sim/vessels/VesselConditionRuntime.ts',
    import.meta.url,
  ),
  'utf8',
);
const storeSource = await fs.readFile(
  new URL('../store/useSimStore.ts', import.meta.url),
  'utf8',
);
const directorSource = await fs.readFile(
  new URL('../components/ScenarioDirector.tsx', import.meta.url),
  'utf8',
);
const floodingSource = await fs.readFile(
  new URL('../sim/vessels/FloodingModel.ts', import.meta.url),
  'utf8',
);
const overlaySource = await fs.readFile(
  new URL('../components/ScenarioResultOverlay.tsx', import.meta.url),
  'utf8',
);
const persistenceSource = await fs.readFile(
  new URL('../components/ExperiencePersistence.tsx', import.meta.url),
  'utf8',
);

assert.match(conditionRuntimeSource, /applyFieldRepairStep\(/);
assert.match(
  boatSource,
  /conditionRuntime\.current\.applyFieldRepair\(/,
);
assert.doesNotMatch(boatSource, /applyFieldRepairStep\(/);
assert.match(boatSource, /repairActive: activeFieldRepair/);
assert.match(boatSource, /repairTrackingEnabled:/);
assert.doesNotMatch(boatSource, /hullHealth\.current \+ 8\.0 \* dt/);
assert.doesNotMatch(boatSource, /engineHealth\.current \+ 12\.0 \* dt/);
assert.doesNotMatch(boatSource, /rudderHealth\.current \+ 15\.0 \* dt/);
assert.match(
  boatSource,
  /preserveConditionAcrossRecovery/,
  'Boat remounts must rehydrate component condition after recovery.',
);

const resetStart = storeSource.lastIndexOf(
  '  resetVessel: () => {',
);
const resetEnd = storeSource.indexOf('fireInstantRepair:', resetStart);
const resetBlock = storeSource.slice(resetStart, resetEnd);
assert.doesNotMatch(
  resetBlock,
  /resetTelemetry\(\)/,
  'Recovery must not restore hull, engine, or rudder condition.',
);
assert.match(resetBlock, /floodingRatio: 0/);

const pauseStart = storeSource.lastIndexOf('  pauseSession: () =>');
const pauseEnd = storeSource.indexOf('  resumeSession:', pauseStart);
assert.match(
  storeSource.slice(pauseStart, pauseEnd),
  /fieldRepairActive: false/,
  'Pausing must clear the visible active-repair flag immediately.',
);
const toggleStart = storeSource.lastIndexOf('  togglePause: () =>');
const toggleEnd = storeSource.indexOf('  restartScenario:', toggleStart);
assert.match(
  storeSource.slice(toggleStart, toggleEnd),
  /fieldRepairActive: false/,
  'Keyboard pause must clear the visible active-repair flag.',
);
const finishStart = storeSource.lastIndexOf('  finishScenario:');
const finishEnd = storeSource.indexOf('  resetVessel:', finishStart);
assert.match(
  storeSource.slice(finishStart, finishEnd),
  /fieldRepairActive: false/,
  'Mission completion must not leave repair marked active.',
);
assert.match(
  storeSource,
  /key === 'r' && !value[\s\S]{0,120}fieldRepairActive: false/,
  'Releasing the repair control must clear its UI state immediately.',
);

assert.match(
  floodingSource,
  /FIELD_REPAIR_LIMITS\.breachStabilizationPerSecond/,
);
assert.match(directorSource, /result\.repairPenaltyPoints/);
assert.match(directorSource, /repairPenaltyPoints,/);
assert.match(
  overlaySource,
  /Field repair used/,
  'Mission results must disclose field-repair use.',
);
assert.match(persistenceSource, /simFieldRepairSeconds/);

console.log('Field repair policy contract passed.');
