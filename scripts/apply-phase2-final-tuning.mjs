import fs from 'node:fs/promises';

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Unable to find ${label}.`);
  }
  return source.replace(search, replacement);
}

async function updateFile(path, transform) {
  const source = await fs.readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`No changes produced for ${path}.`);
  await fs.writeFile(path, next, 'utf8');
}

await updateFile('components/Boat.tsx', (source) => {
  source = replaceOnce(
    source,
    `      rudderForce: new Vector3(),
      boatForward: new Vector3(),
`,
    `      rudderForce: new Vector3(),
      rollStabilityTorque: new Vector3(),
      boatForward: new Vector3(),
`,
    'roll-stability scratch vector',
  );
  source = replaceOnce(
    source,
    `    const highSpeedRudderAuthority = vessel.planingCapable
      ? MathUtils.lerp(
          1,
          0.38,
          MathUtils.smoothstep(normalizedSteeringSpeed, 0.55, 1.25),
        )
`,
    `    const highSpeedRudderAuthority = vessel.planingCapable
      ? MathUtils.lerp(
          1,
          0.22,
          MathUtils.smoothstep(normalizedSteeringSpeed, 0.45, 1.1),
        )
`,
    'planing rudder authority curve',
  );
  source = replaceOnce(
    source,
    `    // You cannot steer if the prop/rudder is out of the water!
    const steeringBite = Math.max(0.1, Math.min(speedBite + propWashBite, 6.0)) * submergedRatio;
`,
    `    // You cannot steer if the prop/rudder is out of the water. Planing
    // hulls also lose effective rudder bite as dynamic pressure rises, which
    // prevents an arcade-like pivot at full speed.
    const steeringBiteLimit = vessel.planingCapable ? 3.2 : 6;
    const steeringBite =
      Math.max(
        0.1,
        Math.min(speedBite + propWashBite, steeringBiteLimit),
      ) * submergedRatio;
`,
    'planing steering bite limit',
  );
  source = replaceOnce(
    source,
    `    body.addForceAtPoint(
      scratch.rudderForce
        .copy(rightDir)
        .multiplyScalar(-rudderForceMagnitude),
      scratch.worldRudder,
    );

    // Rapier resolves compound-hull obstacle and terrain contacts after
`,
    `    body.addForceAtPoint(
      scratch.rudderForce
        .copy(rightDir)
        .multiplyScalar(-rudderForceMagnitude),
      scratch.worldRudder,
    );

    if (vessel.planingCapable && speedRatio > 0.15) {
      const signedRollRadians = Math.atan2(
        scratch.boatUp.dot(rightDir),
        Math.max(0.05, scratch.boatUp.y),
      );
      const rollRateRadPerSecond =
        body.angularVelocity.dot(forwardDir);
      const stabilityBlend = MathUtils.smoothstep(
        speedRatio,
        0.15,
        0.65,
      );
      const rollStabilityTorqueNm = MathUtils.clamp(
        signedRollRadians * mass * 12 -
          rollRateRadPerSecond * mass * 4.5,
        -mass * 22,
        mass * 22,
      );
      body.addTorque(
        scratch.rollStabilityTorque
          .copy(forwardDir)
          .multiplyScalar(rollStabilityTorqueNm * stabilityBlend),
      );
    }

    // Rapier resolves compound-hull obstacle and terrain contacts after
`,
    'planing anti-roll torque',
  );
  return source;
});

await updateFile('sim/collision/RapierCollisionWorld.ts', (source) => {
  source = replaceOnce(
    source,
    `    this.vesselBody = this.world.createRigidBody(bodyDescription);

    const halfWidth = vessel.halfWidthM;
`,
    `    this.vesselBody = this.world.createRigidBody(bodyDescription);
    this.vesselBody.enableCcd(true);
    this.vesselBody.setSoftCcdPrediction(
      Math.max(0.35, vessel.halfLengthM * 0.22),
    );
    this.vesselBody.setAdditionalSolverIterations(4);

    const halfWidth = vessel.halfWidthM;
`,
    'vessel continuous collision detection',
  );
  return source;
});

console.log('Applied final planing stability and continuous-contact tuning.');
