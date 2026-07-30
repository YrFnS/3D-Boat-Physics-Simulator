'use client';

import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Suspense, useCallback, useEffect } from 'react';
import {
  type RenderQuality,
  useSimStore,
} from '@/store/useSimStore';
import { useDebugMode } from '@/hooks/useDebugMode';
import Boat from './Boat';
import Ocean from './Ocean';
import Islands from './Islands';
import Buoys from './Buoys';
import HUD from './HUD';
import WeatherEffects from './WeatherEffects';
import EnvironmentRig from './EnvironmentRig';
import Tornado from './Tornado';
import HurricaneClouds from './HurricaneClouds';
import PerformanceTelemetry from './PerformanceTelemetry';
import PerformanceHUD from './PerformanceHUD';
import WakeField from './WakeField';
import BenchmarkPanel from './BenchmarkPanel';
import ShadowBudget from './ShadowBudget';
import QualityPersistence from './QualityPersistence';

const QUALITY_ORDER: RenderQuality[] = ['low', 'medium', 'high', 'ultra'];

const DPR_BY_QUALITY: Record<RenderQuality, number> = {
  low: 1,
  medium: 1.2,
  high: 1.5,
  ultra: 2,
};

function moveQuality(
  current: RenderQuality,
  direction: -1 | 1,
): RenderQuality {
  const currentIndex = QUALITY_ORDER.indexOf(current);
  const nextIndex = Math.max(
    0,
    Math.min(QUALITY_ORDER.length - 1, currentIndex + direction),
  );
  return QUALITY_ORDER[nextIndex];
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-5 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-sky-200 shadow-2xl backdrop-blur-xl">
        Preparing simulation
      </div>
    </Html>
  );
}

export default function Simulator() {
  const setKey = useSimStore((state) => state.setKey);
  const renderQuality = useSimStore((state) => state.renderQuality);
  const debugEnabled = useDebugMode();

  const lowerAutomaticQuality = useCallback(() => {
    const state = useSimStore.getState();
    if (state.qualityMode !== 'auto') return;
    state.setRenderQuality(moveQuality(state.renderQuality, -1));
  }, []);

  const raiseAutomaticQuality = useCallback(() => {
    const state = useSimStore.getState();
    if (state.qualityMode !== 'auto') return;
    state.setRenderQuality(moveQuality(state.renderQuality, 1));
  }, []);

  const useFallbackQuality = useCallback(() => {
    const state = useSimStore.getState();
    if (state.qualityMode === 'auto') {
      state.setRenderQuality('low');
    }
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent, isDown: boolean) => {
      const key = event.key.toLowerCase();
      if (
        [
          'w',
          'a',
          's',
          'd',
          'r',
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
        ].includes(key)
      ) {
        event.preventDefault();
        setKey(key, isDown);
      }
    };

    const keyDown = (event: KeyboardEvent) => handleKey(event, true);
    const keyUp = (event: KeyboardEvent) => handleKey(event, false);
    const resetKeys = () => {
      for (const key of [
        'w',
        'a',
        's',
        'd',
        'r',
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright',
      ]) {
        setKey(key, false);
      }
    };

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', resetKeys);

    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', resetKeys);
    };
  }, [setKey]);

  return (
    <div className="relative h-screen w-full select-none overflow-hidden bg-slate-900">
      <QualityPersistence />
      <Canvas
        camera={{ position: [0, 15, -25], fov: 60, near: 0.1, far: 3000 }}
        dpr={DPR_BY_QUALITY[renderQuality]}
        shadows={renderQuality !== 'low'}
        gl={{
          antialias: renderQuality !== 'low',
          alpha: false,
          depth: true,
          stencil: false,
          powerPreference: 'high-performance',
        }}
        performance={{ min: 0.5 }}
      >
        <fog attach="fog" args={['#aab8c2', 200, 1000]} />

        <PerformanceMonitor
          flipflops={3}
          onDecline={lowerAutomaticQuality}
          onIncline={raiseAutomaticQuality}
          onFallback={useFallbackQuality}
        />
        {debugEnabled && <PerformanceTelemetry />}
        <ShadowBudget />

        <Suspense fallback={<LoadingFallback />}>
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2 - 0.05}
            minDistance={5}
            maxDistance={150}
          />
          <EnvironmentRig />
          <Boat />
          <HurricaneClouds />
          <Tornado />
          <Islands />
          <Buoys />
          <WakeField />
          <Ocean />
          <WeatherEffects />
        </Suspense>
      </Canvas>
      <HUD />
      {debugEnabled && <BenchmarkPanel />}
      <PerformanceHUD showMetrics={debugEnabled} />
    </div>
  );
}
