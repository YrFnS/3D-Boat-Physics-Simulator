'use client';

import { Html, PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useAutomationMode } from '@/hooks/useAutomationMode';
import { useDebugMode } from '@/hooks/useDebugMode';
import {
  type RenderQuality,
  useSimStore,
} from '@/store/useSimStore';
import BenchmarkPanel from './BenchmarkPanel';
import Boat from './Boat';
import Buoys from './Buoys';
import CameraRig from './CameraRig';
import ContextualControlHints from './ContextualControlHints';
import EnvironmentRig from './EnvironmentRig';
import ExperienceChrome from './ExperienceChrome';
import ExperiencePersistence from './ExperiencePersistence';
import HUD from './HUD';
import HurricaneClouds from './HurricaneClouds';
import InputModeTracker from './InputModeTracker';
import Islands from './Islands';
import NavigationHUD from './NavigationHUD';
import Ocean from './Ocean';
import OnboardingOverlay from './OnboardingOverlay';
import PerformanceHUD from './PerformanceHUD';
import PerformanceTelemetry from './PerformanceTelemetry';
import QualityPersistence from './QualityPersistence';
import ScenarioDirector from './ScenarioDirector';
import ScenarioResultOverlay from './ScenarioResultOverlay';
import ScenarioWaypoints from './ScenarioWaypoints';
import SessionOverlay from './SessionOverlay';
import SettingsOverlay from './SettingsOverlay';
import SettingsPersistence from './SettingsPersistence';
import ShadowBudget from './ShadowBudget';
import {
  detectWebGLSupport,
  SimulatorRecoveryOverlay,
  type WebGLStatus,
  WebGLContextMonitor,
} from './SimulatorRecovery';
import Tornado from './Tornado';
import WakeField from './WakeField';
import WeatherEffects from './WeatherEffects';

const QUALITY_ORDER: RenderQuality[] = ['low', 'medium', 'high', 'ultra'];

const DPR_BY_QUALITY: Record<RenderQuality, number> = {
  low: 1,
  medium: 1.2,
  high: 1.5,
  ultra: 2,
};

const MOVEMENT_KEYS = [
  'w',
  'a',
  's',
  'd',
  'r',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
] as const;

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
      <div className="w-56 rounded-2xl border border-white/10 bg-slate-950/86 p-4 text-center text-white shadow-2xl backdrop-blur-xl">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-sky-300/20 border-t-sky-300" />
        <div className="mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200">
          Preparing simulation
        </div>
        <div className="mt-1 text-[10px] leading-4 text-slate-500">
          Loading the vessel, ocean, weather, and collision world.
        </div>
      </div>
    </Html>
  );
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export default function Simulator() {
  const [webglStatus, setWebglStatus] = useState<WebGLStatus>(() =>
    detectWebGLSupport() ? 'ready' : 'unsupported',
  );
  const setKey = useSimStore((state) => state.setKey);
  const clearKeys = useSimStore((state) => state.clearKeys);
  const renderQuality = useSimStore((state) => state.renderQuality);
  const sessionPhase = useSimStore((state) => state.sessionPhase);
  const scenarioRunStatus = useSimStore(
    (state) => state.scenarioRunStatus,
  );
  const hudVisible = useSimStore((state) => state.hudVisible);
  const activeBoat = useSimStore((state) => state.activeBoat);
  const resetVesselTrigger = useSimStore(
    (state) => state.resetVesselTrigger,
  );
  const debugEnabled = useDebugMode();
  const automationMode = useAutomationMode();

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

  const handleWebGLStatus = useCallback((status: WebGLStatus) => {
    setWebglStatus(status);
  }, []);

  useEffect(() => {
    if (automationMode) {
      useSimStore.getState().resumeSession();
    }
  }, [automationMode]);

  useEffect(() => {
    const handleMovementKey = (
      event: KeyboardEvent,
      isDown: boolean,
    ) => {
      const key = event.key.toLowerCase();
      if (!MOVEMENT_KEYS.includes(key as (typeof MOVEMENT_KEYS)[number])) {
        return;
      }

      const phase = useSimStore.getState().sessionPhase;
      if (isDown && phase !== 'running') return;
      event.preventDefault();
      setKey(key, isDown);
    };

    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === 'escape' && !event.repeat) {
        event.preventDefault();
        useSimStore.getState().togglePause();
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (key === 'c' && !event.repeat) {
        if (useSimStore.getState().sessionPhase === 'running') {
          event.preventDefault();
          useSimStore.getState().cycleCameraMode();
        }
        return;
      }

      if (key === 'home' && !event.repeat) {
        if (useSimStore.getState().sessionPhase === 'running') {
          event.preventDefault();
          useSimStore.getState().resetVessel();
        }
        return;
      }

      handleMovementKey(event, true);
    };

    const keyUp = (event: KeyboardEvent) => {
      handleMovementKey(event, false);
    };

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clearKeys);

    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clearKeys);
    };
  }, [clearKeys, setKey]);

  const simulationRunning = automationMode || sessionPhase === 'running';
  const showHud = automationMode || (sessionPhase !== 'menu' && hudVisible);
  const showSessionOverlay =
    scenarioRunStatus === 'inactive' || scenarioRunStatus === 'active';

  if (webglStatus === 'unsupported') {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-slate-950">
        <SimulatorRecoveryOverlay status="unsupported" />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full select-none overflow-hidden bg-slate-900">
      <QualityPersistence />
      <ExperiencePersistence automationMode={automationMode} />
      <SettingsPersistence automationMode={automationMode} />
      <InputModeTracker />
      <Canvas
        camera={{ position: [0, 15, -25], fov: 60, near: 0.1, far: 3000 }}
        dpr={DPR_BY_QUALITY[renderQuality]}
        frameloop={simulationRunning ? 'always' : 'demand'}
        shadows={renderQuality !== 'low' ? 'basic' : false}
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
        <WebGLContextMonitor onStatusChange={handleWebGLStatus} />

        <PerformanceMonitor
          flipflops={3}
          onDecline={lowerAutomaticQuality}
          onIncline={raiseAutomaticQuality}
          onFallback={useFallbackQuality}
        />
        {debugEnabled && <PerformanceTelemetry />}
        <ShadowBudget />

        <Suspense fallback={<LoadingFallback />}>
          <EnvironmentRig />
          <Boat key={`${activeBoat}-${resetVesselTrigger}`} />
          <ScenarioDirector enabled={!automationMode} />
          <ScenarioWaypoints enabled={!automationMode} />
          <CameraRig />
          <HurricaneClouds />
          <Tornado />
          <Islands />
          <Buoys />
          <WakeField />
          <Ocean />
          <WeatherEffects />
        </Suspense>
      </Canvas>

      <div className="sim-ui-layer pointer-events-none absolute inset-0">
        {showHud && <HUD />}
        {showHud && !automationMode && <NavigationHUD />}
        {debugEnabled && (
          <div className="hidden sm:block">
            <BenchmarkPanel />
          </div>
        )}
        <PerformanceHUD showMetrics={debugEnabled} />
        {showSessionOverlay && (
          <SessionOverlay automationMode={automationMode} />
        )}
        <ExperienceChrome automationMode={automationMode} />
        <ScenarioResultOverlay automationMode={automationMode} />
        <ContextualControlHints automationMode={automationMode} />
        <SettingsOverlay automationMode={automationMode} />
        <OnboardingOverlay automationMode={automationMode} />
      </div>

      {webglStatus === 'lost' && <SimulatorRecoveryOverlay status="lost" />}
    </div>
  );
}
