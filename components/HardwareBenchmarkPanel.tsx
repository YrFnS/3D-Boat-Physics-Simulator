'use client';

import { useEffect, useRef, useState } from 'react';
import {
  type QualityMode,
  type RenderQuality,
  useSimStore,
} from '@/store/useSimStore';

type BenchmarkPreset = 'calm' | 'storm';
type BenchmarkPhase = 'idle' | 'warming' | 'measuring';

interface BenchmarkTiming {
  warmupSteps: number;
  warmupStepMs: number;
  sampleCount: number;
  sampleIntervalMs: number;
}

interface DeviceProfile {
  label: string;
  browser: string;
  operatingSystem: string;
  platform: string;
  userAgent: string;
  gpuVendor: string;
  gpuRenderer: string;
  logicalProcessors: number | null;
  deviceMemoryGb: number | null;
  maxTouchPoints: number;
  viewportWidth: number;
  viewportHeight: number;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  orientation: string;
}

interface HardwareBenchmarkResult {
  id: string;
  capturedAt: string;
  preset: BenchmarkPreset;
  qualityMode: QualityMode;
  qualityAtMeasurementStart: RenderQuality;
  qualityAtMeasurementEnd: RenderQuality;
  observedQualities: RenderQuality[];
  qualityChanges: number;
  averageFps: number;
  minimumFps: number;
  fifthPercentileFps: number;
  averageFrameTimeMs: number;
  maximumFrameTimeMs: number;
  averageDrawCalls: number;
  averageTriangles: number;
  firstHalfAverageFps: number;
  secondHalfAverageFps: number;
  fpsDriftPercent: number;
  possibleThermalThrottle: boolean;
  samples: number;
  hiddenSamples: number;
  warmupSeconds: number;
  measurementSeconds: number;
  valid: boolean;
  notes: string;
  device: DeviceProfile;
}

interface SimulationSnapshot {
  qualityMode: QualityMode;
  renderQuality: RenderQuality;
  windSpeed: number;
  windDir: number;
  currentSpeed: number;
  currentDir: number;
  engineThrust: number;
  targetTime: number;
  targetSeason: number;
}

interface DebugRendererInfoExtension {
  UNMASKED_VENDOR_WEBGL: number;
  UNMASKED_RENDERER_WEBGL: number;
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

const RESULT_STORAGE_KEY = 'boat-simulator-hardware-benchmarks-v1';
const DEVICE_LABEL_STORAGE_KEY = 'boat-simulator-benchmark-device-label-v1';
const MAX_STORED_RESULTS = 24;
const RELEASE_SHA =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local-or-unknown';

const RELEASE_TIMING: BenchmarkTiming = {
  warmupSteps: 20,
  warmupStepMs: 500,
  sampleCount: 60,
  sampleIntervalMs: 500,
};

const QUICK_TIMING: BenchmarkTiming = {
  warmupSteps: 4,
  warmupStepMs: 250,
  sampleCount: 4,
  sampleIntervalMs: 500,
};

const PRESETS: Record<
  BenchmarkPreset,
  {
    label: string;
    windSpeed: number;
    windDir: number;
    currentSpeed: number;
    currentDir: number;
    engineThrust: number;
    targetTime: number;
    targetSeason: number;
  }
> = {
  calm: {
    label: 'Calm',
    windSpeed: 6,
    windDir: 35,
    currentSpeed: 1,
    currentDir: 210,
    engineThrust: 0.72,
    targetTime: 12,
    targetSeason: 0.25,
  },
  storm: {
    label: 'Storm',
    windSpeed: 52,
    windDir: 225,
    currentSpeed: 8,
    currentDir: 200,
    engineThrust: 1,
    targetTime: 18,
    targetSeason: 0.5,
  },
};

function wait(duration: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function readTiming(): BenchmarkTiming {
  if (typeof window === 'undefined') return RELEASE_TIMING;
  const params = new URLSearchParams(window.location.search);
  return params.get('benchmarkQuick') === '1'
    ? QUICK_TIMING
    : RELEASE_TIMING;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(
      sorted.length - 1,
      Math.ceil(sorted.length * percentileValue) - 1,
    ),
  );
  return sorted[index];
}

function formatTriangles(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${value}`;
}

function detectBrowser(userAgent: string) {
  const candidates: Array<[RegExp, string]> = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/FxiOS\/([\d.]+)/, 'Firefox iOS'],
    [/CriOS\/([\d.]+)/, 'Chrome iOS'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari\//, 'Safari'],
  ];

  for (const [pattern, name] of candidates) {
    const match = userAgent.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }
  return 'Unknown browser';
}

function detectOperatingSystem(userAgent: string, platform: string) {
  if (/Android/i.test(userAgent)) {
    const match = userAgent.match(/Android\s([\d.]+)/i);
    return `Android${match ? ` ${match[1]}` : ''}`;
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    const match = userAgent.match(/OS\s([\d_]+)/i);
    return `iOS${match ? ` ${match[1].replaceAll('_', '.')}` : ''}`;
  }
  if (/Windows NT 10\.0/i.test(userAgent)) return 'Windows 10/11';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Mac OS X/i.test(userAgent)) {
    const match = userAgent.match(/Mac OS X\s([\d_]+)/i);
    return `macOS${match ? ` ${match[1].replaceAll('_', '.')}` : ''}`;
  }
  if (/Linux/i.test(platform) || /Linux/i.test(userAgent)) return 'Linux';
  return platform || 'Unknown OS';
}

function readGpuInfo() {
  const canvas = document.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    return { gpuVendor: 'Unknown', gpuRenderer: 'Canvas unavailable' };
  }

  const context =
    canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!context) {
    return { gpuVendor: 'Unknown', gpuRenderer: 'WebGL unavailable' };
  }

  const extension = context.getExtension(
    'WEBGL_debug_renderer_info',
  ) as DebugRendererInfoExtension | null;
  const vendorParameter = extension
    ? extension.UNMASKED_VENDOR_WEBGL
    : context.VENDOR;
  const rendererParameter = extension
    ? extension.UNMASKED_RENDERER_WEBGL
    : context.RENDERER;

  return {
    gpuVendor: String(context.getParameter(vendorParameter) ?? 'Unknown'),
    gpuRenderer: String(
      context.getParameter(rendererParameter) ?? 'Unknown',
    ),
  };
}

function collectDeviceProfile(label: string): DeviceProfile {
  const navigatorWithMemory = navigator as NavigatorWithDeviceMemory;
  const platform = navigator.platform || 'Unknown platform';
  const userAgent = navigator.userAgent;
  const gpu = readGpuInfo();

  return {
    label: label.trim() || 'Unnamed physical device',
    browser: detectBrowser(userAgent),
    operatingSystem: detectOperatingSystem(userAgent, platform),
    platform,
    userAgent,
    gpuVendor: gpu.gpuVendor,
    gpuRenderer: gpu.gpuRenderer,
    logicalProcessors: Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : null,
    deviceMemoryGb: Number.isFinite(navigatorWithMemory.deviceMemory)
      ? navigatorWithMemory.deviceMemory ?? null
      : null,
    maxTouchPoints: navigator.maxTouchPoints,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    devicePixelRatio: window.devicePixelRatio,
    orientation:
      window.screen.orientation?.type ??
      (window.innerWidth >= window.innerHeight
        ? 'landscape'
        : 'portrait'),
  };
}

function loadStoredResults(): HardwareBenchmarkResult[] {
  if (typeof window === 'undefined') return [];

  try {
    const storedValue = window.localStorage.getItem(RESULT_STORAGE_KEY);
    if (!storedValue) return [];
    const parsed: unknown = JSON.parse(storedValue);
    return Array.isArray(parsed)
      ? (parsed as HardwareBenchmarkResult[]).slice(0, MAX_STORED_RESULTS)
      : [];
  } catch {
    return [];
  }
}

function loadDeviceLabel() {
  if (typeof window === 'undefined') return '';

  try {
    return window.localStorage.getItem(DEVICE_LABEL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function sanitizeFileName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'physical-device';
}

function downloadTextFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function qualityDescription(result: HardwareBenchmarkResult) {
  if (result.qualityMode !== 'auto') return result.qualityMode;
  return `Auto (${result.qualityAtMeasurementStart}→${result.qualityAtMeasurementEnd})`;
}

function toChecklistRow(result: HardwareBenchmarkResult) {
  const notes = [
    result.device.orientation,
    result.valid ? 'valid visible-tab run' : 'review invalid/hidden samples',
    result.possibleThermalThrottle
      ? `possible throttling ${result.fpsDriftPercent.toFixed(1)}% drift`
      : `FPS drift ${result.fpsDriftPercent.toFixed(1)}%`,
    result.notes.trim(),
  ]
    .filter(Boolean)
    .join('; ')
    .replaceAll('|', '/');

  return `| ${result.device.label.replaceAll('|', '/')} | ${result.device.operatingSystem.replaceAll('|', '/')} | ${result.device.browser.replaceAll('|', '/')} | ${result.device.gpuRenderer.replaceAll('|', '/')} | ${PRESETS[result.preset].label} | ${qualityDescription(result)} | ${result.averageFps.toFixed(1)} | ${result.minimumFps.toFixed(1)} | ${result.averageFrameTimeMs.toFixed(1)} ms | ${notes} |`;
}

export default function HardwareBenchmarkPanel() {
  const [timing] = useState(readTiming);
  const [phase, setPhase] = useState<BenchmarkPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [activePreset, setActivePreset] =
    useState<BenchmarkPreset>('calm');
  const [results, setResults] =
    useState<HardwareBenchmarkResult[]>(loadStoredResults);
  const [deviceLabel, setDeviceLabel] = useState(loadDeviceLabel);
  const [notes, setNotes] = useState('');
  const [deviceProfile, setDeviceProfile] =
    useState<DeviceProfile | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const qualityMode = useSimStore((state) => state.qualityMode);
  const renderQuality = useSimStore((state) => state.renderQuality);
  const setQualityMode = useSimStore((state) => state.setQualityMode);
  const mountedRef = useRef(true);
  const activeRunRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(() => {
      setDeviceProfile(collectDeviceProfile(deviceLabel));
    }, 500);

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      window.clearTimeout(timer);
    };
  }, [deviceLabel]);

  const persistResults = (nextResults: HardwareBenchmarkResult[]) => {
    try {
      window.localStorage.setItem(
        RESULT_STORAGE_KEY,
        JSON.stringify(nextResults.slice(0, MAX_STORED_RESULTS)),
      );
    } catch {
      // Results remain available in memory when storage is restricted.
    }
  };

  const updateDeviceLabel = (value: string) => {
    setDeviceLabel(value);
    try {
      window.localStorage.setItem(DEVICE_LABEL_STORAGE_KEY, value);
    } catch {
      // The label remains available for the current page session.
    }
  };

  const restoreSimulation = (snapshot: SimulationSnapshot) => {
    const store = useSimStore.getState();
    store.setRenderQuality(snapshot.renderQuality);
    store.setQualityMode(snapshot.qualityMode);
    store.setWindSpeed(snapshot.windSpeed);
    store.setWindDir(snapshot.windDir);
    store.setCurrentSpeed(snapshot.currentSpeed);
    store.setCurrentDir(snapshot.currentDir);
    store.setEngineThrust(snapshot.engineThrust);
    store.setTargetTime(snapshot.targetTime);
    store.setTargetSeason(snapshot.targetSeason);
  };

  const runBenchmark = async (preset: BenchmarkPreset) => {
    if (activeRunRef.current) return;
    activeRunRef.current = true;
    cancelledRef.current = false;
    setActivePreset(preset);
    setPhase('warming');
    setProgress(0);
    setCopyStatus('');

    const initial = useSimStore.getState();
    const snapshot: SimulationSnapshot = {
      qualityMode: initial.qualityMode,
      renderQuality: initial.renderQuality,
      windSpeed: initial.windSpeed,
      windDir: initial.windDir,
      currentSpeed: initial.currentSpeed,
      currentDir: initial.currentDir,
      engineThrust: initial.engineThrust,
      targetTime: initial.targetTime,
      targetSeason: initial.targetSeason,
    };
    const settings = PRESETS[preset];
    const benchmarkQualityMode = initial.qualityMode;

    initial.resetVessel();
    initial.setWindSpeed(settings.windSpeed);
    initial.setWindDir(settings.windDir);
    initial.setCurrentSpeed(settings.currentSpeed);
    initial.setCurrentDir(settings.currentDir);
    initial.setEngineThrust(settings.engineThrust);
    initial.setTargetTime(settings.targetTime);
    initial.setTargetSeason(settings.targetSeason);

    try {
      for (let step = 0; step < timing.warmupSteps; step += 1) {
        await wait(timing.warmupStepMs);
        if (cancelledRef.current) return;
        if (mountedRef.current) {
          setProgress(((step + 1) / timing.warmupSteps) * 20);
        }
      }

      const qualityAtMeasurementStart =
        useSimStore.getState().renderQuality;
      if (mountedRef.current) setPhase('measuring');

      const fpsSamples: number[] = [];
      const frameTimeSamples: number[] = [];
      const drawCallSamples: number[] = [];
      const triangleSamples: number[] = [];
      const qualitySamples: RenderQuality[] = [];
      let hiddenSamples = 0;

      for (let sample = 0; sample < timing.sampleCount; sample += 1) {
        await wait(timing.sampleIntervalMs);
        if (cancelledRef.current) return;

        if (document.hidden) hiddenSamples += 1;
        const telemetry = useSimStore.getState();
        qualitySamples.push(telemetry.renderQuality);
        if (telemetry.fps > 0 && telemetry.frameTimeMs > 0) {
          fpsSamples.push(telemetry.fps);
          frameTimeSamples.push(telemetry.frameTimeMs);
          drawCallSamples.push(telemetry.drawCalls);
          triangleSamples.push(telemetry.triangles);
        }

        if (mountedRef.current) {
          setProgress(20 + ((sample + 1) / timing.sampleCount) * 80);
        }
      }

      const qualityAtMeasurementEnd =
        useSimStore.getState().renderQuality;
      const observedQualities = Array.from(new Set(qualitySamples));
      let qualityChanges = 0;
      for (let index = 1; index < qualitySamples.length; index += 1) {
        if (qualitySamples[index] !== qualitySamples[index - 1]) {
          qualityChanges += 1;
        }
      }

      const midpoint = Math.max(1, Math.ceil(fpsSamples.length / 2));
      const firstHalfAverageFps = average(fpsSamples.slice(0, midpoint));
      const secondHalfAverageFps = average(fpsSamples.slice(midpoint));
      const fpsDriftPercent =
        firstHalfAverageFps > 0 && secondHalfAverageFps > 0
          ? ((secondHalfAverageFps - firstHalfAverageFps) /
              firstHalfAverageFps) *
            100
          : 0;
      const minimumRequiredSamples = Math.max(
        3,
        Math.floor(timing.sampleCount * 0.75),
      );
      const result: HardwareBenchmarkResult = {
        id: `${Date.now()}-${preset}`,
        capturedAt: new Date().toISOString(),
        preset,
        qualityMode: benchmarkQualityMode,
        qualityAtMeasurementStart,
        qualityAtMeasurementEnd,
        observedQualities,
        qualityChanges,
        averageFps: average(fpsSamples),
        minimumFps:
          fpsSamples.length > 0 ? Math.min(...fpsSamples) : 0,
        fifthPercentileFps: percentile(fpsSamples, 0.05),
        averageFrameTimeMs: average(frameTimeSamples),
        maximumFrameTimeMs:
          frameTimeSamples.length > 0
            ? Math.max(...frameTimeSamples)
            : 0,
        averageDrawCalls: Math.round(average(drawCallSamples)),
        averageTriangles: Math.round(average(triangleSamples)),
        firstHalfAverageFps,
        secondHalfAverageFps,
        fpsDriftPercent,
        possibleThermalThrottle: fpsDriftPercent <= -15,
        samples: fpsSamples.length,
        hiddenSamples,
        warmupSeconds:
          (timing.warmupSteps * timing.warmupStepMs) / 1000,
        measurementSeconds:
          (timing.sampleCount * timing.sampleIntervalMs) / 1000,
        valid:
          fpsSamples.length >= minimumRequiredSamples &&
          hiddenSamples === 0,
        notes,
        device: collectDeviceProfile(deviceLabel),
      };

      setDeviceProfile(result.device);
      setResults((previousResults) => {
        const nextResults = [result, ...previousResults].slice(
          0,
          MAX_STORED_RESULTS,
        );
        persistResults(nextResults);
        return nextResults;
      });
      console.table(result);
    } finally {
      restoreSimulation(snapshot);
      activeRunRef.current = false;
      if (mountedRef.current) {
        setPhase('idle');
        setProgress(0);
      }
    }
  };

  const exportJson = () => {
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      releaseCandidateSha: RELEASE_SHA,
      sourceUrl: window.location.href,
      device: collectDeviceProfile(deviceLabel),
      results,
    };
    const fileName = `${sanitizeFileName(deviceLabel)}-boat-benchmark-${Date.now()}.json`;
    downloadTextFile(
      fileName,
      `${JSON.stringify(report, null, 2)}\n`,
      'application/json',
    );
  };

  const copyChecklistRows = async () => {
    const rows = results.map(toChecklistRow).join('\n');
    if (!rows) return;

    try {
      await navigator.clipboard.writeText(rows);
      setCopyStatus('Checklist rows copied');
    } catch {
      downloadTextFile(
        `${sanitizeFileName(deviceLabel)}-benchmark-rows.md`,
        `${rows}\n`,
        'text/markdown',
      );
      setCopyStatus('Clipboard unavailable; Markdown exported');
    }
  };

  const clearResults = () => {
    setResults([]);
    persistResults([]);
    setCopyStatus('Stored benchmark results cleared');
  };

  const isRunning = phase !== 'idle';
  const lastResult = results[0] ?? null;
  const warmupSeconds =
    (timing.warmupSteps * timing.warmupStepMs) / 1000;
  const measurementSeconds =
    (timing.sampleCount * timing.sampleIntervalMs) / 1000;

  return (
    <div
      data-release-benchmark-panel
      data-benchmark-phase={phase}
      data-benchmark-result-count={results.length}
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-[95] max-h-[calc(100vh-1rem)] overflow-y-auto rounded-2xl border border-white/12 bg-slate-950/94 p-4 text-slate-200 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[460px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.22em] text-sky-300">
            Physical release gate
          </div>
          <h2 className="mt-1 text-lg font-black text-white">
            Hardware benchmark
          </h2>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">
            {warmupSeconds}s warmup + {measurementSeconds}s measurement. Keep
            this tab visible for a valid run.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right font-mono text-[9px] text-slate-500">
          RC {RELEASE_SHA.slice(0, 8)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Device label
          <input
            aria-label="Benchmark device label"
            value={deviceLabel}
            disabled={isRunning}
            onChange={(event) => updateDeviceLabel(event.target.value)}
            placeholder="Gaming desktop, office laptop…"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white outline-none transition focus:border-sky-400/60 disabled:opacity-50"
          />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Rendering quality
          <select
            aria-label="Benchmark rendering quality"
            value={qualityMode}
            disabled={isRunning}
            onChange={(event) =>
              setQualityMode(event.target.value as QualityMode)
            }
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold normal-case tracking-normal text-white outline-none focus:border-sky-400/60 disabled:opacity-50"
          >
            <option value="auto">Auto</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="ultra">Ultra</option>
          </select>
        </label>
      </div>

      <label className="mt-3 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        Run notes
        <textarea
          aria-label="Benchmark run notes"
          value={notes}
          disabled={isRunning}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Room temperature, power mode, visual observations…"
          rows={2}
          className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white outline-none transition focus:border-sky-400/60 disabled:opacity-50"
        />
      </label>

      <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.035] p-3 text-[10px] leading-4 text-slate-400">
        <div className="font-semibold text-slate-200">
          {deviceProfile?.browser ?? 'Detecting browser'} ·{' '}
          {deviceProfile?.operatingSystem ?? 'Detecting OS'} ·{' '}
          {renderQuality.toUpperCase()} active
        </div>
        <div className="mt-1 break-words">
          GPU: {deviceProfile?.gpuRenderer ?? 'Detecting WebGL renderer'}
        </div>
        <div>
          Viewport: {window.innerWidth}×{window.innerHeight} · DPR{' '}
          {window.devicePixelRatio.toFixed(2)} ·{' '}
          {deviceProfile?.orientation ?? 'unknown orientation'}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(['calm', 'storm'] as BenchmarkPreset[]).map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={isRunning}
            aria-label={`Run ${PRESETS[preset].label} release benchmark`}
            onClick={() => void runBenchmark(preset)}
            className="rounded-xl border border-sky-300/20 bg-sky-400/10 px-3 py-3 text-xs font-black uppercase tracking-[0.12em] text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-40"
          >
            Run {PRESETS[preset].label}
          </button>
        ))}
      </div>

      {isRunning && (
        <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-400/8 p-3">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-sky-200">
            <span>
              {PRESETS[activePreset].label} ·{' '}
              {phase === 'warming' ? 'Warmup' : 'Measuring'}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-sky-300 transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              cancelledRef.current = true;
            }}
            className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300 hover:bg-white/5"
          >
            Cancel run
          </button>
        </div>
      )}

      {!isRunning && lastResult && (
        <div
          data-benchmark-result
          className={`mt-3 rounded-xl border p-3 ${
            lastResult.valid
              ? 'border-emerald-400/20 bg-emerald-400/8'
              : 'border-amber-400/25 bg-amber-400/8'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white">
              {PRESETS[lastResult.preset].label} ·{' '}
              {qualityDescription(lastResult)}
            </div>
            <div className="text-[9px] font-bold uppercase text-slate-400">
              {lastResult.valid ? 'Valid run' : 'Review run'}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-black/20 p-2">
              <div className="font-mono text-base font-black text-white">
                {lastResult.averageFps.toFixed(1)}
              </div>
              <div className="text-[8px] uppercase tracking-wider text-slate-500">
                Avg FPS
              </div>
            </div>
            <div className="rounded-lg bg-black/20 p-2">
              <div className="font-mono text-base font-black text-white">
                {lastResult.minimumFps.toFixed(1)}
              </div>
              <div className="text-[8px] uppercase tracking-wider text-slate-500">
                Min FPS
              </div>
            </div>
            <div className="rounded-lg bg-black/20 p-2">
              <div className="font-mono text-base font-black text-white">
                {lastResult.averageFrameTimeMs.toFixed(1)}
              </div>
              <div className="text-[8px] uppercase tracking-wider text-slate-500">
                Avg ms
              </div>
            </div>
          </div>
          <div className="mt-2 text-[9px] leading-4 text-slate-400">
            5th percentile {lastResult.fifthPercentileFps.toFixed(1)} FPS ·{' '}
            drift {lastResult.fpsDriftPercent.toFixed(1)}% ·{' '}
            {lastResult.averageDrawCalls} draws ·{' '}
            {formatTriangles(lastResult.averageTriangles)} triangles ·{' '}
            {lastResult.samples} samples
          </div>
          {lastResult.possibleThermalThrottle && (
            <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-1.5 text-[9px] text-amber-100">
              The second half was at least 15% slower. Repeat after checking
              power mode, temperature, and background activity.
            </div>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-label="Export benchmark JSON"
          disabled={results.length === 0 || isRunning}
          onClick={exportJson}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition hover:bg-white/10 disabled:opacity-30"
        >
          Export JSON
        </button>
        <button
          type="button"
          aria-label="Copy release checklist rows"
          disabled={results.length === 0 || isRunning}
          onClick={() => void copyChecklistRows()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition hover:bg-white/10 disabled:opacity-30"
        >
          Copy checklist rows
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-[9px] text-slate-500">
        <span>{results.length} stored result(s)</span>
        <button
          type="button"
          disabled={results.length === 0 || isRunning}
          onClick={clearResults}
          className="font-bold uppercase tracking-wider text-slate-400 hover:text-white disabled:opacity-30"
        >
          Clear results
        </button>
      </div>
      {copyStatus && (
        <div className="mt-2 text-center text-[9px] font-semibold text-sky-200">
          {copyStatus}
        </div>
      )}
    </div>
  );
}
