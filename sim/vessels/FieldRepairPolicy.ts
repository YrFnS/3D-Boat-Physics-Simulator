export interface FieldRepairEligibilityInput {
  requested: boolean;
  speedKnots: number;
  throttle: number;
  propulsionInputActive: boolean;
}

export interface FieldRepairStepInput {
  active: boolean;
  deltaSeconds: number;
  hullHealth: number;
  engineHealth: number;
  rudderHealth: number;
  engineTemperatureC: number;
  engineConditionRestoredThisRun: number;
  rudderConditionRestoredThisRun: number;
}

export interface FieldRepairStepResult {
  hullHealth: number;
  engineHealth: number;
  rudderHealth: number;
  engineTemperatureC: number;
  engineConditionRestored: number;
  rudderConditionRestored: number;
  meaningful: boolean;
}

export interface FieldRepairUsage {
  repairActiveSeconds: number;
  repairActivationCount: number;
  engineConditionRestored: number;
  rudderConditionRestored: number;
}

export const FIELD_REPAIR_LIMITS = Object.freeze({
  maximumSpeedKnots: 2,
  maximumThrottleMagnitude: 0.1,
  engineConditionCeiling: 55,
  rudderConditionCeiling: 65,
  engineRestoreRatePerSecond: 0.6,
  rudderRestoreRatePerSecond: 0.9,
  maximumEngineRestorePerRun: 12,
  maximumRudderRestorePerRun: 18,
  engineCoolingCelsiusPerSecond: 4,
  breachStabilizationPerSecond: 0.012,
});

const MINIMUM_ENGINE_TEMPERATURE_C = 20;

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clampHealth(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function isFieldRepairEligible(
  input: FieldRepairEligibilityInput,
) {
  return (
    input.requested &&
    Number.isFinite(input.speedKnots) &&
    Math.abs(input.speedKnots) <=
      FIELD_REPAIR_LIMITS.maximumSpeedKnots &&
    Number.isFinite(input.throttle) &&
    Math.abs(input.throttle) <=
      FIELD_REPAIR_LIMITS.maximumThrottleMagnitude &&
    !input.propulsionInputActive
  );
}

export function applyFieldRepairStep(
  input: FieldRepairStepInput,
): FieldRepairStepResult {
  const hullHealth = clampHealth(input.hullHealth);
  const engineHealth = clampHealth(input.engineHealth);
  const rudderHealth = clampHealth(input.rudderHealth);
  const engineTemperatureC = Number.isFinite(input.engineTemperatureC)
    ? Math.max(MINIMUM_ENGINE_TEMPERATURE_C, input.engineTemperatureC)
    : MINIMUM_ENGINE_TEMPERATURE_C;
  const deltaSeconds = finiteNonNegative(input.deltaSeconds);

  if (!input.active || deltaSeconds <= 0) {
    return {
      hullHealth,
      engineHealth,
      rudderHealth,
      engineTemperatureC,
      engineConditionRestored: 0,
      rudderConditionRestored: 0,
      meaningful: false,
    };
  }

  const engineBudgetRemaining = Math.max(
    0,
    FIELD_REPAIR_LIMITS.maximumEngineRestorePerRun -
      finiteNonNegative(input.engineConditionRestoredThisRun),
  );
  const rudderBudgetRemaining = Math.max(
    0,
    FIELD_REPAIR_LIMITS.maximumRudderRestorePerRun -
      finiteNonNegative(input.rudderConditionRestoredThisRun),
  );
  const engineConditionRestored = Math.min(
    FIELD_REPAIR_LIMITS.engineRestoreRatePerSecond * deltaSeconds,
    Math.max(
      0,
      FIELD_REPAIR_LIMITS.engineConditionCeiling - engineHealth,
    ),
    engineBudgetRemaining,
  );
  const rudderConditionRestored = Math.min(
    FIELD_REPAIR_LIMITS.rudderRestoreRatePerSecond * deltaSeconds,
    Math.max(
      0,
      FIELD_REPAIR_LIMITS.rudderConditionCeiling - rudderHealth,
    ),
    rudderBudgetRemaining,
  );
  const cooledTemperatureC = Math.max(
    MINIMUM_ENGINE_TEMPERATURE_C,
    engineTemperatureC -
      FIELD_REPAIR_LIMITS.engineCoolingCelsiusPerSecond *
        deltaSeconds,
  );

  return {
    // Structural hull condition requires a dockyard and cannot be
    // restored by the underway bilge/emergency-repair action.
    hullHealth,
    engineHealth: clampHealth(
      engineHealth + engineConditionRestored,
    ),
    rudderHealth: clampHealth(
      rudderHealth + rudderConditionRestored,
    ),
    engineTemperatureC: cooledTemperatureC,
    engineConditionRestored,
    rudderConditionRestored,
    meaningful:
      engineConditionRestored > 0 ||
      rudderConditionRestored > 0 ||
      cooledTemperatureC < engineTemperatureC,
  };
}

export function calculateFieldRepairPenalty(
  usage: FieldRepairUsage,
) {
  const activeSeconds = finiteNonNegative(
    usage.repairActiveSeconds,
  );
  const activationCount = Math.floor(
    finiteNonNegative(usage.repairActivationCount),
  );
  const engineRestored = finiteNonNegative(
    usage.engineConditionRestored,
  );
  const rudderRestored = finiteNonNegative(
    usage.rudderConditionRestored,
  );

  return Math.round(
    Math.min(
      250,
      activeSeconds * 1.25 +
        activationCount * 12 +
        engineRestored * 5 +
        rudderRestored * 3.5,
    ),
  );
}
