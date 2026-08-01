import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';

const FIXED_STEP_SECONDS = 1 / 120;
const SIMULATION_STEPS = 300;
const BODY_MASS_KG = 1_200;
const BASE_INERTIA_KG_M2 = 900;
const INITIAL_SPEED_MPS = 9;

function vectorLength(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function vectorDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function finiteVector(value) {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function kineticEnergyJ(linearVelocity, angularVelocity, inertiaKgM2) {
  return (
    0.5 * BODY_MASS_KG * vectorLength(linearVelocity) ** 2 +
    0.5 * inertiaKgM2 * vectorLength(angularVelocity) ** 2
  );
}

function collectMaximumContactImpulse(
  world,
  vesselColliders,
  vesselColliderHandles,
) {
  let maximumImpulseNs = 0;
  let geometricContactCount = 0;
  let solverContactCount = 0;

  for (const vesselCollider of vesselColliders) {
    world.contactPairsWith(vesselCollider, (otherCollider) => {
      if (vesselColliderHandles.has(otherCollider.handle)) return;
      world.contactPair(vesselCollider, otherCollider, (manifold) => {
        const contactCount = manifold.numContacts();
        const solverCount = manifold.numSolverContacts();
        geometricContactCount += contactCount;
        solverContactCount += solverCount;

        // Rapier stores solved impulses on geometric contacts. Solver
        // contacts expose the reduced world-space point set.
        for (let index = 0; index < contactCount; index += 1) {
          const normalImpulseNs = manifold.contactImpulse(index);
          const tangentImpulseXNs =
            manifold.contactTangentImpulseX(index);
          const tangentImpulseYNs =
            manifold.contactTangentImpulseY(index);
          const impulseNs = Math.hypot(
            Number.isFinite(normalImpulseNs) ? normalImpulseNs : 0,
            Number.isFinite(tangentImpulseXNs)
              ? tangentImpulseXNs
              : 0,
            Number.isFinite(tangentImpulseYNs)
              ? tangentImpulseYNs
              : 0,
          );
          maximumImpulseNs = Math.max(maximumImpulseNs, impulseNs);
        }
      });
    });
  }

  return {
    maximumImpulseNs,
    geometricContactCount,
    solverContactCount,
  };
}

function runImpactScenario({
  obstacleOffsetX,
  inertiaScale = 1,
  reverseColliderOrder = false,
}) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = FIXED_STEP_SECONDS;
  world.numSolverIterations = 8;
  world.numInternalPgsIterations = 2;

  const inertiaKgM2 = BASE_INERTIA_KG_M2 * inertiaScale;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 5)
      .setLinvel(0, 0, -INITIAL_SPEED_MPS)
      .setGravityScale(0)
      .setLinearDamping(0)
      .setAngularDamping(0)
      .setCanSleep(false)
      .setAdditionalMassProperties(
        BODY_MASS_KG,
        { x: 0, y: 0, z: 0 },
        { x: inertiaKgM2, y: inertiaKgM2, z: inertiaKgM2 },
        { x: 0, y: 0, z: 0, w: 1 },
      ),
  );
  body.enableCcd(true);
  body.setSoftCcdPrediction(0.35);
  body.setAdditionalSolverIterations(4);

  const pieces = [
    { x: 0, y: 0, z: -0.95, hx: 0.62, hy: 0.45, hz: 0.55 },
    { x: 0, y: 0, z: 0, hx: 0.82, hy: 0.48, hz: 0.62 },
    { x: 0, y: 0, z: 0.95, hx: 0.9, hy: 0.45, hz: 0.5 },
  ];
  if (reverseColliderOrder) pieces.reverse();

  const vesselColliders = pieces.map((piece) =>
    world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(
        piece.hx,
        piece.hy,
        piece.hz,
        0.06,
      )
        .setTranslation(piece.x, piece.y, piece.z)
        .setDensity(0)
        .setFriction(0.22)
        .setRestitution(0.04)
        .setContactSkin(0.02),
      body,
    ),
  );

  world.createCollider(
    RAPIER.ColliderDesc.ball(0.72)
      .setTranslation(obstacleOffsetX, 0, 0)
      .setFriction(0.24)
      .setRestitution(0.04)
      .setContactSkin(0.02),
  );

  const vesselColliderHandles = new Set(
    vesselColliders.map((collider) => collider.handle),
  );
  let maximumImpulseNs = 0;
  let geometricContactCount = 0;
  let solverContactCount = 0;
  for (let step = 0; step < SIMULATION_STEPS; step += 1) {
    world.step();
    const contact = collectMaximumContactImpulse(
      world,
      vesselColliders,
      vesselColliderHandles,
    );
    maximumImpulseNs = Math.max(
      maximumImpulseNs,
      contact.maximumImpulseNs,
    );
    geometricContactCount += contact.geometricContactCount;
    solverContactCount += contact.solverContactCount;
  }

  const position = body.translation();
  const linearVelocity = body.linvel();
  const angularVelocity = body.angvel();
  const rotation = body.rotation();
  const finalEnergyJ = kineticEnergyJ(
    linearVelocity,
    angularVelocity,
    inertiaKgM2,
  );
  const initialEnergyJ =
    0.5 * BODY_MASS_KG * INITIAL_SPEED_MPS ** 2;

  assert.ok(finiteVector(position), 'solved position must remain finite');
  assert.ok(
    finiteVector(linearVelocity),
    'solved linear velocity must remain finite',
  );
  assert.ok(
    finiteVector(angularVelocity),
    'solved angular velocity must remain finite',
  );
  assert.ok(
    [rotation.x, rotation.y, rotation.z, rotation.w].every(Number.isFinite),
    'solved rotation must remain finite',
  );

  const result = {
    position: { x: position.x, y: position.y, z: position.z },
    linearVelocity: {
      x: linearVelocity.x,
      y: linearVelocity.y,
      z: linearVelocity.z,
    },
    angularVelocity: {
      x: angularVelocity.x,
      y: angularVelocity.y,
      z: angularVelocity.z,
    },
    angularSpeedRadPerSecond: vectorLength(angularVelocity),
    maximumImpulseNs,
    geometricContactCount,
    solverContactCount,
    initialEnergyJ,
    finalEnergyJ,
  };
  world.free();
  return result;
}

await RAPIER.init();

const centered = runImpactScenario({ obstacleOffsetX: 0 });
const offCenter = runImpactScenario({ obstacleOffsetX: 0.68 });
const highInertia = runImpactScenario({
  obstacleOffsetX: 0.68,
  inertiaScale: 4,
});
const reversedOrder = runImpactScenario({
  obstacleOffsetX: 0.68,
  reverseColliderOrder: true,
});

const positionDifferenceM = vectorDistance(
  offCenter.position,
  reversedOrder.position,
);
const linearVelocityDifferenceMps = vectorDistance(
  offCenter.linearVelocity,
  reversedOrder.linearVelocity,
);
const angularVelocityDifferenceRadPerSecond = vectorDistance(
  offCenter.angularVelocity,
  reversedOrder.angularVelocity,
);
const impulseDifferenceRatio =
  Math.abs(offCenter.maximumImpulseNs - reversedOrder.maximumImpulseNs) /
  Math.max(1, offCenter.maximumImpulseNs, reversedOrder.maximumImpulseNs);

console.log(
  JSON.stringify(
    {
      centered,
      offCenter,
      highInertia,
      reversedOrder,
      orderDifferences: {
        positionDifferenceM,
        linearVelocityDifferenceMps,
        angularVelocityDifferenceRadPerSecond,
        impulseDifferenceRatio,
      },
    },
    null,
    2,
  ),
);

for (const [name, result] of [
  ['centered', centered],
  ['off-center', offCenter],
  ['high-inertia', highInertia],
  ['reversed-order', reversedOrder],
]) {
  assert.ok(
    result.geometricContactCount > 0,
    `${name} scenario must generate geometric contacts`,
  );
  assert.ok(
    result.solverContactCount > 0,
    `${name} scenario must generate solver contacts`,
  );
  assert.ok(
    result.maximumImpulseNs > 25,
    `${name} scenario must record a real solver impulse`,
  );
  assert.ok(
    result.finalEnergyJ <= result.initialEnergyJ * 1.08,
    `${name} collision must not create excessive kinetic energy`,
  );
}

assert.ok(
  offCenter.angularSpeedRadPerSecond >
    centered.angularSpeedRadPerSecond + 0.08,
  'an off-center collision must create a materially larger angular response',
);
assert.ok(
  highInertia.angularSpeedRadPerSecond <
    offCenter.angularSpeedRadPerSecond * 0.8,
  'greater principal inertia must reduce the off-center angular response',
);

assert.ok(
  positionDifferenceM <= 0.08,
  `compound collider order changed final position by ${positionDifferenceM} m`,
);
assert.ok(
  linearVelocityDifferenceMps <= 0.08,
  `compound collider order changed final velocity by ${linearVelocityDifferenceMps} m/s`,
);
assert.ok(
  angularVelocityDifferenceRadPerSecond <= 0.08,
  `compound collider order changed angular velocity by ${angularVelocityDifferenceRadPerSecond} rad/s`,
);
assert.ok(
  impulseDifferenceRatio <= 0.12,
  `compound collider order changed peak impulse by ${impulseDifferenceRatio * 100}%`,
);

console.log('Dynamic collision-authority regression tests passed.');
