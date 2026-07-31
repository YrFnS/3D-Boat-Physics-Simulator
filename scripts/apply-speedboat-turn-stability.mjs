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
    `    const uprightSteeringAuthority = MathUtils.smoothstep(
      Math.abs(uprightY),
      0.18,
      0.78,
    );
`,
    `    const uprightSteeringAuthority = MathUtils.smoothstep(
      uprightY,
      0.08,
      0.78,
    );
`,
    'upright-only steering authority',
  );

  source = replaceOnce(
    source,
    `    if (vessel.planingCapable && speedRatio > 0.15) {
      // The component of current-up × world-up along the vessel's forward
      // axis gives a signed roll error without depending on Euler angles or a
      // horizontalized body axis. This remains valid through large banks.
      const signedRollError = scratch.rollStabilityTorque
        .copy(scratch.boatUp)
        .cross(scratch.worldUp)
        .dot(forwardDir);
      const rollRateRadPerSecond =
        body.angularVelocity.dot(forwardDir);
      const stabilityBlend = MathUtils.smoothstep(
        speedRatio,
        0.15,
        0.65,
      );
      const rollStabilityTorqueNm = MathUtils.clamp(
        signedRollError * mass * 18 -
          rollRateRadPerSecond * mass * 6.5,
        -mass * 28,
        mass * 28,
      );
      body.addTorque(
        scratch.rollStabilityTorque
          .copy(forwardDir)
          .multiplyScalar(rollStabilityTorqueNm * stabilityBlend),
      );
    }
`,
    `    if (vessel.planingCapable && speedRatio > 0.15) {
      // atan2(sin, cos) provides a signed roll error through the full
      // orientation range. Unlike a sine-only term, it does not lose all
      // righting authority when the hull approaches an inverted attitude.
      const rollSin = scratch.rollStabilityTorque
        .copy(scratch.boatUp)
        .cross(scratch.worldUp)
        .dot(forwardDir);
      const rollCos = MathUtils.clamp(
        scratch.boatUp.dot(scratch.worldUp),
        -1,
        1,
      );
      const signedRollRadians = Math.atan2(rollSin, rollCos);
      const rollRateRadPerSecond =
        body.angularVelocity.dot(forwardDir);
      const stabilityBlend = MathUtils.smoothstep(
        speedRatio,
        0.15,
        0.65,
      );
      const rollStabilityTorqueNm = MathUtils.clamp(
        signedRollRadians * mass * 24 -
          rollRateRadPerSecond * mass * 8,
        -mass * 45,
        mass * 45,
      );
      body.addTorque(
        scratch.rollStabilityTorque
          .copy(forwardDir)
          .multiplyScalar(rollStabilityTorqueNm * stabilityBlend),
      );
    }
`,
    'full-angle planing righting torque',
  );
  return source;
});

await updateFile('sim/vessels/DistributedHullForces.ts', (source) => {
  source = replaceOnce(
    source,
    `    this.forwardAxis
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion)
      .normalize();
    this.rightAxis
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion)
      .normalize();
`,
    `    this.forwardAxis
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion);
    this.forwardAxis.y = 0;
    if (this.forwardAxis.lengthSq() > EPSILON) {
      this.forwardAxis.normalize();
    } else {
      this.forwardAxis.set(0, 0, -1);
    }
    this.rightAxis
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion);
    this.rightAxis.y = 0;
    if (this.rightAxis.lengthSq() > EPSILON) {
      this.rightAxis.normalize();
    } else {
      this.rightAxis.set(-1, 0, 0);
    }
`,
    'horizontal water-resistance axes',
  );
  return source;
});

await updateFile('sim/vessels/VesselConfig.ts', (source) => {
  source = replaceOnce(
    source,
    `    principalInertiaKgM2: [1_600, 2_400, 900],
    angularDampingPerSecond: [4.6, 4.2, 7.2],
    centerOfMassLocal: [0, -0.1, 0.35],
    maxAngularSpeedRadPerSecond: 2.2,
`,
    `    principalInertiaKgM2: [1_600, 2_400, 1_600],
    angularDampingPerSecond: [4.6, 4.2, 10],
    centerOfMassLocal: [0, -0.22, 0.35],
    maxAngularSpeedRadPerSecond: 2,
`,
    'speedboat roll mass properties',
  );
  source = replaceOnce(
    source,
    `    turnForceMax: 1.7,
`,
    `    turnForceMax: 1.25,
`,
    'speedboat rudder force scale',
  );
  source = replaceOnce(
    source,
    `    maxLateralDragAccelerationMps2: 14,
`,
    `    maxLateralDragAccelerationMps2: 8,
`,
    'speedboat lateral acceleration cap',
  );
  source = replaceOnce(
    source,
    `    maxRudderAngleRad: 0.55,
`,
    `    maxRudderAngleRad: 0.5,
`,
    'speedboat maximum rudder angle',
  );
  return source;
});

await updateFile('sim/calibration/VesselCalibration.ts', (source) => {
  source = replaceOnce(
    source,
    `      const approachThrottle =
        this.request.vessel === 'speedboat' ? 0.3 : 0.82;
`,
    `      const approachThrottle =
        this.request.vessel === 'speedboat' ? 0.18 : 0.82;
`,
    'controlled speedboat turn throttle',
  );
  return source;
});

console.log('Applied full-angle righting and stable planing turn forces.');
