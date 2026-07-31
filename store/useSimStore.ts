import { create } from 'zustand';
import { Quaternion, Vector3 } from 'three';

export type BoatType = 'trawler' | 'speedboat';
export type RenderQuality = 'low' | 'medium' | 'high' | 'ultra';
export type QualityMode = 'auto' | RenderQuality;

export interface PerformanceTelemetry {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
}

export const MAX_OBSTACLES = 250;

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
  engineThrust: number; // 0 to 1
  activeBoat: BoatType;

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
  keys: {
    w: boolean;
    s: boolean;
    a: boolean;
    d: boolean;
    r: boolean;
    arrowup: boolean;
    arrowdown: boolean;
    arrowleft: boolean;
    arrowright: boolean;
  };

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
  setTargetTime: (value: number) => void;
  setTargetSeason: (value: number) => void;
  setQualityMode: (mode: QualityMode) => void;
  setRenderQuality: (quality: RenderQuality) => void;
  setPerformanceTelemetry: (telemetry: PerformanceTelemetry) => void;
  instantRepairTrigger: number;
  fireInstantRepair: () => void;
}

export const useSimStore = create<SimState>((set) => ({
  windSpeed: 8,
  windDir: 90,
  currentSpeed: 3,
  currentDir: 0,
  engineThrust: 0,
  activeBoat: 'trawler',

  speedKnots: 0,
  heading: 0,
  hullHealth: 100,
  engineHealth: 100,
  engineTemperature: 20,
  rudderHealth: 100,

  keys: {
    w: false,
    s: false,
    a: false,
    d: false,
    r: false,
    arrowup: false,
    arrowdown: false,
    arrowleft: false,
    arrowright: false,
  },

  targetTime: 12,
  targetSeason: 0,

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
  setEngineThrust: (engineThrust) => set({ engineThrust }),
  setActiveBoat: (activeBoat) => set({ activeBoat }),
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
    set((state) => ({ keys: { ...state.keys, [key]: value } })),
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
  fireInstantRepair: () =>
    set((state) => ({
      instantRepairTrigger: state.instantRepairTrigger + 1,
    })),
}));
