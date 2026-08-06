'use client';

import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Gauge,
  Leaf,
  LockKeyhole,
  Moon,
  Navigation,
  Navigation2,
  RefreshCcw,
  Settings2,
  ShieldAlert,
  Ship,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
  Waves,
  Wrench,
  X,
} from 'lucide-react';
import { useDebugMode } from '@/hooks/useDebugMode';
import {
  FIELD_REPAIR_LIMITS,
  isFieldRepairEligible,
} from '@/sim/vessels/FieldRepairPolicy';
import type { ScenarioRunMode } from '@/sim/scenarios/ScoredScenarioAuthority';
import {
  type BoatType,
  type ScenarioRunStatus,
  useSimStore,
} from '@/store/useSimStore';

type MobilePanel = 'environment' | 'forces' | null;
type HeldKey = 'arrowup' | 'arrowdown' | 'arrowleft' | 'arrowright' | 'r';

interface HealthBarProps {
  icon: typeof Activity;
  label: string;
  value: number;
  display: string;
  tone: 'health' | 'temperature' | 'hazard';
}

function HealthBar({ icon: Icon, label, value, display, tone }: HealthBarProps) {
  const normalized = Math.max(0, Math.min(100, value));
  const barClass =
    tone === 'temperature'
      ? normalized < 80
        ? 'bg-sky-400'
        : normalized < 100
          ? 'bg-amber-500'
          : 'bg-red-600'
      : tone === 'hazard'
        ? normalized < 20
          ? 'bg-emerald-400'
          : normalized < 55
            ? 'bg-amber-400'
            : 'bg-red-500'
        : normalized > 50
          ? 'bg-emerald-400'
          : normalized > 20
            ? 'bg-amber-400'
            : 'bg-red-500';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[10px]">
          <Icon className="h-3 w-3" /> {label}
        </span>
        <span className="font-mono text-[9px] text-slate-200 sm:text-[10px]">
          {display}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full transition-[width] duration-300 ${barClass}`}
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  );
}

interface RangeControlProps {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accentClass: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function RangeControl({
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  accentClass,
  disabled = false,
  onChange,
}: RangeControlProps) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wide text-slate-300 sm:text-xs">
        <span>{label}</span>
        <span className="font-mono text-sky-200">{valueLabel}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-5 w-full ${
          disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
        } ${accentClass}`}
      />
    </label>
  );
}

interface EnvironmentControlsProps {
  targetTime: number;
  targetSeason: number;
  disabled?: boolean;
  setTargetTime: (value: number) => void;
  setTargetSeason: (value: number) => void;
}

function EnvironmentControls({
  targetTime,
  targetSeason,
  disabled = false,
  setTargetTime,
  setTargetSeason,
}: EnvironmentControlsProps) {
  const times = [
    { label: 'Dawn', value: 6, icon: Sunrise },
    { label: 'Noon', value: 12, icon: Sun },
    { label: 'Dusk', value: 18, icon: Sunset },
    { label: 'Night', value: 0, icon: Moon },
  ];
  const seasons = [
    { label: 'Spring', value: 0, icon: Leaf },
    { label: 'Summer', value: 0.25, icon: Sun },
    { label: 'Fall', value: 0.5, icon: Wind },
    { label: 'Winter', value: 0.75, icon: Snowflake },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1">
        {times.map(({ label, value, icon: Icon }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={() => setTargetTime(value)}
            className={`flex min-h-10 items-center justify-center rounded-lg transition ${
              disabled ? 'cursor-not-allowed opacity-45' : ''
            } ${
              targetTime === value
                ? 'bg-amber-500 text-white shadow-lg'
                : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1">
        {seasons.map(({ label, value, icon: Icon }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={() => setTargetSeason(value)}
            className={`flex min-h-10 items-center justify-center rounded-lg transition ${
              disabled ? 'cursor-not-allowed opacity-45' : ''
            } ${
              targetSeason === value
                ? 'bg-sky-500 text-white shadow-lg'
                : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

interface ForceControlsProps {
  windSpeed: number;
  windDir: number;
  currentSpeed: number;
  currentDir: number;
  disabled?: boolean;
  setWindSpeed: (value: number) => void;
  setWindDir: (value: number) => void;
  setCurrentSpeed: (value: number) => void;
  setCurrentDir: (value: number) => void;
}

function ForceControls(props: ForceControlsProps) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <RangeControl
        label="Wind speed"
        valueLabel={`${props.windSpeed.toFixed(1)} m/s`}
        value={props.windSpeed}
        min={0}
        max={60}
        step={0.1}
        accentClass="accent-sky-400"
        disabled={props.disabled}
        onChange={props.setWindSpeed}
      />
      <RangeControl
        label="Wind heading (toward)"
        valueLabel={`${props.windDir.toFixed(0)}°`}
        value={props.windDir}
        min={0}
        max={359}
        step={1}
        accentClass="accent-indigo-400"
        disabled={props.disabled}
        onChange={props.setWindDir}
      />
      <div className="h-px bg-white/10" />
      <RangeControl
        label="Current speed"
        valueLabel={`${props.currentSpeed.toFixed(1)} m/s`}
        value={props.currentSpeed}
        min={0}
        max={10}
        step={0.1}
        accentClass="accent-teal-400"
        disabled={props.disabled}
        onChange={props.setCurrentSpeed}
      />
      <RangeControl
        label="Current heading (toward)"
        valueLabel={`${props.currentDir.toFixed(0)}°`}
        value={props.currentDir}
        min={0}
        max={359}
        step={1}
        accentClass="accent-teal-500"
        disabled={props.disabled}
        onChange={props.setCurrentDir}
      />
    </div>
  );
}

interface EnvironmentAuthorityNoticeProps {
  scenarioRunStatus: ScenarioRunStatus;
  scenarioRunMode: ScenarioRunMode;
  assistanceReason: string;
  enableAssistedConditions: () => void;
  restoreScenarioEnvironment: () => void;
}

function EnvironmentAuthorityNotice({
  scenarioRunStatus,
  scenarioRunMode,
  assistanceReason,
  enableAssistedConditions,
  restoreScenarioEnvironment,
}: EnvironmentAuthorityNoticeProps) {
  if (scenarioRunStatus !== 'active') return null;

  if (scenarioRunMode === 'standard') {
    return (
      <div className="mb-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-3">
        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-200">
          <LockKeyhole className="h-3.5 w-3.5" /> Scored preset locked
        </div>
        <p className="mt-1 text-[10px] leading-4 text-slate-400">
          Wind, current, time, and season stay fixed for standard records.
        </p>
        <button
          type="button"
          aria-label="Use custom conditions"
          onClick={enableAssistedConditions}
          className="mt-2 w-full rounded-lg border border-amber-300/25 bg-amber-300/10 px-2 py-2 text-[9px] font-bold uppercase tracking-wider text-amber-200 transition hover:bg-amber-300/15"
        >
          Use custom conditions
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.08] p-3">
      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-amber-200">
        <Settings2 className="h-3.5 w-3.5" /> Assisted conditions
      </div>
      <p className="mt-1 text-[10px] leading-4 text-slate-400">
        {assistanceReason ||
          'This attempt is excluded from standard records.'}
      </p>
      <button
        type="button"
        aria-label="Restore scenario preset"
        onClick={restoreScenarioEnvironment}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-300 transition hover:bg-white/10"
      >
        <RefreshCcw className="h-3 w-3" /> Restore scenario preset
      </button>
    </div>
  );
}

function holdKey(
  event: ReactPointerEvent<HTMLButtonElement>,
  key: HeldKey,
  active: boolean,
) {
  event.preventDefault();
  const target = event.currentTarget;

  try {
    if (active) {
      if (!target.hasPointerCapture?.(event.pointerId)) {
        target.setPointerCapture?.(event.pointerId);
      }
    } else if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture?.(event.pointerId);
    }
  } catch {
    // Synthetic pointer events and interrupted touch streams may no
    // longer own an active pointer. Key state must still be updated.
  }

  useSimStore.getState().setKey(key, active);
}

export default function HUD() {
  const debugEnabled = useDebugMode();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);

  const state = useSimStore(
    useShallow((store) => ({
      windSpeed: store.windSpeed,
      windDir: store.windDir,
      currentSpeed: store.currentSpeed,
      currentDir: store.currentDir,
      engineThrust: store.engineThrust,
      speedKnots: store.speedKnots,
      heading: store.heading,
      activeBoat: store.activeBoat,
      hullHealth: store.hullHealth,
      engineHealth: store.engineHealth,
      engineTemperature: store.engineTemperature,
      rudderHealth: store.rudderHealth,
      floodingRatio: store.floodingRatio,
      floodedVolumeM3: store.floodedVolumeM3,
      targetTime: store.targetTime,
      targetSeason: store.targetSeason,
      scenarioRunStatus: store.scenarioRunStatus,
      scenarioRunMode: store.scenarioRunMode,
      scenarioAssistanceReason: store.scenarioAssistanceReason,
      fieldRepairSeconds: store.fieldRepairSeconds,
      fieldRepairActivationCount: store.fieldRepairActivationCount,
      fieldRepairEngineRestored: store.fieldRepairEngineRestored,
      fieldRepairRudderRestored: store.fieldRepairRudderRestored,
      fieldRepairPenaltyPoints: store.fieldRepairPenaltyPoints,
      keys: store.keys,
      setTargetTime: store.setTargetTime,
      setTargetSeason: store.setTargetSeason,
      setWindSpeed: store.setWindSpeed,
      setWindDir: store.setWindDir,
      setCurrentSpeed: store.setCurrentSpeed,
      setCurrentDir: store.setCurrentDir,
      enableAssistedConditions: store.enableAssistedConditions,
      restoreScenarioEnvironment: store.restoreScenarioEnvironment,
      setEngineThrust: store.setEngineThrust,
      setActiveBoat: store.setActiveBoat,
    })),
  );

  const isRepairing = isFieldRepairEligible({
    requested: state.keys.r,
    speedKnots: state.speedKnots,
    throttle: state.engineThrust,
    propulsionInputActive:
      state.keys.w ||
      state.keys.s ||
      state.keys.arrowup ||
      state.keys.arrowdown,
  });
  const remainingEngineRepair = Math.max(
    0,
    FIELD_REPAIR_LIMITS.maximumEngineRestorePerRun -
      state.fieldRepairEngineRestored,
  );
  const remainingRudderRepair = Math.max(
    0,
    FIELD_REPAIR_LIMITS.maximumRudderRestorePerRun -
      state.fieldRepairRudderRestored,
  );

  const environmentLocked =
    state.scenarioRunStatus === 'active' &&
    state.scenarioRunMode === 'standard';
  const authorityNoticeProps: EnvironmentAuthorityNoticeProps = {
    scenarioRunStatus: state.scenarioRunStatus,
    scenarioRunMode: state.scenarioRunMode,
    assistanceReason: state.scenarioAssistanceReason,
    enableAssistedConditions: state.enableAssistedConditions,
    restoreScenarioEnvironment: state.restoreScenarioEnvironment,
  };

  const forceProps: ForceControlsProps = {
    windSpeed: state.windSpeed,
    windDir: state.windDir,
    currentSpeed: state.currentSpeed,
    currentDir: state.currentDir,
    disabled: environmentLocked,
    setWindSpeed: state.setWindSpeed,
    setWindDir: state.setWindDir,
    setCurrentSpeed: state.setCurrentSpeed,
    setCurrentDir: state.setCurrentDir,
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-50 p-3 sm:p-4">
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-2">
          <section className="pointer-events-auto rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-white shadow-2xl backdrop-blur-xl sm:p-4">
            <h2 className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 sm:mb-3 sm:text-xs">
              <Ship className="h-4 w-4" /> Vessel
            </h2>
            <div className="flex gap-1.5 sm:gap-2">
              {(['trawler', 'speedboat'] as BoatType[]).map((boat) => (
                <button
                  key={boat}
                  type="button"
                  onClick={() => state.setActiveBoat(boat)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition sm:px-4 sm:text-sm ${
                    state.activeBoat === boat
                      ? 'bg-sky-500 text-white shadow-lg shadow-sky-950/40'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {boat}
                </button>
              ))}
            </div>
          </section>

          <div className="pointer-events-auto hidden flex-col items-center gap-2 lg:flex">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/55 px-5 py-2 font-mono text-xs tracking-wider text-white/80 backdrop-blur-md">
              <span>[W/S] Throttle</span>
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              <span>[A/D] Steer</span>
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              <button
                type="button"
                onPointerDown={(event) => holdKey(event, 'r', true)}
                onPointerUp={(event) => holdKey(event, 'r', false)}
                onPointerCancel={(event) => holdKey(event, 'r', false)}
                onPointerLeave={(event) => holdKey(event, 'r', false)}
                className={
                  state.keys.r
                    ? 'font-bold text-emerald-400'
                    : 'transition hover:text-emerald-300'
                }
              >
                Hold [R] bilge / field repair
              </button>
            </div>
          </div>

          <section className="pointer-events-auto hidden w-48 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-white shadow-2xl backdrop-blur-xl md:block">
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Environment
            </h2>
            <EnvironmentAuthorityNotice {...authorityNoticeProps} />
            <EnvironmentControls
              targetTime={state.targetTime}
              disabled={environmentLocked}
              targetSeason={state.targetSeason}
              setTargetTime={state.setTargetTime}
              setTargetSeason={state.setTargetSeason}
            />
          </section>

          <div className="pointer-events-auto flex gap-1.5 md:hidden">
            <button
              type="button"
              aria-label="Toggle environment controls"
              onClick={() =>
                setMobilePanel((panel) =>
                  panel === 'environment' ? null : 'environment',
                )
              }
              className={`flex h-11 w-11 items-center justify-center rounded-xl border backdrop-blur-xl ${
                mobilePanel === 'environment'
                  ? 'border-sky-400/60 bg-sky-500 text-white'
                  : 'border-white/10 bg-slate-950/70 text-slate-300'
              }`}
            >
              <Sun className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Toggle wind and current controls"
              onClick={() =>
                setMobilePanel((panel) => (panel === 'forces' ? null : 'forces'))
              }
              className={`flex h-11 w-11 items-center justify-center rounded-xl border backdrop-blur-xl ${
                mobilePanel === 'forces'
                  ? 'border-sky-400/60 bg-sky-500 text-white'
                  : 'border-white/10 bg-slate-950/70 text-slate-300'
              }`}
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {mobilePanel && (
          <section className="pointer-events-auto absolute inset-x-3 top-20 z-20 max-h-[55vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur-xl md:hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
                {mobilePanel === 'environment' ? (
                  <>
                    <Sun className="h-4 w-4" /> Environment
                  </>
                ) : (
                  <>
                    <Wind className="h-4 w-4" /> Physics engine
                  </>
                )}
              </h2>
              <button
                type="button"
                aria-label="Close controls"
                onClick={() => setMobilePanel(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-slate-300 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {mobilePanel === 'environment' ? (
              <>
                <EnvironmentAuthorityNotice {...authorityNoticeProps} />
                <EnvironmentControls
                targetTime={state.targetTime}
                disabled={environmentLocked}
                targetSeason={state.targetSeason}
                setTargetTime={state.setTargetTime}
                setTargetSeason={state.setTargetSeason}
                />
              </>
            ) : (
              <>
                <EnvironmentAuthorityNotice {...authorityNoticeProps} />
                <ForceControls {...forceProps} />
              </>
            )}
          </section>
        )}

        {(state.keys.r || isRepairing) && (
          <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 md:top-20">
            <div
              className={`rounded-xl border px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest backdrop-blur-md sm:text-xs ${
                isRepairing
                  ? 'border-emerald-500/50 bg-emerald-950/85 text-emerald-300'
                  : 'border-red-500/40 bg-red-950/80 text-red-300'
              }`}
            >
              {isRepairing
                ? 'Bilge pump active · emergency repair logged'
                : 'Slow below 2 kt and set neutral to repair'}
            </div>
          </div>
        )}

        <div className="flex items-end justify-between gap-2 pb-12 sm:gap-4 sm:pb-0">
          <section className="pointer-events-auto w-[min(15.5rem,calc(100vw-8rem))] max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/72 p-3 text-white shadow-2xl backdrop-blur-xl sm:w-64 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 sm:text-sm">
              <Navigation className="h-4 w-4" /> Telemetry
            </h2>

            {state.hullHealth <= 0 && (
              <div className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-red-400 bg-red-600 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-white sm:text-sm">
                <ShieldAlert className="h-4 w-4" /> Vessel sunk
              </div>
            )}
            {state.hullHealth > 0 && state.engineHealth <= 0 && (
              <div className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-orange-500 bg-orange-600/50 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-orange-100 sm:text-sm">
                <Activity className="h-4 w-4" /> Engine dead
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-baseline gap-1 font-mono text-2xl tracking-tight text-sky-400 sm:text-4xl">
                  {Math.abs(state.speedKnots).toFixed(1)}
                  <span className="text-xs text-slate-400 sm:text-lg">kts</span>
                </div>
                <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Speed over ground
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <Compass
                    className="h-6 w-6 text-indigo-400 sm:h-8 sm:w-8"
                    style={{ transform: `rotate(${-state.heading}deg)` }}
                  />
                  <div className="font-mono text-xl tracking-tight text-indigo-300 sm:text-3xl">
                    {state.heading.toFixed(0).padStart(3, '0')}°
                  </div>
                </div>
                <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  Heading
                </div>
              </div>
            </div>

            <div className="my-3 border-t border-white/10 pt-3 sm:my-4 sm:pt-4">
              <RangeControl
                label="Engine thrust"
                valueLabel={`${Math.round(state.engineThrust * 100)}%`}
                value={state.engineThrust}
                min={0}
                max={1}
                step={0.01}
                accentClass="accent-sky-500"
                onChange={state.setEngineThrust}
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
              <HealthBar
                icon={ShieldAlert}
                label="Hull integrity"
                value={state.hullHealth}
                display={`${state.hullHealth.toFixed(0)}%`}
                tone="health"
              />
              <HealthBar
                icon={Activity}
                label="Engine"
                value={state.engineHealth}
                display={`${state.engineHealth.toFixed(0)}%`}
                tone="health"
              />
              <HealthBar
                icon={Thermometer}
                label="Heat"
                value={state.engineTemperature}
                display={`${state.engineTemperature.toFixed(0)}°C`}
                tone="temperature"
              />
              <HealthBar
                icon={Waves}
                label="Flooding"
                value={state.floodingRatio * 100}
                display={`${(state.floodingRatio * 100).toFixed(0)}% · ${state.floodedVolumeM3.toFixed(2)}m³`}
                tone="hazard"
              />
              <HealthBar
                icon={Navigation2}
                label="Rudder"
                value={state.rudderHealth}
                display={`${state.rudderHealth.toFixed(0)}%`}
                tone="health"
              />
            </div>

            {(
              state.fieldRepairSeconds > 0 ||
              state.hullHealth < 100 ||
              state.engineHealth < 100 ||
              state.rudderHealth < 100 ||
              state.floodingRatio > 0
            ) && (
              <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] p-3 text-[9px] leading-4 text-slate-400">
                <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-cyan-200">
                  <Wrench className="h-3 w-3" /> Field repair limits
                </div>
                <p className="mt-1">
                  Bilge pumping and breach stabilization remain available. Hull structural condition cannot be restored underway. Engine recovery is capped at {FIELD_REPAIR_LIMITS.engineConditionCeiling}% with {remainingEngineRepair.toFixed(1)} points remaining; rudder recovery is capped at {FIELD_REPAIR_LIMITS.rudderConditionCeiling}% with {remainingRudderRepair.toFixed(1)} remaining.
                </p>
                {state.fieldRepairPenaltyPoints > 0 && (
                  <div className="mt-1 font-mono text-cyan-200">
                    {state.fieldRepairActivationCount} stop{state.fieldRepairActivationCount === 1 ? '' : 's'} · {state.fieldRepairSeconds.toFixed(1)}s · -{state.fieldRepairPenaltyPoints} score
                  </div>
                )}
              </div>
            )}

            {debugEnabled && (
              <button
                type="button"
                onClick={() => useSimStore.getState().fireInstantRepair()}
                className="mt-3 w-full rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 py-2 text-[9px] font-bold uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-500/25 sm:mt-5 sm:text-[10px]"
              >
                Debug instant repair
              </button>
            )}
          </section>

          <section className="pointer-events-auto hidden w-72 rounded-2xl border border-white/10 bg-slate-950/72 p-5 text-white shadow-2xl backdrop-blur-xl md:block">
            <h2 className="mb-5 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
              <Gauge className="h-4 w-4" /> Physics engine
            </h2>
            <EnvironmentAuthorityNotice {...authorityNoticeProps} />
            <ForceControls {...forceProps} />
          </section>

          <div className="pointer-events-auto grid w-[6.75rem] grid-cols-3 gap-1.5 md:hidden">
            <div />
            <button
              type="button"
              aria-label="Throttle forward"
              onPointerDown={(event) => holdKey(event, 'arrowup', true)}
              onPointerUp={(event) => holdKey(event, 'arrowup', false)}
              onPointerCancel={(event) => holdKey(event, 'arrowup', false)}
              onPointerLeave={(event) => holdKey(event, 'arrowup', false)}
              className="flex h-11 touch-none items-center justify-center rounded-xl border border-white/10 bg-slate-950/75 text-white shadow-xl backdrop-blur-xl active:bg-sky-500"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <div />
            <button
              type="button"
              aria-label="Steer left"
              onPointerDown={(event) => holdKey(event, 'arrowleft', true)}
              onPointerUp={(event) => holdKey(event, 'arrowleft', false)}
              onPointerCancel={(event) => holdKey(event, 'arrowleft', false)}
              onPointerLeave={(event) => holdKey(event, 'arrowleft', false)}
              className="flex h-11 touch-none items-center justify-center rounded-xl border border-white/10 bg-slate-950/75 text-white shadow-xl backdrop-blur-xl active:bg-sky-500"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Activate bilge pump and emergency field repair"
              onPointerDown={(event) => holdKey(event, 'r', true)}
              onPointerUp={(event) => holdKey(event, 'r', false)}
              onPointerCancel={(event) => holdKey(event, 'r', false)}
              onPointerLeave={(event) => holdKey(event, 'r', false)}
              className="flex h-11 touch-none items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/75 text-emerald-300 shadow-xl backdrop-blur-xl active:bg-emerald-600 active:text-white"
            >
              <Wrench className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Steer right"
              onPointerDown={(event) => holdKey(event, 'arrowright', true)}
              onPointerUp={(event) => holdKey(event, 'arrowright', false)}
              onPointerCancel={(event) => holdKey(event, 'arrowright', false)}
              onPointerLeave={(event) => holdKey(event, 'arrowright', false)}
              className="flex h-11 touch-none items-center justify-center rounded-xl border border-white/10 bg-slate-950/75 text-white shadow-xl backdrop-blur-xl active:bg-sky-500"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div />
            <button
              type="button"
              aria-label="Throttle reverse"
              onPointerDown={(event) => holdKey(event, 'arrowdown', true)}
              onPointerUp={(event) => holdKey(event, 'arrowdown', false)}
              onPointerCancel={(event) => holdKey(event, 'arrowdown', false)}
              onPointerLeave={(event) => holdKey(event, 'arrowdown', false)}
              className="flex h-11 touch-none items-center justify-center rounded-xl border border-white/10 bg-slate-950/75 text-white shadow-xl backdrop-blur-xl active:bg-sky-500"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
            <div />
          </div>
        </div>
      </div>
    </div>
  );
}
