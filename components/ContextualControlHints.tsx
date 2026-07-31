'use client';

import {
  Camera,
  CirclePause,
  Keyboard,
  Navigation,
  Smartphone,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useExperienceSettings } from '@/store/useExperienceSettings';
import { useSimStore } from '@/store/useSimStore';

interface ContextualControlHintsProps {
  automationMode: boolean;
}

export default function ContextualControlHints({
  automationMode,
}: ContextualControlHintsProps) {
  const simulator = useSimStore(
    useShallow((state) => ({
      sessionPhase: state.sessionPhase,
      scenarioRunStatus: state.scenarioRunStatus,
    })),
  );
  const settings = useExperienceSettings(
    useShallow((state) => ({
      controlHintsEnabled: state.controlHintsEnabled,
      onboardingOpen: state.onboardingOpen,
      settingsOpen: state.settingsOpen,
      inputMode: state.inputMode,
      setControlHintsEnabled: state.setControlHintsEnabled,
    })),
  );

  if (
    automationMode ||
    !settings.controlHintsEnabled ||
    settings.onboardingOpen ||
    settings.settingsOpen ||
    simulator.sessionPhase !== 'running' ||
    simulator.scenarioRunStatus !== 'active'
  ) {
    return null;
  }

  const touch = settings.inputMode === 'touch';
  const InputIcon = touch ? Smartphone : Keyboard;

  return (
    <aside
      aria-label="Contextual simulator controls"
      className="pointer-events-auto absolute bottom-[10.25rem] left-1/2 z-[68] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/76 px-3 py-2 text-white shadow-xl backdrop-blur-xl sm:bottom-16 sm:gap-3 sm:px-4"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-400/12 text-sky-200">
        <InputIcon className="h-4 w-4" />
      </div>
      <div className="flex min-w-0 items-center gap-3 overflow-x-auto text-[9px] font-semibold text-slate-300 sm:text-[10px]">
        <span className="whitespace-nowrap">
          {touch ? 'Hold arrows to pilot' : 'W/S throttle · A/D steer'}
        </span>
        <span className="hidden h-1 w-1 shrink-0 rounded-full bg-slate-600 sm:block" />
        <span className="hidden items-center gap-1 whitespace-nowrap sm:flex">
          <Navigation className="h-3 w-3 text-cyan-300" /> Follow route marks
        </span>
        <span className="hidden h-1 w-1 shrink-0 rounded-full bg-slate-600 md:block" />
        <span className="hidden items-center gap-1 whitespace-nowrap md:flex">
          <Camera className="h-3 w-3 text-indigo-300" />
          {touch ? 'Camera button' : 'C changes camera'}
        </span>
        <span className="hidden h-1 w-1 shrink-0 rounded-full bg-slate-600 lg:block" />
        <span className="hidden items-center gap-1 whitespace-nowrap lg:flex">
          <CirclePause className="h-3 w-3 text-amber-300" />
          {touch ? 'Pause button' : 'Esc pauses'}
        </span>
      </div>
      <button
        type="button"
        aria-label="Hide contextual control hints"
        onClick={() => settings.setControlHintsEnabled(false)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </aside>
  );
}
