import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  distanceToWhirlpoolBasinCenterM,
  WHIRLPOOL_BASIN_CENTER_X_M,
  WHIRLPOOL_BASIN_CENTER_Z_M,
  WHIRLPOOL_MIN_ROUTE_DISTANCE_FROM_HAZARD_M,
  WHIRLPOOL_ORBIT_RADIUS_M,
  WHIRLPOOL_ROUTE_CLEARANCE_RADIUS_M,
  WHIRLPOOL_TERRAIN_CLEARANCE_RADIUS_M,
} from '../sim/world/WorldEnvironment.ts';

assert.equal(
  distanceToWhirlpoolBasinCenterM(
    WHIRLPOOL_BASIN_CENTER_X_M,
    WHIRLPOOL_BASIN_CENTER_Z_M,
  ),
  0,
  'The immutable basin center must have zero self-distance.',
);
assert.equal(
  WHIRLPOOL_ROUTE_CLEARANCE_RADIUS_M,
  WHIRLPOOL_MIN_ROUTE_DISTANCE_FROM_HAZARD_M +
    WHIRLPOOL_ORBIT_RADIUS_M,
  'Route clearance must contain the complete moving hazard envelope.',
);
assert.ok(
  WHIRLPOOL_TERRAIN_CLEARANCE_RADIUS_M >=
    WHIRLPOOL_ROUTE_CLEARANCE_RADIUS_M,
  'The cleared seabed basin must contain every route-excluded whirlpool position.',
);

const terrainSource = await fs.readFile(
  new URL('../lib/terrain.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  terrainSource,
  /sharedPhysics/,
  'Cached terrain generation must not read mutable simulation state.',
);
assert.match(
  terrainSource,
  /distanceToWhirlpoolBasinCenterM/,
  'Terrain generation must use the immutable whirlpool basin center.',
);

const routeSource = await fs.readFile(
  new URL('../sim/scenarios/ScenarioRoute.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  routeSource,
  /sharedPhysics/,
  'Cached route resolution must not read a moving hazard position.',
);
assert.match(
  routeSource,
  /WHIRLPOOL_ROUTE_CLEARANCE_RADIUS_M/,
  'Route resolution must reserve the complete moving whirlpool envelope.',
);

const environmentSource = await fs.readFile(
  new URL('../components/EnvironmentRig.tsx', import.meta.url),
  'utf8',
);
assert.match(
  environmentSource,
  /canAdvanceAuthoritativeSimulation/,
  'Hazard movement must be gated by running-session authority.',
);
assert.match(
  environmentSource,
  /hazardTimeRef\.current \+= authoritativeDelta/,
  'Hazard movement must use the running-only accumulated world delta.',
);
assert.doesNotMatch(
  environmentSource,
  /const elapsed = state\.clock\.elapsedTime/,
  'Hazards must not jump according to wall-clock time after a pause.',
);

console.log('World environment contract passed.');
