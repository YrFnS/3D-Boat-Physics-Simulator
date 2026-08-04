import { MathUtils, Quaternion, Vector3 } from 'three';
import type { SixDofBody } from '@/sim/core/SixDofBody';
import type {
  HydrostaticHullCell,
  VesselConfig,
} from '@/sim/vessels/VesselConfig';
import type {
  WaterSurfaceSample,
  WaterSurfaceSampler,
} from '@/sim/water/WaterSurface';
import { createWaterSurfaceSample } from '@/sim/water/WaterSurface';
import {
  displacedColumnCentroidDepthM,
  displacedColumnVolumeM3,
  hydrodynamicDampingForceN,
  hydrostaticForceN,
  immersionFraction,
  slamForceN,
} from '@/sim/vessels/HydrostaticsMath';

const EPSILON = 1e-8;
const WORLD_UP = new Vector3(0, 1, 0);

export interface SectionalHydrostaticResult {
  submergedRatio: number;
  activeCellCount: number;
  deepestSubmersionM: number;
  averageWaterHeightM: number;
  displacedVolumeM3: number;
  buoyantForceN: number;
  centerOfBuoyancyWorld: Vector3;
  averageWaterVelocityWorld: Vector3;
  compartmentExposure: Record<string, number>;
  maximumSlamSeverity: number;
  slamCompartmentId: string;
  slamHullDamage: number;
  slamEngineDamage: number;
  slamRudderDamage: number;
}

interface CellScratch {
  readonly localBottomPoint: Vector3;
  readonly worldBottomPoint: Vector3;
  readonly buoyancyPoint: Vector3;
  readonly pointVelocity: Vector3;
  readonly waterVelocity: Vector3;
  readonly waterAcceleration: Vector3;
  readonly relativeVelocity: Vector3;
  readonly waterNormal: Vector3;
  readonly force: Vector3;
  readonly waterSample: WaterSurfaceSample;
}

export interface ApplySectionalHydrostaticsOptions {
  body: SixDofBody;
  vessel: VesselConfig;
  timeSeconds: number;
  deltaSeconds: number;
  baseCurrentVelocity: Vector3;
  forwardDragMultiplier: number;
  lateralDragMultiplier: number;
  buoyancyAvailabilityByCompartment: Readonly<Record<string, number>>;
  physicalMassKg: number;
  sampleWater: WaterSurfaceSampler;
}

/**
 * Section-based Archimedes support and hydrodynamic resistance.
 *
 * Each cell owns real waterplane area and maximum submerged volume. Local
 * water position, normal, orbital velocity, and vessel point velocity produce
 * buoyancy, damping, drag, restoring torque, and localized slam loads without
 * assigning visual angles or using a global spring acceleration.
 */
export class SectionalHydrostatics {
  private readonly cellScratch: CellScratch[] = [];
  private previousImmersion = new Float32Array(0);
  private previousVesselType: VesselConfig['type'] | null = null;
  private hasPreviousImmersion = false;

  private readonly forwardAxis = new Vector3();
  private readonly rightAxis = new Vector3();
  private readonly inverseRotation = new Quaternion();
  private readonly localAngularVelocity = new Vector3();
  private readonly localWaterAcceleration = new Vector3();
  private readonly waveExcitationForce = new Vector3();
  private readonly localTorque = new Vector3();
  private readonly worldTorque = new Vector3();
  private readonly weightedCenterOfBuoyancy = new Vector3();
  private readonly weightedWaterVelocity = new Vector3();

  private readonly result: SectionalHydrostaticResult = {
    submergedRatio: 0,
    activeCellCount: 0,
    deepestSubmersionM: 0,
    averageWaterHeightM: 0,
    displacedVolumeM3: 0,
    buoyantForceN: 0,
    centerOfBuoyancyWorld: new Vector3(),
    averageWaterVelocityWorld: new Vector3(),
    compartmentExposure: {},
    maximumSlamSeverity: 0,
    slamCompartmentId: '',
    slamHullDamage: 0,
    slamEngineDamage: 0,
    slamRudderDamage: 0,
  };

  reset(vessel?: VesselConfig) {
    this.previousVesselType = vessel?.type ?? null;
    this.previousImmersion = new Float32Array(
      vessel?.hydrostaticCells.length ?? 0,
    );
    this.hasPreviousImmersion = false;
  }

  apply({
    body,
    vessel,
    timeSeconds,
    deltaSeconds,
    baseCurrentVelocity,
    forwardDragMultiplier,
    lateralDragMultiplier,
    buoyancyAvailabilityByCompartment,
    physicalMassKg,
    sampleWater,
  }: ApplySectionalHydrostaticsOptions) {
    this.ensureVessel(vessel);
    const dt = Number.isFinite(deltaSeconds)
      ? Math.max(0, deltaSeconds)
      : 0;
    const compartmentExposure = this.result.compartmentExposure;
    for (const key of Object.keys(compartmentExposure)) {
      delete compartmentExposure[key];
    }

    this.result.submergedRatio = 0;
    this.result.activeCellCount = 0;
    this.result.deepestSubmersionM = 0;
    this.result.averageWaterHeightM = 0;
    this.result.displacedVolumeM3 = 0;
    this.result.buoyantForceN = 0;
    this.result.centerOfBuoyancyWorld.set(0, 0, 0);
    this.result.averageWaterVelocityWorld.set(0, 0, 0);
    this.result.maximumSlamSeverity = 0;
    this.result.slamCompartmentId = '';
    this.result.slamHullDamage = 0;
    this.result.slamEngineDamage = 0;
    this.result.slamRudderDamage = 0;
    this.weightedCenterOfBuoyancy.set(0, 0, 0);
    this.weightedWaterVelocity.set(0, 0, 0);

    this.forwardAxis
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion)
      .normalize();
    this.rightAxis
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion)
      .normalize();

    let totalCellWeight = 0;
    let weightedImmersion = 0;
    let weightedWaterHeight = 0;
    let waterVelocityWeight = 0;

    const forwardMultiplier = Math.max(0, forwardDragMultiplier);
    const lateralMultiplier = Math.max(0, lateralDragMultiplier);

    for (let index = 0; index < vessel.hydrostaticCells.length; index += 1) {
      const cell = vessel.hydrostaticCells[index];
      const scratch = this.getCellScratch(index);
      const weight = Math.max(0, cell.weight);
      totalCellWeight += weight;

      scratch.localBottomPoint.fromArray(cell.localPosition);
      scratch.localBottomPoint.y += vessel.baseDraftM;
      body.localPointToWorld(
        scratch.localBottomPoint,
        scratch.worldBottomPoint,
      );

      const waterSample = sampleWater(
        scratch.worldBottomPoint.x,
        scratch.worldBottomPoint.z,
        timeSeconds,
        scratch.waterSample,
      );
      scratch.waterVelocity
        .set(
          waterSample.velocityX,
          waterSample.velocityY,
          waterSample.velocityZ,
        )
        .add(baseCurrentVelocity);
      scratch.waterAcceleration.set(
        waterSample.accelerationX,
        waterSample.accelerationY,
        waterSample.accelerationZ,
      );
      scratch.waterNormal
        .set(
          waterSample.normalX,
          waterSample.normalY,
          waterSample.normalZ,
        );
      if (scratch.waterNormal.lengthSq() <= EPSILON) {
        scratch.waterNormal.copy(WORLD_UP);
      } else {
        scratch.waterNormal.normalize();
      }

      const depthM = waterSample.y - scratch.worldBottomPoint.y;
      const immersion = immersionFraction(
        depthM,
        cell.maxImmersionDepthM,
      );
      const availability =
        buoyancyAvailabilityByCompartment[cell.compartmentId] ?? 1;
      const displacedVolumeM3 = displacedColumnVolumeM3(
        cell.waterplaneAreaM2,
        depthM,
        cell.maxImmersionDepthM,
        cell.volumeExponent,
        availability,
      );
      const centroidDepthM = displacedColumnCentroidDepthM(
        depthM,
        cell.maxImmersionDepthM,
        cell.volumeExponent,
      );
      scratch.buoyancyPoint
        .copy(scratch.worldBottomPoint)
        .addScaledVector(WORLD_UP, centroidDepthM);

      // Keep the public submergence signal compatible with propulsion and
      // gameplay systems: a cell whose keel reference is exactly on the
      // surface contributes 0.5, while the hydrostatic volume itself still
      // starts from zero and follows the physical immersion fraction.
      const wetness = MathUtils.clamp(
        0.5 + depthM / Math.max(EPSILON, cell.maxImmersionDepthM),
        0,
        1,
      );
      weightedImmersion += wetness * weight;
      weightedWaterHeight += waterSample.y * weight;
      this.result.deepestSubmersionM = Math.max(
        this.result.deepestSubmersionM,
        Math.max(0, depthM),
      );
      if (immersion > 0.01) this.result.activeCellCount += 1;
      compartmentExposure[cell.compartmentId] = Math.max(
        compartmentExposure[cell.compartmentId] ?? 0,
        immersion,
      );

      if (displacedVolumeM3 > EPSILON) {
        const buoyantForceN = hydrostaticForceN(
          displacedVolumeM3,
          vessel.waterDensityKgM3,
        );
        body.addForceAtPoint(
          scratch.force.set(0, buoyantForceN, 0),
          scratch.buoyancyPoint,
        );
        this.result.displacedVolumeM3 += displacedVolumeM3;
        this.result.buoyantForceN += buoyantForceN;
        this.weightedCenterOfBuoyancy.addScaledVector(
          scratch.buoyancyPoint,
          displacedVolumeM3,
        );
        this.weightedWaterVelocity.addScaledVector(
          scratch.waterVelocity,
          displacedVolumeM3,
        );
        waterVelocityWeight += displacedVolumeM3;
      }

      body.velocityAtPoint(
        scratch.buoyancyPoint,
        scratch.pointVelocity,
      );
      scratch.relativeVelocity
        .copy(scratch.pointVelocity)
        .sub(scratch.waterVelocity);

      if (immersion > 0) {
        this.applyCellDampingAndDrag(
          body,
          vessel,
          cell,
          immersion,
          scratch,
          forwardMultiplier,
          lateralMultiplier,
        );
      }

      if (dt > 0 && this.hasPreviousImmersion) {
        this.applySlamLoad(
          body,
          vessel,
          index,
          immersion,
          dt,
          physicalMassKg,
          scratch,
        );
      }
      this.previousImmersion[index] = immersion;
    }

    if (this.result.displacedVolumeM3 > EPSILON) {
      this.result.centerOfBuoyancyWorld.copy(
        this.weightedCenterOfBuoyancy.multiplyScalar(
          1 / this.result.displacedVolumeM3,
        ),
      );
    } else {
      body.getWorldCenterOfMass(this.result.centerOfBuoyancyWorld);
    }
    if (waterVelocityWeight > EPSILON) {
      this.result.averageWaterVelocityWorld.copy(
        this.weightedWaterVelocity.multiplyScalar(
          1 / waterVelocityWeight,
        ),
      );
    } else {
      this.result.averageWaterVelocityWorld.copy(baseCurrentVelocity);
    }

    const inverseTotalWeight = totalCellWeight > EPSILON
      ? 1 / totalCellWeight
      : 0;
    this.result.submergedRatio = MathUtils.clamp(
      weightedImmersion * inverseTotalWeight,
      0,
      1,
    );
    this.result.averageWaterHeightM =
      weightedWaterHeight * inverseTotalWeight;

    this.applyAngularHydrodynamicDamping(body, vessel);
    this.hasPreviousImmersion = true;
    return this.result;
  }

  private applyCellDampingAndDrag(
    body: SixDofBody,
    vessel: VesselConfig,
    cell: HydrostaticHullCell,
    immersion: number,
    scratch: CellScratch,
    forwardMultiplier: number,
    lateralMultiplier: number,
  ) {
    const normalSpeedMps = scratch.relativeVelocity.dot(
      scratch.waterNormal,
    );
    const normalDampingN = hydrodynamicDampingForceN(
      normalSpeedMps,
      cell.heaveLinearDampingNPerMps,
      cell.heaveQuadraticDampingNPerMps2,
    ) * immersion;

    const forwardSpeedMps = scratch.relativeVelocity.dot(
      this.forwardAxis,
    );
    const lateralSpeedMps = scratch.relativeVelocity.dot(
      this.rightAxis,
    );
    const hydrodynamics = vessel.hydrodynamics;
    const forwardDragN = hydrodynamicDampingForceN(
      forwardSpeedMps,
      hydrodynamics.linearDampingNPerMps[2] * cell.weight,
      hydrodynamics.quadraticDampingNPerMps2[2] * cell.weight,
    ) * immersion * forwardMultiplier;
    const lateralDragN = hydrodynamicDampingForceN(
      lateralSpeedMps,
      hydrodynamics.linearDampingNPerMps[0] * cell.weight,
      hydrodynamics.quadraticDampingNPerMps2[0] * cell.weight,
    ) * immersion * lateralMultiplier;

    // Added mass changes the vessel acceleration response in SixDofBody. The
    // matching fluid-acceleration term below transfers Gerstner orbital
    // acceleration into the hull instead of treating waves as moving height
    // fields only.
    this.inverseRotation.copy(body.quaternion).invert();
    this.localWaterAcceleration
      .copy(scratch.waterAcceleration)
      .applyQuaternion(this.inverseRotation);
    this.waveExcitationForce
      .set(
        this.localWaterAcceleration.x * hydrodynamics.addedMassKg[0],
        this.localWaterAcceleration.y * hydrodynamics.addedMassKg[1],
        this.localWaterAcceleration.z * hydrodynamics.addedMassKg[2],
      )
      .multiplyScalar(cell.weight * immersion)
      .applyQuaternion(body.quaternion);

    scratch.force
      .copy(scratch.waterNormal)
      .multiplyScalar(normalDampingN)
      .addScaledVector(this.forwardAxis, forwardDragN)
      .addScaledVector(this.rightAxis, lateralDragN)
      .add(this.waveExcitationForce);
    if (scratch.force.lengthSq() > EPSILON) {
      body.addForceAtPoint(scratch.force, scratch.buoyancyPoint);
    }
  }

  private applySlamLoad(
    body: SixDofBody,
    vessel: VesselConfig,
    index: number,
    immersion: number,
    dt: number,
    physicalMassKg: number,
    scratch: CellScratch,
  ) {
    const cell = vessel.hydrostaticCells[index];
    const previousImmersion = this.previousImmersion[index] ?? 0;
    const wettingRatePerSecond = Math.max(
      0,
      (immersion - previousImmersion) / dt,
    );
    const relativeEntrySpeedMps = Math.max(
      0,
      -scratch.relativeVelocity.dot(scratch.waterNormal),
    );
    if (
      previousImmersion > 0.24 ||
      immersion <= 0.035 ||
      wettingRatePerSecond <= 0.2 ||
      relativeEntrySpeedMps <= 1.6
    ) {
      return;
    }

    const maximumForceN = Math.max(1, physicalMassKg) * 9.81 * 8;
    const forceN = slamForceN({
      waterDensityKgM3: vessel.waterDensityKgM3,
      slamAreaM2: cell.slamAreaM2,
      relativeEntrySpeedMps,
      wettingRatePerSecond,
      deadriseDeg: cell.deadriseDeg,
      slamCoefficient: cell.slamCoefficient,
      maximumForceN,
    });
    if (forceN <= EPSILON) return;

    body.addForceAtPoint(
      scratch.force.copy(scratch.waterNormal).multiplyScalar(forceN),
      scratch.buoyancyPoint,
    );

    const severity = forceN / Math.max(1, physicalMassKg * 9.81);
    if (severity > this.result.maximumSlamSeverity) {
      this.result.maximumSlamSeverity = severity;
      this.result.slamCompartmentId = cell.compartmentId;
    }
    const damageBase = Math.max(0, severity - 0.55);
    this.result.slamHullDamage +=
      damageBase * cell.slamCoefficient * 0.72;
    if (cell.localPosition[2] > vessel.halfLengthM * 0.45) {
      this.result.slamEngineDamage += Math.max(0, severity - 1.2) * 0.28;
      this.result.slamRudderDamage += Math.max(0, severity - 0.95) * 0.34;
    }
  }

  private applyAngularHydrodynamicDamping(
    body: SixDofBody,
    vessel: VesselConfig,
  ) {
    const immersionScale = this.result.submergedRatio;
    if (immersionScale <= 0) return;

    this.inverseRotation.copy(body.quaternion).invert();
    this.localAngularVelocity
      .copy(body.angularVelocity)
      .applyQuaternion(this.inverseRotation);
    const coefficients = vessel.hydrodynamics;
    this.localTorque.set(
      hydrodynamicDampingForceN(
        this.localAngularVelocity.x,
        coefficients.angularLinearDampingNmPerRadPerSecond[0],
        coefficients.angularQuadraticDampingNmPerRad2PerSecond2[0],
      ),
      hydrodynamicDampingForceN(
        this.localAngularVelocity.y,
        coefficients.angularLinearDampingNmPerRadPerSecond[1],
        coefficients.angularQuadraticDampingNmPerRad2PerSecond2[1],
      ),
      hydrodynamicDampingForceN(
        this.localAngularVelocity.z,
        coefficients.angularLinearDampingNmPerRadPerSecond[2],
        coefficients.angularQuadraticDampingNmPerRad2PerSecond2[2],
      ),
    ).multiplyScalar(immersionScale);
    this.worldTorque
      .copy(this.localTorque)
      .applyQuaternion(body.quaternion);
    body.addTorque(this.worldTorque);
  }

  private ensureVessel(vessel: VesselConfig) {
    if (
      this.previousVesselType !== vessel.type ||
      this.previousImmersion.length !== vessel.hydrostaticCells.length
    ) {
      this.reset(vessel);
    }
  }

  private getCellScratch(index: number): CellScratch {
    let scratch = this.cellScratch[index];
    if (!scratch) {
      scratch = {
        localBottomPoint: new Vector3(),
        worldBottomPoint: new Vector3(),
        buoyancyPoint: new Vector3(),
        pointVelocity: new Vector3(),
        waterVelocity: new Vector3(),
        waterAcceleration: new Vector3(),
        relativeVelocity: new Vector3(),
        waterNormal: new Vector3(),
        force: new Vector3(),
        waterSample: createWaterSurfaceSample(),
      };
      this.cellScratch[index] = scratch;
    }
    return scratch;
  }
}
