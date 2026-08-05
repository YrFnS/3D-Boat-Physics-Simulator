export type ScenarioRunMode = 'standard' | 'assisted';

export type ScoredScenarioRunStatus =
  | 'inactive'
  | 'active'
  | 'completed'
  | 'failed';

export interface ScenarioEnvironmentSnapshot {
  windSpeed: number;
  windDir: number;
  currentSpeed: number;
  currentDir: number;
  targetTime: number;
  targetSeason: number;
}

export interface ScenarioHistoryPolicyRecord<TBoat extends string> {
  attempts: number;
  completions: number;
  failures: number;
  bestScore: number;
  bestTimeSeconds: number | null;
  bestHullHealth: number;
  lastScore: number;
  lastOutcome: 'completed' | 'failed' | null;
  lastBoat: TBoat | null;
  lastPlayedAt: string | null;
  assistedAttempts: number;
  assistedCompletions: number;
  assistedFailures: number;
}

export interface ScenarioHistoryPolicyResult {
  outcome: 'completed' | 'failed';
  score: number;
  elapsedSeconds: number;
  hullHealth: number;
  runMode: ScenarioRunMode;
}

export const ASSISTED_ENVIRONMENT_REASON =
  'Custom wind, current, time, or season controls were enabled.';

const FULL_CIRCLE_DEGREES = 360;
const FULL_DAY_HOURS = 24;
const FULL_SEASON_CYCLE = 1;
const ENVIRONMENT_EPSILON = 1e-6;

function finiteOr(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeCycle(value: number, cycle: number) {
  const finiteValue = finiteOr(value);
  return ((finiteValue % cycle) + cycle) % cycle;
}

export function normalizeScenarioHeadingDegrees(value: number) {
  return normalizeCycle(value, FULL_CIRCLE_DEGREES);
}

export function normalizeScenarioTimeHours(value: number) {
  return normalizeCycle(value, FULL_DAY_HOURS);
}

export function normalizeScenarioSeason(value: number) {
  return normalizeCycle(value, FULL_SEASON_CYCLE);
}

export function scenarioEnvironmentFromDefinition(
  scenario: ScenarioEnvironmentSnapshot,
): ScenarioEnvironmentSnapshot {
  return {
    windSpeed: Math.max(0, finiteOr(scenario.windSpeed)),
    windDir: normalizeScenarioHeadingDegrees(scenario.windDir),
    currentSpeed: Math.max(0, finiteOr(scenario.currentSpeed)),
    currentDir: normalizeScenarioHeadingDegrees(scenario.currentDir),
    targetTime: normalizeScenarioTimeHours(scenario.targetTime),
    targetSeason: normalizeScenarioSeason(scenario.targetSeason),
  };
}

export function canEditScenarioEnvironment(
  runStatus: ScoredScenarioRunStatus,
  runMode: ScenarioRunMode,
) {
  return runStatus !== 'active' || runMode === 'assisted';
}

export function isScenarioEnvironmentLocked(
  runStatus: ScoredScenarioRunStatus,
  runMode: ScenarioRunMode,
) {
  return !canEditScenarioEnvironment(runStatus, runMode);
}

function headingDifferenceDegrees(a: number, b: number) {
  const difference = normalizeScenarioHeadingDegrees(a - b);
  return Math.min(difference, FULL_CIRCLE_DEGREES - difference);
}

export function scenarioEnvironmentMatchesPreset(
  environment: ScenarioEnvironmentSnapshot,
  preset: ScenarioEnvironmentSnapshot,
  epsilon = ENVIRONMENT_EPSILON,
) {
  const tolerance = Number.isFinite(epsilon)
    ? Math.max(0, epsilon)
    : ENVIRONMENT_EPSILON;
  return (
    Math.abs(environment.windSpeed - preset.windSpeed) <= tolerance &&
    headingDifferenceDegrees(environment.windDir, preset.windDir) <= tolerance &&
    Math.abs(environment.currentSpeed - preset.currentSpeed) <= tolerance &&
    headingDifferenceDegrees(environment.currentDir, preset.currentDir) <= tolerance &&
    Math.abs(
      normalizeScenarioTimeHours(environment.targetTime) -
        normalizeScenarioTimeHours(preset.targetTime),
    ) <= tolerance &&
    Math.abs(
      normalizeScenarioSeason(environment.targetSeason) -
        normalizeScenarioSeason(preset.targetSeason),
    ) <= tolerance
  );
}

/**
 * Assisted attempts are deliberately separated from standard records.
 * They may still display an informational score, but they cannot alter
 * standard attempts, completions, best score, best time, or best hull.
 */
export function applyScenarioHistoryResult<TBoat extends string>(
  current: ScenarioHistoryPolicyRecord<TBoat>,
  boat: TBoat,
  result: ScenarioHistoryPolicyResult,
  playedAt = new Date().toISOString(),
): ScenarioHistoryPolicyRecord<TBoat> {
  const completed = result.outcome === 'completed';

  if (result.runMode === 'assisted') {
    return {
      ...current,
      assistedAttempts: current.assistedAttempts + 1,
      assistedCompletions:
        current.assistedCompletions + (completed ? 1 : 0),
      assistedFailures:
        current.assistedFailures + (completed ? 0 : 1),
    };
  }

  const bestTimeSeconds = completed
    ? current.bestTimeSeconds === null
      ? result.elapsedSeconds
      : Math.min(current.bestTimeSeconds, result.elapsedSeconds)
    : current.bestTimeSeconds;

  return {
    ...current,
    attempts: current.attempts + 1,
    completions: current.completions + (completed ? 1 : 0),
    failures: current.failures + (completed ? 0 : 1),
    bestScore: completed
      ? Math.max(current.bestScore, result.score)
      : current.bestScore,
    bestTimeSeconds,
    bestHullHealth: completed
      ? Math.max(current.bestHullHealth, result.hullHealth)
      : current.bestHullHealth,
    lastScore: result.score,
    lastOutcome: result.outcome,
    lastBoat: boat,
    lastPlayedAt: playedAt,
  };
}
