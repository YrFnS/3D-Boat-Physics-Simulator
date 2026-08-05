import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  CollisionContactLifecycle,
} from '../sim/collision/CollisionContactLifecycle.ts';

const STEP_SECONDS = 1 / 60;
const lifecycle = new CollisionContactLifecycle(0.12);
const terrainBow = {
  pairKey: 'vessel-bow:terrain',
  externalKey: 'terrain',
  kind: 'terrain',
};
const terrainCenter = {
  pairKey: 'vessel-center:terrain',
  externalKey: 'terrain',
  kind: 'terrain',
};

let summary = lifecycle.advance(
  [terrainBow, terrainBow, terrainCenter],
  STEP_SECONDS,
);
assert.equal(
  summary.contactStartCount,
  1,
  'Compound hull pieces touching one terrain collider must emit one start.',
);
assert.equal(summary.terrainContactStartCount, 1);
assert.equal(summary.obstacleContactStartCount, 0);
assert.equal(summary.activeContactPairCount, 2);
assert.equal(summary.activeExternalContactCount, 1);

for (let step = 0; step < 180; step += 1) {
  summary = lifecycle.advance(
    [terrainBow, terrainCenter],
    STEP_SECONDS,
  );
  assert.equal(
    summary.contactStartCount,
    0,
    'A sustained grounding must not emit per-step collision starts.',
  );
}

summary = lifecycle.advance([terrainCenter], STEP_SECONDS);
assert.equal(
  summary.contactStartCount,
  0,
  'Moving a contact between compound hull pieces must remain one event.',
);
assert.equal(summary.activeExternalContactCount, 1);

summary = lifecycle.advance([], 0.05);
assert.equal(summary.contactEndCount, 0);
assert.equal(summary.activeExternalContactCount, 0);

summary = lifecycle.advance([terrainBow], 0.04);
assert.equal(
  summary.contactStartCount,
  0,
  'A brief solver dropout inside the release grace must not re-score.',
);
assert.equal(summary.activeExternalContactCount, 1);

summary = lifecycle.advance([], 0.07);
assert.equal(summary.contactEndCount, 0);
summary = lifecycle.advance([], 0.06);
assert.equal(
  summary.contactEndCount,
  1,
  'A contact must end after sustained separation.',
);

summary = lifecycle.advance([terrainBow], STEP_SECONDS);
assert.equal(
  summary.contactStartCount,
  1,
  'A new impact after full separation must emit a new event.',
);

const classified = new CollisionContactLifecycle();
summary = classified.advance(
  [
    {
      pairKey: 'vessel-bow:probe',
      externalKey: 'probe',
      kind: 'obstacle',
      debugProbe: true,
    },
    {
      pairKey: 'vessel-center:fixture',
      externalKey: 'fixture',
      kind: 'obstacle',
      fixture: true,
    },
  ],
  STEP_SECONDS,
);
assert.equal(summary.contactStartCount, 2);
assert.equal(summary.obstacleContactStartCount, 2);
assert.equal(summary.debugProbeContactStartCount, 1);
assert.equal(summary.fixtureContactStartCount, 1);

classified.reset();
summary = classified.advance(
  [
    {
      pairKey: 'vessel-bow:probe',
      externalKey: 'probe',
      kind: 'obstacle',
      debugProbe: true,
    },
  ],
  STEP_SECONDS,
);
assert.equal(
  summary.contactStartCount,
  1,
  'Resetting a vessel generation must reset contact identity.',
);

const rapierSource = await fs.readFile(
  new URL(
    '../sim/collision/RapierCollisionWorld.ts',
    import.meta.url,
  ),
  'utf8',
);
const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const calibrationSource = await fs.readFile(
  new URL(
    '../sim/calibration/CollisionCalibration.ts',
    import.meta.url,
  ),
  'utf8',
);

assert.match(
  rapierSource,
  /new CollisionContactLifecycle\(\)/,
  'Rapier must own one lifecycle tracker per collision world.',
);
assert.match(
  rapierSource,
  /contactLifecycle\.advance\(\s*activeContactPairs,/,
  'Rapier contact pairs must feed the lifecycle tracker every step.',
);
assert.match(
  boatSource,
  /collisionSummary\.contactStartCount/,
  'Gameplay sequences must consume contact-start events.',
);
assert.doesNotMatch(
  boatSource,
  /collisionSequence \+= collisionSummary\.contactCount/,
  'Gameplay scoring must not accumulate raw contact points.',
);
assert.match(
  calibrationSource,
  /collisionEventRecorded:/,
  'Browser collision calibration must verify lifecycle integration.',
);

console.log('Collision contact lifecycle contract passed.');
