'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Anchor,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Compass,
  Gauge,
  Keyboard,
  LifeBuoy,
  MapPinned,
  MousePointer2,
  Navigation,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getScenarioDefinition } from '@/sim/scenarios/ScenarioCatalog';
import { getResolvedScenarioRoute } from '@/sim/scenarios/ScenarioRoute';
import {
  type InputMode,
  useExperienceSettings,
} from '@/store/useExperienceSettings';
import { useSimStore } from '@/store/useSimStore';

interface OnboardingOverlayProps {
  automationMode: boolean;
}

interface TutorialStep {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  details: Array<{
    icon: LucideIcon;
    label: string;
    description: string;
  }>;
}

function controlStep(inputMode: InputMode): TutorialStep {
  if (inputMode === 'touch') {
    return {
      eyebrow: 'Touch controls',
      title: 'Steer from the on-screen helm.',
      description:
        'Hold the directional controls rather than tapping them. The simulator continuously reads throttle and rudder input while your finger remains down.',
      icon: Smartphone,
      details: [
        {
          icon: ArrowRight,
          label: 'Forward and reverse',
          description: 'Hold the up or down control to apply propulsion.',
        },
        {
          icon: Navigation,
          label: 'Port and starboard',
          description: 'Hold the left or right control to move the rudder.',
        },
        {
          icon: Camera,
          label: 'Camera button',
          description: 'Cycle chase, helm, orbit, and cinematic views.',
        },
        {
          icon: Anchor,
          label: 'Pause button',
          description: 'Freeze the fixed-step simulation before changing plans.',
        },
      ],
    };
  }

  return {
    eyebrow: 'Keyboard controls',
    title: 'Command the vessel from the keyboard.',
    description:
      'The controls are continuous: hold the keys to build thrust or rudder angle and release them smoothly as the hull responds.',
    icon: Keyboard,
    details: [
      {
        icon: ArrowRight,
        label: 'W / S or ↑ / ↓',
        description: 'Apply forward or reverse propulsion.',
      },
      {
        icon: Navigation,
        label: 'A / D or ← / →',
        description: 'Steer port or starboard.',
      },
      {
        icon: Camera,
        label: 'C',
        description: 'Cycle the available camera modes.',
      },
      {
        icon: Anchor,
        label: 'Escape',
        description: 'Pause or resume the active passage.',
      },
    ],
  };
}

function createTutorialSteps(
  inputMode: InputMode,
  scenarioTitle: string,
  objective: string,
  waypointCount: number,
): TutorialStep[] {
  return [
    {
      eyebrow: 'Welcome aboard',
      title: scenarioTitle,
      description: objective,
      icon: Compass,
      details: [
        {
          icon: Gauge,
          label: 'Real vessel response',
          description:
            'Momentum, current, wind, hull damage, and water forces all affect handling.',
        },
        {
          icon: ShieldCheck,
          label: 'Deterministic simulation',
          description:
            'Physics advances at a fixed 60 Hz independently of display refresh rate.',
        },
      ],
    },
    controlStep(inputMode),
    {
      eyebrow: 'Navigation',
      title: `Follow the ${waypointCount}-mark route.`,
      description:
        'The marine chart tracks your vessel, current bearing, remaining distance, route progress, and the next gate.',
      icon: MapPinned,
      details: [
        {
          icon: Compass,
          label: 'Bearing pointer',
          description: 'Turn until the pointer settles near the top of the dial.',
        },
        {
          icon: Navigation,
          label: 'Waypoint gates',
          description:
            'Pass through each numbered mark in sequence; some final gates require low speed.',
        },
        {
          icon: Gauge,
          label: 'Time and progress',
          description:
            'The chart shows the mission clock and route completion percentage.',
        },
      ],
    },
    {
      eyebrow: 'Vessel care',
      title: 'Protect the hull, engine, and rudder.',
      description:
        'Impacts and heavy handling can damage the vessel. Watch the instrument HUD and recover before a small problem becomes a failed passage.',
      icon: LifeBuoy,
      details: [
        {
          icon: Wrench,
          label: inputMode === 'touch' ? 'Repair control' : 'Hold R',
          description:
            'Stop the vessel and cut thrust before beginning a field repair.',
        },
        {
          icon: RotateCcw,
          label: inputMode === 'touch' ? 'Reset button' : 'Home',
          description:
            'Return the vessel to the scenario start if recovery is no longer practical.',
        },
        {
          icon: MousePointer2,
          label: 'HUD and settings',
          description:
            'Hide instruments, change camera behavior, or enable accessibility options at any time.',
        },
      ],
    },
    {
      eyebrow: 'Ready to depart',
      title: 'Take the helm.',
      description:
        'Start gently, account for current before committing to a turn, and use the route guidance rather than steering directly at distant marks.',
      icon: Check,
      details: [
        {
          icon: Anchor,
          label: 'Pause safely',
          description: 'The pause menu freezes physics and environmental time.',
        },
        {
          icon: Camera,
          label: 'Choose your view',
          description: 'Chase is easiest to learn; helm is best for precise piloting.',
        },
      ],
    },
  ];
}

export default function OnboardingOverlay({
  automationMode,
}: OnboardingOverlayProps) {
  const simulator = useSimStore(
    useShallow((state) => ({
      activeScenario: state.activeScenario,
      sessionPhase: state.sessionPhase,
      scenarioRunStatus: state.scenarioRunStatus,
    })),
  );
  const settings = useExperienceSettings(
    useShallow((state) => ({
      settingsHydrated: state.settingsHydrated,
      settingsOpen: state.settingsOpen,
      onboardingCompleted: state.onboardingCompleted,
      onboardingOpen: state.onboardingOpen,
      onboardingStep: state.onboardingStep,
      inputMode: state.inputMode,
      reducedMotion: state.reducedMotion,
      beginOnboarding: state.beginOnboarding,
      nextOnboardingStep: state.nextOnboardingStep,
      previousOnboardingStep: state.previousOnboardingStep,
      completeOnboarding: state.completeOnboarding,
      skipOnboarding: state.skipOnboarding,
    })),
  );

  const scenario = getScenarioDefinition(simulator.activeScenario);
  const waypointCount = getResolvedScenarioRoute(simulator.activeScenario).length;
  const steps = useMemo(
    () =>
      createTutorialSteps(
        settings.inputMode,
        scenario.title,
        scenario.objective,
        waypointCount,
      ),
    [
      scenario.objective,
      scenario.title,
      settings.inputMode,
      waypointCount,
    ],
  );

  useEffect(() => {
    if (
      automationMode ||
      !settings.settingsHydrated ||
      settings.settingsOpen ||
      settings.onboardingCompleted ||
      settings.onboardingOpen ||
      simulator.sessionPhase !== 'running' ||
      simulator.scenarioRunStatus !== 'active'
    ) {
      return;
    }

    settings.beginOnboarding();
  }, [
    automationMode,
    settings,
    simulator.scenarioRunStatus,
    simulator.sessionPhase,
  ]);

  if (automationMode || !settings.onboardingOpen) return null;

  const stepIndex = Math.min(settings.onboardingStep, steps.length - 1);
  const step = steps[stepIndex];
  const StepIcon = step.icon;
  const lastStep = steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="simulator-onboarding-title"
      className="pointer-events-auto absolute inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-slate-950/82 p-4 text-white backdrop-blur-xl sm:p-8"
    >
      <section
        className={`my-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-white/12 bg-slate-950/95 shadow-2xl shadow-black/60 ${
          settings.reducedMotion ? '' : 'animate-in fade-in zoom-in-95 duration-300'
        }`}
      >
        <div className="grid md:grid-cols-[0.38fr_0.62fr]">
          <aside className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-sky-500/18 via-cyan-400/8 to-teal-400/14 p-5 md:border-b-0 md:border-r md:p-7">
            <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-sky-400/15 blur-3xl" />
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-300/30 bg-sky-300/15 text-sky-200 shadow-lg">
                <StepIcon className="h-7 w-7" />
              </div>
              <div className="mt-5 text-[9px] font-black uppercase tracking-[0.24em] text-sky-300">
                {step.eyebrow}
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-400">
                Step {stepIndex + 1} of {steps.length}
              </div>

              <div className="mt-5 flex gap-1.5">
                {steps.map((tutorialStep, index) => (
                  <div
                    key={tutorialStep.title}
                    className={`h-1.5 flex-1 rounded-full transition ${
                      index <= stepIndex ? 'bg-sky-400' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
            </div>
          </aside>

          <div className="p-5 sm:p-7">
            <h2
              id="simulator-onboarding-title"
              className="text-2xl font-black tracking-tight text-white sm:text-3xl"
            >
              {step.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {step.description}
            </p>

            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {step.details.map(({ icon: DetailIcon, label, description }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/8 bg-white/[0.035] p-3.5"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
                    <DetailIcon className="h-4 w-4 text-cyan-300" />
                    {label}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-4.5 text-slate-400">
                    {description}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={settings.skipOnboarding}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                Skip guide
              </button>

              <div className="flex gap-2">
                {stepIndex > 0 && (
                  <button
                    type="button"
                    onClick={settings.previousOnboardingStep}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 sm:flex-none"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    stepIndex === lastStep
                      ? settings.completeOnboarding()
                      : settings.nextOnboardingStep(lastStep)
                  }
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-400 px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-sky-950/30 transition hover:brightness-110 sm:flex-none"
                >
                  {stepIndex === lastStep ? 'Begin passage' : 'Continue'}
                  {stepIndex === lastStep ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
