import fs from 'node:fs/promises';

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Unable to find ${label}.`);
  }
  return source.replace(search, replacement);
}

const path = 'sim/collision/RapierCollisionWorld.ts';
let source = await fs.readFile(path, 'utf8');

source = replaceOnce(
  source,
  `const DEBUG_PROBE_RADIUS_M = 0.65;
const DEBUG_PROBE_GAP_M = 0.12;
`,
  `const DEBUG_PROBE_HALF_WIDTH_M = 3.5;
const DEBUG_PROBE_HALF_HEIGHT_M = 1.5;
const DEBUG_PROBE_HALF_DEPTH_M = 0.24;
const DEBUG_PROBE_GAP_M = 0.03;
`,
  'debug probe constants',
);

source = replaceOnce(
  source,
  '  private readonly otherPosition = new Vector3();\n',
  '',
  'unused collision scratch vector',
);

source = replaceOnce(
  source,
  `    if (summary.debugProbeContactCount > 0 && this.debugProbeCollider) {
      this.debugProbeCollider.setEnabled(false);
      this.debugProbeConsumed = true;
    }
`,
  `    if (
      summary.debugProbeContactCount > 0 &&
      summary.maxObstacleImpulseNs > 0 &&
      this.debugProbeCollider
    ) {
      this.debugProbeCollider.setEnabled(false);
      this.debugProbeConsumed = true;
    }
`,
  'debug probe consumption condition',
);

const previousProbe = `  private syncDebugProbe(
    body: SixDofBody,
    vessel: VesselConfig,
    enabled: boolean,
  ) {
    if (!enabled) {
      this.debugProbeCollider?.setEnabled(false);
      return;
    }
    if (this.debugProbeConsumed) return;
    if (this.debugProbeCollider) {
      this.debugProbeCollider.setEnabled(true);
      return;
    }

    this.forward
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion)
      .normalize();
    this.debugProbePosition
      .copy(body.position)
      .addScaledVector(
        this.forward,
        vessel.halfLengthM + DEBUG_PROBE_RADIUS_M + DEBUG_PROBE_GAP_M,
      );
    this.debugProbePosition.y -= Math.min(
      0.15,
      vessel.deepestDraftM * 0.25,
    );

    this.debugProbeCollider = this.world.createCollider(
      this.rapier.ColliderDesc.ball(DEBUG_PROBE_RADIUS_M)
        .setTranslation(
          this.debugProbePosition.x,
          this.debugProbePosition.y,
          this.debugProbePosition.z,
        )
        .setFriction(0.18)
        .setRestitution(0.06)
        .setContactSkin(CONTACT_SLOP_M)
        .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.ALL),
    );
  }
`;

const nextProbe = `  private syncDebugProbe(
    body: SixDofBody,
    vessel: VesselConfig,
    enabled: boolean,
  ) {
    if (!enabled) {
      this.debugProbeCollider?.setEnabled(false);
      return;
    }
    if (this.debugProbeConsumed) return;
    if (this.debugProbeCollider) {
      this.debugProbeCollider.setEnabled(true);
      return;
    }

    this.forward
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion)
      .normalize();
    this.debugProbePosition
      .copy(body.position)
      .addScaledVector(
        this.forward,
        vessel.halfLengthM +
          DEBUG_PROBE_HALF_DEPTH_M +
          COLLIDER_BORDER_M +
          DEBUG_PROBE_GAP_M,
      );
    this.debugProbePosition.y -= Math.min(
      0.15,
      vessel.deepestDraftM * 0.25,
    );

    // A short wall is intentionally used instead of a small sphere. The
    // headless browser can advance fewer fixed steps while the simulated wind
    // creates lateral drift, so the wall verifies a real Rapier manifold
    // without coupling the test to one exact trajectory.
    this.debugProbeCollider = this.world.createCollider(
      this.rapier.ColliderDesc.roundCuboid(
        DEBUG_PROBE_HALF_WIDTH_M,
        DEBUG_PROBE_HALF_HEIGHT_M,
        DEBUG_PROBE_HALF_DEPTH_M,
        Math.min(
          COLLIDER_BORDER_M,
          DEBUG_PROBE_HALF_DEPTH_M * 0.35,
        ),
      )
        .setTranslation(
          this.debugProbePosition.x,
          this.debugProbePosition.y,
          this.debugProbePosition.z,
        )
        .setRotation({
          x: body.quaternion.x,
          y: body.quaternion.y,
          z: body.quaternion.z,
          w: body.quaternion.w,
        })
        .setFriction(0.18)
        .setRestitution(0.06)
        .setContactSkin(CONTACT_SLOP_M)
        .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.ALL),
    );
  }
`;

source = replaceOnce(
  source,
  previousProbe,
  nextProbe,
  'spherical debug probe implementation',
);

await fs.writeFile(path, source);
console.log('Replaced the spherical collision probe with a drift-tolerant wall.');
