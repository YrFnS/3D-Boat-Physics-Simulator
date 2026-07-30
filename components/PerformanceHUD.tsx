'use client';

import {
  type QualityMode,
  type RenderQuality,
  useSimStore,
} from '@/store/useSimStore';

const QUALITY_OPTIONS: Array<{ value: QualityMode; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'ultra', label: 'Ultra' },
];

function formatTriangles(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${value}`;
}

export default function PerformanceHUD() {
  const qualityMode = useSimStore((state) => state.qualityMode);
  const renderQuality = useSimStore((state) => state.renderQuality);
  const fps = useSimStore((state) => state.fps);
  const frameTimeMs = useSimStore((state) => state.frameTimeMs);
  const drawCalls = useSimStore((state) => state.drawCalls);
  const triangles = useSimStore((state) => state.triangles);
  const setQualityMode = useSimStore((state) => state.setQualityMode);
  const setRenderQuality = useSimStore((state) => state.setRenderQuality);

  const handleQualityChange = (nextMode: QualityMode) => {
    setQualityMode(nextMode);
    if (nextMode !== 'auto') {
      setRenderQuality(nextMode as RenderQuality);
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 z-[60] -translate-x-1/2 pointer-events-auto">
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/75 px-3 py-2 text-[10px] font-mono text-slate-300 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2" title="Measured rendering performance">
          <span
            className={`h-2 w-2 rounded-full ${
              fps >= 55
                ? 'bg-emerald-400'
                : fps >= 35
                  ? 'bg-amber-400'
                  : 'bg-red-500'
            }`}
          />
          <span className="text-white">{fps > 0 ? fps.toFixed(0) : '--'} FPS</span>
          <span className="text-slate-500">{frameTimeMs > 0 ? frameTimeMs.toFixed(1) : '--'} ms</span>
          <span className="hidden sm:inline text-slate-500">
            {drawCalls} draws · {formatTriangles(triangles)} tris
          </span>
        </div>

        <span className="h-4 w-px bg-white/10" />

        <label className="flex items-center gap-2">
          <span className="hidden sm:inline uppercase tracking-widest text-slate-500">
            Quality
          </span>
          <select
            aria-label="Rendering quality"
            value={qualityMode}
            onChange={(event) =>
              handleQualityChange(event.target.value as QualityMode)
            }
            className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase text-white outline-none hover:bg-white/10"
          >
            {QUALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-slate-950">
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <span className="hidden md:inline text-sky-300 uppercase tracking-wider">
          {qualityMode === 'auto' ? `Auto · ${renderQuality}` : renderQuality}
        </span>
      </div>
    </div>
  );
}
