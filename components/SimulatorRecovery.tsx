'use client';

import { useThree } from '@react-three/fiber';
import {
  AlertTriangle,
  MonitorUp,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';
import { useEffect } from 'react';

export type WebGLStatus = 'ready' | 'unsupported' | 'lost';

export function detectWebGLSupport() {
  if (typeof document === 'undefined') return true;

  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') || canvas.getContext('webgl'),
    );
  } catch {
    return false;
  }
}

export function WebGLContextMonitor({
  onStatusChange,
}: {
  onStatusChange: (status: WebGLStatus) => void;
}) {
  const canvas = useThree((state) => state.gl.domElement);

  useEffect(() => {
    const handleLost = (event: Event) => {
      event.preventDefault();
      onStatusChange('lost');
    };
    const handleRestored = () => onStatusChange('ready');

    canvas.addEventListener('webglcontextlost', handleLost);
    canvas.addEventListener('webglcontextrestored', handleRestored);
    document.documentElement.dataset.simWebglContextMonitorReady = '1';

    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
      delete document.documentElement.dataset.simWebglContextMonitorReady;
    };
  }, [canvas, onStatusChange]);

  return null;
}

export function SimulatorRecoveryOverlay({
  status,
}: {
  status: Exclude<WebGLStatus, 'ready'>;
}) {
  const unsupported = status === 'unsupported';
  const Icon = unsupported ? MonitorUp : ShieldAlert;

  return (
    <div className="absolute inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-slate-950 p-5 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(14,165,233,0.14),transparent_35%),radial-gradient(circle_at_75%_75%,rgba(20,184,166,0.1),transparent_35%)]" />
      <section className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/92 p-6 text-center shadow-2xl sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-amber-200">
          <Icon className="h-8 w-8" />
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {unsupported ? '3D rendering unavailable' : 'Graphics context interrupted'}
        </div>
        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
          {unsupported
            ? 'This browser could not start WebGL.'
            : 'The simulator lost access to the graphics device.'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
          {unsupported
            ? 'Enable hardware acceleration, update the browser or graphics driver, and try again. The simulator requires WebGL 1 or WebGL 2.'
            : 'This can happen after a graphics-driver reset, device sleep, or memory pressure. Reloading safely rebuilds the scene and physics session.'}
        </p>

        <div className="mt-6 grid gap-2 rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-left text-xs leading-5 text-slate-400 sm:grid-cols-2">
          <div>
            <span className="font-semibold text-slate-200">Browser</span>
            <br />Use a current Chromium, Firefox, or Safari release.
          </div>
          <div>
            <span className="font-semibold text-slate-200">Device</span>
            <br />Close GPU-heavy tabs and confirm hardware acceleration is enabled.
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-950/30 transition hover:brightness-110"
        >
          <RefreshCcw className="h-4 w-4" /> Reload simulator
        </button>
      </section>
    </div>
  );
}
