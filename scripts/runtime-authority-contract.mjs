import assert from 'node:assert/strict';
import {
  canAcceptVesselInput,
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

console.log('Runtime authority contract passed.');
