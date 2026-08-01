import RAPIER from '@dimforge/rapier3d-compat';
import { MathUtils, Quaternion, Vector3 } from 'three';
import { getTerrainHeight } from '@/lib/terrain';
import { MAX_OBSTACLES } from '@/store/useSimStore';
import type { SixDofBody } from '@/sim/core/SixDofBody';
import type { VesselConfig } from '@/sim/vessels/VesselConfig';

const TERRAIN_SIZE_M = 3_000;
const TERRAIN_SEGMENTS = 96;
const CONTACT_PREDICTION_M = 0.12;
const COLLIDER_BORDER_M = 0.08;
const DEBUG_PROBE_HALF_WIDTH_M = 3.5;
const DEBUG_PROBE_HALF_HEIGHT_M = 1.5;
const DEBUG_PROBE_HALF_DEPTH_M = 0.24;
const DEBUG_PROBE_GAP_M = CONTACT_PREDICTION_M + 0.08;
const FIXTURE_WALL_HALF_WIDTH_M = 4.5;
const FIXTURE_WALL_HALF_HEIGHT_M = 1.8;
const FIXTURE_WALL_HALF_DEPTH_M = 0.28;
const SHORE_HALF_WIDTH_M = 6;
const SHORE_HALF_HEIGHT_M = 0.6;
const SHORE_HALF_DEPTH_M = 5;
const SHORE_SLOPE_RAD = MathUtils.degToRad(8);

export type CollisionFixtureKind =
  | 'shoreline'
  | 'glancing'
  | 'head-on';

let rapierInitialization: Promise<typeof RAPIER> | null = null;

function initializeRapier() {
  if (!rapierInitialization) {
    rapierInitialization = RAPIER.init().then(() => RAPIER);
  }
  return rapierInitialization;
}

export interface RapierContactSummary {
  contactCount: number;
  terrainContactCount: number;
  obstacleContactCount: number;
  debugProbeContactCount: number;
  fixtureContactCount: number;
  fixtureKind: CollisionFixtureKind | null;
  maxObstacleHeadOnFactor: number;
  maxPenetrationM: number;
  maxTerrainImpactSpeedMps: number;
  maxObstacleImpactSpeedMps: number;
  maxTerrainImpulseNs: number;
  maxObstacleImpulseNs: number;
  totalPositionCorrectionM: number;
}

function createEmptySummary(): RapierContactSummary {
  return {
    contactCount: 0,
    terrainContactCount: 0,
    obstacleContactCount: 0,
    debugProbeContactCount: 0,
    fixtureContactCount: 0,
    fixtureKind: null,
    maxObstacleHeadOnFactor: 0,
    maxPenetrationM: 0,
    maxTerrainImpactSpeedMps: 0,
    maxObstacleImpactSpeedMps: 0,
    maxTerrainImpulseNs: 0,
    maxObstacleImpulseNs: 0,
    totalPositionCorrectionM: 0,
  };
}

function createTerrainMesh() {
  const pointsPerAxis = TERRAIN_SEGMENTS + 1;
  const vertices = new Float32Array(pointsPerAxis * pointsPerAxis * 3);
  const indices = new Uint32Array(TERRAIN_SEGMENTS * TERRAIN_SEGMENTS * 6);
  const halfSize = TERRAIN_SIZE_M * 0.5;

  let vertexOffset = 0;
  for (let zIndex = 0; zIndex < pointsPerAxis; zIndex += 1) {
    const z =
      -halfSize + (zIndex / TERRAIN_SEGMENTS) * TERRAIN_SIZE_M;
    for (let xIndex = 0; xIndex < pointsPerAxis; xIndex += 1) {
      const x =
        -halfSize + (xIndex / TERRAIN_SEGMENTS) * TERRAIN_SIZE_M;
      vertices[vertexOffset] = x;
      vertices[vertexOffset + 1] = MathUtils.clamp(
        getTerrainHeight(x, z),
        -140,
        120,
      );
      vertices[vertexOffset + 2] = z;
      vertexOffset += 3;
    }
  }

  let indexOffset = 0;
  for (let zIndex = 0; zIndex < TERRAIN_SEGMENTS; zIndex += 1) {
    for (let xIndex = 0; xIndex < TERRAIN_SEGMENTS; xIndex += 1) {
      const a = zIndex * pointsPerAxis + xIndex;
      const b = a + 1;
      const c = a + pointsPerAxis;
      const d = c + 1;

      indices[indexOffset] = a;
      indices[indexOffset + 1] = c;
      indices[indexOffset + 2] = b;
      indices[indexOffset + 3] = b;
      indices[indexOffset + 4] = c;
      indices[indexOffset + 5] = d;
      indexOffset += 6;
    }
  }

  return { vertices, indices };
}

/**
 * Dynamic Rapier collision authority for the custom marine-force body.
 *
 * SixDofBody integrates anisotropic marine forces into velocity. Rapier then
 * advances the pose exactly once, resolves every contact manifold with its
 * effective mass and angular inertia, and returns the solved state. This keeps
 * the bespoke hydrodynamic model while removing the hand-tuned contact solver.
 */
export class RapierCollisionWorld {
  private readonly world: RAPIER.World;
  private readonly terrainCollider: RAPIER.Collider;
  private readonly obstacleColliders: Array<RAPIER.Collider | null> =
    Array.from({ length: MAX_OBSTACLES }, () => null);
  private readonly obstacleRadii = new Float32Array(MAX_OBSTACLES);
  private readonly vesselColliders: RAPIER.Collider[] = [];
  private readonly vesselColliderHandles = new Set<number>();

  private vesselBody: RAPIER.RigidBody | null = null;
  private vesselType: VesselConfig['type'] | null = null;
  private debugProbeCollider: RAPIER.Collider | null = null;
  private debugProbeConsumed = false;
  private calibrationFixtureCollider: RAPIER.Collider | null = null;
  private calibrationFixtureKind: CollisionFixtureKind | null = null;

  private readonly normal = new Vector3();
  private readonly separation = new Vector3();
  private readonly contactPoint = new Vector3();
  private readonly pointOffset = new Vector3();
  private readonly pointVelocity = new Vector3();
  private readonly preStepCenterOfMass = new Vector3();
  private readonly preStepLinearVelocity = new Vector3();
  private readonly preStepAngularVelocity = new Vector3();
  private readonly preStepForward = new Vector3();
  private readonly centerOfMassLocal = new Vector3();
  private readonly principalInertia = new Vector3();
  private readonly debugProbePosition = new Vector3();
  private readonly fixturePosition = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly fixtureRotation = new Quaternion();
  private readonly localFixtureRotation = new Quaternion();

  private constructor(private readonly rapier: typeof RAPIER) {
    this.world = new rapier.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = 1 / 60;
    this.world.numSolverIterations = 6;
    this.world.numInternalPgsIterations = 2;

    const terrain = createTerrainMesh();
    this.terrainCollider = this.world.createCollider(
      rapier.ColliderDesc.trimesh(
        terrain.vertices,
        terrain.indices,
        rapier.TriMeshFlags.FIX_INTERNAL_EDGES,
      )
        .setFriction(0.18)
        .setRestitution(0.02)
        .setContactSkin(CONTACT_PREDICTION_M)
        .setActiveCollisionTypes(rapier.ActiveCollisionTypes.ALL),
    );
  }

  static async create() {
    const rapier = await initializeRapier();
    return new RapierCollisionWorld(rapier);
  }

  dispose() {
    this.world.free();
  }

  step(
    body: SixDofBody,
    vessel: VesselConfig,
    deltaSeconds: number,
    obstacleData: Float32Array,
    debugProbeEnabled = false,
    fixtureKind: CollisionFixtureKind | null = null,
    effectiveMassKg = vessel.massKg,
  ): RapierContactSummary {
    this.ensureVessel(body, vessel);
    const vesselBody = this.vesselBody;
    if (!vesselBody) {
      body.integratePose(deltaSeconds);
      return createEmptySummary();
    }

    this.syncObstacles(obstacleData);
    this.syncDebugProbe(body, vessel, debugProbeEnabled);
    this.syncCalibrationFixture(body, vessel, fixtureKind);

    const contactMassKg = Number.isFinite(effectiveMassKg)
      ? Math.max(1, effectiveMassKg)
      : vessel.massKg;
    body.getCenterOfMassLocal(this.centerOfMassLocal);
    body.getPrincipalInertia(this.principalInertia);
    this.principalInertia.set(
      Number.isFinite(this.principalInertia.x)
        ? Math.max(1e-6, this.principalInertia.x)
        : 1,
      Number.isFinite(this.principalInertia.y)
        ? Math.max(1e-6, this.principalInertia.y)
        : 1,
      Number.isFinite(this.principalInertia.z)
        ? Math.max(1e-6, this.principalInertia.z)
        : 1,
    );
    vesselBody.setAdditionalMassProperties(
      contactMassKg,
      {
        x: Number.isFinite(this.centerOfMassLocal.x)
          ? this.centerOfMassLocal.x
          : 0,
        y: Number.isFinite(this.centerOfMassLocal.y)
          ? this.centerOfMassLocal.y
          : 0,
        z: Number.isFinite(this.centerOfMassLocal.z)
          ? this.centerOfMassLocal.z
          : 0,
      },
      {
        x: this.principalInertia.x,
        y: this.principalInertia.y,
        z: this.principalInertia.z,
      },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    vesselBody.resetForces(true);
    vesselBody.resetTorques(true);

    // The solved Rapier transform was imported after the previous step. Avoid
    // rewriting an already-synchronized dynamic pose so CCD and contact-cache
    // history remain continuous. Explicitly resynchronize only after a reset,
    // teleport, or other external pose change.
    const currentTranslation = vesselBody.translation();
    const positionErrorSquared =
      (currentTranslation.x - body.position.x) ** 2 +
      (currentTranslation.y - body.position.y) ** 2 +
      (currentTranslation.z - body.position.z) ** 2;
    if (!Number.isFinite(positionErrorSquared) || positionErrorSquared > 1e-12) {
      vesselBody.setTranslation(
        {
          x: body.position.x,
          y: body.position.y,
          z: body.position.z,
        },
        true,
      );
    }

    const currentRotation = vesselBody.rotation();
    const rotationAlignment = Math.abs(
      currentRotation.x * body.quaternion.x +
        currentRotation.y * body.quaternion.y +
        currentRotation.z * body.quaternion.z +
        currentRotation.w * body.quaternion.w,
    );
    if (
      !Number.isFinite(rotationAlignment) ||
      1 - Math.min(1, rotationAlignment) > 1e-10
    ) {
      vesselBody.setRotation(
        {
          x: body.quaternion.x,
          y: body.quaternion.y,
          z: body.quaternion.z,
          w: body.quaternion.w,
        },
        true,
      );
    }

    vesselBody.setLinvel(
      {
        x: body.linearVelocity.x,
        y: body.linearVelocity.y,
        z: body.linearVelocity.z,
      },
      true,
    );
    vesselBody.setAngvel(
      {
        x: body.angularVelocity.x,
        y: body.angularVelocity.y,
        z: body.angularVelocity.z,
      },
      true,
    );

    // Capture the unsolved state once. Contact diagnostics must never depend on
    // manifold iteration order or on velocities already modified by Rapier.
    body.getWorldCenterOfMass(this.preStepCenterOfMass);
    this.preStepLinearVelocity.copy(body.linearVelocity);
    this.preStepAngularVelocity.copy(body.angularVelocity);
    this.preStepForward
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion)
      .normalize();

    this.world.timestep = MathUtils.clamp(deltaSeconds, 1 / 240, 1 / 20);
    this.world.step();

    const summary = createEmptySummary();
    const visitedPairs = new Set<string>();

    for (const vesselCollider of this.vesselColliders) {
      this.world.contactPairsWith(vesselCollider, (otherCollider) => {
        if (this.vesselColliderHandles.has(otherCollider.handle)) return;

        const lowerHandle = Math.min(
          vesselCollider.handle,
          otherCollider.handle,
        );
        const upperHandle = Math.max(
          vesselCollider.handle,
          otherCollider.handle,
        );
        const pairKey = `${lowerHandle}:${upperHandle}`;
        if (visitedPairs.has(pairKey)) return;
        visitedPairs.add(pairKey);

        this.world.contactPair(
          vesselCollider,
          otherCollider,
          (manifold, flipped) => {
            const geometricContactCount = manifold.numContacts();
            const solverContactCount = manifold.numSolverContacts();
            if (geometricContactCount <= 0 && solverContactCount <= 0) return;

            const isCalibrationFixture =
              otherCollider.handle === this.calibrationFixtureCollider?.handle;
            const fixtureIsTerrain =
              isCalibrationFixture &&
              this.calibrationFixtureKind === 'shoreline';
            const isTerrain =
              otherCollider.handle === this.terrainCollider.handle ||
              fixtureIsTerrain;
            const isDebugProbe =
              otherCollider.handle === this.debugProbeCollider?.handle;

            const rawNormal = manifold.normal();
            this.normal.set(rawNormal.x, rawNormal.y, rawNormal.z);
            if (!flipped) this.normal.negate();
            if (this.normal.lengthSq() <= 1e-8) return;
            this.normal.normalize();

            // Orient the manifold normal once using the first solver point.
            // Reorienting it inside the contact loop made diagnostics depend on
            // contact ordering when one compound hull piece had several points.
            if (solverContactCount > 0) {
              const rawPoint = manifold.solverContactPoint(0);
              this.contactPoint.set(rawPoint.x, rawPoint.y, rawPoint.z);
            } else {
              const colliderPosition = vesselCollider.translation();
              this.contactPoint.set(
                colliderPosition.x,
                colliderPosition.y,
                colliderPosition.z,
              );
            }
            this.separation
              .copy(this.preStepCenterOfMass)
              .sub(this.contactPoint);
            if (this.normal.dot(this.separation) < 0) {
              this.normal.negate();
            }

            let maximumPenetrationM = 0;
            let maximumSolvedImpulseNs = 0;
            for (let index = 0; index < geometricContactCount; index += 1) {
              const signedDistanceM = manifold.contactDist(index);
              if (Number.isFinite(signedDistanceM)) {
                maximumPenetrationM = Math.max(
                  maximumPenetrationM,
                  Math.max(0, -signedDistanceM),
                );
              }

              // Rapier stores solved impulses on the geometric contacts. The
              // solver-contact list is separate and is used below only for
              // world-space contact points and closing-speed diagnostics.
              const rawNormalImpulseNs = manifold.contactImpulse(index);
              const rawTangentImpulseXNs =
                manifold.contactTangentImpulseX(index);
              const rawTangentImpulseYNs =
                manifold.contactTangentImpulseY(index);
              const normalImpulseNs = Number.isFinite(rawNormalImpulseNs)
                ? Math.abs(rawNormalImpulseNs)
                : 0;
              const tangentImpulseXNs = Number.isFinite(
                rawTangentImpulseXNs,
              )
                ? rawTangentImpulseXNs
                : 0;
              const tangentImpulseYNs = Number.isFinite(
                rawTangentImpulseYNs,
              )
                ? rawTangentImpulseYNs
                : 0;
              maximumSolvedImpulseNs = Math.max(
                maximumSolvedImpulseNs,
                Math.hypot(
                  normalImpulseNs,
                  tangentImpulseXNs,
                  tangentImpulseYNs,
                ),
              );
            }

            let maximumImpactSpeedMps = 0;
            for (let index = 0; index < solverContactCount; index += 1) {
              const rawPoint = manifold.solverContactPoint(index);
              this.contactPoint.set(rawPoint.x, rawPoint.y, rawPoint.z);
              this.pointOffset
                .copy(this.contactPoint)
                .sub(this.preStepCenterOfMass);
              this.pointVelocity
                .copy(this.preStepAngularVelocity)
                .cross(this.pointOffset)
                .add(this.preStepLinearVelocity);
              maximumImpactSpeedMps = Math.max(
                maximumImpactSpeedMps,
                Math.max(0, -this.pointVelocity.dot(this.normal)),
              );
            }

            // Predictive contacts may not yet have a solver point. Preserve a
            // closing-speed diagnostic without inventing an impulse.
            if (solverContactCount <= 0) {
              this.pointOffset
                .copy(this.contactPoint)
                .sub(this.preStepCenterOfMass);
              this.pointVelocity
                .copy(this.preStepAngularVelocity)
                .cross(this.pointOffset)
                .add(this.preStepLinearVelocity);
              maximumImpactSpeedMps = Math.max(
                0,
                -this.pointVelocity.dot(this.normal),
              );
            }

            const reportedContactCount = Math.max(
              1,
              geometricContactCount,
              solverContactCount,
            );
            summary.contactCount += reportedContactCount;
            summary.maxPenetrationM = Math.max(
              summary.maxPenetrationM,
              maximumPenetrationM,
            );
            if (isCalibrationFixture) {
              summary.fixtureContactCount += reportedContactCount;
              summary.fixtureKind = this.calibrationFixtureKind;
            }

            if (isTerrain) {
              summary.terrainContactCount += reportedContactCount;
              summary.maxTerrainImpactSpeedMps = Math.max(
                summary.maxTerrainImpactSpeedMps,
                maximumImpactSpeedMps,
              );
              summary.maxTerrainImpulseNs = Math.max(
                summary.maxTerrainImpulseNs,
                maximumSolvedImpulseNs,
              );
            } else {
              summary.obstacleContactCount += reportedContactCount;
              summary.maxObstacleHeadOnFactor = Math.max(
                summary.maxObstacleHeadOnFactor,
                Math.abs(this.normal.dot(this.preStepForward)),
              );
              summary.maxObstacleImpactSpeedMps = Math.max(
                summary.maxObstacleImpactSpeedMps,
                maximumImpactSpeedMps,
              );
              summary.maxObstacleImpulseNs = Math.max(
                summary.maxObstacleImpulseNs,
                maximumSolvedImpulseNs,
              );
              if (isDebugProbe) {
                summary.debugProbeContactCount += reportedContactCount;
              }
            }
          },
        );
      });
    }

    const solvedTranslation = vesselBody.translation();
    const solvedRotation = vesselBody.rotation();
    const solvedLinearVelocity = vesselBody.linvel();
    const solvedAngularVelocity = vesselBody.angvel();
    const imported = body.importExternalSolverState({
      position: solvedTranslation,
      quaternion: solvedRotation,
      linearVelocity: solvedLinearVelocity,
      angularVelocity: solvedAngularVelocity,
    });
    if (!imported) {
      body.integratePose(deltaSeconds);
    }

    if (
      summary.debugProbeContactCount > 0 &&
      summary.maxObstacleImpulseNs > 0 &&
      this.debugProbeCollider
    ) {
      this.debugProbeCollider.setEnabled(false);
      this.debugProbeConsumed = true;
    }

    return summary;
  }

  private ensureVessel(body: SixDofBody, vessel: VesselConfig) {
    if (this.vesselBody && this.vesselType === vessel.type) return;

    if (this.vesselBody) {
      this.world.removeRigidBody(this.vesselBody);
      this.vesselBody = null;
      this.vesselColliders.length = 0;
      this.vesselColliderHandles.clear();
    }
    this.removeDebugProbe();
    this.removeCalibrationFixture();

    this.vesselType = vessel.type;
    body.getCenterOfMassLocal(this.centerOfMassLocal);
    body.getPrincipalInertia(this.principalInertia);
    const bodyDescription = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(body.position.x, body.position.y, body.position.z)
      .setRotation({
        x: body.quaternion.x,
        y: body.quaternion.y,
        z: body.quaternion.z,
        w: body.quaternion.w,
      })
      .setLinvel(
        body.linearVelocity.x,
        body.linearVelocity.y,
        body.linearVelocity.z,
      )
      .setAngvel({
        x: body.angularVelocity.x,
        y: body.angularVelocity.y,
        z: body.angularVelocity.z,
      })
      .setGravityScale(0)
      .setLinearDamping(0)
      .setAngularDamping(0)
      .setCanSleep(false)
      .setAdditionalMassProperties(
        vessel.massKg,
        {
          x: this.centerOfMassLocal.x,
          y: this.centerOfMassLocal.y,
          z: this.centerOfMassLocal.z,
        },
        {
          x: this.principalInertia.x,
          y: this.principalInertia.y,
          z: this.principalInertia.z,
        },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    this.vesselBody = this.world.createRigidBody(bodyDescription);
    this.vesselBody.enableCcd(true);
    this.vesselBody.setSoftCcdPrediction(
      Math.max(0.35, vessel.halfLengthM * 0.22),
    );
    this.vesselBody.setAdditionalSolverIterations(4);

    const halfWidth = vessel.halfWidthM;
    const halfLength = vessel.halfLengthM;
    const halfHeight = Math.max(0.22, vessel.deepestDraftM * 0.8);
    const pieces = [
      {
        x: 0,
        y: -halfHeight * 0.25,
        z: -halfLength * 0.62,
        hx: halfWidth * 0.62,
        hy: halfHeight,
        hz: halfLength * 0.34,
      },
      {
        x: 0,
        y: -halfHeight * 0.2,
        z: 0,
        hx: halfWidth * 0.88,
        hy: halfHeight,
        hz: halfLength * 0.42,
      },
      {
        x: 0,
        y: -halfHeight * 0.15,
        z: halfLength * 0.66,
        hx: halfWidth * 0.96,
        hy: halfHeight,
        hz: halfLength * 0.28,
      },
    ];

    for (const piece of pieces) {
      const collider = this.world.createCollider(
        this.rapier.ColliderDesc.roundCuboid(
          piece.hx,
          piece.hy,
          piece.hz,
          Math.min(
            COLLIDER_BORDER_M,
            piece.hx * 0.25,
            piece.hy * 0.25,
            piece.hz * 0.25,
          ),
        )
          .setTranslation(piece.x, piece.y, piece.z)
          .setDensity(0)
          .setFriction(0.22)
          .setRestitution(0.04)
          .setContactSkin(CONTACT_PREDICTION_M)
          .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.ALL),
        this.vesselBody,
      );
      this.vesselColliders.push(collider);
      this.vesselColliderHandles.add(collider.handle);
    }
  }

  private syncObstacles(obstacleData: Float32Array) {
    for (let index = 0; index < MAX_OBSTACLES; index += 1) {
      const offset = index * 4;
      const x = obstacleData[offset];
      const y = obstacleData[offset + 1];
      const z = obstacleData[offset + 2];
      const radius = obstacleData[offset + 3];
      const active = radius > 0 && Number.isFinite(x + y + z + radius);
      let collider = this.obstacleColliders[index];

      if (!active) {
        collider?.setEnabled(false);
        continue;
      }

      const safeRadius = Math.max(0.2, radius);
      if (!collider) {
        collider = this.world.createCollider(
          this.rapier.ColliderDesc.ball(safeRadius)
            .setTranslation(x, y, z)
            .setFriction(0.15)
            .setRestitution(0.08)
            .setContactSkin(CONTACT_PREDICTION_M)
            .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.ALL),
        );
        this.obstacleColliders[index] = collider;
        this.obstacleRadii[index] = safeRadius;
      } else {
        collider.setEnabled(true);
        collider.setTranslation({ x, y, z });
        if (Math.abs(this.obstacleRadii[index] - safeRadius) > 1e-4) {
          collider.setRadius(safeRadius);
          this.obstacleRadii[index] = safeRadius;
        }
      }
    }
  }

  private syncCalibrationFixture(
    body: SixDofBody,
    vessel: VesselConfig,
    fixtureKind: CollisionFixtureKind | null,
  ) {
    if (!fixtureKind) {
      this.calibrationFixtureCollider?.setEnabled(false);
      return;
    }
    if (
      this.calibrationFixtureCollider &&
      this.calibrationFixtureKind === fixtureKind
    ) {
      this.calibrationFixtureCollider.setEnabled(true);
      return;
    }

    this.removeCalibrationFixture();
    this.calibrationFixtureKind = fixtureKind;
    this.forward
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion)
      .normalize();
    this.right
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion)
      .normalize();
    this.fixtureRotation.copy(body.quaternion);

    if (fixtureKind === 'shoreline') {
      this.fixturePosition
        .copy(body.position)
        .addScaledVector(
          this.forward,
          vessel.halfLengthM + SHORE_HALF_DEPTH_M + 0.5,
        );
      this.fixturePosition.y = -1.4;
      this.localFixtureRotation.setFromAxisAngle(
        new Vector3(1, 0, 0),
        SHORE_SLOPE_RAD,
      );
      this.fixtureRotation.multiply(this.localFixtureRotation).normalize();
      this.calibrationFixtureCollider = this.world.createCollider(
        this.rapier.ColliderDesc.roundCuboid(
          SHORE_HALF_WIDTH_M,
          SHORE_HALF_HEIGHT_M,
          SHORE_HALF_DEPTH_M,
          COLLIDER_BORDER_M,
        )
          .setTranslation(
            this.fixturePosition.x,
            this.fixturePosition.y,
            this.fixturePosition.z,
          )
          .setRotation(this.fixtureRotation)
          .setFriction(0.18)
          .setRestitution(0.01)
          .setContactSkin(CONTACT_PREDICTION_M)
          .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.ALL),
      );
      return;
    }

    const glancing = fixtureKind === 'glancing';
    this.fixturePosition
      .copy(body.position)
      .addScaledVector(
        this.forward,
        vessel.halfLengthM + 5.5,
      );
    this.fixturePosition.y = body.position.y - 0.05;
    if (glancing) {
      this.fixturePosition.addScaledVector(
        this.right,
        vessel.halfWidthM * 0.45,
      );
      this.localFixtureRotation.setFromAxisAngle(
        new Vector3(0, 1, 0),
        MathUtils.degToRad(50),
      );
      this.fixtureRotation.multiply(this.localFixtureRotation).normalize();
    }

    this.calibrationFixtureCollider = this.world.createCollider(
      this.rapier.ColliderDesc.roundCuboid(
        FIXTURE_WALL_HALF_WIDTH_M,
        FIXTURE_WALL_HALF_HEIGHT_M,
        FIXTURE_WALL_HALF_DEPTH_M,
        COLLIDER_BORDER_M,
      )
        .setTranslation(
          this.fixturePosition.x,
          this.fixturePosition.y,
          this.fixturePosition.z,
        )
        .setRotation(this.fixtureRotation)
        .setFriction(glancing ? 0.24 : 0.32)
        .setRestitution(glancing ? 0.08 : 0.025)
        .setContactSkin(CONTACT_PREDICTION_M)
        .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.ALL),
    );
  }

  private removeCalibrationFixture() {
    if (this.calibrationFixtureCollider) {
      this.world.removeCollider(this.calibrationFixtureCollider, false);
      this.calibrationFixtureCollider = null;
    }
    this.calibrationFixtureKind = null;
  }

  private syncDebugProbe(
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
        .setContactSkin(0)
        .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.ALL),
    );
  }

  private removeDebugProbe() {
    if (this.debugProbeCollider) {
      this.world.removeCollider(this.debugProbeCollider, false);
      this.debugProbeCollider = null;
    }
    this.debugProbeConsumed = false;
  }
}
