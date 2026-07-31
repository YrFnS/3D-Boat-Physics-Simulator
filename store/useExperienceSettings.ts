import { create } from 'zustand';
import { useSimStore } from '@/store/useSimStore';

export type InputMode = 'keyboard' | 'touch';
export type InterfaceScale = 'compact' | 'default' | 'large';

export interface ExperienceSettingsSnapshot {
  onboardingCompleted: boolean;
  controlHintsEnabled: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  interfaceScale: InterfaceScale;
  cameraFov: number;
  cameraSmoothing: number;
}

interface ExperienceSettingsState extends ExperienceSettingsSnapshot {
  settingsHydrated: boolean;
  settingsOpen: boolean;
  settingsResumeOnClose: boolean;
  onboardingOpen: boolean;
  onboardingStep: number;
  onboardingResumeOnClose: boolean;
  inputMode: InputMode;

  hydrateSettings: (
    settings: Partial<ExperienceSettingsSnapshot>,
  ) => void;
  openSettings: () => void;
  closeSettings: () => void;
  beginOnboarding: () => void;
  replayOnboarding: () => void;
  nextOnboardingStep: (lastStep: number) => void;
  previousOnboardingStep: () => void;
  completeOnboarding: () => void;
  skipOnboarding: () => void;
  setControlHintsEnabled: (value: boolean) => void;
  setReducedMotion: (value: boolean) => void;
  setHighContrast: (value: boolean) => void;
  setInterfaceScale: (value: InterfaceScale) => void;
  setCameraFov: (value: number) => void;
  setCameraSmoothing: (value: number) => void;
  setInputMode: (value: InputMode) => void;
  resetSettings: () => void;
}

export const DEFAULT_EXPERIENCE_SETTINGS: ExperienceSettingsSnapshot = {
  onboardingCompleted: false,
  controlHintsEnabled: true,
  reducedMotion: false,
  highContrast: false,
  interfaceScale: 'default',
  cameraFov: 60,
  cameraSmoothing: 0.62,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isInterfaceScale(value: unknown): value is InterfaceScale {
  return value === 'compact' || value === 'default' || value === 'large';
}

function normalizedSettings(
  settings: Partial<ExperienceSettingsSnapshot>,
): Partial<ExperienceSettingsSnapshot> {
  return {
    onboardingCompleted:
      typeof settings.onboardingCompleted === 'boolean'
        ? settings.onboardingCompleted
        : undefined,
    controlHintsEnabled:
      typeof settings.controlHintsEnabled === 'boolean'
        ? settings.controlHintsEnabled
        : undefined,
    reducedMotion:
      typeof settings.reducedMotion === 'boolean'
        ? settings.reducedMotion
        : undefined,
    highContrast:
      typeof settings.highContrast === 'boolean'
        ? settings.highContrast
        : undefined,
    interfaceScale: isInterfaceScale(settings.interfaceScale)
      ? settings.interfaceScale
      : undefined,
    cameraFov:
      typeof settings.cameraFov === 'number' &&
      Number.isFinite(settings.cameraFov)
        ? clamp(settings.cameraFov, 45, 80)
        : undefined,
    cameraSmoothing:
      typeof settings.cameraSmoothing === 'number' &&
      Number.isFinite(settings.cameraSmoothing)
        ? clamp(settings.cameraSmoothing, 0, 1)
        : undefined,
  };
}

function stripUndefined<T extends object>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function resumeSimulation(shouldResume: boolean) {
  if (!shouldResume) return;
  useSimStore.getState().resumeSession();
}

export const useExperienceSettings = create<ExperienceSettingsState>(
  (set, get) => ({
    ...DEFAULT_EXPERIENCE_SETTINGS,
    settingsHydrated: false,
    settingsOpen: false,
    settingsResumeOnClose: false,
    onboardingOpen: false,
    onboardingStep: 0,
    onboardingResumeOnClose: false,
    inputMode: 'keyboard',

    hydrateSettings: (settings) =>
      set({
        ...stripUndefined(normalizedSettings(settings)),
        settingsHydrated: true,
      }),

    openSettings: () => {
      const simulator = useSimStore.getState();
      const resumeAfterClose = simulator.sessionPhase === 'running';
      if (resumeAfterClose) simulator.pauseSession();

      set({
        settingsOpen: true,
        settingsResumeOnClose: resumeAfterClose,
      });
    },

    closeSettings: () => {
      const resumeAfterClose = get().settingsResumeOnClose;
      set({
        settingsOpen: false,
        settingsResumeOnClose: false,
      });
      resumeSimulation(resumeAfterClose);
    },

    beginOnboarding: () => {
      const simulator = useSimStore.getState();
      const resumeAfterClose = simulator.sessionPhase === 'running';
      if (resumeAfterClose) simulator.pauseSession();

      set({
        onboardingOpen: true,
        onboardingStep: 0,
        onboardingResumeOnClose: resumeAfterClose,
        settingsOpen: false,
        settingsResumeOnClose: false,
      });
    },

    replayOnboarding: () => {
      const simulator = useSimStore.getState();
      const state = get();
      const resumeAfterClose =
        state.settingsResumeOnClose || simulator.sessionPhase === 'running';
      if (simulator.sessionPhase === 'running') simulator.pauseSession();

      set({
        onboardingOpen: true,
        onboardingStep: 0,
        onboardingResumeOnClose: resumeAfterClose,
        settingsOpen: false,
        settingsResumeOnClose: false,
      });
    },

    nextOnboardingStep: (lastStep) => {
      const step = get().onboardingStep;
      if (step < lastStep) {
        set({ onboardingStep: step + 1 });
        return;
      }
      get().completeOnboarding();
    },

    previousOnboardingStep: () =>
      set((state) => ({
        onboardingStep: Math.max(0, state.onboardingStep - 1),
      })),

    completeOnboarding: () => {
      const resumeAfterClose = get().onboardingResumeOnClose;
      set({
        onboardingCompleted: true,
        onboardingOpen: false,
        onboardingStep: 0,
        onboardingResumeOnClose: false,
      });
      resumeSimulation(resumeAfterClose);
    },

    skipOnboarding: () => get().completeOnboarding(),
    setControlHintsEnabled: (controlHintsEnabled) =>
      set({ controlHintsEnabled }),
    setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    setHighContrast: (highContrast) => set({ highContrast }),
    setInterfaceScale: (interfaceScale) => set({ interfaceScale }),
    setCameraFov: (cameraFov) =>
      set({ cameraFov: clamp(cameraFov, 45, 80) }),
    setCameraSmoothing: (cameraSmoothing) =>
      set({ cameraSmoothing: clamp(cameraSmoothing, 0, 1) }),
    setInputMode: (inputMode) => set({ inputMode }),

    resetSettings: () =>
      set((state) => ({
        ...DEFAULT_EXPERIENCE_SETTINGS,
        onboardingCompleted: state.onboardingCompleted,
      })),
  }),
);
