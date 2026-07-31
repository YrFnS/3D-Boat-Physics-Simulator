'use client';

import { useEffect, useState } from 'react';
import {
  type ExperiencePreferences,
  useSimStore,
} from '@/store/useSimStore';

const EXPERIENCE_STORAGE_KEY = 'boat-simulator-experience-v1';

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

export default function ExperiencePersistence() {
  const [hydrated, setHydrated] = useState(false);
  const activeBoat = useSimStore((state) => state.activeBoat);
  const activeScenario = useSimStore((state) => state.activeScenario);
  const cameraMode = useSimStore((state) => state.cameraMode);
  const hudVisible = useSimStore((state) => state.hudVisible);
  const sessionPhase = useSimStore((state) => state.sessionPhase);
  const resetVesselTrigger = useSimStore(
    (state) => state.resetVesselTrigger,
  );
  const hydrateExperiencePreferences = useSimStore(
    (state) => state.hydrateExperiencePreferences,
  );

  useEffect(() => {
    hydrateExperiencePreferences(readStoredPreferences());
    setHydrated(true);
  }, [hydrateExperiencePreferences]);

  useEffect(() => {
    const dataset = document.documentElement.dataset;
    dataset.simSessionPhase = sessionPhase;
    dataset.simScenario = activeScenario;
    dataset.simCameraMode = cameraMode;
    dataset.simHudVisible = hudVisible ? '1' : '0';
    dataset.simActiveBoat = activeBoat;
    dataset.simResetVesselTrigger = String(resetVesselTrigger);

    if (!hydrated) return;

    const preferences: ExperiencePreferences = {
      activeBoat,
      activeScenario,
      cameraMode,
      hudVisible,
    };

    try {
      window.localStorage.setItem(
        EXPERIENCE_STORAGE_KEY,
        JSON.stringify(preferences),
      );
    } catch {
      // Storage can be unavailable in private or restricted browsing modes.
    }
  }, [
    activeBoat,
    activeScenario,
    cameraMode,
    hudVisible,
    hydrated,
    resetVesselTrigger,
    sessionPhase,
  ]);

  return null;
}
