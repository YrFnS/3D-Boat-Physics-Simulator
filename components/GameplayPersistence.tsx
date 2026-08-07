'use client';

import { useEffect } from 'react';
import { useNavigationPlanner } from '@/store/useNavigationPlanner';
import {
  type ScenarioHistorySnapshot,
  useScenarioHistory,
} from '@/store/useScenarioHistory';
import { useSimStore } from '@/store/useSimStore';

const HISTORY_STORAGE_KEY = 'boat-simulator-scenario-history-v1';

interface GameplayPersistenceProps {
  automationMode: boolean;
}

function readStoredHistory(): Partial<ScenarioHistorySnapshot> {
  try {
    const storedValue = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!storedValue) return {};
    const parsed: unknown = JSON.parse(storedValue);
    return parsed && typeof parsed === 'object'
      ? (parsed as Partial<ScenarioHistorySnapshot>)
      : {};
  } catch {
    return {};
  }
}

function writeStoredHistory(records: ScenarioHistorySnapshot) {
  try {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(records),
    );
  } catch {
    // Storage can be unavailable in private or restricted browsing modes.
  }
}

function writePlannerDataset() {
  const planner = useNavigationPlanner.getState();
  const dataset = document.documentElement.dataset;
  dataset.simNavigationMode = planner.mode;
  dataset.simFreeNavigationStatus = planner.status;
  dataset.simFreeWaypointCount = String(planner.waypoints.length);
  dataset.simActiveFreeWaypointIndex = String(planner.activeWaypointIndex);
  dataset.simFreeNavigationProgress = String(planner.progress);
  dataset.simFreeNavigationDistanceM = String(planner.distanceM);
}

function writeHistoryDataset() {
  const scenarioId = useSimStore.getState().activeScenario;
  const record = useScenarioHistory.getState().records[scenarioId];
  const dataset = document.documentElement.dataset;
  dataset.simScenarioHistoryAttempts = String(record.attempts);
  dataset.simScenarioHistoryCompletions = String(record.completions);
  dataset.simScenarioHistoryAssistedAttempts = String(
    record.assistedAttempts,
  );
  dataset.simScenarioHistoryAssistedCompletions = String(
    record.assistedCompletions,
  );
  dataset.simScenarioBestScore = String(record.bestScore);
  dataset.simScenarioBestTimeSeconds =
    record.bestTimeSeconds === null ? '' : String(record.bestTimeSeconds);
}

export default function GameplayPersistence({
  automationMode,
}: GameplayPersistenceProps) {
  const scenarioRunId = useSimStore((state) => state.scenarioRunId);
  const sessionPhase = useSimStore((state) => state.sessionPhase);

  useEffect(() => {
    const historyStore = useScenarioHistory.getState();
    historyStore.hydrate(automationMode ? {} : readStoredHistory());
    writeHistoryDataset();

    const unsubscribeHistory = useScenarioHistory.subscribe((state) => {
      writeHistoryDataset();
      if (!automationMode && state.hydrated) {
        writeStoredHistory(state.records);
      }
    });
    const unsubscribeScenario = useSimStore.subscribe(
      (nextState, previousState) => {
        if (nextState.activeScenario !== previousState.activeScenario) {
          writeHistoryDataset();
        }
      },
    );

    return () => {
      unsubscribeHistory();
      unsubscribeScenario();
    };
  }, [automationMode]);

  useEffect(() => {
    useNavigationPlanner.getState().resetForScenario();
    writePlannerDataset();
  }, [scenarioRunId]);

  useEffect(() => {
    if (sessionPhase === 'menu') {
      useNavigationPlanner.getState().resetForScenario();
    }
  }, [sessionPhase]);

  useEffect(() => {
    writePlannerDataset();
    return useNavigationPlanner.subscribe(writePlannerDataset);
  }, []);

  return null;
}
