'use client';

import { useEffect } from 'react';
import {
  isScenarioEnvironmentLocked,
} from '@/sim/scenarios/ScoredScenarioAuthority';
import {
  type ExperiencePreferences,
  type SimState,
  useSimStore,
} from '@/store/useSimStore';

const EXPERIENCE_STORAGE_KEY = 'boat-simulator-experience-v1';

interface ExperiencePersistenceProps {
  automationMode: boolean;
}

function readStoredPreferences(): Partial<ExperiencePreferences> {
  try {
    const storedValue = window.localStorage.getItem(EXPERIENCE_STORAGE_KEY);
    if (!storedValue) return {};

    const parsed: unknown = JSON.parse(storedValue);
    return parsed && typeof parsed === 'object'
      ? (parsed as Partial<ExperiencePreferences>)
      : {};
  } catch {
    return {};
  }
}

function writeDataset(state: SimState) {
  const dataset = document.documentElement.dataset;
  dataset.simSessionPhase = state.sessionPhase;
  dataset.simScenario = state.activeScenario;
  dataset.simCameraMode = state.cameraMode;
  dataset.simHudVisible = state.hudVisible ? '1' : '0';
  dataset.simActiveBoat = state.activeBoat;
  dataset.simResetVesselTrigger = String(state.resetVesselTrigger);
  dataset.simScenarioRunStatus = state.scenarioRunStatus;
  dataset.simScenarioRunMode = state.scenarioRunMode;
  dataset.simScenarioEnvironmentLocked = isScenarioEnvironmentLocked(
    state.scenarioRunStatus,
    state.scenarioRunMode,
  )
    ? '1'
    : '0';
  dataset.simScenarioAssistanceReason = state.scenarioAssistanceReason;
  dataset.simWindSpeed = String(state.windSpeed);
  dataset.simWindDir = String(state.windDir);
  dataset.simCurrentSpeed = String(state.currentSpeed);
  dataset.simCurrentDir = String(state.currentDir);
  dataset.simTargetTime = String(state.targetTime);
  dataset.simTargetSeason = String(state.targetSeason);
  dataset.simActiveWaypointIndex = String(state.activeWaypointIndex);
  dataset.simScenarioProgress = String(state.scenarioProgress);
  dataset.simScenarioElapsedSeconds = String(
    state.scenarioElapsedSeconds,
  );
  dataset.simNavigationDistanceM = String(state.navigationDistanceM);
  dataset.simNavigationBearingDeg = String(
    state.navigationBearingDeg,
  );
  dataset.simScenarioResult = state.scenarioResult?.outcome ?? '';
  dataset.simScenarioResultRunMode = state.scenarioResult?.runMode ?? '';
  dataset.simHullHealth = String(state.hullHealth);
  dataset.simEngineHealth = String(state.engineHealth);
  dataset.simRudderHealth = String(state.rudderHealth);
  dataset.simEngineTemperature = String(state.engineTemperature);
  dataset.simFloodingRatio = String(state.floodingRatio);
  dataset.simFieldRepairActive = state.fieldRepairActive ? '1' : '0';
  dataset.simFieldRepairSeconds = String(state.fieldRepairSeconds);
  dataset.simFieldRepairActivationCount = String(
    state.fieldRepairActivationCount,
  );
  dataset.simFieldRepairEngineRestored = String(
    state.fieldRepairEngineRestored,
  );
  dataset.simFieldRepairRudderRestored = String(
    state.fieldRepairRudderRestored,
  );
  dataset.simFieldRepairPenaltyPoints = String(
    state.fieldRepairPenaltyPoints,
  );
  dataset.simScenarioRepairPenaltyPoints = String(
    state.scenarioResult?.repairPenaltyPoints ?? 0,
  );
  dataset.simScenarioEntityCount = String(
    state.completedScenarioEntityIds.length,
  );
  dataset.simScenarioInteractionEntityId =
    state.scenarioInteractionEntityId ?? '';
  dataset.simScenarioInteractionStatus =
    state.scenarioInteractionStatus;
  dataset.simScenarioInteractionProgress = String(
    state.scenarioInteractionProgress,
  );
  dataset.simScenarioInteractionMessage =
    state.scenarioInteractionMessage;
  dataset.simScenarioCheckpointId = state.scenarioCheckpointId ?? '';
  dataset.simScenarioCheckpointLabel = state.scenarioCheckpointLabel;
  dataset.simScenarioCheckpointWaypointIndex = String(
    state.scenarioCheckpointWaypointIndex,
  );
  dataset.simScenarioSpawnX = String(state.scenarioSpawnX);
  dataset.simScenarioSpawnZ = String(state.scenarioSpawnZ);
  dataset.simScenarioSpawnHeadingDeg = String(
    state.scenarioSpawnHeadingDeg,
  );
}

function writePreferences(state: SimState) {
  const preferences: ExperiencePreferences = {
    activeBoat: state.activeBoat,
    activeScenario: state.activeScenario,
    cameraMode: state.cameraMode,
    hudVisible: state.hudVisible,
  };

  try {
    window.localStorage.setItem(
      EXPERIENCE_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Storage can be unavailable in private or restricted browsing modes.
  }
}

function preferencesChanged(previous: SimState, next: SimState) {
  return (
    previous.activeBoat !== next.activeBoat ||
    previous.activeScenario !== next.activeScenario ||
    previous.cameraMode !== next.cameraMode ||
    previous.hudVisible !== next.hudVisible
  );
}

export default function ExperiencePersistence({
  automationMode,
}: ExperiencePersistenceProps) {
  const hydrateExperiencePreferences = useSimStore(
    (state) => state.hydrateExperiencePreferences,
  );

  useEffect(() => {
    if (!automationMode) {
      hydrateExperiencePreferences(readStoredPreferences());
    }

    const hydratedState = useSimStore.getState();
    writeDataset(hydratedState);
    if (!automationMode) writePreferences(hydratedState);

    return useSimStore.subscribe((nextState, previousState) => {
      writeDataset(nextState);
      if (
        !automationMode &&
        preferencesChanged(previousState, nextState)
      ) {
        writePreferences(nextState);
      }
    });
  }, [automationMode, hydrateExperiencePreferences]);

  return null;
}
