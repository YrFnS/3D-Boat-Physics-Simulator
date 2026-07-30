'use client';

import { useEffect, useRef, useState } from 'react';
import {
  type QualityMode,
  type RenderQuality,
  useSimStore,
} from '@/store/useSimStore';

type BenchmarkPreset = 'calm' | 'storm';
type BenchmarkPhase = 'idle' | 'warming' | 'measuring';

interface BenchmarkResult {
  id: number;
  preset: BenchmarkPreset;
  quality: RenderQuality;
  averageFps: number;
  minimumFps: number;
  averageFrameTimeMs: number;
  averageDrawCalls: number;
  averageTriangles: number;
  samples: number;
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

const STORAGE_KEY = 'boat-simulator-performance-baselines-v1';
const WARMUP_STEPS = 10;
const WARMUP_STEP_MS = 250;
const SAMPLE_COUNT = 12;
const SAMPLE_INTERVAL_MS = 500;

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

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatTriangles(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${value}`;
}

export default function BenchmarkPanel() {
  const [phase, setPhase] = useState<BenchmarkPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [activePreset, setActivePreset] = useState<BenchmarkPreset>('calm');
  const [lastResult, setLastResult] = useState<BenchmarkResult | null>(null);
  const mountedRef = useRef(true);
  const activeRunRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const results = JSON.parse(stored) as BenchmarkResult[];
        if (results[0]) setLastResult(results[0]);
      }
    } catch {
      // Benchmarking remains available even when storage is unavailable.
    }

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
    };
  }, []);

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

  const saveResult = (result: BenchmarkResult) => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const previous = stored
        ? (JSON.parse(stored) as BenchmarkResult[])
        : [];
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([result, ...previous].slice(0, 12)),
      );
    } catch {
      // The visible result still works if localStorage is blocked.
    }
  };

  const runBenchmark = async (preset: BenchmarkPreset) => {
    if (activeRunRef.current) return;
    activeRunRef.current = true;
    cancelledRef.current = false;
    setActivePreset(preset);
    setPhase('warming');
    setProgress(0);

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
    const lockedQuality = initial.renderQuality;
    const settings = PRESETS[preset];

    initial.setQualityMode(lockedQuality);
    initial.setWindSpeed(settings.windSpeed);
    initial.setWindDir(settings.windDir);
    initial.setCurrentSpeed(settings.currentSpeed);
    initial.setCurrentDir(settings.currentDir);
    initial.setEngineThrust(settings.engineThrust);
    initial.setTargetTime(settings.targetTime);
    initial.setTargetSeason(settings.targetSeason);

    try {
      for (let step = 0; step < WARMUP_STEPS; step += 1) {
        await wait(WARMUP_STEP_MS);
        if (cancelledRef.current) return;
        if (mountedRef.current) {
          setProgress(((step + 1) / WARMUP_STEPS) * 25);
        }
      }

      if (mountedRef.current) setPhase('measuring');
      const fpsSamples: number[] = [];
      const frameTimeSamples: number[] = [];
      const drawCallSamples: number[] = [];
      const triangleSamples: number[] = [];

      for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
        await wait(SAMPLE_INTERVAL_MS);
        if (cancelledRef.current) return;

        const telemetry = useSimStore.getState();
        if (telemetry.fps > 0 && telemetry.frameTimeMs > 0) {
          fpsSamples.push(telemetry.fps);
          frameTimeSamples.push(telemetry.frameTimeMs);
          drawCallSamples.push(telemetry.drawCalls);
          triangleSamples.push(telemetry.triangles);
        }

        if (mountedRef.current) {
          setProgress(25 + ((sample + 1) / SAMPLE_COUNT) * 75);
        }
      }

      const result: BenchmarkResult = {
        id: Date.now(),
        preset,
        quality: lockedQuality,
        averageFps: average(fpsSamples),
        minimumFps:
          fpsSamples.length > 0 ? Math.min(...fpsSamples) : 0,
        averageFrameTimeMs: average(frameTimeSamples),
        averageDrawCalls: Math.round(average(drawCallSamples)),
        averageTriangles: Math.round(average(triangleSamples)),
        samples: fpsSamples.length,
      };

      saveResult(result);
      console.table(result);
      if (mountedRef.current) setLastResult(result);
    } finally {
      restoreSimulation(snapshot);
      activeRunRef.current = false;
      if (mountedRef.current) {
        setPhase('idle');
        setProgress(0);
      }
    }
  };

  const isRunning = phase !== 'idle';

  return (
    <div className="pointer-events-auto absolute bottom-16 left-1/2 z-[60] -translate-x-1/2">
      <div className="min-w-[310px] rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-[10px] font-mono text-slate-300 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[0.18em] text-slate-500">
            Benchmark
          </span>
          {(['calm', 'storm'] as BenchmarkPreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={isRunning}
              onClick={() => void runBenchmark(preset)}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold uppercase text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-40"
            >
              {PRESETS[preset].label}
            </button>
          ))}

          {isRunning && (
            <span className="ml-auto text-sky-300 uppercase tracking-wider">
              {PRESETS[activePreset].label} · {phase === 'warming' ? 'Warmup' : 'Measure'} · {Math.round(progress)}%
            </span>
          )}
        </div>

        {isRunning && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-sky-400 transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {!isRunning && lastResult && (
          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-2 text-slate-400"
            title={`${lastResult.averageDrawCalls} draw calls · ${lastResult.averageTriangles} triangles · ${lastResult.samples} samples`}
          >
            <span className="font-semibold uppercase text-sky-300">
              {lastResult.preset} · {lastResult.quality}
            </span>
            <span className="text-white">
              {lastResult.averageFps.toFixed(1)} FPS avg
            </span>
            <span>{lastResult.minimumFps.toFixed(1)} min</span>
            <span>{lastResult.averageFrameTimeMs.toFixed(1)} ms</span>
            <span className="hidden sm:inline">
              {lastResult.averageDrawCalls} draws · {formatTriangles(lastResult.averageTriangles)} tris
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
