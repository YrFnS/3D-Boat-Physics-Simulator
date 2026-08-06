import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  applyVesselDamage,
  NORMAL_OPERATION_DAMAGE_POLICY,
  VESSEL_DAMAGE_SOURCE_LABELS,
} from '../sim/vessels/VesselDamagePolicy.ts';

const pristine = {
  hullHealth: 100,
  engineHealth: 100,
  rudderHealth: 100,
};

assert.deepEqual(
  applyVesselDamage(pristine, {
    source: 'terrain-impact',
    hullDamage: 12,
    engineDamage: 3,
    rudderDamage: 4,
  }),
  {
    hullHealth: 88,
    engineHealth: 97,
    rudderHealth: 96,
  },
  'Explicit damage must affect only the declared health channels.',
);

assert.deepEqual(
  applyVesselDamage(pristine, {
    source: 'obstacle-impact',
    hullDamage: 500,
    engineDamage: Number.POSITIVE_INFINITY,
    rudderDamage: -8,
  }),
  {
    hullHealth: 0,
    engineHealth: 100,
    rudderHealth: 100,
  },
  'Damage must clamp health and ignore invalid or negative values.',
);

assert.equal(
  NORMAL_OPERATION_DAMAGE_POLICY.sustainedPlaningHullDamagePerSecond,
  0,
);
assert.equal(
  NORMAL_OPERATION_DAMAGE_POLICY.hydrodynamicRudderWearPerSecond,
  0,
);
assert.deepEqual(
  Object.keys(VESSEL_DAMAGE_SOURCE_LABELS).sort(),
  [
    'engine-overheat',
    'environmental-impact',
    'machinery-flooding',
    'obstacle-impact',
    'slamming',
    'terrain-impact',
  ],
  'Every allowed health-loss source must be explicit and named.',
);

const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const conditionRuntimeSource = await fs.readFile(
  new URL(
    '../sim/vessels/VesselConditionRuntime.ts',
    import.meta.url,
  ),
  'utf8',
);
const collisionRuntimeSource = await fs.readFile(
  new URL(
    '../sim/collision/VesselCollisionRuntime.ts',
    import.meta.url,
  ),
  'utf8',
);
const integratedDamageSource =
  `${boatSource}\n${conditionRuntimeSource}\n${collisionRuntimeSource}`;

assert.match(
  conditionRuntimeSource,
  /applyVesselDamage/,
  'Condition health loss must route through the explicit damage policy.',
);
assert.doesNotMatch(
  boatSource,
  /applyVesselDamage/,
  'The React vessel component must delegate condition mutation.',
);
for (const source of Object.keys(VESSEL_DAMAGE_SOURCE_LABELS)) {
  assert.match(
    integratedDamageSource,
    new RegExp(`source: '${source}'`),
    `The integrated vessel runtime must retain the explicit ${source} damage path.`,
  );
}

assert.doesNotMatch(
  boatSource,
  /activePlaningSpeedRatio\s*>\s*0\.8[\s\S]{0,260}(?:hullHealth\.current|conditionRuntime\.current\.hullHealth)\s*-/,
  'Designed planing operation must not passively consume hull health.',
);
assert.doesNotMatch(
  boatSource,
  /rudderLoadRatio/,
  'Ordinary hydrodynamic rudder load must not passively consume rudder health.',
);
assert.doesNotMatch(
  boatSource,
  /normalizedSurgeSpeed/,
  'The removed passive rudder-wear calculation must not remain dead code.',
);
assert.doesNotMatch(
  integratedDamageSource,
  /(?:hullHealth|engineHealth|rudderHealth)(?:\.current|Value)?\s*=\s*Math\.max\(\s*0,\s*(?:hullHealth|engineHealth|rudderHealth)(?:\.current|Value)?\s*-/,
  'Direct health subtraction must not bypass the damage policy.',
);

console.log('Vessel damage policy contract passed.');
