import { getTerrainHeight } from '../../lib/terrain.ts';

export const TERRAIN_WORLD_SIZE_M = 3_000;
export const TERRAIN_WORLD_HALF_SIZE_M =
  TERRAIN_WORLD_SIZE_M * 0.5;
export const TERRAIN_HEIGHTFIELD_SEGMENTS = 128;
export const TERRAIN_HEIGHTFIELD_POINTS_PER_AXIS =
  TERRAIN_HEIGHTFIELD_SEGMENTS + 1;
export const TERRAIN_HEIGHTFIELD_CELL_SIZE_M =
  TERRAIN_WORLD_SIZE_M / TERRAIN_HEIGHTFIELD_SEGMENTS;
export const TERRAIN_MIN_HEIGHT_M = -140;
export const TERRAIN_MAX_HEIGHT_M = 120;

export interface TerrainHeightfieldData {
  readonly version: 1;
  readonly worldSizeM: number;
  readonly halfSizeM: number;
  readonly segments: number;
  readonly pointsPerAxis: number;
  readonly cellSizeM: number;
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly heights: Float32Array;
}

let sharedTerrainHeightfield: TerrainHeightfieldData | null = null;

function clampHeight(height: number) {
  if (!Number.isFinite(height)) return TERRAIN_MIN_HEIGHT_M;
  return Math.max(
    TERRAIN_MIN_HEIGHT_M,
    Math.min(TERRAIN_MAX_HEIGHT_M, height),
  );
}

function createTerrainHeightfield(): TerrainHeightfieldData {
  const pointsPerAxis = TERRAIN_HEIGHTFIELD_POINTS_PER_AXIS;
  const vertices = new Float32Array(
    pointsPerAxis * pointsPerAxis * 3,
  );
  const heights = new Float32Array(
    pointsPerAxis * pointsPerAxis,
  );
  const indices = new Uint32Array(
    TERRAIN_HEIGHTFIELD_SEGMENTS *
      TERRAIN_HEIGHTFIELD_SEGMENTS *
      6,
  );

  let vertexOffset = 0;
  for (
    let zIndex = 0;
    zIndex < pointsPerAxis;
    zIndex += 1
  ) {
    const z =
      -TERRAIN_WORLD_HALF_SIZE_M +
      zIndex * TERRAIN_HEIGHTFIELD_CELL_SIZE_M;
    for (
      let xIndex = 0;
      xIndex < pointsPerAxis;
      xIndex += 1
    ) {
      const x =
        -TERRAIN_WORLD_HALF_SIZE_M +
        xIndex * TERRAIN_HEIGHTFIELD_CELL_SIZE_M;
      const vertexIndex = zIndex * pointsPerAxis + xIndex;
      const height = clampHeight(getTerrainHeight(x, z));

      vertices[vertexOffset] = x;
      vertices[vertexOffset + 1] = height;
      vertices[vertexOffset + 2] = z;
      heights[vertexIndex] = vertices[vertexOffset + 1];
      vertexOffset += 3;
    }
  }

  let indexOffset = 0;
  for (
    let zIndex = 0;
    zIndex < TERRAIN_HEIGHTFIELD_SEGMENTS;
    zIndex += 1
  ) {
    for (
      let xIndex = 0;
      xIndex < TERRAIN_HEIGHTFIELD_SEGMENTS;
      xIndex += 1
    ) {
      const a = zIndex * pointsPerAxis + xIndex;
      const b = a + 1;
      const c = a + pointsPerAxis;
      const d = c + 1;

      // Both Three.js and Rapier consume this exact indexed
      // triangulation. The diagonal runs from b to c.
      indices[indexOffset] = a;
      indices[indexOffset + 1] = c;
      indices[indexOffset + 2] = b;
      indices[indexOffset + 3] = b;
      indices[indexOffset + 4] = c;
      indices[indexOffset + 5] = d;
      indexOffset += 6;
    }
  }

  return Object.freeze({
    version: 1 as const,
    worldSizeM: TERRAIN_WORLD_SIZE_M,
    halfSizeM: TERRAIN_WORLD_HALF_SIZE_M,
    segments: TERRAIN_HEIGHTFIELD_SEGMENTS,
    pointsPerAxis,
    cellSizeM: TERRAIN_HEIGHTFIELD_CELL_SIZE_M,
    vertices,
    indices,
    heights,
  });
}

export function getSharedTerrainHeightfield() {
  sharedTerrainHeightfield ??= createTerrainHeightfield();
  return sharedTerrainHeightfield;
}

/**
 * Samples the same two triangles used by the visible and Rapier
 * surfaces. CPU route, buoy, and shoreline decisions therefore
 * cannot observe a different shoreline than the collision mesh.
 */
export function sampleTerrainHeightfield(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return TERRAIN_MIN_HEIGHT_M;
  }
  if (
    x < -TERRAIN_WORLD_HALF_SIZE_M ||
    x > TERRAIN_WORLD_HALF_SIZE_M ||
    z < -TERRAIN_WORLD_HALF_SIZE_M ||
    z > TERRAIN_WORLD_HALF_SIZE_M
  ) {
    return TERRAIN_MIN_HEIGHT_M;
  }

  const terrain = getSharedTerrainHeightfield();
  const gridX =
    (x + TERRAIN_WORLD_HALF_SIZE_M) /
    TERRAIN_HEIGHTFIELD_CELL_SIZE_M;
  const gridZ =
    (z + TERRAIN_WORLD_HALF_SIZE_M) /
    TERRAIN_HEIGHTFIELD_CELL_SIZE_M;
  const cellX = Math.min(
    TERRAIN_HEIGHTFIELD_SEGMENTS - 1,
    Math.max(0, Math.floor(gridX)),
  );
  const cellZ = Math.min(
    TERRAIN_HEIGHTFIELD_SEGMENTS - 1,
    Math.max(0, Math.floor(gridZ)),
  );
  const localX = Math.max(
    0,
    Math.min(1, gridX - cellX),
  );
  const localZ = Math.max(
    0,
    Math.min(1, gridZ - cellZ),
  );
  const a = cellZ * terrain.pointsPerAxis + cellX;
  const b = a + 1;
  const c = a + terrain.pointsPerAxis;
  const d = c + 1;
  const heightA = terrain.heights[a];
  const heightB = terrain.heights[b];
  const heightC = terrain.heights[c];
  const heightD = terrain.heights[d];

  if (localX + localZ <= 1) {
    return (
      heightA +
      localX * (heightB - heightA) +
      localZ * (heightC - heightA)
    );
  }

  return (
    (1 - localZ) * heightB +
    (1 - localX) * heightC +
    (localX + localZ - 1) * heightD
  );
}
