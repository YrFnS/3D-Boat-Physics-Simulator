import { create } from 'zustand';
import { Vector3 } from 'three';

export type BoatType = 'trawler' | 'speedboat';

export const MAX_WAKE_NODES = 50;
export const MAX_OBSTACLES = 250;

// Shared high-frequency state that skips React completely to maintain 60fps
export const sharedPhysics = {
  boatPos: new Vector3(0, 0, 0),
  boatDir: new Vector3(0, 0, -1),
  boatSpeed: 0,
  lightningFlash: 0,
  absoluteOdometer: 0,
  wakeNodes: new Float32Array(MAX_WAKE_NODES * 4), 
  wakeDirs: new Float32Array(MAX_WAKE_NODES * 4),
  obstacles: new Float32Array(MAX_OBSTACLES * 4), // x, y, z, radius
  worldTime: 12.0, // Start at Noon
  season: 0.0, // 0=Spring, 0.25=Summer, 0.5=Fall, 0.75=Winter
  tornadoPos: new Vector3(0, 0, 0),
  whirlpoolPos: new Vector3(-400, 0, -400), // Relocated to the South-West corner
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
  hullHealth: number; // 0 to 100
  engineHealth: number; // 0 to 100
  engineTemperature: number; // 0 to 100+
  rudderHealth: number; // 0 to 100
  
  // Environment Targets
  targetTime: number; // 0 to 24
  targetSeason: number; // 0 to 1
  
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
  setWindSpeed: (v: number) => void;
  setWindDir: (v: number) => void;
  setCurrentSpeed: (v: number) => void;
  setCurrentDir: (v: number) => void;
  setEngineThrust: (v: number) => void;
  setActiveBoat: (v: BoatType) => void;
  setTelemetry: (speed: number, heading: number, hull: number, engine: number, temp: number, rudder: number) => void;
  setKey: (key: string, v: boolean) => void;
  setTargetTime: (v: number) => void;
  setTargetSeason: (v: number) => void;
  instantRepairTrigger: number;
  fireInstantRepair: () => void;
}

export const useSimStore = create<SimState>((set) => ({
  windSpeed: 8,
  windDir: 90, // East Wind
  currentSpeed: 3,
  currentDir: 0, // Flowing South to North (-Z direction)
  engineThrust: 0,
  activeBoat: 'trawler',
  
  speedKnots: 0,
  heading: 0,
  hullHealth: 100,
  engineHealth: 100,
  engineTemperature: 20, // ambient start
  rudderHealth: 100,
  
  keys: {
    w: false, s: false, a: false, d: false, r: false,
    arrowup: false, arrowdown: false, arrowleft: false, arrowright: false,
  },
  
  targetTime: 12,
  targetSeason: 0,
  
  instantRepairTrigger: 0,

  setWindSpeed: (v) => set({ windSpeed: v }),
  setWindDir: (v) => set({ windDir: v }),
  setCurrentSpeed: (v) => set({ currentSpeed: v }),
  setCurrentDir: (v) => set({ currentDir: v }),
  setEngineThrust: (v) => set({ engineThrust: v }),
  setActiveBoat: (v) => set({ activeBoat: v }),
  setTelemetry: (speedKnots, heading, hullHealth, engineHealth, engineTemperature, rudderHealth) => set({ speedKnots, heading, hullHealth, engineHealth, engineTemperature, rudderHealth }),
  setKey: (key, v) => set((state) => ({ keys: { ...state.keys, [key]: v } })),
  setTargetTime: (v) => set({ targetTime: v }),
  setTargetSeason: (v) => set({ targetSeason: v }),
  fireInstantRepair: () => set((state) => ({ instantRepairTrigger: state.instantRepairTrigger + 1 })),
}));
