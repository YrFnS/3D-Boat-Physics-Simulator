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
import { useBenchmarkMode } from '@/hooks/useBenchmarkMode';
import { useDebugMode } from '@/hooks/useDebugMode';
import {
  canAcceptVesselInput,
  resolveSimulatorFrameLoop,
} from '@/sim/core/SimulationRuntimeAuthority';
import {
  type RenderQuality,
  sharedPhysics,
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
import FreeNavigationDirector from './FreeNavigationDirector';
import GameplayPersistence from './GameplayPersistence';
import HardwareBenchmarkPanel from './HardwareBenchmarkPanel';
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
import ScenarioEntities from './ScenarioEntities';
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

const COLLISION_READY_POLL_MS = 50;
const COLLISION_READY_SETTLE_MS = 100;
const COLLISION_READY_TIMEOUT_MS = 20_000;

type CollisionRuntimeStatus = 'loading' | 'ready' | 'stalled';

interface CollisionRuntimeState {
  generation: string;
  status: CollisionRuntimeStatus;
}

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

function CollisionReadinessOverlay({
  status,
}: {
  status: Exclude<CollisionRuntimeStatus, 'ready'>;
}) {
  const stalled = status === 'stalled';

  return (
    <div className="pointer-events-auto absolute inset-0 z-[120] flex items-center justify-center bg-slate-950/72 p-5 text-white backdrop-blur-md">
      <div
        role={stalled ? 'alert' : 'status'}
        aria-live="polite"
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-950/92 p-6 text-center shadow-2xl"
      >
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border ${
            stalled
              ? 'border-amber-300/30 bg-amber-300/10'
              : 'border-sky-300/30 bg-sky-300/10'
          }`}
        >
          <div
            className={`h-6 w-6 rounded-full border-2 ${
              stalled
                ? 'border-amber-200/35 border-t-amber-200'
                : 'animate-spin border-sky-200/25 border-t-sky-200'
            }`}
          />
        </div>
        <div
          className={`mt-4 text-[10px] font-black uppercase tracking-[0.24em] ${
            stalled ? 'text-amber-200' : 'text-sky-200'
          }`}
        >
          {stalled ? 'Collision world unavailable' : 'Preparing collision world'}
        </div>
        <h2 className="mt-2 text-xl font-bold text-white">
          {stalled
            ? 'The physics runtime did not become ready.'
            : 'Building the authoritative vessel runtime.'}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {stalled
            ? 'The simulator has kept vessel movement locked so it cannot pass through terrain or navigation obstacles.'
            : 'Rapier terrain, vessel contacts, and obstacle colliders must be ready before controls or mission time can advance.'}
        </p>
        {stalled && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200"
          >
            Reload simulator
          </button>
        )}
      </div>
    </div>
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
  const runtimeGeneration = `${activeBoat}-${resetVesselTrigger}`;
  const [collisionRuntime, setCollisionRuntime] =
    useState<CollisionRuntimeState>({
      generation: '',
      status: 'loading',
    });
  const collisionStatus =
    collisionRuntime.generation === runtimeGeneration
      ? collisionRuntime.status
      : 'loading';
  const collisionRuntimeReady = collisionStatus === 'ready';
  const debugEnabled = useDebugMode();
  const benchmarkMode = useBenchmarkMode();
  const automationMode = useAutomationMode();
  const diagnosticsEnabled = debugEnabled || benchmarkMode;

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
    if (webglStatus !== 'ready') return undefined;

    let cancelled = false;
    const startedAt = performance.now();
    const acceptReadyAt = startedAt + COLLISION_READY_SETTLE_MS;

    setCollisionRuntime({
      generation: runtimeGeneration,
      status: 'loading',
    });

    const interval = window.setInterval(() => {
      if (cancelled) return;

      const ready = sharedPhysics.collisionReady === 1;

      if (ready && performance.now() >= acceptReadyAt) {
        setCollisionRuntime({
          generation: runtimeGeneration,
          status: 'ready',
        });
        window.clearInterval(interval);
        return;
      }

      if (performance.now() - startedAt >= COLLISION_READY_TIMEOUT_MS) {
        setCollisionRuntime({
          generation: runtimeGeneration,
          status: 'stalled',
        });
        window.clearInterval(interval);
      }
    }, COLLISION_READY_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runtimeGeneration, webglStatus]);

  useEffect(() => {
    if (!collisionRuntimeReady) clearKeys();
  }, [clearKeys, collisionRuntimeReady]);

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
      if (
        isDown &&
        !canAcceptVesselInput(
          sharedPhysics.collisionReady === 1,
          phase,
        )
      ) {
        return;
      }
      event.preventDefault();
      setKey(key, isDown);
    };

    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === 'escape' && !event.repeat) {
        if (sharedPhysics.collisionReady !== 1) return;
        event.preventDefault();
        useSimStore.getState().togglePause();
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (key === 'c' && !event.repeat) {
        if (
          canAcceptVesselInput(
            sharedPhysics.collisionReady === 1,
            useSimStore.getState().sessionPhase,
          )
        ) {
          event.preventDefault();
          useSimStore.getState().cycleCameraMode();
        }
        return;
      }

      if (key === 'home' && !event.repeat) {
        if (
          canAcceptVesselInput(
            sharedPhysics.collisionReady === 1,
            useSimStore.getState().sessionPhase,
          )
        ) {
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

  const frameLoop = resolveSimulatorFrameLoop({
    collisionRuntimeReady,
    automationMode,
    sessionPhase,
  });
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
      <GameplayPersistence automationMode={automationMode} />
      <SettingsPersistence automationMode={automationMode} />
      <InputModeTracker />
      <Canvas
        camera={{ position: [0, 15, -25], fov: 60, near: 0.1, far: 3000 }}
        dpr={DPR_BY_QUALITY[renderQuality]}
        frameloop={frameLoop}
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
        {diagnosticsEnabled && <PerformanceTelemetry />}
        <ShadowBudget />

        <Suspense fallback={<LoadingFallback />}>
          <EnvironmentRig />
          <Boat key={runtimeGeneration} />
          <ScenarioDirector enabled={!automationMode} />
          <FreeNavigationDirector enabled={!automationMode} />
          <ScenarioWaypoints enabled={!automationMode} />
          <ScenarioEntities enabled={!automationMode} />
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
        {benchmarkMode ? (
          <HardwareBenchmarkPanel />
        ) : (
          debugEnabled && (
            <div className="hidden sm:block">
              <BenchmarkPanel />
            </div>
          )
        )}
        <PerformanceHUD showMetrics={diagnosticsEnabled} />
        {showSessionOverlay && (
          <SessionOverlay automationMode={automationMode} />
        )}
        <ExperienceChrome automationMode={automationMode} />
        <ScenarioResultOverlay automationMode={automationMode} />
        <ContextualControlHints automationMode={automationMode} />
        <SettingsOverlay automationMode={automationMode} />
        <OnboardingOverlay automationMode={automationMode} />
      </div>

      {collisionStatus !== 'ready' && (
        <CollisionReadinessOverlay status={collisionStatus} />
      )}
      {webglStatus === 'lost' && <SimulatorRecoveryOverlay status="lost" />}
    </div>
  );
}
