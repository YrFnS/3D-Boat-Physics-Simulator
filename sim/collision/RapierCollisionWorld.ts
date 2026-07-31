import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { getTerrainHeight } from '@/lib/terrain';
import { MAX_OBSTACLES } from '@/store/useSimStore';
import type { SixDofBody } from '@/sim/core/SixDofBody';
import type { VesselConfig } from '@/sim/vessels/VesselConfig';

const TERRAIN_SIZE_M = 3_000;
const TERRAIN_SEGMENTS = 64;
const CONTACT_SLOP_M = 0.01;
const MAX_POSITION_CORRECTION_M = 0.18;
const MAX_TOTAL_CORRECTION_M = 0.45;
const COLLIDER_BORDER_M = 0.08;

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
  maxPenetrationM: number;
  maxImpactSpeedMps: number;
  maxImpulseNs: number;
}

const EMPTY_SUMMARY: RapierContactSummary = {
  contactCount: 0,
  terrainContactCount: 0,
  obstacleContactCount: 0,
  maxPenetrationM: 0,
  maxImpactSpeedMps: 0,
  maxImpulseNs: 0,
};

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
      vertices[vertexOffset + 1] = MathUtilsClamp(
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

function MathUtilsClamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Rapier-backed contact detector for the custom marine-force body.
 *
 * The vessel remains integrated by SixDofBody so the bespoke buoyancy and
 * hydrodynamic force model stays authoritative. Rapier owns only collision
 * geometry and contact manifolds. A kinematic compound hull is synchronized
 * to the custom body each fixed step, then manifold penetration and normals
 * are converted into bounded impulses and position corrections.
 */
export class RapierCollisionWorld {
  private readonly world: RAPIER.World;
  private readonly terrainCollider: RAPIER.Collider;
  private readonly obstacleColliders: Array<RAPIER.Collider | null> =
    Array.from({ length: MAX_OBSTACLES }, () => null);
  private readonly obstacleHandleToIndex = new Map<number, number>();
  private readonly vesselColliders: RAPIER.Collider[] = [];

  private vesselBody: RAPIER.RigidBody | null = null;
  private vesselType: VesselConfig['type'] | null = null;

  private readonly normal = new Vector3();
  private readonly separation = new Vector3();
  private readonly contactPoint = new Vector3();
  private readonly pointVelocity = new Vector3();
  private readonly impulse = new Vector3();
  private readonly tangent = new Vector3();
  private readonly correction = new Vector3();
  private readonly vesselPosition = new Vector3();
  private readonly vesselRotation = new Quaternion();

  private constructor(rapier: typeof RAPIER) {
    this.world = new rapier.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = 1 / 60;
    this.world.numSolverIterations = 6;

    const terrain = createTerrainMesh();
    this.terrainCollider = this.world.createCollider(
      rapier.ColliderDesc.trimesh(
        terrain.vertices,
        terrain.indices,
        rapier.TriMeshFlags.FIX_INTERNAL_EDGES,
      )
        .setFriction(0.45)
        .setRestitution(0.02)
        .setContactSkin(CONTACT_SLOP_M),
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
  ): RapierContactSummary {
    this.ensureVessel(body, vessel);
    const vesselBody = this.vesselBody;
    if (!vesselBody) return EMPTY_SUMMARY;

    this.syncObstacles(obstacleData);

    vesselBody.setNextKinematicTranslation({
      x: body.position.x,
      y: body.position.y,
      z: body.position.z,
    });
    vesselBody.setNextKinematicRotation({
      x: body.quaternion.x,
      y: body.quaternion.y,
      z: body.quaternion.z,
      w: body.quaternion.w,
    });

    this.world.timestep = Math.max(1 / 240, Math.min(1 / 20, deltaSeconds));
    this.world.step();

    const summary: RapierContactSummary = {
      contactCount: 0,
      terrainContactCount: 0,
      obstacleContactCount: 0,
      maxPenetrationM: 0,
      maxImpactSpeedMps: 0,
      maxImpulseNs: 0,
    };
    let totalCorrectionM = 0;
    const visitedPairs = new Set<string>();

    for (const vesselCollider of this.vesselColliders) {
      this.world.contactPairsWith(vesselCollider, (otherCollider) => {
        const pairKey = `${vesselCollider.handle}:${otherCollider.handle}`;
        if (visitedPairs.has(pairKey)) return;
        visitedPairs.add(pairKey);

        this.world.contactPair(
          vesselCollider,
          otherCollider,
          (manifold) => {
            const contactCount = manifold.numContacts();
            if (contactCount <= 0) return;

            let penetrationM = 0;
            for (let index = 0; index < contactCount; index += 1) {
              penetrationM = Math.max(
                penetrationM,
                -manifold.contactDist(index),
              );
            }
            if (penetrationM <= 0) return;

            const isTerrain =
              otherCollider.handle === this.terrainCollider.handle;
            const rawNormal = manifold.normal();
            this.normal.set(rawNormal.x, rawNormal.y, rawNormal.z);

            if (isTerrain) {
              if (this.normal.y < 0) this.normal.negate();
            } else {
              const otherPosition = otherCollider.translation();
              this.separation
                .copy(body.position)
                .sub(
                  this.vesselPosition.set(
                    otherPosition.x,
                    otherPosition.y,
                    otherPosition.z,
                  ),
                );
              if (this.normal.dot(this.separation) < 0) {
                this.normal.negate();
              }
            }
            if (this.normal.lengthSq() <= 1e-8) return;
            this.normal.normalize();

            if (manifold.numSolverContacts() > 0) {
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

            body.velocityAtPoint(this.contactPoint, this.pointVelocity);
            const normalSpeedMps = this.pointVelocity.dot(this.normal);
            const impactSpeedMps = Math.max(0, -normalSpeedMps);
            const impulseNs = Math.min(
              vessel.massKg * 14,
              impactSpeedMps * vessel.massKg * 0.62,
            );

            if (impulseNs > 0) {
              body.applyImpulseAtPoint(
                this.impulse.copy(this.normal).multiplyScalar(impulseNs),
                this.contactPoint,
              );

              this.tangent
                .copy(this.pointVelocity)
                .addScaledVector(this.normal, -normalSpeedMps);
              const tangentSpeedMps = this.tangent.length();
              if (tangentSpeedMps > 1e-5) {
                const frictionImpulseNs = Math.min(
                  impulseNs * 0.32,
                  tangentSpeedMps * vessel.massKg * 0.08,
                );
                body.applyImpulseAtPoint(
                  this.impulse
                    .copy(this.tangent)
                    .multiplyScalar(-frictionImpulseNs / tangentSpeedMps),
                  this.contactPoint,
                );
              }
            }

            const correctionM = Math.min(
              MAX_POSITION_CORRECTION_M,
              Math.max(0, penetrationM - CONTACT_SLOP_M) * 0.55,
              MAX_TOTAL_CORRECTION_M - totalCorrectionM,
            );
            if (correctionM > 0) {
              body.applyPositionCorrection(
                this.correction
                  .copy(this.normal)
                  .multiplyScalar(correctionM),
              );
              totalCorrectionM += correctionM;
            }

            summary.contactCount += 1;
            summary.maxPenetrationM = Math.max(
              summary.maxPenetrationM,
              penetrationM,
            );
            summary.maxImpactSpeedMps = Math.max(
              summary.maxImpactSpeedMps,
              impactSpeedMps,
            );
            summary.maxImpulseNs = Math.max(
              summary.maxImpulseNs,
              impulseNs,
            );
            if (isTerrain) summary.terrainContactCount += 1;
            else summary.obstacleContactCount += 1;
          },
        );
      });
    }

    return summary;
  }

  private ensureVessel(body: SixDofBody, vessel: VesselConfig) {
    if (this.vesselBody && this.vesselType === vessel.type) return;

    if (this.vesselBody) {
      this.world.removeRigidBody(this.vesselBody);
      this.vesselBody = null;
      this.vesselColliders.length = 0;
    }

    this.vesselType = vessel.type;
    const bodyDescription = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(body.position.x, body.position.y, body.position.z)
      .setRotation({
        x: body.quaternion.x,
        y: body.quaternion.y,
        z: body.quaternion.z,
        w: body.quaternion.w,
      })
      .setCanSleep(false);
    this.vesselBody = this.world.createRigidBody(bodyDescription);

    const activeCollisionTypes =
      RAPIER.ActiveCollisionTypes.DEFAULT |
      RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED;
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
        RAPIER.ColliderDesc.roundCuboid(
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
          .setContactSkin(CONTACT_SLOP_M)
          .setActiveCollisionTypes(activeCollisionTypes),
        this.vesselBody,
      );
      this.vesselColliders.push(collider);
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

      if (!collider) {
        collider = this.world.createCollider(
          RAPIER.ColliderDesc.ball(Math.max(0.2, radius))
            .setTranslation(x, y, z)
            .setFriction(0.15)
            .setRestitution(0.08)
            .setContactSkin(CONTACT_SLOP_M),
        );
        this.obstacleColliders[index] = collider;
        this.obstacleHandleToIndex.set(collider.handle, index);
      } else {
        collider.setEnabled(true);
        collider.setTranslation({ x, y, z });
        collider.setRadius(Math.max(0.2, radius));
      }
    }
  }
}
