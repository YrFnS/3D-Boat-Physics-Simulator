'use client';

import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  Gauge,
  Home,
  MapPinned,
  PackageCheck,
  RefreshCcw,
  Route,
  ShieldCheck,
  Ship,
  Trophy,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  getNextScenarioId,
  getScenarioDefinition,
} from '@/sim/scenarios/ScenarioCatalog';
import { useScenarioHistory } from '@/store/useScenarioHistory';
import { useSimStore } from '@/store/useSimStore';

interface ScenarioResultOverlayProps {
  automationMode: boolean;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatDistance(distanceM: number) {
  if (distanceM >= 1_000) return `${(distanceM / 1_000).toFixed(2)} km`;
  return `${Math.round(distanceM)} m`;
}

export default function ScenarioResultOverlay({
  automationMode,
}: ScenarioResultOverlayProps) {
  const state = useSimStore(
    useShallow((store) => ({
      activeScenario: store.activeScenario,
      activeBoat: store.activeBoat,
      scenarioRunStatus: store.scenarioRunStatus,
      scenarioResult: store.scenarioResult,
      restartScenario: store.restartScenario,
      returnToMenu: store.returnToMenu,
      previewScenario: store.previewScenario,
      startScenario: store.startScenario,
    })),
  );
  const history = useScenarioHistory(
    (store) => store.records[state.activeScenario],
  );

  if (
    automationMode ||
    !state.scenarioResult ||
    (state.scenarioRunStatus !== 'completed' &&
      state.scenarioRunStatus !== 'failed')
  ) {
    return null;
  }

  const result = state.scenarioResult;
  const scenario = getScenarioDefinition(state.activeScenario);
  const nextScenarioId = getNextScenarioId(state.activeScenario);
  const nextScenario = getScenarioDefinition(nextScenarioId);
  const completed = result.outcome === 'completed';
  const matchedBestScore = completed && result.score >= history.bestScore;
  const matchedBestTime =
    completed &&
    history.bestTimeSeconds !== null &&
    Math.abs(result.elapsedSeconds - history.bestTimeSeconds) < 0.11;

  const startNextScenario = () => {
    state.previewScenario(nextScenarioId);
    state.startScenario(
      nextScenarioId,
      nextScenario.recommendedBoat,
    );
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-slate-950/72 p-4 text-white backdrop-blur-lg">
      <section className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-950/94 p-5 shadow-2xl sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${
                completed
                  ? 'border-emerald-300/30 bg-emerald-300/12 text-emerald-300'
                  : 'border-amber-300/30 bg-amber-300/12 text-amber-300'
              }`}
            >
              {completed ? (
                <Trophy className="h-7 w-7" />
              ) : (
                <AlertTriangle className="h-7 w-7" />
              )}
            </div>
            <div>
              <div
                className={`text-[10px] font-bold uppercase tracking-[0.24em] ${
                  completed ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {completed ? 'Passage complete' : 'Passage failed'}
              </div>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                {scenario.title}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                {result.reason}
              </p>
            </div>
          </div>

          <div
            className={`rounded-2xl border px-5 py-3 text-center ${
              completed
                ? 'border-sky-300/20 bg-sky-300/8'
                : 'border-white/10 bg-white/5'
            }`}
          >
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Mission score
            </div>
            <div className="mt-1 font-mono text-3xl font-black text-sky-300">
              {result.score}
            </div>
            <div className="text-[9px] text-slate-500">out of 1000</div>
            {matchedBestScore && (
              <div className="mt-1 rounded-full bg-emerald-300/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-200">
                Personal best
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3">
            <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
              <Clock3 className="h-3 w-3" /> Time
            </div>
            <div className="mt-1 font-mono text-base text-slate-100">
              {formatDuration(result.elapsedSeconds)}
            </div>
            {matchedBestTime && (
              <div className="mt-0.5 text-[8px] text-emerald-300">Best time</div>
            )}
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3">
            <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
              <Route className="h-3 w-3" /> Route
            </div>
            <div className="mt-1 font-mono text-base text-slate-100">
              {result.waypointsCompleted}/{result.totalWaypoints}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3">
            <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
              <PackageCheck className="h-3 w-3" /> Tasks
            </div>
            <div className="mt-1 font-mono text-base text-slate-100">
              {result.entitiesCompleted}/{result.totalEntities}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3">
            <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
              <ShieldCheck className="h-3 w-3" /> Hull
            </div>
            <div className="mt-1 font-mono text-base text-slate-100">
              {result.hullHealth.toFixed(0)}%
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3">
            <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
              <Gauge className="h-3 w-3" /> Peak speed
            </div>
            <div className="mt-1 font-mono text-base text-slate-100">
              {result.maximumSpeedKnots.toFixed(1)} kts
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-xl bg-black/20 px-3 py-2">
            <div className="text-[8px] uppercase tracking-wider text-slate-500">
              Distance
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-300">
              {formatDistance(result.distanceTravelledM)}
            </div>
          </div>
          <div className="rounded-xl bg-black/20 px-3 py-2">
            <div className="text-[8px] uppercase tracking-wider text-slate-500">
              Contacts
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-300">
              {result.collisionCount}
            </div>
          </div>
          <div className="rounded-xl bg-black/20 px-3 py-2">
            <div className="text-[8px] uppercase tracking-wider text-slate-500">
              Recoveries
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-300">
              {result.resetCount}
            </div>
          </div>
          <div className="rounded-xl bg-black/20 px-3 py-2">
            <div className="text-[8px] uppercase tracking-wider text-slate-500">
              Last checkpoint
            </div>
            <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-300">
              <MapPinned className="h-3 w-3 shrink-0" />
              {result.checkpointLabel}
            </div>
          </div>
          <div className="rounded-xl bg-black/20 px-3 py-2">
            <div className="text-[8px] uppercase tracking-wider text-slate-500">
              Vessel
            </div>
            <div className="mt-0.5 flex items-center gap-1 font-mono text-xs capitalize text-slate-300">
              <Ship className="h-3 w-3" /> {state.activeBoat}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-semibold text-slate-200">Scenario record:</span>{' '}
            {history.completions} completed from {history.attempts} attempts
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span>Best {history.bestScore}/1000</span>
            <span>
              {history.bestTimeSeconds === null
                ? 'No best time'
                : `Best ${formatDuration(history.bestTimeSeconds)}`}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={state.restartScenario}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <RefreshCcw className="h-4 w-4" /> Retry passage
          </button>
          <button
            type="button"
            onClick={state.returnToMenu}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <Home className="h-4 w-4" /> Briefing
          </button>
          <button
            type="button"
            onClick={startNextScenario}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:brightness-110"
          >
            Next: {nextScenario.title}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
