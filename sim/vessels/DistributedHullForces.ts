import { MathUtils, Vector3 } from 'three';
import type { SixDofBody } from '@/sim/core/SixDofBody';
import type { VesselConfig } from '@/sim/vessels/VesselConfig';

export interface WaterHeightSample {
  x: number;
  y: number;
  z: number;
}

export type WaterHeightSampler = (
  x: number,
  z: number,
  timeSeconds: number,
  target: WaterHeightSample,
) => WaterHeightSample;

export interface DistributedHullForceResult {
  submergedRatio: number;
  activePointCount: number;
  deepestSubmersionM: number;
  averageWaterHeightM: number;
}

interface PointScratch {
  readonly localPoint: Vector3;
  readonly worldPoint: Vector3;
  readonly pointVelocity: Vector3;
  readonly waterRelativeVelocity: Vector3;
  readonly force: Vector3;
  readonly waterSample: WaterHeightSample;
}

export interface ApplyDistributedHullForcesOptions {
  body: SixDofBody;
  vessel: VesselConfig;
  timeSeconds: number;
  waterVelocity: Vector3;
  draftOffsetM: number;
  buoyancyStiffness: number;
  forwardDragMultiplier: number;
  lateralDragMultiplier: number;
  sampleWater: WaterHeightSampler;
}

const EPSILON = 1e-8;

/**
 * Applies hydrostatic support and hydrodynamic resistance at a configurable
 * lattice of hull points. Point velocities include angular motion, so the
 * resulting forces naturally create pitch, roll, yaw, heave, and damping
 * torques instead of correcting those axes directly.
 */
export class DistributedHullForces {
  private readonly pointScratch: PointScratch[] = [];
  private readonly forwardAxis = new Vector3();
  private readonly rightAxis = new Vector3();
  private readonly result: DistributedHullForceResult = {
    submergedRatio: 0,
    activePointCount: 0,
    deepestSubmersionM: 0,
    averageWaterHeightM: 0,
  };

  apply({
    body,
    vessel,
    timeSeconds,
    waterVelocity,
    draftOffsetM,
    buoyancyStiffness,
    forwardDragMultiplier,
    lateralDragMultiplier,
    sampleWater,
  }: ApplyDistributedHullForcesOptions): DistributedHullForceResult {
    this.forwardAxis
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion)
      .normalize();
    this.rightAxis
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion)
      .normalize();

    let totalWeight = 0;
    let weightedSubmersion = 0;
    let weightedWaterHeight = 0;
    let activePointCount = 0;
    let deepestSubmersionM = 0;

    const forwardDragCoefficient =
      vessel.forwardDragCoefficient * Math.max(0, forwardDragMultiplier);
    const lateralDragCoefficient =
      vessel.forwardDragCoefficient *
      vessel.keelDragMultiplier *
      Math.max(0, lateralDragMultiplier);

    for (let index = 0; index < vessel.hullForcePoints.length; index += 1) {
      const point = vessel.hullForcePoints[index];
      const weight = Math.max(0, point.weight);
      if (weight <= 0) continue;

      const scratch = this.getPointScratch(index);
      scratch.localPoint.fromArray(point.localPosition);
      body.localPointToWorld(scratch.localPoint, scratch.worldPoint);
      const waterSample = sampleWater(
        scratch.worldPoint.x,
        scratch.worldPoint.z,
        timeSeconds,
        scratch.waterSample,
      );

      const depthM =
        waterSample.y - draftOffsetM - scratch.worldPoint.y;
      const submerged = MathUtils.clamp(
        depthM * vessel.submersionResponsePerM + 0.5,
        0,
        1,
      );

      totalWeight += weight;
      weightedSubmersion += submerged * weight;
      weightedWaterHeight += waterSample.y * weight;
      deepestSubmersionM = Math.max(deepestSubmersionM, depthM);
      if (submerged > 0.01) activePointCount += 1;

      if (depthM <= -vessel.buoyancyActivationDepthM) continue;

      body.velocityAtPoint(scratch.worldPoint, scratch.pointVelocity);

      const rawBuoyancyAcceleration =
        Math.max(0, depthM) * buoyancyStiffness -
        scratch.pointVelocity.y * vessel.verticalDamping * submerged;
      const buoyancyAcceleration = MathUtils.clamp(
        rawBuoyancyAcceleration,
        -vessel.maxBuoyancyAccelerationMps2 * 0.6,
        vessel.maxBuoyancyAccelerationMps2,
      );
      const buoyancyForceN =
        buoyancyAcceleration * vessel.massKg * weight;

      if (Math.abs(buoyancyForceN) > EPSILON) {
        body.addForceAtPoint(
          scratch.force.set(0, buoyancyForceN, 0),
          scratch.worldPoint,
        );
      }

      if (submerged <= 0) continue;

      scratch.waterRelativeVelocity
        .copy(scratch.pointVelocity)
        .sub(waterVelocity);
      const forwardSpeed = scratch.waterRelativeVelocity.dot(this.forwardAxis);
      const lateralSpeed = scratch.waterRelativeVelocity.dot(this.rightAxis);
      const immersionWeight = submerged * weight;

      const forwardDragN =
        (-forwardSpeed * forwardDragCoefficient -
          forwardSpeed *
            Math.abs(forwardSpeed) *
            forwardDragCoefficient *
            0.2) *
        immersionWeight;
      const lateralDragN =
        -lateralSpeed *
        Math.abs(lateralSpeed) *
        lateralDragCoefficient *
        immersionWeight;

      scratch.force
        .copy(this.forwardAxis)
        .multiplyScalar(forwardDragN)
        .addScaledVector(this.rightAxis, lateralDragN);

      if (scratch.force.lengthSq() > EPSILON) {
        body.addForceAtPoint(scratch.force, scratch.worldPoint);
      }
    }

    const inverseTotalWeight = totalWeight > EPSILON ? 1 / totalWeight : 0;
    this.result.submergedRatio = MathUtils.clamp(
      weightedSubmersion * inverseTotalWeight,
      0,
      1,
    );
    this.result.activePointCount = activePointCount;
    this.result.deepestSubmersionM = Math.max(0, deepestSubmersionM);
    this.result.averageWaterHeightM =
      weightedWaterHeight * inverseTotalWeight;
    return this.result;
  }

  private getPointScratch(index: number): PointScratch {
    let scratch = this.pointScratch[index];
    if (!scratch) {
      scratch = {
        localPoint: new Vector3(),
        worldPoint: new Vector3(),
        pointVelocity: new Vector3(),
        waterRelativeVelocity: new Vector3(),
        force: new Vector3(),
        waterSample: { x: 0, y: 0, z: 0 },
      };
      this.pointScratch[index] = scratch;
    }
    return scratch;
  }
}
