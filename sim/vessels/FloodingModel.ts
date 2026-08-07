import type {
  FloodCompartmentConfig,
  VesselConfig,
} from '@/sim/vessels/VesselConfig';
import { FIELD_REPAIR_LIMITS } from './FieldRepairPolicy.ts';
const GRAVITY_MPS2 = 9.81;
const DISCHARGE_COEFFICIENT = 0.62;
const EPSILON = 1e-8;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export interface FloodingStepOptions {
  vessel: VesselConfig;
  deltaSeconds: number;
  hullHealth: number;
  engineHealth: number;
  compartmentExposure: Readonly<Record<string, number>>;
  activePump: boolean;
  winterFactor: number;
}

export interface FloodingResult {
  totalFloodedVolumeM3: number;
  totalCapacityM3: number;
  floodingRatio: number;
  maximumCompartmentRatio: number;
  floodWaterMassKg: number;
  winterLoadMassKg: number;
  physicalMassKg: number;
  centerOfMassLocal: [number, number, number];
  principalInertiaKgM2: [number, number, number];
  buoyancyAvailabilityByCompartment: Record<string, number>;
  compartmentRatios: Record<string, number>;
  engineCompartmentFloodingRatio: number;
}

interface CompartmentState {
  volumeM3: number;
  breachSeverity: number;
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function compartmentLeakRateM3PerSecond(
  compartment: FloodCompartmentConfig,
  exposure: number,
  damageSeverity: number,
  breachSeverity: number,
) {
  const activeSeverity = Math.max(
    clamp01(damageSeverity),
    clamp01(breachSeverity),
  );
  if (activeSeverity <= 0 || exposure <= 0.01) return 0;

  const pressureHeadM = 0.04 + clamp01(exposure) * 0.58;
  return (
    DISCHARGE_COEFFICIENT *
    compartment.leakAreaM2 *
    Math.sqrt(2 * GRAVITY_MPS2 * pressureHeadM) *
    Math.pow(activeSeverity, 1.35) *
    compartment.susceptibility
  );
}

/**
 * Deterministic compartment flooding model. Flood water contributes mass and
 * shifts the center of gravity, while each flooded compartment also loses a
 * configured share of its sealed reserve buoyancy. This replaces the legacy
 * global draft offset and allows port/starboard or bow/stern damage to create
 * heel and trim naturally.
 */
export class FloodingModel {
  private vesselType: VesselConfig['type'] | null = null;
  private readonly states = new Map<string, CompartmentState>();
  private readonly result: FloodingResult = {
    totalFloodedVolumeM3: 0,
    totalCapacityM3: 0,
    floodingRatio: 0,
    maximumCompartmentRatio: 0,
    floodWaterMassKg: 0,
    winterLoadMassKg: 0,
    physicalMassKg: 1,
    centerOfMassLocal: [0, 0, 0],
    principalInertiaKgM2: [1, 1, 1],
    buoyancyAvailabilityByCompartment: {},
    compartmentRatios: {},
    engineCompartmentFloodingRatio: 0,
  };

  reset(vessel?: VesselConfig) {
    this.states.clear();
    this.vesselType = vessel?.type ?? null;
    if (vessel) this.ensureCompartments(vessel);
  }

  registerBreach(
    vessel: VesselConfig,
    compartmentId: string,
    severity: number,
  ) {
    this.ensureVessel(vessel);
    const state = this.states.get(compartmentId);
    if (!state) return;
    state.breachSeverity = clamp01(
      state.breachSeverity + Math.max(0, severity),
    );
  }

  step({
    vessel,
    deltaSeconds,
    hullHealth,
    engineHealth,
    compartmentExposure,
    activePump,
    winterFactor,
  }: FloodingStepOptions) {
    this.ensureVessel(vessel);
    const dt = Number.isFinite(deltaSeconds)
      ? Math.max(0, deltaSeconds)
      : 0;
    const enginePumpAuthority =
      0.25 + 0.75 * clamp01(engineHealth / 100);

    for (const compartment of vessel.floodCompartments) {
      const state = this.states.get(compartment.id)!;
      const exposure = clamp01(
        compartmentExposure[compartment.id] ?? 0,
      );
      const damageSeverity = clamp01(
        (compartment.damageThreshold - hullHealth) /
          Math.max(EPSILON, compartment.damageThreshold),
      );
      const leakRateM3PerSecond = compartmentLeakRateM3PerSecond(
        compartment,
        exposure,
        damageSeverity,
        state.breachSeverity,
      );
      const pumpRateM3PerSecond =
        compartment.passivePumpRateM3PerSecond * enginePumpAuthority +
        (activePump ? compartment.activePumpRateM3PerSecond : 0);

      state.volumeM3 = Math.min(
        compartment.capacityM3,
        Math.max(
          0,
          state.volumeM3 +
            (leakRateM3PerSecond - pumpRateM3PerSecond) * dt,
        ),
      );

      if (activePump && dt > 0) {
        state.breachSeverity = Math.max(
          0,
          state.breachSeverity -
            FIELD_REPAIR_LIMITS.breachStabilizationPerSecond * dt,
        );
      }
    }

    return this.rebuildResult(vessel, clamp01(winterFactor));
  }

  private ensureVessel(vessel: VesselConfig) {
    if (this.vesselType !== vessel.type) {
      this.reset(vessel);
      return;
    }
    this.ensureCompartments(vessel);
  }

  private ensureCompartments(vessel: VesselConfig) {
    for (const compartment of vessel.floodCompartments) {
      if (!this.states.has(compartment.id)) {
        this.states.set(compartment.id, {
          volumeM3: 0,
          breachSeverity: 0,
        });
      }
    }
  }

  private rebuildResult(vessel: VesselConfig, winterFactor: number) {
    const availability = this.result.buoyancyAvailabilityByCompartment;
    const ratios = this.result.compartmentRatios;
    for (const key of Object.keys(availability)) delete availability[key];
    for (const key of Object.keys(ratios)) delete ratios[key];

    let totalCapacityM3 = 0;
    let totalFloodedVolumeM3 = 0;
    let maximumCompartmentRatio = 0;
    let floodWaterMassKg = 0;
    let engineCompartmentFloodingRatio = 0;

    let weightedX = vessel.centerOfMassLocal[0] * vessel.massKg;
    let weightedY = vessel.centerOfMassLocal[1] * vessel.massKg;
    let weightedZ = vessel.centerOfMassLocal[2] * vessel.massKg;

    const floodMasses: Array<{
      massKg: number;
      localPosition: readonly [number, number, number];
    }> = [];

    for (const compartment of vessel.floodCompartments) {
      const state = this.states.get(compartment.id)!;
      const ratio = clamp01(
        state.volumeM3 / Math.max(EPSILON, compartment.capacityM3),
      );
      const retainedMassKg =
        state.volumeM3 *
        vessel.waterDensityKgM3 *
        compartment.retainedMassFraction;

      totalCapacityM3 += compartment.capacityM3;
      totalFloodedVolumeM3 += state.volumeM3;
      maximumCompartmentRatio = Math.max(maximumCompartmentRatio, ratio);
      floodWaterMassKg += retainedMassKg;
      ratios[compartment.id] = ratio;
      availability[compartment.id] = clamp01(
        1 - ratio * compartment.buoyancyLossFraction,
      );

      if (
        compartment.id.includes('engine') ||
        compartment.id.includes('machinery')
      ) {
        engineCompartmentFloodingRatio = Math.max(
          engineCompartmentFloodingRatio,
          ratio,
        );
      }

      weightedX += compartment.localPosition[0] * retainedMassKg;
      weightedY += compartment.localPosition[1] * retainedMassKg;
      weightedZ += compartment.localPosition[2] * retainedMassKg;
      floodMasses.push({
        massKg: retainedMassKg,
        localPosition: compartment.localPosition,
      });
    }

    const winterLoadMassKg =
      vessel.winterLoad.maximumMassKg * winterFactor;
    weightedX += vessel.winterLoad.localPosition[0] * winterLoadMassKg;
    weightedY += vessel.winterLoad.localPosition[1] * winterLoadMassKg;
    weightedZ += vessel.winterLoad.localPosition[2] * winterLoadMassKg;

    const physicalMassKg = Math.max(
      1,
      vessel.massKg + floodWaterMassKg + winterLoadMassKg,
    );
    const centerOfMassLocal: [number, number, number] = [
      weightedX / physicalMassKg,
      weightedY / physicalMassKg,
      weightedZ / physicalMassKg,
    ];

    const principalInertiaKgM2: [number, number, number] = [
      vessel.principalInertiaKgM2[0],
      vessel.principalInertiaKgM2[1],
      vessel.principalInertiaKgM2[2],
    ];

    for (const flood of floodMasses) {
      const dx = flood.localPosition[0] - centerOfMassLocal[0];
      const dy = flood.localPosition[1] - centerOfMassLocal[1];
      const dz = flood.localPosition[2] - centerOfMassLocal[2];
      principalInertiaKgM2[0] += flood.massKg * (dy * dy + dz * dz);
      principalInertiaKgM2[1] += flood.massKg * (dx * dx + dz * dz);
      principalInertiaKgM2[2] += flood.massKg * (dx * dx + dy * dy);
    }

    if (winterLoadMassKg > 0) {
      const dx = vessel.winterLoad.localPosition[0] - centerOfMassLocal[0];
      const dy = vessel.winterLoad.localPosition[1] - centerOfMassLocal[1];
      const dz = vessel.winterLoad.localPosition[2] - centerOfMassLocal[2];
      principalInertiaKgM2[0] +=
        winterLoadMassKg * (dy * dy + dz * dz);
      principalInertiaKgM2[1] +=
        winterLoadMassKg * (dx * dx + dz * dz);
      principalInertiaKgM2[2] +=
        winterLoadMassKg * (dx * dx + dy * dy);
    }

    this.result.totalFloodedVolumeM3 = totalFloodedVolumeM3;
    this.result.totalCapacityM3 = totalCapacityM3;
    this.result.floodingRatio = clamp01(
      totalFloodedVolumeM3 / Math.max(EPSILON, totalCapacityM3),
    );
    this.result.maximumCompartmentRatio = maximumCompartmentRatio;
    this.result.floodWaterMassKg = floodWaterMassKg;
    this.result.winterLoadMassKg = winterLoadMassKg;
    this.result.physicalMassKg = physicalMassKg;
    this.result.centerOfMassLocal = centerOfMassLocal;
    this.result.principalInertiaKgM2 = principalInertiaKgM2;
    this.result.engineCompartmentFloodingRatio =
      engineCompartmentFloodingRatio;
    return this.result;
  }
}

export function cloneFloodingResult(result: FloodingResult): FloodingResult {
  return {
    ...result,
    centerOfMassLocal: [...result.centerOfMassLocal],
    principalInertiaKgM2: [...result.principalInertiaKgM2],
    buoyancyAvailabilityByCompartment: {
      ...result.buoyancyAvailabilityByCompartment,
    },
    compartmentRatios: { ...result.compartmentRatios },
  };
}

export function createDryFloodingResult(vessel: VesselConfig): FloodingResult {
  const model = new FloodingModel();
  return model.step({
    vessel,
    deltaSeconds: 0,
    hullHealth: 100,
    engineHealth: 100,
    compartmentExposure: {},
    activePump: false,
    winterFactor: 0,
  });
}

export function floodedMassFromVolume(
  volumeM3: number,
  densityKgM3: number,
  retainedMassFraction: number,
) {
  return (
    finiteNonNegative(volumeM3) *
    finiteNonNegative(densityKgM3) *
    clamp01(retainedMassFraction)
  );
}
