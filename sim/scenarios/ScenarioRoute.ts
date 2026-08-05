import { getTerrainHeight } from '@/lib/terrain';
import {
  distanceToWhirlpoolBasinCenterM,
  WHIRLPOOL_ROUTE_CLEARANCE_RADIUS_M,
} from '@/sim/world/WorldEnvironment';
import {
  getScenarioDefinition,
  type ScenarioCheckpointDefinition,
  type ScenarioEntityDefinition,
  type ScenarioId,
  type ScenarioWaypointDefinition,
} from '@/sim/scenarios/ScenarioCatalog';

export interface ResolvedNavigablePosition {
  x: number;
  z: number;
  sourceX: number;
  sourceZ: number;
  adjustedForSafety: boolean;
}

export interface ResolvedScenarioWaypoint
  extends ScenarioWaypointDefinition,
    ResolvedNavigablePosition {}

export interface ResolvedScenarioEntity
  extends ScenarioEntityDefinition,
    ResolvedNavigablePosition {}

export interface ResolvedScenarioCheckpoint
  extends ScenarioCheckpointDefinition {
  waypointIndex: number;
  x: number;
  z: number;
  headingDeg: number;
}

const WATER_DEPTH_THRESHOLD_M = -1.4;
const SEARCH_STEP_M = 18;
const SEARCH_RINGS = 14;
const SEARCH_SAMPLES_PER_RING = 20;
const routeCache = new Map<ScenarioId, readonly ResolvedScenarioWaypoint[]>();
const entityCache = new Map<ScenarioId, readonly ResolvedScenarioEntity[]>();
const checkpointCache = new Map<
  ScenarioId,
  readonly ResolvedScenarioCheckpoint[]
>();

export function isNavigableWater(x: number, z: number) {
  const terrainHeight = getTerrainHeight(x, z);
  const whirlpoolBasinDistance = distanceToWhirlpoolBasinCenterM(x, z);

  return (
    Number.isFinite(terrainHeight) &&
    terrainHeight <= WATER_DEPTH_THRESHOLD_M &&
    whirlpoolBasinDistance >= WHIRLPOOL_ROUTE_CLEARANCE_RADIUS_M
  );
}

export function resolveNavigablePosition(
  sourceX: number,
  sourceZ: number,
  phaseSeed = 0,
): ResolvedNavigablePosition {
  if (isNavigableWater(sourceX, sourceZ)) {
    return {
      x: sourceX,
      z: sourceZ,
      sourceX,
      sourceZ,
      adjustedForSafety: false,
    };
  }

  for (let ring = 1; ring <= SEARCH_RINGS; ring += 1) {
    const radius = ring * SEARCH_STEP_M;
    const phase = phaseSeed * 0.91 + ring * 0.37;

    for (let sample = 0; sample < SEARCH_SAMPLES_PER_RING; sample += 1) {
      const angle =
        phase + (sample / SEARCH_SAMPLES_PER_RING) * Math.PI * 2;
      const x = sourceX + Math.cos(angle) * radius;
      const z = sourceZ + Math.sin(angle) * radius;

      if (isNavigableWater(x, z)) {
        return {
          x,
          z,
          sourceX,
          sourceZ,
          adjustedForSafety: true,
        };
      }
    }
  }

  return {
    x: sourceX,
    z: sourceZ,
    sourceX,
    sourceZ,
    adjustedForSafety: false,
  };
}

function resolveWaypoint(
  waypoint: ScenarioWaypointDefinition,
  waypointIndex: number,
): ResolvedScenarioWaypoint {
  return {
    ...waypoint,
    ...resolveNavigablePosition(
      waypoint.x,
      waypoint.z,
      waypointIndex,
    ),
  };
}

function normalizeBearing(degrees: number) {
  return ((degrees % 360) + 360) % 360;
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

export function getResolvedScenarioEntities(
  scenarioId: ScenarioId,
): readonly ResolvedScenarioEntity[] {
  const cachedEntities = entityCache.get(scenarioId);
  if (cachedEntities) return cachedEntities;

  const scenario = getScenarioDefinition(scenarioId);
  const route = getResolvedScenarioRoute(scenarioId);
  const entities = scenario.mission.entities.map((entity, index) => {
    const waypoint = route.find(
      (candidate) => candidate.id === entity.waypointId,
    );
    const sourceX = (waypoint?.x ?? 0) + (entity.offsetX ?? 0);
    const sourceZ = (waypoint?.z ?? 0) + (entity.offsetZ ?? 0);

    return {
      ...entity,
      ...resolveNavigablePosition(sourceX, sourceZ, 100 + index),
    };
  });

  entityCache.set(scenarioId, entities);
  return entities;
}

export function getResolvedScenarioCheckpoints(
  scenarioId: ScenarioId,
): readonly ResolvedScenarioCheckpoint[] {
  const cachedCheckpoints = checkpointCache.get(scenarioId);
  if (cachedCheckpoints) return cachedCheckpoints;

  const scenario = getScenarioDefinition(scenarioId);
  const route = getResolvedScenarioRoute(scenarioId);
  const checkpoints = scenario.mission.checkpoints.flatMap((checkpoint) => {
    const waypointIndex = route.findIndex(
      (waypoint) => waypoint.id === checkpoint.waypointId,
    );
    if (waypointIndex < 0) return [];

    const waypoint = route[waypointIndex];
    const headingTarget =
      route[Math.min(waypointIndex + 1, route.length - 1)] ?? waypoint;
    const headingSource =
      headingTarget === waypoint
        ? route[Math.max(0, waypointIndex - 1)] ?? { x: 0, z: 0 }
        : waypoint;
    const headingDeg = normalizeBearing(
      (Math.atan2(
        headingTarget.x - headingSource.x,
        -(headingTarget.z - headingSource.z),
      ) *
        180) /
        Math.PI,
    );

    return [
      {
        ...checkpoint,
        waypointIndex,
        x: waypoint.x,
        z: waypoint.z,
        headingDeg,
      },
    ];
  });

  checkpointCache.set(scenarioId, checkpoints);
  return checkpoints;
}
