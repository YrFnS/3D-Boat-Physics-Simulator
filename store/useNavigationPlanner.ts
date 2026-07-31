import { create } from 'zustand';
import { resolveNavigablePosition } from '@/sim/scenarios/ScenarioRoute';

export type NavigationMode = 'mission' | 'free';
export type FreeNavigationStatus = 'idle' | 'active' | 'completed';

export interface FreeNavigationWaypoint {
  id: string;
  label: string;
  x: number;
  z: number;
  sourceX: number;
  sourceZ: number;
  radiusM: number;
  adjustedForSafety: boolean;
}

export interface FreeNavigationTelemetry {
  elapsedSeconds: number;
  progress: number;
  distanceM: number;
  bearingDeg: number;
  relativeBearingDeg: number;
}

interface NavigationPlannerState extends FreeNavigationTelemetry {
  mode: NavigationMode;
  status: FreeNavigationStatus;
  waypoints: FreeNavigationWaypoint[];
  activeWaypointIndex: number;

  setMode: (mode: NavigationMode) => void;
  addWaypoint: (x: number, z: number) => void;
  undoWaypoint: () => void;
  clearWaypoints: () => void;
  restartFreeRoute: () => void;
  setTelemetry: (telemetry: FreeNavigationTelemetry) => void;
  setActiveWaypointIndex: (index: number) => void;
  completeFreeRoute: () => void;
  resetForScenario: () => void;
}

export const MAX_FREE_NAVIGATION_WAYPOINTS = 8;

function createTelemetry(): FreeNavigationTelemetry {
  return {
    elapsedSeconds: 0,
    progress: 0,
    distanceM: 0,
    bearingDeg: 0,
    relativeBearingDeg: 0,
  };
}

export const useNavigationPlanner = create<NavigationPlannerState>((set) => ({
  mode: 'mission',
  status: 'idle',
  waypoints: [],
  activeWaypointIndex: 0,
  ...createTelemetry(),

  setMode: (mode) =>
    set((state) => ({
      mode,
      status:
        mode === 'free'
          ? state.waypoints.length > 0
            ? state.status === 'completed'
              ? 'completed'
              : 'active'
            : 'idle'
          : state.status,
    })),

  addWaypoint: (sourceX, sourceZ) =>
    set((state) => {
      if (state.waypoints.length >= MAX_FREE_NAVIGATION_WAYPOINTS) {
        return { mode: 'free' };
      }

      const index = state.waypoints.length;
      const resolved = resolveNavigablePosition(
        sourceX,
        sourceZ,
        500 + index,
      );
      const waypoint: FreeNavigationWaypoint = {
        id: `free-waypoint-${index + 1}`,
        label: `Plotted mark ${index + 1}`,
        radiusM: 20,
        ...resolved,
      };
      const waypoints = [...state.waypoints, waypoint];
      const activeWaypointIndex =
        state.status === 'completed'
          ? waypoints.length - 1
          : Math.min(state.activeWaypointIndex, waypoints.length - 1);

      return {
        mode: 'free',
        status: 'active',
        waypoints,
        activeWaypointIndex,
        progress:
          state.status === 'completed'
            ? Math.max(0, (waypoints.length - 1) / waypoints.length)
            : state.progress,
      };
    }),

  undoWaypoint: () =>
    set((state) => {
      if (state.waypoints.length === 0) return {};
      const waypoints = state.waypoints.slice(0, -1);
      const activeWaypointIndex = Math.min(
        state.activeWaypointIndex,
        Math.max(0, waypoints.length - 1),
      );

      return {
        waypoints,
        activeWaypointIndex,
        status: waypoints.length > 0 ? 'active' : 'idle',
        ...createTelemetry(),
      };
    }),

  clearWaypoints: () =>
    set({
      waypoints: [],
      activeWaypointIndex: 0,
      status: 'idle',
      ...createTelemetry(),
    }),

  restartFreeRoute: () =>
    set((state) => ({
      mode: 'free',
      activeWaypointIndex: 0,
      status: state.waypoints.length > 0 ? 'active' : 'idle',
      ...createTelemetry(),
    })),

  setTelemetry: (telemetry) => set(telemetry),

  setActiveWaypointIndex: (activeWaypointIndex) =>
    set({ activeWaypointIndex }),

  completeFreeRoute: () =>
    set({
      status: 'completed',
      progress: 1,
      distanceM: 0,
    }),

  resetForScenario: () =>
    set({
      mode: 'mission',
      status: 'idle',
      waypoints: [],
      activeWaypointIndex: 0,
      ...createTelemetry(),
    }),
}));

export function getActiveFreeNavigationWaypoint() {
  const state = useNavigationPlanner.getState();
  return state.waypoints[state.activeWaypointIndex] ?? null;
}
