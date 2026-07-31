import fs from 'node:fs/promises';

async function replaceOnce(path, currentText, replacementText, label) {
  const source = await fs.readFile(path, 'utf8');

  if (source.includes(replacementText)) {
    console.log(`${label} is already applied.`);
    return false;
  }

  const firstIndex = source.indexOf(currentText);
  if (firstIndex < 0) {
    throw new Error(`Unable to find ${label}.`);
  }
  if (source.indexOf(currentText, firstIndex + currentText.length) >= 0) {
    throw new Error(`Found more than one ${label}; refusing an ambiguous edit.`);
  }

  await fs.writeFile(
    path,
    source.slice(0, firstIndex) + replacementText + source.slice(firstIndex + currentText.length),
  );
  console.log(`Applied ${label}.`);
  return true;
}

await replaceOnce(
  'components/Boat.tsx',
  `    const highSpeedRudderAuthority = vessel.planingCapable
      ? MathUtils.lerp(
          1,
          0.38,
          MathUtils.smoothstep(normalizedSteeringSpeed, 0.45, 1.1),
        )
      : MathUtils.lerp(`,
  `    // Planing hulls retain useful authority through normal cruise, then
    // taper again at extreme speed so full steering remains controllable.
    const highSpeedRudderAuthority = vessel.planingCapable
      ? MathUtils.lerp(
          1,
          0.76,
          MathUtils.smoothstep(normalizedSteeringSpeed, 0.45, 1.1),
        ) *
        MathUtils.lerp(
          1,
          0.5,
          MathUtils.smoothstep(normalizedSteeringSpeed, 1.1, 2),
        )
      : MathUtils.lerp(`,
  'two-stage planing rudder authority',
);

await replaceOnce(
  'sim/calibration/VesselCalibration.ts',
  `        this.request.vessel === 'speedboat' ? 0.24 : 0.82;`,
  `        this.request.vessel === 'speedboat' ? 0.21 : 0.82;`,
  'representative speedboat turn-entry throttle',
);

await replaceOnce(
  'scripts/visual-smoke.mjs',
  `            penetrationRecorded: physicsAfter.collision.maxPenetration > 0,`,
  `            residualPenetrationBounded:
              physicsAfter.collision.maxPenetration >= 0 &&
              physicsAfter.collision.maxPenetration < 0.25,`,
  'bounded residual-penetration smoke assertion',
);
