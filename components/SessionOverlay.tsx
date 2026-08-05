'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Anchor,
  Camera,
  CirclePause,
  CloudRain,
  Compass,
  Home,
  Play,
  RefreshCcw,
  RotateCcw,
  Ship,
  Snowflake,
  Waves,
  Wind,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  getScenarioDefinition,
  SCENARIOS,
  type ScenarioId,
} from '@/sim/scenarios/ScenarioCatalog';
import {
  CAMERA_MODES,
  type BoatType,
  type CameraMode,
  useSimStore,
} from '@/store/useSimStore';

interface SessionOverlayProps {
  automationMode: boolean;
}

const SCENARIO_ICONS: Record<ScenarioId, LucideIcon> = {
  'open-water': Waves,
  'harbor-training': Anchor,
  'storm-passage': CloudRain,
  'winter-rescue': Snowflake,
};

const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Chase',
  helm: 'Helm',
  orbit: 'Orbit',
  cinematic: 'Cinematic',
};

const DIFFICULTY_CLASS = {
  Training: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  Standard: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  Advanced: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
} as const;

function ScenarioEnvironment({ scenarioId }: { scenarioId: ScenarioId }) {
  const scenario = getScenarioDefinition(scenarioId);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
          <Wind className="h-3 w-3" /> Wind
        </div>
        <div className="mt-1 font-mono text-sm text-slate-100">
          {scenario.windSpeed.toFixed(1)} m/s
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
          <Compass className="h-3 w-3" /> Bearing
        </div>
        <div className="mt-1 font-mono text-sm text-slate-100">
          {scenario.windDir.toFixed(0)}°
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
          <Waves className="h-3 w-3" /> Current
        </div>
        <div className="mt-1 font-mono text-sm text-slate-100">
          {scenario.currentSpeed.toFixed(1)} m/s
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
          <Camera className="h-3 w-3" /> Start
        </div>
        <div className="mt-1 font-mono text-sm text-slate-100">
          {String(Math.round(scenario.targetTime)).padStart(2, '0')}:00
        </div>
      </div>
    </div>
  );
}

function CameraSelector({
  cameraMode,
  setCameraMode,
}: {
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {CAMERA_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={cameraMode === mode}
          onClick={() => setCameraMode(mode)}
          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
            cameraMode === mode
              ? 'border-sky-400/60 bg-sky-500 text-white shadow-lg shadow-sky-950/30'
              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10'
          }`}
        >
          <Camera className="h-3.5 w-3.5" />
          {CAMERA_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}

function LaunchBriefing() {
  const state = useSimStore(
    useShallow((store) => ({
      activeScenario: store.activeScenario,
      activeBoat: store.activeBoat,
      previewScenario: store.previewScenario,
      setActiveBoat: store.setActiveBoat,
      startScenario: store.startScenario,
    })),
  );
  const selectedScenario = getScenarioDefinition(state.activeScenario);

  return (
    <div className="pointer-events-auto absolute inset-0 z-[90] overflow-y-auto bg-slate-950/78 text-white backdrop-blur-md">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_85%_70%,rgba(20,184,166,0.13),transparent_38%)]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 py-5 sm:px-8 sm:py-8 lg:px-12">
        <header className="flex items-start justify-between gap-6">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-sky-200">
              <Ship className="h-3.5 w-3.5" /> Marine simulation lab
            </div>
            <h1 className="max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
              Choose your passage.
              <span className="block bg-gradient-to-r from-sky-300 via-cyan-200 to-teal-300 bg-clip-text text-transparent">
                Take command of the vessel.
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Select a controlled environment, choose a vessel, and enter the
              deterministic six-degree marine simulation. Every passage can be
              restarted instantly without reloading the page.
            </p>
          </div>
          <div className="hidden rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right sm:block">
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Phase 3
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-200">
              Product experience
            </div>
          </div>
        </header>

        <div className="mt-8 grid flex-1 gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Passage briefing
                </div>
                <h2 className="mt-1 text-xl font-bold text-white">
                  Select a scenario
                </h2>
              </div>
              <div className="text-right text-[10px] text-slate-500">
                Standard mission presets lock after launch
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {SCENARIOS.map((scenario) => {
                const Icon = SCENARIO_ICONS[scenario.id];
                const selected = state.activeScenario === scenario.id;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => state.previewScenario(scenario.id)}
                    className={`group rounded-2xl border p-4 text-left transition sm:p-5 ${
                      selected
                        ? 'border-sky-400/60 bg-sky-400/12 shadow-2xl shadow-sky-950/30'
                        : 'border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                          selected
                            ? 'border-sky-300/40 bg-sky-400/20 text-sky-200'
                            : 'border-white/10 bg-black/20 text-slate-400 group-hover:text-slate-200'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${DIFFICULTY_CLASS[scenario.difficulty]}`}
                      >
                        {scenario.difficulty}
                      </span>
                    </div>
                    <div className="mt-4 text-[9px] font-bold uppercase tracking-[0.18em] text-sky-300/80">
                      {scenario.kicker}
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-white">
                      {scenario.title}
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-slate-400 sm:text-sm">
                      {scenario.summary}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    Current objective
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-100 sm:text-base">
                    {selectedScenario.objective}
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-slate-300">
                  Recommended: {selectedScenario.recommendedBoat}
                </div>
              </div>
              <div className="mt-4">
                <ScenarioEnvironment scenarioId={selectedScenario.id} />
              </div>
            </div>
          </section>

          <aside className="flex flex-col rounded-3xl border border-white/10 bg-black/25 p-4 shadow-2xl sm:p-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
              Vessel assignment
            </div>
            <h2 className="mt-1 text-xl font-bold text-white">
              Select your hull
            </h2>

            <div className="mt-4 grid gap-3">
              {(['trawler', 'speedboat'] as BoatType[]).map((boat) => {
                const selected = state.activeBoat === boat;
                const recommended = selectedScenario.recommendedBoat === boat;
                return (
                  <button
                    key={boat}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => state.setActiveBoat(boat)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selected
                        ? 'border-teal-400/60 bg-teal-400/12 shadow-lg shadow-teal-950/25'
                        : 'border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                            selected
                              ? 'bg-teal-400 text-slate-950'
                              : 'bg-white/5 text-slate-400'
                          }`}
                        >
                          <Ship className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-bold capitalize text-white">
                            {boat}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {boat === 'trawler'
                              ? 'Stable displacement hull'
                              : 'Fast planing response hull'}
                          </div>
                        </div>
                      </div>
                      {recommended && (
                        <span className="rounded-full bg-teal-300/15 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em] text-teal-200">
                          Recommended
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() =>
                  state.startScenario(state.activeScenario, state.activeBoat)
                }
                className="group flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-sky-500 to-teal-400 px-5 py-4 font-bold text-slate-950 shadow-2xl shadow-sky-950/35 transition hover:brightness-110"
              >
                <span>
                  <span className="block text-left text-[9px] uppercase tracking-[0.18em] opacity-70">
                    Begin passage
                  </span>
                  <span className="mt-0.5 block text-left text-base">
                    {selectedScenario.title}
                  </span>
                </span>
                <Play className="h-5 w-5 transition group-hover:translate-x-0.5" />
              </button>
              <div className="mt-3 text-center text-[10px] leading-4 text-slate-500">
                Escape pauses · C cycles cameras · controls remain available on
                touch devices
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function RunningToolbar() {
  const state = useSimStore(
    useShallow((store) => ({
      activeScenario: store.activeScenario,
      scenarioRunMode: store.scenarioRunMode,
      cameraMode: store.cameraMode,
      pauseSession: store.pauseSession,
      cycleCameraMode: store.cycleCameraMode,
      resetVessel: store.resetVessel,
    })),
  );
  const scenario = getScenarioDefinition(state.activeScenario);

  return (
    <>
      <div className="pointer-events-auto absolute left-1/2 top-3 z-[65] hidden -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-slate-950/72 p-1.5 text-white shadow-2xl backdrop-blur-xl sm:flex">
        <div className="px-3">
          <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Active passage
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs font-semibold text-slate-200">
            {scenario.title}
            <span
              className={`rounded-full px-2 py-0.5 text-[7px] font-black uppercase tracking-wider ${
                state.scenarioRunMode === 'assisted'
                  ? 'bg-amber-300/12 text-amber-200'
                  : 'bg-emerald-300/10 text-emerald-200'
              }`}
            >
              {state.scenarioRunMode === 'assisted' ? 'Assisted' : 'Standard'}
            </span>
          </div>
        </div>
        <div className="mx-1 h-7 w-px bg-white/10" />
        <button
          type="button"
          aria-label="Pause simulation"
          onClick={state.pauseSession}
          className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <CirclePause className="h-4 w-4" /> Pause
        </button>
        <button
          type="button"
          aria-label="Cycle camera mode"
          onClick={state.cycleCameraMode}
          className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <Camera className="h-4 w-4" /> {CAMERA_LABELS[state.cameraMode]}
        </button>
        <button
          type="button"
          aria-label="Reset vessel"
          onClick={state.resetVessel}
          className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
      </div>

      <div className="pointer-events-auto absolute right-3 top-20 z-[65] flex flex-col gap-2 sm:hidden">
        <button
          type="button"
          aria-label="Pause simulation"
          onClick={state.pauseSession}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950/75 text-slate-200 shadow-xl backdrop-blur-xl"
        >
          <CirclePause className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={`Camera mode: ${CAMERA_LABELS[state.cameraMode]}`}
          onClick={state.cycleCameraMode}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950/75 text-slate-200 shadow-xl backdrop-blur-xl"
        >
          <Camera className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Reset vessel"
          onClick={state.resetVessel}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950/75 text-slate-200 shadow-xl backdrop-blur-xl"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

function PauseMenu() {
  const state = useSimStore(
    useShallow((store) => ({
      activeScenario: store.activeScenario,
      activeBoat: store.activeBoat,
      scenarioRunMode: store.scenarioRunMode,
      cameraMode: store.cameraMode,
      resumeSession: store.resumeSession,
      restartScenario: store.restartScenario,
      returnToMenu: store.returnToMenu,
      setCameraMode: store.setCameraMode,
    })),
  );
  const scenario = getScenarioDefinition(state.activeScenario);

  return (
    <div className="pointer-events-auto absolute inset-0 z-[85] flex items-center justify-center bg-slate-950/58 p-4 text-white backdrop-blur-md">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-sky-300">
              Simulation paused
            </div>
            <h2 className="mt-1 text-2xl font-black text-white">
              {scenario.title}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {state.activeBoat} · {state.scenarioRunMode === 'assisted' ? 'assisted conditions' : 'standard scoring'} · physics and environmental time are frozen
            </p>
          </div>
          <button
            type="button"
            aria-label="Resume simulation"
            onClick={state.resumeSession}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Camera mode
          </div>
          <CameraSelector
            cameraMode={state.cameraMode}
            setCameraMode={state.setCameraMode}
          />
        </div>

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={state.resumeSession}
            className="flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-400"
          >
            <Play className="h-4 w-4" /> Resume passage
          </button>
          <button
            type="button"
            onClick={state.restartScenario}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <RefreshCcw className="h-4 w-4" /> Restart scenario
          </button>
          <button
            type="button"
            onClick={state.returnToMenu}
            className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <Home className="h-4 w-4" /> Return to briefing
          </button>
        </div>
      </section>
    </div>
  );
}

export default function SessionOverlay({
  automationMode,
}: SessionOverlayProps) {
  const sessionPhase = useSimStore((state) => state.sessionPhase);

  if (automationMode) return null;
  if (sessionPhase === 'menu') return <LaunchBriefing />;
  if (sessionPhase === 'paused') return <PauseMenu />;
  return <RunningToolbar />;
}
