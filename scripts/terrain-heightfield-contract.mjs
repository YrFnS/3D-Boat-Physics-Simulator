import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getSharedTerrainHeightfield,
  sampleTerrainHeightfield,
  TERRAIN_HEIGHTFIELD_SEGMENTS,
  TERRAIN_MIN_HEIGHT_M,
  TERRAIN_WORLD_HALF_SIZE_M,
} from '../sim/terrain/TerrainHeightfield.ts';

const EPSILON = 1e-5;
const terrain = getSharedTerrainHeightfield();
assert.equal(
  terrain,
  getSharedTerrainHeightfield(),
  'The canonical terrain mesh must be cached and shared.',
);
assert.equal(TERRAIN_HEIGHTFIELD_SEGMENTS, 128);
assert.equal(terrain.segments, 128);
assert.equal(terrain.pointsPerAxis, 129);
assert.equal(
  terrain.vertices.length,
  terrain.pointsPerAxis * terrain.pointsPerAxis * 3,
);
assert.equal(
  terrain.heights.length,
  terrain.pointsPerAxis * terrain.pointsPerAxis,
);
assert.equal(
  terrain.indices.length,
  terrain.segments * terrain.segments * 6,
);
assert.deepEqual(
  Array.from(terrain.indices.slice(0, 6)),
  [0, 129, 1, 1, 129, 130],
  'The shared diagonal must match the visible and Rapier triangles.',
);

function assertClose(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

for (const [xIndex, zIndex] of [
  [0, 0],
  [17, 43],
  [64, 64],
  [128, 128],
]) {
  const vertexIndex =
    zIndex * terrain.pointsPerAxis + xIndex;
  const x =
    -terrain.halfSizeM + xIndex * terrain.cellSizeM;
  const z =
    -terrain.halfSizeM + zIndex * terrain.cellSizeM;
  assertClose(
    terrain.vertices[vertexIndex * 3 + 1],
    terrain.heights[vertexIndex],
    `vertex ${xIndex},${zIndex} storage`,
  );
  assertClose(
    sampleTerrainHeightfield(x, z),
    terrain.heights[vertexIndex],
    `vertex ${xIndex},${zIndex} sample`,
  );
}

function expectedTriangleHeight(
  cellX,
  cellZ,
  localX,
  localZ,
) {
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

for (const sample of [
  [3, 5, 0.2, 0.35],
  [37, 91, 0.8, 0.65],
  [64, 64, 0.5, 0.5],
  [126, 2, 0.95, 0.2],
]) {
  const [cellX, cellZ, localX, localZ] = sample;
  const x =
    -terrain.halfSizeM +
    (cellX + localX) * terrain.cellSizeM;
  const z =
    -terrain.halfSizeM +
    (cellZ + localZ) * terrain.cellSizeM;
  assertClose(
    sampleTerrainHeightfield(x, z),
    expectedTriangleHeight(
      cellX,
      cellZ,
      localX,
      localZ,
    ),
    `triangle ${cellX},${cellZ}`,
  );
}

assert.equal(
  sampleTerrainHeightfield(
    TERRAIN_WORLD_HALF_SIZE_M + 1,
    0,
  ),
  TERRAIN_MIN_HEIGHT_M,
);
assert.equal(
  sampleTerrainHeightfield(Number.NaN, 0),
  TERRAIN_MIN_HEIGHT_M,
);

const sources = {
  islands: await fs.readFile(
    new URL('../components/Islands.tsx', import.meta.url),
    'utf8',
  ),
  ocean: await fs.readFile(
    new URL('../components/Ocean.tsx', import.meta.url),
    'utf8',
  ),
  buoys: await fs.readFile(
    new URL('../components/Buoys.tsx', import.meta.url),
    'utf8',
  ),
  route: await fs.readFile(
    new URL('../sim/scenarios/ScenarioRoute.ts', import.meta.url),
    'utf8',
  ),
  rapier: await fs.readFile(
    new URL(
      '../sim/collision/RapierCollisionWorld.ts',
      import.meta.url,
    ),
    'utf8',
  ),
};

assert.match(sources.islands, /getSharedTerrainHeightfield\(\)/);
assert.match(sources.islands, /new BufferGeometry\(\)/);
assert.doesNotMatch(sources.islands, /config\.segments/);
assert.doesNotMatch(sources.islands, /snowDisplacement/);
assert.doesNotMatch(sources.islands, /uSnowDisplacement/);
assert.match(
  sources.rapier,
  /const terrain = getSharedTerrainHeightfield\(\);/,
);
assert.doesNotMatch(sources.rapier, /createTerrainMesh/);
assert.doesNotMatch(sources.rapier, /TERRAIN_SEGMENTS/);
assert.match(sources.ocean, /terrain\.heights\[/);
assert.match(sources.buoys, /sampleTerrainHeightfield\(/);
assert.match(sources.route, /sampleTerrainHeightfield\(/);

async function collectSourceFiles(directory) {
  const entries = await fs.readdir(directory, {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const repositoryRoot = fileURLToPath(
  new URL('..', import.meta.url),
);
const allowedDirectProceduralConsumers = new Set([
  path.join(repositoryRoot, 'lib/terrain.ts'),
  path.join(
    repositoryRoot,
    'sim/terrain/TerrainHeightfield.ts',
  ),
]);
for (const sourceRoot of ['components', 'sim', 'store', 'lib']) {
  const files = await collectSourceFiles(
    path.join(repositoryRoot, sourceRoot),
  );
  for (const file of files) {
    if (allowedDirectProceduralConsumers.has(file)) continue;
    const source = await fs.readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /getTerrainHeight/,
      `${path.relative(repositoryRoot, file)} must sample the canonical heightfield instead of the procedural source.`,
    );
  }
}

console.log('Terrain heightfield contract passed.');
