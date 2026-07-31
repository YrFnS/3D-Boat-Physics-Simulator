'use client';

import { useEffect } from 'react';
import {
  type ExperienceSettingsSnapshot,
  type InputMode,
  useExperienceSettings,
} from '@/store/useExperienceSettings';

const SETTINGS_STORAGE_KEY = 'boat-simulator-settings-v1';

interface SettingsPersistenceProps {
  automationMode: boolean;
}

function isDedicatedOnboardingProbe() {
  return new URLSearchParams(window.location.search).get('onboardingTest') === '1';
}

function readStoredSettings(): Partial<ExperienceSettingsSnapshot> {
  try {
    const storedValue = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    const storedSettings = storedValue
      ? (JSON.parse(storedValue) as Partial<ExperienceSettingsSnapshot>)
      : {};

    // Existing physics, navigation, and mission browser probes pre-date the
    // first-run guide. Keep them focused on their original assertions while a
    // dedicated onboarding probe exercises the real tutorial flow.
    if (navigator.webdriver && !isDedicatedOnboardingProbe()) {
      return {
        ...storedSettings,
        onboardingCompleted: true,
      };
    }

    return storedSettings && typeof storedSettings === 'object'
      ? storedSettings
      : {};
  } catch {
    return navigator.webdriver && !isDedicatedOnboardingProbe()
      ? { onboardingCompleted: true }
      : {};
  }
}

function getSnapshot(): ExperienceSettingsSnapshot {
  const state = useExperienceSettings.getState();
  return {
    onboardingCompleted: state.onboardingCompleted,
    controlHintsEnabled: state.controlHintsEnabled,
    reducedMotion: state.reducedMotion,
    highContrast: state.highContrast,
    interfaceScale: state.interfaceScale,
    cameraFov: state.cameraFov,
    cameraSmoothing: state.cameraSmoothing,
  };
}

function writeSettings(snapshot: ExperienceSettingsSnapshot) {
  try {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    // Storage can be unavailable in private or restricted browsing modes.
  }
}

function settingsChanged(
  previous: ExperienceSettingsSnapshot,
  next: ExperienceSettingsSnapshot,
) {
  return (
    previous.onboardingCompleted !== next.onboardingCompleted ||
    previous.controlHintsEnabled !== next.controlHintsEnabled ||
    previous.reducedMotion !== next.reducedMotion ||
    previous.highContrast !== next.highContrast ||
    previous.interfaceScale !== next.interfaceScale ||
    previous.cameraFov !== next.cameraFov ||
    previous.cameraSmoothing !== next.cameraSmoothing
  );
}

function writeDocumentState(inputMode: InputMode) {
  const state = useExperienceSettings.getState();
  const dataset = document.documentElement.dataset;
  dataset.simSettingsHydrated = state.settingsHydrated ? '1' : '0';
  dataset.simSettingsOpen = state.settingsOpen ? '1' : '0';
  dataset.simOnboardingOpen = state.onboardingOpen ? '1' : '0';
  dataset.simOnboardingCompleted = state.onboardingCompleted ? '1' : '0';
  dataset.simOnboardingStep = String(state.onboardingStep);
  dataset.simControlHints = state.controlHintsEnabled ? '1' : '0';
  dataset.simReducedMotion = state.reducedMotion ? '1' : '0';
  dataset.simHighContrast = state.highContrast ? '1' : '0';
  dataset.simInterfaceScale = state.interfaceScale;
  dataset.simCameraFov = String(state.cameraFov);
  dataset.simCameraSmoothing = String(state.cameraSmoothing);
  dataset.simInputMode = inputMode;
}

export default function SettingsPersistence({
  automationMode,
}: SettingsPersistenceProps) {
  const hydrateSettings = useExperienceSettings(
    (state) => state.hydrateSettings,
  );

  useEffect(() => {
    hydrateSettings(
      automationMode
        ? {
            onboardingCompleted: true,
            controlHintsEnabled: false,
            reducedMotion: true,
          }
        : readStoredSettings(),
    );

    let previousSnapshot = getSnapshot();
    writeDocumentState(useExperienceSettings.getState().inputMode);
    if (!automationMode) writeSettings(previousSnapshot);

    return useExperienceSettings.subscribe((nextState) => {
      writeDocumentState(nextState.inputMode);
      const nextSnapshot = getSnapshot();
      if (
        !automationMode &&
        settingsChanged(previousSnapshot, nextSnapshot)
      ) {
        writeSettings(nextSnapshot);
      }
      previousSnapshot = nextSnapshot;
    });
  }, [automationMode, hydrateSettings]);

  return null;
}
