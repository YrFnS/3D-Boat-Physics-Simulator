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
    `      boatUp: new Vector3(),
      boatPosition: new Vector3(),
`,
    `      boatUp: new Vector3(),
      worldUp: new Vector3(0, 1, 0),
      boatPosition: new Vector3(),
`,
    'world-up scratch vector',
  );
  source = replaceOnce(
    source,
    `          0.22,
          MathUtils.smoothstep(normalizedSteeringSpeed, 0.45, 1.1),
`,
    `          0.38,
          MathUtils.smoothstep(normalizedSteeringSpeed, 0.45, 1.1),
`,
    'planing rudder authority floor',
  );
  source = replaceOnce(
    source,
    '    const steeringBiteLimit = vessel.planingCapable ? 3.2 : 6;\n',
    '    const steeringBiteLimit = vessel.planingCapable ? 4 : 6;\n',
    'planing steering bite cap',
  );
  source = replaceOnce(
    source,
    `    if (vessel.planingCapable && speedRatio > 0.15) {
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
`,
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
    'vector-based planing righting torque',
  );
  return source;
});

await updateFile('sim/calibration/VesselCalibration.ts', (source) => {
  source = replaceOnce(
    source,
    `      const approachThrottle =
        this.request.vessel === 'speedboat' ? 0.72 : 0.82;
`,
    `      const approachThrottle =
        this.request.vessel === 'speedboat' ? 0.58 : 0.82;
`,
    'speedboat turn approach throttle',
  );
  return source;
});

await updateFile('sim/collision/RapierCollisionWorld.ts', (source) => {
  source = replaceOnce(
    source,
    `const CONTACT_SLOP_M = 0.012;
const MAX_POSITION_CORRECTION_M = 0.16;
const MAX_TOTAL_CORRECTION_M = 0.42;
`,
    `const CONTACT_SLOP_M = 0.012;
const CONTACT_PREDICTION_M = 0.12;
const MAX_POSITION_CORRECTION_M = 0.22;
const MAX_TOTAL_CORRECTION_M = 0.55;
`,
    'predictive contact constants',
  );

  const skinCount = source.split('.setContactSkin(CONTACT_SLOP_M)').length - 1;
  if (skinCount < 5) {
    throw new Error(`Expected at least five contact-skin sites, found ${skinCount}.`);
  }
  source = source.replaceAll(
    '.setContactSkin(CONTACT_SLOP_M)',
    '.setContactSkin(CONTACT_PREDICTION_M)',
  );

  source = replaceOnce(
    source,
    `            let penetrationM = 0;
            for (let index = 0; index < contactCount; index += 1) {
              penetrationM = Math.max(
                penetrationM,
                -manifold.contactDist(index),
              );
            }
            if (penetrationM <= 0) return;
`,
    `            let signedContactDistanceM = Number.POSITIVE_INFINITY;
            for (let index = 0; index < contactCount; index += 1) {
              signedContactDistanceM = Math.min(
                signedContactDistanceM,
                manifold.contactDist(index),
              );
            }
            const penetrationM = Math.max(0, -signedContactDistanceM);
            const predictiveDepthM = Math.max(
              0,
              CONTACT_PREDICTION_M - signedContactDistanceM,
            );
            if (predictiveDepthM <= 0) return;
`,
    'predictive contact-distance evaluation',
  );
  source = replaceOnce(
    source,
    `                Math.max(impulseNs, vessel.massKg * penetrationM * 0.9) *
`,
    `                Math.max(
                  impulseNs,
                  vessel.massKg * predictiveDepthM * 0.9,
                ) *
`,
    'predictive friction support',
  );
  source = replaceOnce(
    source,
    `            summary.maxPenetrationM = Math.max(
              summary.maxPenetrationM,
              penetrationM,
            );
`,
    `            // Diagnostics track unresolved overlap after the bounded
            // correction actually applied to the authoritative custom body.
            summary.maxPenetrationM = Math.max(
              summary.maxPenetrationM,
              Math.max(0, penetrationM - correctionM),
            );
`,
    'residual penetration diagnostics',
  );
  return source;
});

console.log('Applied vector righting torque and predictive contact response.');
