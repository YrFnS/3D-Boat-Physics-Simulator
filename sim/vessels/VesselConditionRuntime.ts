import {
  applyFieldRepairStep,
  type FieldRepairStepResult,
} from './FieldRepairPolicy.ts';
import {
  applyVesselDamage,
  type VesselDamageEvent,
} from './VesselDamagePolicy.ts';

export interface VesselConditionState {
  hullHealth: number;
  engineHealth: number;
  engineTemperature: number;
  rudderHealth: number;
}

export interface VesselConditionThermalStep {
  deltaSeconds: number;
  engineRpm: number;
  ratedEngineRpm: number;
  absorbedShaftPowerW: number;
  ratedEnginePowerW: number;
  ventilationFactor: number;
  submergedRatio: number;
  engineCompartmentFloodingRatio: number;
  simulationTimeSeconds: number;
}

export interface VesselConditionRepairStep {
  active: boolean;
  deltaSeconds: number;
  engineConditionRestoredThisRun: number;
  rudderConditionRestoredThisRun: number;
}

const DEFAULT_CONDITION: Readonly<VesselConditionState> = Object.freeze({
  hullHealth: 100,
  engineHealth: 100,
  engineTemperature: 20,
  rudderHealth: 100,
});

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function clampHealth(value: number) {
  return clamp(value, 0, 100);
}

function lerp(start: number, end: number, alpha: number) {
  return start + (end - start) * alpha;
}

/**
 * Authoritative mutable condition state for one mounted vessel runtime.
 *
 * The React vessel component owns orchestration and rendering, while this
 * class owns component health, engine temperature, explicit damage, and
 * limited underway repair. Recovery remounts can seed it from store telemetry;
 * new scenarios and calibration runs reset it to a pristine condition.
 */
export class VesselConditionRuntime {
  private hullHealthValue = DEFAULT_CONDITION.hullHealth;
  private engineHealthValue = DEFAULT_CONDITION.engineHealth;
  private engineTemperatureValue = DEFAULT_CONDITION.engineTemperature;
  private rudderHealthValue = DEFAULT_CONDITION.rudderHealth;

  constructor(initialCondition: Partial<VesselConditionState> = {}) {
    this.reset(initialCondition);
  }

  get hullHealth() {
    return this.hullHealthValue;
  }

  get engineHealth() {
    return this.engineHealthValue;
  }

  get engineTemperature() {
    return this.engineTemperatureValue;
  }

  get rudderHealth() {
    return this.rudderHealthValue;
  }

  get snapshot(): Readonly<VesselConditionState> {
    return {
      hullHealth: this.hullHealthValue,
      engineHealth: this.engineHealthValue,
      engineTemperature: this.engineTemperatureValue,
      rudderHealth: this.rudderHealthValue,
    };
  }

  reset(initialCondition: Partial<VesselConditionState> = {}) {
    this.hullHealthValue = clampHealth(
      initialCondition.hullHealth ?? DEFAULT_CONDITION.hullHealth,
    );
    this.engineHealthValue = clampHealth(
      initialCondition.engineHealth ?? DEFAULT_CONDITION.engineHealth,
    );
    this.engineTemperatureValue = Math.max(
      20,
      Number.isFinite(initialCondition.engineTemperature)
        ? initialCondition.engineTemperature!
        : DEFAULT_CONDITION.engineTemperature,
    );
    this.rudderHealthValue = clampHealth(
      initialCondition.rudderHealth ?? DEFAULT_CONDITION.rudderHealth,
    );
    return this.snapshot;
  }

  applyDamage(event: VesselDamageEvent) {
    const nextHealth = applyVesselDamage(
      {
        hullHealth: this.hullHealthValue,
        engineHealth: this.engineHealthValue,
        rudderHealth: this.rudderHealthValue,
      },
      event,
    );
    this.hullHealthValue = nextHealth.hullHealth;
    this.engineHealthValue = nextHealth.engineHealth;
    this.rudderHealthValue = nextHealth.rudderHealth;
    return this.snapshot;
  }

  stepThermalAndFlooding(input: VesselConditionThermalStep) {
    const deltaSeconds = finiteNonNegative(input.deltaSeconds);
    if (deltaSeconds <= 0) return this.snapshot;

    const ratedEngineRpm = Math.max(
      1,
      finiteNonNegative(input.ratedEngineRpm),
    );
    const ratedEnginePowerW = Math.max(
      1,
      finiteNonNegative(input.ratedEnginePowerW),
    );
    const normalizedEngineRpm = clamp(
      finiteNonNegative(input.engineRpm) / ratedEngineRpm,
      0,
      1.25,
    );
    const normalizedShaftPower = clamp(
      finiteNonNegative(input.absorbedShaftPowerW) /
        ratedEnginePowerW,
      0,
      1.25,
    );

    let targetTemperature =
      20 + normalizedEngineRpm * 32 + normalizedShaftPower * 34;
    let temperatureLerpRate =
      finiteNonNegative(input.engineRpm) > ratedEngineRpm * 0.7
        ? 0.012
        : 0.025;

    if (input.submergedRatio > 0.95) {
      temperatureLerpRate = 0.5;
    } else if (
      input.ventilationFactor < 0.15 &&
      finiteNonNegative(input.engineRpm) > ratedEngineRpm * 0.7
    ) {
      targetTemperature = 105;
      temperatureLerpRate = 0.03;
    }

    targetTemperature = Math.min(105, targetTemperature);
    this.engineTemperatureValue = lerp(
      this.engineTemperatureValue,
      targetTemperature,
      temperatureLerpRate * deltaSeconds,
    );

    if (this.engineTemperatureValue > 90) {
      this.applyDamage({
        source: 'engine-overheat',
        engineDamage:
          (this.engineTemperatureValue - 90) *
          0.05 *
          deltaSeconds,
      });
    }

    if (
      input.engineCompartmentFloodingRatio > 0.18 &&
      input.simulationTimeSeconds > 2
    ) {
      const floodingRatio = clamp(
        input.engineCompartmentFloodingRatio,
        0,
        1,
      );
      const floodingDamagePerSecond = lerp(1.5, 16, floodingRatio);
      this.applyDamage({
        source: 'machinery-flooding',
        engineDamage: floodingDamagePerSecond * deltaSeconds,
      });
    }

    return this.snapshot;
  }

  applyFieldRepair(
    input: VesselConditionRepairStep,
  ): FieldRepairStepResult {
    const result = applyFieldRepairStep({
      active: input.active,
      deltaSeconds: input.deltaSeconds,
      hullHealth: this.hullHealthValue,
      engineHealth: this.engineHealthValue,
      rudderHealth: this.rudderHealthValue,
      engineTemperatureC: this.engineTemperatureValue,
      engineConditionRestoredThisRun:
        input.engineConditionRestoredThisRun,
      rudderConditionRestoredThisRun:
        input.rudderConditionRestoredThisRun,
    });

    this.hullHealthValue = result.hullHealth;
    this.engineHealthValue = result.engineHealth;
    this.rudderHealthValue = result.rudderHealth;
    this.engineTemperatureValue = result.engineTemperatureC;
    return result;
  }
}
