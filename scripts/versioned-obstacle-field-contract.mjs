import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  OBSTACLE_POSITION_EPSILON_M,
  VersionedObstacleField,
} from '../sim/collision/VersionedObstacleField.ts';

const field = new VersionedObstacleField(4, 8);
const changed = [];

const initial = field.collectChangedIndicesSince(-1, changed);
assert.equal(initial.version, 0);
assert.equal(initial.fullSync, true);
assert.deepEqual(changed, [0, 1, 2, 3]);

const unchanged = field.collectChangedIndicesSince(0, changed);
assert.equal(unchanged.fullSync, false);
assert.deepEqual(changed, []);

assert.equal(field.set(1, 10, 0, -5, 1), true);
assert.equal(field.version, 1);
assert.equal(field.set(1, 10, 0, -5, 1), false);
assert.equal(field.version, 1);
assert.equal(
  field.set(
    1,
    10,
    OBSTACLE_POSITION_EPSILON_M * 0.5,
    -5,
    1,
  ),
  false,
  'Sub-centimetre visual movement must not dirty the collider.',
);

assert.equal(field.set(1, 10, 0.05, -5, 1), true);
assert.equal(field.set(1, 10, 0.1, -5, 1), true);
assert.equal(field.set(2, -3, 1, 4, 0.8), true);
const incremental = field.collectChangedIndicesSince(1, changed);
assert.equal(incremental.fullSync, false);
assert.equal(incremental.version, 4);
assert.deepEqual(
  changed,
  [1, 2],
  'Repeated changes to one slot must be deduplicated per sync.',
);

assert.equal(field.clear(1), true);
assert.equal(field.clear(1), false);
field.collectChangedIndicesSince(4, changed);
assert.deepEqual(changed, [1]);
assert.equal(field.data[1 * 4 + 3], 0);

assert.equal(field.set(3, Number.NaN, 0, 0, 1), false);
assert.throws(() => field.set(4, 0, 0, 0, 1), RangeError);

const shortHistory = new VersionedObstacleField(3, 2);
shortHistory.set(0, 0, 0, 0, 1);
shortHistory.set(1, 1, 0, 0, 1);
shortHistory.set(2, 2, 0, 0, 1);
const recovered = shortHistory.collectChangedIndicesSince(0, changed);
assert.equal(recovered.fullSync, true);
assert.deepEqual(changed, [0, 1, 2]);

const storeSource = await fs.readFile(
  new URL('../store/useSimStore.ts', import.meta.url),
  'utf8',
);
const buoySource = await fs.readFile(
  new URL('../components/Buoys.tsx', import.meta.url),
  'utf8',
);
const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const rapierSource = await fs.readFile(
  new URL(
    '../sim/collision/RapierCollisionWorld.ts',
    import.meta.url,
  ),
  'utf8',
);

assert.match(
  storeSource,
  /obstacleField: sharedObstacleField/,
  'Shared physics must expose the versioned obstacle authority.',
);
assert.doesNotMatch(
  storeSource,
  /obstacles: new Float32Array/,
  'The raw unversioned obstacle array must not return.',
);
assert.match(buoySource, /sharedPhysics\.obstacleField\.set\(/);
assert.match(buoySource, /sharedPhysics\.obstacleField\.clear\(id\)/);
assert.doesNotMatch(buoySource, /sharedPhysics\.obstacles\[/);
assert.match(
  boatSource,
  /sharedPhysics\.obstacleField,/,
  'Boat must pass the obstacle authority into Rapier.',
);
assert.match(
  rapierSource,
  /if \(obstacleField\.version === this\.lastObstacleVersion\) return;/,
  'Unchanged physics steps must skip obstacle synchronization.',
);
assert.match(
  rapierSource,
  /collectChangedIndicesSince\(/,
  'Rapier must request only slots changed since its revision.',
);
assert.doesNotMatch(
  rapierSource,
  /for \(let index = 0; index < MAX_OBSTACLES; index \+= 1\)/,
  'The per-step 250-slot scan must not return.',
);

console.log('Versioned obstacle field contract passed.');
