import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  canAcceptVesselInput,
  canAdvanceAuthoritativeSimulation,
  resolveSimulatorFrameLoop,
} from '../sim/core/SimulationRuntimeAuthority.ts';

const frameLoopCases = [
  {
    label: 'loading runtime blocks a running session',
    input: {
      collisionRuntimeReady: false,
      automationMode: false,
      sessionPhase: 'running',
    },
    expected: 'never',
  },
  {
    label: 'loading runtime blocks automation',
    input: {
      collisionRuntimeReady: false,
      automationMode: true,
      sessionPhase: 'running',
    },
    expected: 'never',
  },
  {
    label: 'ready running session renders continuously',
    input: {
      collisionRuntimeReady: true,
      automationMode: false,
      sessionPhase: 'running',
    },
    expected: 'always',
  },
  {
    label: 'ready automation renders continuously',
    input: {
      collisionRuntimeReady: true,
      automationMode: true,
      sessionPhase: 'menu',
    },
    expected: 'always',
  },
  {
    label: 'paused session executes no frame callbacks',
    input: {
      collisionRuntimeReady: true,
      automationMode: false,
      sessionPhase: 'paused',
    },
    expected: 'never',
  },
  {
    label: 'ready menu remains demand-rendered',
    input: {
      collisionRuntimeReady: true,
      automationMode: false,
      sessionPhase: 'menu',
    },
    expected: 'demand',
  },
];

for (const testCase of frameLoopCases) {
  assert.equal(
    resolveSimulatorFrameLoop(testCase.input),
    testCase.expected,
    testCase.label,
  );
}

assert.equal(canAdvanceAuthoritativeSimulation('running'), true);
assert.equal(canAdvanceAuthoritativeSimulation('paused'), false);
assert.equal(canAdvanceAuthoritativeSimulation('menu'), false);

assert.equal(
  canAcceptVesselInput(true, 'running'),
  true,
  'A ready running vessel must accept controls.',
);
assert.equal(
  canAcceptVesselInput(false, 'running'),
  false,
  'Controls must remain locked until collision authority is ready.',
);
assert.equal(
  canAcceptVesselInput(true, 'paused'),
  false,
  'Paused sessions must reject vessel controls.',
);
assert.equal(
  canAcceptVesselInput(true, 'menu'),
  false,
  'The launch menu must reject vessel controls.',
);

const recoveryMonitorSource = await fs.readFile(
  new URL('../components/SimulatorRecovery.tsx', import.meta.url),
  'utf8',
);
const releaseValidationSource = await fs.readFile(
  new URL('./release-validation.mjs', import.meta.url),
  'utf8',
);
assert.match(
  recoveryMonitorSource,
  /simWebglContextMonitorReady = '1'/,
  'The application must expose when its WebGL recovery listener is attached.',
);
assert.match(
  releaseValidationSource,
  /waitForDataset\(page, 'simWebglContextMonitorReady', '1'\)/,
  'Release validation must wait for the recovery listener before dispatching context loss.',
);

const staticPreviewSources = await Promise.all(
  [
    '../components/Boat.tsx',
    '../components/EnvironmentRig.tsx',
    '../components/WeatherEffects.tsx',
    '../components/HurricaneClouds.tsx',
    '../components/Tornado.tsx',
    '../components/WakeField.tsx',
  ].map(async (sourcePath) => ({
    sourcePath,
    source: await fs.readFile(new URL(sourcePath, import.meta.url), 'utf8'),
  })),
);
for (const { sourcePath, source } of staticPreviewSources) {
  assert.match(
    source,
    /canAdvanceAuthoritativeSimulation/,
    `${sourcePath} must gate time-driven work behind running-state authority.`,
  );
}
for (const { sourcePath, source } of staticPreviewSources.filter(({ sourcePath }) =>
  /HurricaneClouds|Tornado|WakeField/.test(sourcePath),
)) {
  assert.doesNotMatch(
    source,
    /state\.clock\.elapsedTime/,
    `${sourcePath} must not animate from browser wall-clock time.`,
  );
}

console.log('Runtime authority contract passed.');
