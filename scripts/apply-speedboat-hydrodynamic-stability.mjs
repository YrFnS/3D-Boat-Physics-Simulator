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

await updateFile('sim/vessels/VesselConfig.ts', (source) => {
  source = replaceOnce(
    source,
    `  forwardDragCoefficient: number;
  keelDragMultiplier: number;
`,
    `  forwardDragCoefficient: number;
  keelDragMultiplier: number;
  dragApplicationDepthM: number;
  maxLateralDragAccelerationMps2: number;
`,
    'hydrodynamic stability configuration fields',
  );
  source = replaceOnce(
    source,
    `    forwardDragCoefficient: 250,
    keelDragMultiplier: 6,
`,
    `    forwardDragCoefficient: 250,
    keelDragMultiplier: 6,
    dragApplicationDepthM: 0,
    maxLateralDragAccelerationMps2: 40,
`,
    'trawler drag configuration',
  );
  source = replaceOnce(
    source,
    `    forwardDragCoefficient: 180,
    keelDragMultiplier: 3,
`,
    `    forwardDragCoefficient: 180,
    keelDragMultiplier: 3,
    dragApplicationDepthM: 0.35,
    maxLateralDragAccelerationMps2: 14,
`,
    'speedboat drag configuration',
  );
  source = replaceOnce(
    source,
    `    principalInertiaKgM2: [1_600, 2_400, 520],
    angularDampingPerSecond: [4.6, 4.2, 5.6],
`,
    `    principalInertiaKgM2: [1_600, 2_400, 900],
    angularDampingPerSecond: [4.6, 4.2, 7.2],
`,
    'speedboat roll inertia and damping',
  );
  return source;
});

await updateFile('sim/vessels/DistributedHullForces.ts', (source) => {
  source = replaceOnce(
    source,
    `  readonly worldPoint: Vector3;
  readonly pointVelocity: Vector3;
`,
    `  readonly worldPoint: Vector3;
  readonly dragPoint: Vector3;
  readonly pointVelocity: Vector3;
`,
    'drag application point scratch',
  );
  source = replaceOnce(
    source,
    `  private readonly forwardAxis = new Vector3();
  private readonly rightAxis = new Vector3();
`,
    `  private readonly forwardAxis = new Vector3();
  private readonly rightAxis = new Vector3();
  private readonly upAxis = new Vector3();
`,
    'hull up-axis scratch',
  );
  source = replaceOnce(
    source,
    `    this.rightAxis
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion)
      .normalize();

    let totalWeight = 0;
`,
    `    this.rightAxis
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion)
      .normalize();
    this.upAxis
      .set(0, 1, 0)
      .applyQuaternion(body.quaternion)
      .normalize();

    let totalWeight = 0;
`,
    'world-space hull up axis',
  );
  source = replaceOnce(
    source,
    `      const lateralDragN =
        -lateralSpeed *
        Math.abs(lateralSpeed) *
        lateralDragCoefficient *
        immersionWeight;

      scratch.force
`,
    `      const rawLateralDragN =
        -lateralSpeed *
        Math.abs(lateralSpeed) *
        lateralDragCoefficient *
        immersionWeight;
      const maximumLateralDragN =
        vessel.massKg *
        vessel.maxLateralDragAccelerationMps2 *
        immersionWeight;
      const lateralDragN = MathUtils.clamp(
        rawLateralDragN,
        -maximumLateralDragN,
        maximumLateralDragN,
      );

      scratch.force
`,
    'bounded lateral hull resistance',
  );
  source = replaceOnce(
    source,
    `      if (scratch.force.lengthSq() > EPSILON) {
        body.addForceAtPoint(scratch.force, scratch.worldPoint);
      }
`,
    `      if (scratch.force.lengthSq() > EPSILON) {
        scratch.dragPoint
          .copy(scratch.worldPoint)
          .addScaledVector(
            this.upAxis,
            -vessel.dragApplicationDepthM,
          );
        body.addForceAtPoint(scratch.force, scratch.dragPoint);
      }
`,
    'lower drag application point',
  );
  source = replaceOnce(
    source,
    `        worldPoint: new Vector3(),
        pointVelocity: new Vector3(),
`,
    `        worldPoint: new Vector3(),
        dragPoint: new Vector3(),
        pointVelocity: new Vector3(),
`,
    'drag scratch allocation',
  );
  return source;
});

await updateFile('sim/calibration/VesselCalibration.ts', (source) => {
  source = replaceOnce(
    source,
    `      const approachThrottle =
        this.request.vessel === 'speedboat' ? 0.58 : 0.82;
`,
    `      const approachThrottle =
        this.request.vessel === 'speedboat' ? 0.3 : 0.82;
`,
    'controlled planing-turn throttle',
  );
  return source;
});

console.log('Applied bounded low-hull hydrodynamic drag for stable planing turns.');
