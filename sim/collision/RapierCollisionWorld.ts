import RAPIER from '@dimforge/rapier3d-compat';
import { MathUtils, Vector3 } from 'three';
import { getTerrainHeight } from '@/lib/terrain';
import { MAX_OBSTACLES } from '@/store/useSimStore';
import type { SixDofBody } from '@/sim/core/SixDofBody';
import type { VesselConfig } from '@/sim/vessels/VesselConfig';

const TERRAIN_SIZE_M = 3_000;
const TERRAIN_SEGMENTS = 96;
const CONTACT_SLOP_M = 0.012;
const MAX_POSITION_CORRECTION_M = 0.16;
const MAX_TOTAL_CORRECTION_M = 0.42;
const COLLIDER_BORDER_M = 0.08;
const DEBUG_PROBE_RADIUS_M = 0.65;
const DEBUG_PROBE_GAP_M = 0.12;

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
 * Rapier-backed contact detector for the custom marine-force body.
 *
 * The vessel remains integrated by SixDofBody so the bespoke buoyancy and
 * hydrodynamic force model stays authoritative. Rapier owns collision geometry
 * and contact manifolds. A kinematic compound hull is synchronized to the
 * custom body each fixed step, then penetration, normals, and contact points
 * are converted into bounded impulses and positional correction.
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

  private readonly normal = new Vector3();
  private readonly separation = new Vector3();
  private readonly contactPoint = new Vector3();
  private readonly pointVelocity = new Vector3();
  private readonly impulse = new Vector3();
  private readonly tangent = new Vector3();
  private readonly correction = new Vector3();
  private readonly otherPosition = new Vector3();
  private readonly vesselCenterOfMass = new Vector3();
  private readonly debugProbePosition = new Vector3();
  private readonly forward = new Vector3();

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
        .setFriction(0.55)
        .setRestitution(0.02)
        .setContactSkin(CONTACT_SLOP_M)
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
  ): RapierContactSummary {
    this.ensureVessel(body, vessel);
    const vesselBody = this.vesselBody;
    if (!vesselBody) return createEmptySummary();

    this.syncObstacles(obstacleData);
    this.syncDebugProbe(body, vessel, debugProbeEnabled);

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

    this.world.timestep = MathUtils.clamp(deltaSeconds, 1 / 240, 1 / 20);
    this.world.step();

    const summary = createEmptySummary();
    let totalCorrectionM = 0;
    let remainingNormalImpulseNs = vessel.massKg * 18;
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
            const isDebugProbe =
              otherCollider.handle === this.debugProbeCollider?.handle;

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

            const rawNormal = manifold.normal();
            this.normal.set(rawNormal.x, rawNormal.y, rawNormal.z);
            if (!flipped) this.normal.negate();

            body.getWorldCenterOfMass(this.vesselCenterOfMass);
            this.separation
              .copy(this.vesselCenterOfMass)
              .sub(this.contactPoint);
            if (this.normal.dot(this.separation) < 0) {
              this.normal.negate();
            }
            if (this.normal.lengthSq() <= 1e-8) return;
            this.normal.normalize();

            body.velocityAtPoint(this.contactPoint, this.pointVelocity);
            const normalSpeedMps = this.pointVelocity.dot(this.normal);
            const impactSpeedMps = Math.max(0, -normalSpeedMps);
            const responseScale = isTerrain ? 0.72 : 0.6;
            const impulseNs = Math.min(
              remainingNormalImpulseNs,
              vessel.massKg * 12,
              impactSpeedMps * vessel.massKg * responseScale,
            );

            if (impulseNs > 0) {
              body.applyImpulseAtPoint(
                this.impulse.copy(this.normal).multiplyScalar(impulseNs),
                this.contactPoint,
              );
              remainingNormalImpulseNs -= impulseNs;
            }

            this.tangent
              .copy(this.pointVelocity)
              .addScaledVector(this.normal, -normalSpeedMps);
            const tangentSpeedMps = this.tangent.length();
            if (tangentSpeedMps > 1e-5) {
              const frictionImpulseNs = Math.min(
                tangentSpeedMps *
                  vessel.massKg *
                  (isTerrain ? 0.18 : 0.06),
                vessel.massKg * (isTerrain ? 2.5 : 0.8),
                Math.max(impulseNs, vessel.massKg * penetrationM * 0.9) *
                  (isTerrain ? 0.75 : 0.3),
              );
              if (frictionImpulseNs > 0) {
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
              Math.max(0, penetrationM - CONTACT_SLOP_M) * 0.58,
              Math.max(0, MAX_TOTAL_CORRECTION_M - totalCorrectionM),
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
            if (isTerrain) {
              summary.terrainContactCount += 1;
              summary.maxTerrainImpactSpeedMps = Math.max(
                summary.maxTerrainImpactSpeedMps,
                impactSpeedMps,
              );
              summary.maxTerrainImpulseNs = Math.max(
                summary.maxTerrainImpulseNs,
                impulseNs,
              );
            } else {
              summary.obstacleContactCount += 1;
              summary.maxObstacleImpactSpeedMps = Math.max(
                summary.maxObstacleImpactSpeedMps,
                impactSpeedMps,
              );
              summary.maxObstacleImpulseNs = Math.max(
                summary.maxObstacleImpulseNs,
                impulseNs,
              );
              if (isDebugProbe) summary.debugProbeContactCount += 1;
            }
          },
        );
      });
    }

    summary.totalPositionCorrectionM = totalCorrectionM;

    if (summary.debugProbeContactCount > 0 && this.debugProbeCollider) {
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

    this.vesselType = vessel.type;
    const bodyDescription = this.rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(body.position.x, body.position.y, body.position.z)
      .setRotation({
        x: body.quaternion.x,
        y: body.quaternion.y,
        z: body.quaternion.z,
        w: body.quaternion.w,
      })
      .setCanSleep(false);
    this.vesselBody = this.world.createRigidBody(bodyDescription);

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
          .setFriction(0.22)
          .setRestitution(0.04)
          .setContactSkin(CONTACT_SLOP_M)
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
            .setContactSkin(CONTACT_SLOP_M)
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

  private removeDebugProbe() {
    if (this.debugProbeCollider) {
      this.world.removeCollider(this.debugProbeCollider, false);
      this.debugProbeCollider = null;
    }
    this.debugProbeConsumed = false;
  }
}
