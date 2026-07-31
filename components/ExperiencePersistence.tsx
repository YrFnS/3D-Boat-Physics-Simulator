'use client';

import { useEffect } from 'react';
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
