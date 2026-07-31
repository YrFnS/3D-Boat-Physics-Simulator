import { getTerrainHeight } from '@/lib/terrain';
import { sharedPhysics } from '@/store/useSimStore';
import {
  getScenarioDefinition,
  type ScenarioId,
  type ScenarioWaypointDefinition,
} from '@/sim/scenarios/ScenarioCatalog';

export interface ResolvedScenarioWaypoint
  extends ScenarioWaypointDefinition {
  sourceX: number;
  sourceZ: number;
  adjustedForSafety: boolean;
}

const WATER_DEPTH_THRESHOLD_M = -1.4;
const SEARCH_STEP_M = 18;
const SEARCH_RINGS = 14;
const SEARCH_SAMPLES_PER_RING = 20;
const MIN_WHIRLPOOL_DISTANCE_M = 230;
const routeCache = new Map<ScenarioId, readonly ResolvedScenarioWaypoint[]>();

function isNavigableWater(x: number, z: number) {
  const terrainHeight = getTerrainHeight(x, z);
  const whirlpoolDistance = Math.hypot(
    x - sharedPhysics.whirlpoolPos.x,
    z - sharedPhysics.whirlpoolPos.z,
  );

  return (
    Number.isFinite(terrainHeight) &&
    terrainHeight <= WATER_DEPTH_THRESHOLD_M &&
    whirlpoolDistance >= MIN_WHIRLPOOL_DISTANCE_M
  );
}

function resolveWaypoint(
  waypoint: ScenarioWaypointDefinition,
  waypointIndex: number,
): ResolvedScenarioWaypoint {
  if (isNavigableWater(waypoint.x, waypoint.z)) {
    return {
      ...waypoint,
      sourceX: waypoint.x,
      sourceZ: waypoint.z,
      adjustedForSafety: false,
    };
  }

  for (let ring = 1; ring <= SEARCH_RINGS; ring += 1) {
    const radius = ring * SEARCH_STEP_M;
    const phase = waypointIndex * 0.91 + ring * 0.37;

    for (let sample = 0; sample < SEARCH_SAMPLES_PER_RING; sample += 1) {
      const angle =
        phase + (sample / SEARCH_SAMPLES_PER_RING) * Math.PI * 2;
      const x = waypoint.x + Math.cos(angle) * radius;
      const z = waypoint.z + Math.sin(angle) * radius;

      if (isNavigableWater(x, z)) {
        return {
          ...waypoint,
          x,
          z,
          sourceX: waypoint.x,
          sourceZ: waypoint.z,
          adjustedForSafety: true,
        };
      }
    }
  }

  return {
    ...waypoint,
    sourceX: waypoint.x,
    sourceZ: waypoint.z,
    adjustedForSafety: false,
  };
}

export function getResolvedScenarioRoute(
  scenarioId: ScenarioId,
): readonly ResolvedScenarioWaypoint[] {
  const cachedRoute = routeCache.get(scenarioId);
  if (cachedRoute) return cachedRoute;

  const scenario = getScenarioDefinition(scenarioId);
  const route = scenario.mission.waypoints.map(resolveWaypoint);
  routeCache.set(scenarioId, route);
  return route;
}
