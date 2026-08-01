import { create } from 'zustand';
import { Quaternion, Vector3 } from 'three';
import { queueNextSixDofBodySpawn } from '@/sim/core/SixDofBody';
import {
  DEFAULT_SCENARIO_ID,
  getScenarioDefinition,
  SCENARIOS,
  type ScenarioId,
} from '@/sim/scenarios/ScenarioCatalog';

export type BoatType = 'trawler' | 'speedboat';
export type RenderQuality = 'low' | 'medium' | 'high' | 'ultra';
export type QualityMode = 'auto' | RenderQuality;
export type SessionPhase = 'menu' | 'running' | 'paused';
export type CameraMode = 'chase' | 'helm' | 'orbit' | 'cinematic';
export type ScenarioRunStatus =
  | 'inactive'
  | 'active'
  | 'completed'
  | 'failed';

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

export interface ExperiencePreferences {
  activeBoat: BoatType;
  activeScenario: ScenarioId;
  cameraMode: CameraMode;
  hudVisible: boolean;
}

export interface ScenarioNavigationTelemetry {
  elapsedSeconds: number;
  progress: number;
  distanceM: number;
  bearingDeg: number;
  relativeBearingDeg: number;
  boatX: number;
  boatZ: number;
}

export interface ScenarioCheckpointState {
  id: string;
  label: string;
  waypointIndex: number;
  x: number;
  z: number;
  headingDeg: number;
}

export interface ScenarioResult {
  outcome: 'completed' | 'failed';
  reason: string;
  elapsedSeconds: number;
  score: number;
  waypointsCompleted: number;
  totalWaypoints: number;
  entitiesCompleted: number;
  totalEntities: number;
  hullHealth: number;
  engineHealth: number;
  rudderHealth: number;
  collisionCount: number;
  resetCount: number;
  maximumSpeedKnots: number;
  distanceTravelledM: number;
  checkpointLabel: string;
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

function queueScenarioSpawn(
  x: number,
  z: number,
  headingDeg: number,
) {
  queueNextSixDofBodySpawn({
    x,
    y: 0,
    z,
    headingDeg,
  });
}

function createScenarioGameplayState(
  scenarioRunStatus: ScenarioRunStatus,
) {
  return {
    scenarioRunStatus,
    activeWaypointIndex: 0,
    scenarioElapsedSeconds: 0,
    scenarioProgress: 0,
    navigationDistanceM: 0,
    navigationBearingDeg: 0,
    navigationRelativeBearingDeg: 0,
    navigationBoatX: 0,
    navigationBoatZ: 0,
    scenarioResult: null as ScenarioResult | null,
    scenarioResetCount: 0,
    completedScenarioEntityIds: [] as string[],
    scenarioEventMessage: '',
    scenarioCheckpointId: null as string | null,
    scenarioCheckpointLabel: 'Departure point',
    scenarioCheckpointWaypointIndex: -1,
    scenarioSpawnX: 0,
    scenarioSpawnZ: 0,
    scenarioSpawnHeadingDeg: 0,
  };
}

function isBoatType(value: unknown): value is BoatType {
  return value === 'trawler' || value === 'speedboat';
}

function isCameraMode(value: unknown): value is CameraMode {
  return CAMERA_MODES.includes(value as CameraMode);
}

function isScenarioId(value: unknown): value is ScenarioId {
  return SCENARIOS.some((scenario) => scenario.id === value);
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
  displacedVolumeM3: 0,
  floodingRatio: 0,
  floodedVolumeM3: 0,
  physicalMassKg: 0,
  displacementBalanceErrorRatio: 0,
  centerOfBuoyancy: new Vector3(),
  averageWaterVelocity: new Vector3(),
  maximumSlamSeverity: 0,
  engineRpm: 0,
  shaftRpm: 0,
  deliveredShaftPowerW: 0,
  absorbedShaftPowerW: 0,
  propellerThrustN: 0,
  propellerAdvanceRatio: 0,
  propellerLoadRatio: 0,
  cavitationFactor: 1,
  ventilationFactor: 1,
  propWashSpeedMps: 0,
  rudderAngleRad: 0,
  rudderForceN: 0,
  rudderFlowSpeedMps: 0,
  rudderAngleOfAttackRad: 0,
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
  windSpeed: number;
  windDir: number;
  currentSpeed: number;
  currentDir: number;
  engineThrust: number;
  activeBoat: BoatType;

  sessionPhase: SessionPhase;
  activeScenario: ScenarioId;
  cameraMode: CameraMode;
  hudVisible: boolean;
  resetVesselTrigger: number;

  scenarioRunStatus: ScenarioRunStatus;
  scenarioRunId: number;
  activeWaypointIndex: number;
  scenarioElapsedSeconds: number;
  scenarioProgress: number;
  navigationDistanceM: number;
  navigationBearingDeg: number;
  navigationRelativeBearingDeg: number;
  navigationBoatX: number;
  navigationBoatZ: number;
  scenarioResult: ScenarioResult | null;
  scenarioResetCount: number;
  completedScenarioEntityIds: string[];
  scenarioEventMessage: string;
  scenarioCheckpointId: string | null;
  scenarioCheckpointLabel: string;
  scenarioCheckpointWaypointIndex: number;
  scenarioSpawnX: number;
  scenarioSpawnZ: number;
  scenarioSpawnHeadingDeg: number;

  speedKnots: number;
  heading: number;
  hullHealth: number;
  engineHealth: number;
  engineTemperature: number;
  rudderHealth: number;
  floodingRatio: number;
  floodedVolumeM3: number;

  targetTime: number;
  targetSeason: number;

  qualityMode: QualityMode;
  renderQuality: RenderQuality;
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;

  keys: ControlState;

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
  setFloodingTelemetry: (
    floodingRatio: number,
    floodedVolumeM3: number,
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
  setHudVisible: (visible: boolean) => void;
  toggleHud: () => void;
  hydrateExperiencePreferences: (
    preferences: Partial<ExperiencePreferences>,
  ) => void;
  setScenarioNavigation: (
    telemetry: ScenarioNavigationTelemetry,
  ) => void;
  setActiveWaypointIndex: (index: number) => void;
  completeScenarioEntities: (
    entityIds: readonly string[],
    message: string,
  ) => void;
  setScenarioCheckpoint: (
    checkpoint: ScenarioCheckpointState,
  ) => void;
  finishScenario: (result: ScenarioResult) => void;
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
    floodingRatio: 0,
    floodedVolumeM3: 0,
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
  hudVisible: true,
  resetVesselTrigger: 0,

  ...createScenarioGameplayState('inactive'),
  scenarioRunId: 0,

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
  setActiveBoat: (activeBoat) => {
    const state = get();
    if (state.activeBoat === activeBoat) return;

    if (state.sessionPhase === 'menu') {
      set({ activeBoat });
      return;
    }

    queueScenarioSpawn(0, 0, 0);
    set({
      activeBoat,
      engineThrust: 0,
      keys: createEmptyKeys(),
      resetVesselTrigger: state.resetVesselTrigger + 1,
      scenarioRunId: state.scenarioRunId + 1,
      ...createScenarioGameplayState('active'),
      ...resetTelemetry(),
    });
  },
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
  setFloodingTelemetry: (floodingRatio, floodedVolumeM3) =>
    set({
      floodingRatio: Math.max(0, Math.min(1, floodingRatio)),
      floodedVolumeM3: Math.max(0, floodedVolumeM3),
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
      ...createScenarioGameplayState('inactive'),
    });
  },
  startScenario: (scenarioId, requestedBoat) => {
    const state = get();
    const activeScenario = scenarioId ?? state.activeScenario;
    const scenario = getScenarioDefinition(activeScenario);
    queueScenarioSpawn(0, 0, 0);
    set({
      activeScenario,
      activeBoat: requestedBoat ?? state.activeBoat,
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
      scenarioRunId: state.scenarioRunId + 1,
      ...createScenarioGameplayState('active'),
      ...resetTelemetry(),
    });
  },
  pauseSession: () =>
    set((state) =>
      state.sessionPhase !== 'running' ||
      state.scenarioRunStatus !== 'active'
        ? {}
        : {
            sessionPhase: 'paused',
            engineThrust: 0,
            keys: createEmptyKeys(),
          },
    ),
  resumeSession: () =>
    set((state) =>
      state.sessionPhase === 'paused' &&
      state.scenarioRunStatus === 'active'
        ? { sessionPhase: 'running', keys: createEmptyKeys() }
        : state.sessionPhase === 'menu'
          ? { sessionPhase: 'running', keys: createEmptyKeys() }
          : {},
    ),
  togglePause: () =>
    set((state) => {
      if (
        state.sessionPhase === 'running' &&
        state.scenarioRunStatus === 'active'
      ) {
        return {
          sessionPhase: 'paused',
          engineThrust: 0,
          keys: createEmptyKeys(),
        };
      }
      if (
        state.sessionPhase === 'paused' &&
        state.scenarioRunStatus === 'active'
      ) {
        return { sessionPhase: 'running', keys: createEmptyKeys() };
      }
      return {};
    }),
  restartScenario: () => {
    const state = get();
    const scenario = getScenarioDefinition(state.activeScenario);
    queueScenarioSpawn(0, 0, 0);
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
      scenarioRunId: state.scenarioRunId + 1,
      ...createScenarioGameplayState('active'),
      ...resetTelemetry(),
    });
  },
  returnToMenu: () =>
    set({
      sessionPhase: 'menu',
      engineThrust: 0,
      keys: createEmptyKeys(),
      ...createScenarioGameplayState('inactive'),
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
  setHudVisible: (hudVisible) => set({ hudVisible }),
  toggleHud: () => set((state) => ({ hudVisible: !state.hudVisible })),
  hydrateExperiencePreferences: (preferences) =>
    set((state) => {
      const activeScenario = isScenarioId(preferences.activeScenario)
        ? preferences.activeScenario
        : state.activeScenario;
      const scenario = getScenarioDefinition(activeScenario);

      return {
        activeScenario,
        activeBoat: isBoatType(preferences.activeBoat)
          ? preferences.activeBoat
          : state.activeBoat,
        cameraMode: isCameraMode(preferences.cameraMode)
          ? preferences.cameraMode
          : state.cameraMode,
        hudVisible:
          typeof preferences.hudVisible === 'boolean'
            ? preferences.hudVisible
            : state.hudVisible,
        windSpeed: scenario.windSpeed,
        windDir: scenario.windDir,
        currentSpeed: scenario.currentSpeed,
        currentDir: scenario.currentDir,
        targetTime: scenario.targetTime,
        targetSeason: scenario.targetSeason,
      };
    }),
  setScenarioNavigation: (telemetry) =>
    set({
      scenarioElapsedSeconds: telemetry.elapsedSeconds,
      scenarioProgress: telemetry.progress,
      navigationDistanceM: telemetry.distanceM,
      navigationBearingDeg: telemetry.bearingDeg,
      navigationRelativeBearingDeg: telemetry.relativeBearingDeg,
      navigationBoatX: telemetry.boatX,
      navigationBoatZ: telemetry.boatZ,
    }),
  setActiveWaypointIndex: (activeWaypointIndex) =>
    set({ activeWaypointIndex }),
  completeScenarioEntities: (entityIds, scenarioEventMessage) =>
    set((state) => ({
      completedScenarioEntityIds: Array.from(
        new Set([...state.completedScenarioEntityIds, ...entityIds]),
      ),
      scenarioEventMessage,
    })),
  setScenarioCheckpoint: (checkpoint) =>
    set({
      scenarioCheckpointId: checkpoint.id,
      scenarioCheckpointLabel: checkpoint.label,
      scenarioCheckpointWaypointIndex: checkpoint.waypointIndex,
      scenarioSpawnX: checkpoint.x,
      scenarioSpawnZ: checkpoint.z,
      scenarioSpawnHeadingDeg: checkpoint.headingDeg,
      scenarioEventMessage: `Recovery checkpoint updated: ${checkpoint.label}.`,
    }),
  finishScenario: (scenarioResult) =>
    set({
      scenarioRunStatus: scenarioResult.outcome,
      scenarioResult,
      scenarioProgress:
        scenarioResult.outcome === 'completed' ? 1 : get().scenarioProgress,
      sessionPhase: 'paused',
      engineThrust: 0,
      keys: createEmptyKeys(),
    }),
  resetVessel: () => {
    const state = get();
    queueScenarioSpawn(
      state.scenarioSpawnX,
      state.scenarioSpawnZ,
      state.scenarioSpawnHeadingDeg,
    );
    set({
      engineThrust: 0,
      keys: createEmptyKeys(),
      resetVesselTrigger: state.resetVesselTrigger + 1,
      scenarioResetCount:
        state.scenarioRunStatus === 'active'
          ? state.scenarioResetCount + 1
          : state.scenarioResetCount,
      scenarioEventMessage: `Vessel recovered at ${state.scenarioCheckpointLabel}.`,
      ...resetTelemetry(),
    });
  },
  fireInstantRepair: () =>
    set((state) => ({
      instantRepairTrigger: state.instantRepairTrigger + 1,
    })),
}));
