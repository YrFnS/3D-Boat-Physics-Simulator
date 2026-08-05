import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  applyScenarioHistoryResult,
  ASSISTED_ENVIRONMENT_REASON,
  canEditScenarioEnvironment,
  isScenarioEnvironmentLocked,
  scenarioEnvironmentFromDefinition,
  scenarioEnvironmentMatchesPreset,
} from '../sim/scenarios/ScoredScenarioAuthority.ts';

const preset = scenarioEnvironmentFromDefinition({
  windSpeed: 8,
  windDir: 450,
  currentSpeed: 1.5,
  currentDir: -345,
  targetTime: 36,
  targetSeason: 1.25,
});
assert.deepEqual(preset, {
  windSpeed: 8,
  windDir: 90,
  currentSpeed: 1.5,
  currentDir: 15,
  targetTime: 12,
  targetSeason: 0.25,
});
assert.equal(
  isScenarioEnvironmentLocked('active', 'standard'),
  true,
  'A standard active mission must lock its environment.',
);
assert.equal(
  canEditScenarioEnvironment('active', 'standard'),
  false,
  'Standard active runs must reject environment changes.',
);
assert.equal(
  canEditScenarioEnvironment('active', 'assisted'),
  true,
  'Explicitly assisted runs may edit the environment.',
);
assert.equal(
  canEditScenarioEnvironment('inactive', 'standard'),
  true,
  'Briefing previews may edit environment values.',
);
assert.equal(
  scenarioEnvironmentMatchesPreset(
    { ...preset, windDir: -270, currentDir: 375 },
    preset,
  ),
  true,
  'Equivalent wrapped headings must match the preset.',
);
assert.equal(
  scenarioEnvironmentMatchesPreset(
    { ...preset, windSpeed: 8.1 },
    preset,
  ),
  false,
  'A material environment change must not match the preset.',
);
assert.ok(ASSISTED_ENVIRONMENT_REASON.includes('Custom wind'));

const emptyRecord = {
  attempts: 0,
  completions: 0,
  failures: 0,
  bestScore: 0,
  bestTimeSeconds: null,
  bestHullHealth: 0,
  lastScore: 0,
  lastOutcome: null,
  lastBoat: null,
  lastPlayedAt: null,
  assistedAttempts: 0,
  assistedCompletions: 0,
  assistedFailures: 0,
};
const standardResult = {
  outcome: 'completed',
  score: 840,
  elapsedSeconds: 95,
  hullHealth: 92,
  runMode: 'standard',
};
const standardRecord = applyScenarioHistoryResult(
  emptyRecord,
  'trawler',
  standardResult,
  '2026-08-05T00:00:00.000Z',
);
assert.equal(standardRecord.attempts, 1);
assert.equal(standardRecord.completions, 1);
assert.equal(standardRecord.bestScore, 840);
assert.equal(standardRecord.bestTimeSeconds, 95);
assert.equal(standardRecord.bestHullHealth, 92);
assert.equal(standardRecord.assistedAttempts, 0);

const assistedRecord = applyScenarioHistoryResult(
  standardRecord,
  'speedboat',
  {
    outcome: 'completed',
    score: 999,
    elapsedSeconds: 20,
    hullHealth: 100,
    runMode: 'assisted',
  },
  '2026-08-05T00:01:00.000Z',
);
assert.equal(assistedRecord.assistedAttempts, 1);
assert.equal(assistedRecord.assistedCompletions, 1);
assert.equal(assistedRecord.attempts, 1);
assert.equal(assistedRecord.completions, 1);
assert.equal(assistedRecord.bestScore, 840);
assert.equal(assistedRecord.bestTimeSeconds, 95);
assert.equal(assistedRecord.bestHullHealth, 92);
assert.equal(assistedRecord.lastBoat, 'trawler');

const storeSource = await fs.readFile(
  new URL('../store/useSimStore.ts', import.meta.url),
  'utf8',
);
const hudSource = await fs.readFile(
  new URL('../components/HUD.tsx', import.meta.url),
  'utf8',
);
const directorSource = await fs.readFile(
  new URL('../components/ScenarioDirector.tsx', import.meta.url),
  'utf8',
);
const historySource = await fs.readFile(
  new URL('../store/useScenarioHistory.ts', import.meta.url),
  'utf8',
);
const resultSource = await fs.readFile(
  new URL('../components/ScenarioResultOverlay.tsx', import.meta.url),
  'utf8',
);
const persistenceSource = await fs.readFile(
  new URL('../components/ExperiencePersistence.tsx', import.meta.url),
  'utf8',
);

assert.match(
  storeSource,
  /canEditScenarioEnvironment\(\s*state\.scenarioRunStatus,\s*state\.scenarioRunMode/,
  'Every environment setter must enforce the scored-run guard.',
);
assert.match(
  storeSource,
  /enableAssistedConditions:/,
  'The store must expose an explicit assisted-mode transition.',
);
assert.match(
  hudSource,
  /Use custom conditions/,
  'The HUD must disclose and explicitly unlock custom conditions.',
);
assert.match(
  hudSource,
  /disabled=\{environmentLocked\}/,
  'Standard mission environment controls must be disabled in the HUD.',
);
assert.match(
  directorSource,
  /runMode: latestStore\.scenarioRunMode/,
  'Mission results must retain their standard or assisted authority.',
);
assert.match(
  historySource,
  /applyScenarioHistoryResult/,
  'Scenario history must use the assisted-exclusion policy.',
);
assert.match(
  resultSource,
  /Assisted score/,
  'The result UI must label assisted scoring explicitly.',
);
assert.match(
  persistenceSource,
  /simScenarioEnvironmentLocked/,
  'Browser validation must be able to observe the environment lock.',
);

console.log('Scored scenario environment authority contract passed.');
