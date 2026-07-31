'use client';

import {
  Accessibility,
  Camera,
  Check,
  Contrast,
  Eye,
  Gauge,
  HelpCircle,
  MonitorCog,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  type InterfaceScale,
  useExperienceSettings,
} from '@/store/useExperienceSettings';
import {
  type QualityMode,
  useSimStore,
} from '@/store/useSimStore';

interface SettingsOverlayProps {
  automationMode: boolean;
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const INTERFACE_SCALES: Array<{
  value: InterfaceScale;
  label: string;
}> = [
  { value: 'compact', label: 'Compact' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
];

const QUALITY_MODES: Array<{ value: QualityMode; label: string }> = [
  { value: 'auto', label: 'Automatic' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'ultra', label: 'Ultra' },
];

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.035] p-3.5 transition hover:border-white/15 hover:bg-white/[0.055]">
      <span>
        <span className="block text-sm font-semibold text-slate-100">
          {label}
        </span>
        <span className="mt-1 block text-[11px] leading-4 text-slate-400">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-white/10 bg-slate-800 transition peer-checked:border-sky-300/40 peer-checked:bg-sky-500">
        <span className="absolute left-0.5 top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function RangeSetting({
  label,
  description,
  value,
  min,
  max,
  step,
  valueLabel,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-2xl border border-white/8 bg-white/[0.035] p-3.5">
      <span className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-semibold text-slate-100">
            {label}
          </span>
          <span className="mt-1 block text-[11px] leading-4 text-slate-400">
            {description}
          </span>
        </span>
        <span className="shrink-0 rounded-lg bg-sky-400/10 px-2 py-1 font-mono text-[11px] text-sky-200">
          {valueLabel}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 h-5 w-full cursor-pointer accent-sky-400"
      />
    </label>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: typeof Settings;
  title: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
      <Icon className="h-3.5 w-3.5 text-sky-300" /> {title}
    </div>
  );
}

export default function SettingsOverlay({
  automationMode,
}: SettingsOverlayProps) {
  const settings = useExperienceSettings(
    useShallow((state) => ({
      settingsOpen: state.settingsOpen,
      controlHintsEnabled: state.controlHintsEnabled,
      reducedMotion: state.reducedMotion,
      highContrast: state.highContrast,
      interfaceScale: state.interfaceScale,
      cameraFov: state.cameraFov,
      cameraSmoothing: state.cameraSmoothing,
      openSettings: state.openSettings,
      closeSettings: state.closeSettings,
      replayOnboarding: state.replayOnboarding,
      setControlHintsEnabled: state.setControlHintsEnabled,
      setReducedMotion: state.setReducedMotion,
      setHighContrast: state.setHighContrast,
      setInterfaceScale: state.setInterfaceScale,
      setCameraFov: state.setCameraFov,
      setCameraSmoothing: state.setCameraSmoothing,
      resetSettings: state.resetSettings,
    })),
  );
  const simulator = useSimStore(
    useShallow((state) => ({
      sessionPhase: state.sessionPhase,
      hudVisible: state.hudVisible,
      qualityMode: state.qualityMode,
      renderQuality: state.renderQuality,
      setHudVisible: state.setHudVisible,
      setQualityMode: state.setQualityMode,
    })),
  );

  if (automationMode) return null;

  if (!settings.settingsOpen) {
    if (simulator.sessionPhase === 'running') return null;

    return (
      <button
        type="button"
        aria-label="Open simulator settings"
        onClick={settings.openSettings}
        className="pointer-events-auto absolute right-4 top-4 z-[105] flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/75 px-3 text-slate-200 shadow-xl backdrop-blur-xl transition hover:border-white/20 hover:bg-slate-900"
      >
        <Settings className="h-4 w-4" />
        <span className="hidden text-xs font-semibold sm:inline">Settings</span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="simulator-settings-title"
      className="pointer-events-auto absolute inset-0 z-[125] overflow-y-auto bg-slate-950/75 p-3 text-white backdrop-blur-xl sm:p-6"
    >
      <section className="mx-auto my-auto w-full max-w-4xl overflow-hidden rounded-3xl border border-white/12 bg-slate-950/96 shadow-2xl shadow-black/60">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-gradient-to-r from-sky-500/12 via-transparent to-teal-400/10 p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-sky-300">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Simulator preferences
            </div>
            <h2
              id="simulator-settings-title"
              className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl"
            >
              Settings
            </h2>
            <p className="mt-2 max-w-xl text-xs leading-5 text-slate-400">
              These preferences are saved locally on this device and do not
              change the calibrated vessel-physics model.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close simulator settings"
            onClick={settings.closeSettings}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
          <div className="space-y-6">
            <section>
              <SectionTitle icon={Eye} title="Interface" />
              <div className="space-y-2.5">
                <ToggleRow
                  label="Contextual control hints"
                  description="Show a compact control reference that adapts between keyboard and touch input."
                  checked={settings.controlHintsEnabled}
                  onChange={settings.setControlHintsEnabled}
                />
                <ToggleRow
                  label="Instrument HUD"
                  description="Show vessel telemetry, health, throttle, environment, and mobile helm controls."
                  checked={simulator.hudVisible}
                  onChange={simulator.setHudVisible}
                />
                <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3.5">
                  <div className="text-sm font-semibold text-slate-100">
                    Interface size
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-slate-400">
                    Adjust text and simulator panels without changing the 3D viewport.
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {INTERFACE_SCALES.map((scale) => (
                      <button
                        key={scale.value}
                        type="button"
                        aria-pressed={settings.interfaceScale === scale.value}
                        onClick={() => settings.setInterfaceScale(scale.value)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          settings.interfaceScale === scale.value
                            ? 'border-sky-300/50 bg-sky-500 text-white'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {scale.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <SectionTitle icon={Accessibility} title="Accessibility" />
              <div className="space-y-2.5">
                <ToggleRow
                  label="Reduced motion"
                  description="Minimize camera drift, interface animation, and decorative transitions."
                  checked={settings.reducedMotion}
                  onChange={settings.setReducedMotion}
                />
                <ToggleRow
                  label="Higher contrast"
                  description="Increase contrast and reduce transparency across simulator interface panels."
                  checked={settings.highContrast}
                  onChange={settings.setHighContrast}
                />
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section>
              <SectionTitle icon={Camera} title="Camera" />
              <div className="space-y-2.5">
                <RangeSetting
                  label="Field of view"
                  description="A wider view shows more surroundings; a narrower view emphasizes the vessel and route."
                  value={settings.cameraFov}
                  min={45}
                  max={80}
                  step={1}
                  valueLabel={`${Math.round(settings.cameraFov)}°`}
                  onChange={settings.setCameraFov}
                />
                <RangeSetting
                  label="Follow smoothing"
                  description="Controls how gradually chase, helm, and cinematic cameras follow vessel motion."
                  value={settings.cameraSmoothing}
                  min={0}
                  max={1}
                  step={0.05}
                  valueLabel={
                    settings.reducedMotion
                      ? 'Reduced'
                      : `${Math.round(settings.cameraSmoothing * 100)}%`
                  }
                  onChange={settings.setCameraSmoothing}
                />
              </div>
            </section>

            <section>
              <SectionTitle icon={MonitorCog} title="Rendering" />
              <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3.5">
                <label className="block text-sm font-semibold text-slate-100">
                  Quality mode
                  <select
                    aria-label="Simulator quality mode"
                    value={simulator.qualityMode}
                    onChange={(event) =>
                      simulator.setQualityMode(event.target.value as QualityMode)
                    }
                    className="mt-3 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-xs text-slate-100 outline-none ring-sky-400 transition focus:ring-2"
                  >
                    {QUALITY_MODES.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                  <Gauge className="h-3.5 w-3.5 text-teal-300" />
                  Effective quality: {simulator.renderQuality}
                </div>
              </div>
            </section>

            <section>
              <SectionTitle icon={HelpCircle} title="Help and reset" />
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={settings.replayOnboarding}
                  className="flex items-center justify-center gap-2 rounded-xl border border-sky-300/25 bg-sky-300/8 px-4 py-3 text-xs font-semibold text-sky-200 transition hover:bg-sky-300/15"
                >
                  <Sparkles className="h-4 w-4" /> Replay guide
                </button>
                <button
                  type="button"
                  onClick={settings.resetSettings}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" /> Reset preferences
                </button>
              </div>
            </section>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Contrast className="h-3.5 w-3.5" /> Changes apply immediately
          </div>
          <button
            type="button"
            onClick={settings.closeSettings}
            className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-sky-400"
          >
            <Check className="h-4 w-4" /> Done
          </button>
        </footer>
      </section>
    </div>
  );
}
