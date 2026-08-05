import { create } from 'zustand';
import {
  SCENARIOS,
  type ScenarioId,
} from '@/sim/scenarios/ScenarioCatalog';
import {
  applyScenarioHistoryResult,
  type ScenarioHistoryPolicyRecord,
} from '@/sim/scenarios/ScoredScenarioAuthority';
import type { BoatType, ScenarioResult } from '@/store/useSimStore';

export type ScenarioHistoryRecord =
  ScenarioHistoryPolicyRecord<BoatType>;

export type ScenarioHistorySnapshot = Record<
  ScenarioId,
  ScenarioHistoryRecord
>;

interface ScenarioHistoryState {
  hydrated: boolean;
  records: ScenarioHistorySnapshot;
  hydrate: (records: Partial<ScenarioHistorySnapshot>) => void;
  recordResult: (
    scenarioId: ScenarioId,
    boat: BoatType,
    result: ScenarioResult,
  ) => void;
  clearHistory: () => void;
}

function createEmptyRecord(): ScenarioHistoryRecord {
  return {
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
}

function createEmptyHistory(): ScenarioHistorySnapshot {
  return Object.fromEntries(
    SCENARIOS.map((scenario) => [scenario.id, createEmptyRecord()]),
  ) as ScenarioHistorySnapshot;
}

function finiteNonNegative(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function normalizeRecord(
  value: Partial<ScenarioHistoryRecord> | undefined,
): ScenarioHistoryRecord {
  const empty = createEmptyRecord();
  if (!value) return empty;

  return {
    attempts: Math.floor(finiteNonNegative(value.attempts, 0)),
    completions: Math.floor(finiteNonNegative(value.completions, 0)),
    failures: Math.floor(finiteNonNegative(value.failures, 0)),
    bestScore: Math.min(1_000, finiteNonNegative(value.bestScore, 0)),
    bestTimeSeconds:
      typeof value.bestTimeSeconds === 'number' &&
      Number.isFinite(value.bestTimeSeconds) &&
      value.bestTimeSeconds >= 0
        ? value.bestTimeSeconds
        : null,
    bestHullHealth: Math.min(
      100,
      finiteNonNegative(value.bestHullHealth, 0),
    ),
    lastScore: Math.min(1_000, finiteNonNegative(value.lastScore, 0)),
    lastOutcome:
      value.lastOutcome === 'completed' || value.lastOutcome === 'failed'
        ? value.lastOutcome
        : null,
    lastBoat:
      value.lastBoat === 'trawler' || value.lastBoat === 'speedboat'
        ? value.lastBoat
        : null,
    lastPlayedAt:
      typeof value.lastPlayedAt === 'string' ? value.lastPlayedAt : null,
    assistedAttempts: Math.floor(
      finiteNonNegative(value.assistedAttempts, 0),
    ),
    assistedCompletions: Math.floor(
      finiteNonNegative(value.assistedCompletions, 0),
    ),
    assistedFailures: Math.floor(
      finiteNonNegative(value.assistedFailures, 0),
    ),
  };
}

export const useScenarioHistory = create<ScenarioHistoryState>((set) => ({
  hydrated: false,
  records: createEmptyHistory(),

  hydrate: (records) =>
    set({
      hydrated: true,
      records: Object.fromEntries(
        SCENARIOS.map((scenario) => [
          scenario.id,
          normalizeRecord(records[scenario.id]),
        ]),
      ) as ScenarioHistorySnapshot,
    }),

  recordResult: (scenarioId, boat, result) =>
    set((state) => ({
      records: {
        ...state.records,
        [scenarioId]: applyScenarioHistoryResult(
          state.records[scenarioId],
          boat,
          result,
        ),
      },
    })),

  clearHistory: () =>
    set({
      hydrated: true,
      records: createEmptyHistory(),
    }),
}));
