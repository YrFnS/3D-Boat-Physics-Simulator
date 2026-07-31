import { create } from 'zustand';
import { Quaternion, Vector3 } from 'three';
import {
  DEFAULT_SCENARIO_ID,
  getScenarioDefinition,
  type ScenarioId,
} from '@/sim/scenarios/ScenarioCatalog';

export type BoatType = 'trawler' | 'speedboat';
export type RenderQuality = 'low' | 'medium' | 'high' | 'ultra';
export type QualityMode = 'auto' | RenderQuality;
export type SessionPhase = 'menu' | 'running' | 'paused';
export type CameraMode = 'chase' | 'helm' | 'orbit' | 'cinematic';

export const CAMERA_MODES: readonly CameraMode[] = [
  'chase',
  'helm',
  'orbit',
  'cinematic',
] as const;

export interface PerformanceTelemetry {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
}

export interface ControlState {
  w: boolean;
  s: boolean;
  a: boolean;
  d: boolean;
  r: boolean;
  arrowup: boolean;
  arrowdown: boolean;
  arrowleft: boolean;
  arrowright: boolean;
}

export const MAX_OBSTACLES = 250;

function createEmptyKeys(): ControlState {
  return {
    w: false,
    s: false,
    a: false,
    d: false,
    r: false,
    arrowup: false,
    arrowdown: false,
    arrowleft: false,
    arrowright: false,
  };
}

// Shared high-frequency state skips React completely so the render loop can
// update simulation and shader inputs without forcing component renders.
export const sharedPhysics = {
  boatPos: new Vector3(0, 0, 0),
  boatDir: new Vector3(0, 0, -1),
  boatQuaternion: new Quaternion(),
  boatLinearVelocity: new Vector3(),
  boatAngularVelocity: new Vector3(),
  boatSpeed: 0,
  submergedRatio: 0,
  simulationTime: 0,
  renderTime: 0,
  fixedStepAlpha: 0,
  fixedStepCount: 0,
  droppedSimulationTime: 0,
  collisionReady: 0,
  collisionSequence: 0,
  terrainCollisionSequence: 0,
  obstacleCollisionSequence: 0,
  debugProbeCollisionSequence: 0,
  collisionMaxImpactSpeed: 0,
  collisionMaxImpulse: 0,
  collisionMaxPenetration: 0,
  calibrationReady: 0,
  calibrationPassed: 0,
  calibrationProgress: 0,
  calibrationScenario: '',
  calibrationVessel: '',
  calibrationResult: '',
  lightningFlash: 0,
  obstacles: new Float32Array(MAX_OBSTACLES * 4), // x, y, z, radius
  worldTime: 12.0,
  season: 0.0, // 0=Spring, 0.25=Summer, 0.5=Fall, 0.75=Winter
  tornadoPos: new Vector3(0, 0, 0),
  whirlpoolPos: new Vector3(-400, 0, -400),
};

export interface SimState {
  windSpeed: number; // m/s
  windDir: number; // degrees
  currentSpeed: number; // m/s
  currentDir: number; // degrees
  engineThrust: number; // -1 to 1
  activeBoat: BoatType;

  // Product session
  sessionPhase: SessionPhase;
  activeScenario: ScenarioId;
  cameraMode: CameraMode;
  resetVesselTrigger: number;

  // Telemetry (updated by physics)
  speedKnots: number;
  heading: number;
  hullHealth: number;
  engineHealth: number;
  engineTemperature: number;
  rudderHealth: number;

  // Environment targets
  targetTime: number; // 0 to 24
  targetSeason: number; // 0 to 1

  // Rendering and performance
  qualityMode: QualityMode;
  renderQuality: RenderQuality;
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;

  // Controls
  keys: ControlState;

  // Actions
  setWindSpeed: (value: number) => void;
  setWindDir: (value: number) => void;
  setCurrentSpeed: (value: number) => void;
  setCurrentDir: (value: number) => void;
  setEngineThrust: (value: number) => void;
  setActiveBoat: (value: BoatType) => void;
  setTelemetry: (
    speed: number,
    heading: number,
    hull: number,
    engine: number,
    temperature: number,
    rudder: number,
  ) => void;
  setKey: (key: string, value: boolean) => void;
  clearKeys: () => void;
  setTargetTime: (value: number) => void;
  setTargetSeason: (value: number) => void;
  setQualityMode: (mode: QualityMode) => void;
  setRenderQuality: (quality: RenderQuality) => void;
  setPerformanceTelemetry: (telemetry: PerformanceTelemetry) => void;
  previewScenario: (scenarioId: ScenarioId) => void;
  startScenario: (scenarioId?: ScenarioId, boat?: BoatType) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  togglePause: () => void;
  restartScenario: () => void;
  returnToMenu: () => void;
  setCameraMode: (mode: CameraMode) => void;
  cycleCameraMode: () => void;
  resetVessel: () => void;
  instantRepairTrigger: number;
  fireInstantRepair: () => void;
}

function resetTelemetry() {
  return {
    speedKnots: 0,
    heading: 0,
    hullHealth: 100,
    engineHealth: 100,
    engineTemperature: 20,
    rudderHealth: 100,
  };
}

export const useSimStore = create<SimState>((set, get) => ({
  windSpeed: 8,
  windDir: 90,
  currentSpeed: 1.5,
  currentDir: 15,
  engineThrust: 0,
  activeBoat: 'trawler',

  sessionPhase: 'menu',
  activeScenario: DEFAULT_SCENARIO_ID,
  cameraMode: 'chase',
  resetVesselTrigger: 0,

  ...resetTelemetry(),

  keys: createEmptyKeys(),

  targetTime: 12,
  targetSeason: 0.25,

  qualityMode: 'auto',
  renderQuality: 'high',
  fps: 0,
  frameTimeMs: 0,
  drawCalls: 0,
  triangles: 0,

  instantRepairTrigger: 0,

  setWindSpeed: (windSpeed) => set({ windSpeed }),
  setWindDir: (windDir) => set({ windDir }),
  setCurrentSpeed: (currentSpeed) => set({ currentSpeed }),
  setCurrentDir: (currentDir) => set({ currentDir }),
  setEngineThrust: (engineThrust) =>
    set({ engineThrust: Math.max(-1, Math.min(1, engineThrust)) }),
  setActiveBoat: (activeBoat) =>
    set((state) =>
      state.activeBoat === activeBoat
        ? {}
        : {
            activeBoat,
            engineThrust: 0,
            keys: createEmptyKeys(),
            resetVesselTrigger: state.resetVesselTrigger + 1,
            ...resetTelemetry(),
          },
    ),
  setTelemetry: (
    speedKnots,
    heading,
    hullHealth,
    engineHealth,
    engineTemperature,
    rudderHealth,
  ) =>
    set({
      speedKnots,
      heading,
      hullHealth,
      engineHealth,
      engineTemperature,
      rudderHealth,
    }),
  setKey: (key, value) =>
    set((state) => {
      if (!(key in state.keys)) return state;
      return {
        keys: {
          ...state.keys,
          [key]: value,
        },
      };
    }),
  clearKeys: () => set({ keys: createEmptyKeys() }),
  setTargetTime: (targetTime) => set({ targetTime }),
  setTargetSeason: (targetSeason) => set({ targetSeason }),
  setQualityMode: (qualityMode) =>
    set((state) => ({
      qualityMode,
      renderQuality:
        qualityMode === 'auto' ? state.renderQuality : qualityMode,
    })),
  setRenderQuality: (renderQuality) => set({ renderQuality }),
  setPerformanceTelemetry: (telemetry) => set(telemetry),

  previewScenario: (activeScenario) => {
    const scenario = getScenarioDefinition(activeScenario);
    set({
      activeScenario,
      windSpeed: scenario.windSpeed,
      windDir: scenario.windDir,
      currentSpeed: scenario.currentSpeed,
      currentDir: scenario.currentDir,
      targetTime: scenario.targetTime,
      targetSeason: scenario.targetSeason,
    });
  },
  startScenario: (scenarioId, requestedBoat) => {
    const activeScenario = scenarioId ?? get().activeScenario;
    const scenario = getScenarioDefinition(activeScenario);
    set((state) => ({
      activeScenario,
      activeBoat: requestedBoat ?? state.activeBoat,
      sessionPhase: 'running',
      cameraMode: 'chase',
      windSpeed: scenario.windSpeed,
      windDir: scenario.windDir,
      currentSpeed: scenario.currentSpeed,
      currentDir: scenario.currentDir,
      targetTime: scenario.targetTime,
      targetSeason: scenario.targetSeason,
      engineThrust: 0,
      keys: createEmptyKeys(),
      resetVesselTrigger: state.resetVesselTrigger + 1,
      ...resetTelemetry(),
    }));
  },
  pauseSession: () =>
    set((state) =>
      state.sessionPhase !== 'running'
        ? {}
        : {
            sessionPhase: 'paused',
            engineThrust: 0,
            keys: createEmptyKeys(),
          },
    ),
  resumeSession: () => set({ sessionPhase: 'running' }),
  togglePause: () =>
    set((state) => {
      if (state.sessionPhase === 'running') {
        return {
          sessionPhase: 'paused',
          engineThrust: 0,
          keys: createEmptyKeys(),
        };
      }
      if (state.sessionPhase === 'paused') {
        return { sessionPhase: 'running' };
      }
      return {};
    }),
  restartScenario: () => {
    const state = get();
    const scenario = getScenarioDefinition(state.activeScenario);
    set({
      sessionPhase: 'running',
      windSpeed: scenario.windSpeed,
      windDir: scenario.windDir,
      currentSpeed: scenario.currentSpeed,
      currentDir: scenario.currentDir,
      targetTime: scenario.targetTime,
      targetSeason: scenario.targetSeason,
      engineThrust: 0,
      keys: createEmptyKeys(),
      resetVesselTrigger: state.resetVesselTrigger + 1,
      ...resetTelemetry(),
    });
  },
  returnToMenu: () =>
    set({
      sessionPhase: 'menu',
      engineThrust: 0,
      keys: createEmptyKeys(),
    }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  cycleCameraMode: () =>
    set((state) => {
      const currentIndex = CAMERA_MODES.indexOf(state.cameraMode);
      return {
        cameraMode:
          CAMERA_MODES[(currentIndex + 1) % CAMERA_MODES.length],
      };
    }),
  resetVessel: () =>
    set((state) => ({
      engineThrust: 0,
      keys: createEmptyKeys(),
      resetVesselTrigger: state.resetVesselTrigger + 1,
      ...resetTelemetry(),
    })),
  fireInstantRepair: () =>
    set((state) => ({
      instantRepairTrigger: state.instantRepairTrigger + 1,
    })),
}));
