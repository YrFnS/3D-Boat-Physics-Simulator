import type {
  MarineEngineConfig,
  PropellerConfig,
  RudderConfig,
} from './VesselConfig';

const EPSILON = 1e-6;
const TWO_PI = Math.PI * 2;

export interface PropulsionStepInput {
  deltaSeconds: number;
  throttle: number;
  engineHealthRatio: number;
  temperatureEfficiency: number;
  combustionEfficiency: number;
  waterDensityKgM3: number;
  propellerAdvanceSpeedMps: number;
  propellerSubmergenceM: number;
}

export interface PropulsionResult {
  engineRpm: number;
  shaftRpm: number;
  gearSign: -1 | 0 | 1;
  deliveredShaftPowerW: number;
  absorbedShaftPowerW: number;
  shaftTorqueNm: number;
  propellerThrustN: number;
  advanceRatio: number;
  thrustCoefficient: number;
  torqueCoefficient: number;
  loadRatio: number;
  cavitationFactor: number;
  ventilationFactor: number;
  propWashSpeedMps: number;
}

export interface RudderHydrodynamicsInput {
  config: RudderConfig;
  waterDensityKgM3: number;
  forwardFlowMps: number;
  rightFlowMps: number;
  rudderAngleRad: number;
  submergenceM: number;
  healthRatio: number;
}

export interface RudderHydrodynamicsResult {
  flowSpeedMps: number;
  angleOfAttackRad: number;
  liftCoefficient: number;
  dragCoefficient: number;
  liftN: number;
  dragN: number;
  forceMagnitudeN: number;
  ventilationFactor: number;
}

export interface RudderForceComponents {
  forwardN: number;
  rightN: number;
}

function finiteOr(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, finiteOr(value, minimum)));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - normalized * 2);
}

function signedUnit(value: number): -1 | 0 | 1 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function wrapHalfPi(angleRad: number) {
  let wrapped = finiteOr(angleRad, 0);
  while (wrapped > Math.PI / 2) wrapped -= Math.PI;
  while (wrapped < -Math.PI / 2) wrapped += Math.PI;
  return wrapped;
}

export function moveToward(
  current: number,
  target: number,
  maximumDelta: number,
) {
  const safeCurrent = finiteOr(current, 0);
  const safeTarget = finiteOr(target, safeCurrent);
  const safeDelta = Math.max(0, finiteOr(maximumDelta, 0));
  if (safeCurrent < safeTarget) {
    return Math.min(safeTarget, safeCurrent + safeDelta);
  }
  return Math.max(safeTarget, safeCurrent - safeDelta);
}

export function propellerVentilationFactor(
  config: PropellerConfig,
  submergenceM: number,
) {
  const immersion = smoothstep(
    config.ventilationStartSubmergenceM,
    config.ventilationFullSubmergenceM,
    Math.max(0, finiteOr(submergenceM, 0)),
  );
  return config.minimumVentilationFactor +
    (1 - config.minimumVentilationFactor) * immersion;
}

export function evaluateOpenWaterCoefficient(
  coefficients: readonly [number, number, number],
  advanceRatio: number,
  minimum: number,
  maximum: number,
) {
  const j = finiteOr(advanceRatio, 0);
  return clamp(
    coefficients[0] + coefficients[1] * j + coefficients[2] * j * j,
    minimum,
    maximum,
  );
}

export function enginePowerFraction(
  config: MarineEngineConfig,
  engineRpm: number,
) {
  const normalized = clamp(
    (finiteOr(engineRpm, 0) - config.idleRpm) /
      Math.max(EPSILON, config.ratedRpm - config.idleRpm),
    0,
    1.25,
  );
  if (normalized <= 0) return 0;

  // Broad marine-engine power curve: torque builds off idle, reaches rated
  // output close to rated RPM, then tapers smoothly toward the limiter.
  const lowSpeedBuild = smoothstep(0, 0.38, normalized);
  const ratedPlateau = 0.66 + normalized * 0.34;
  const overSpeedTaper =
    normalized <= 1
      ? 1
      : 1 - smoothstep(1, 1.25, normalized) * 0.28;
  return clamp(lowSpeedBuild * ratedPlateau * overSpeedTaper, 0, 1.05);
}

export function propellerCavitationFactor(
  config: PropellerConfig,
  waterDensityKgM3: number,
  shaftRevolutionsPerSecond: number,
  uncorrectedThrustN: number,
) {
  const density = Math.max(1, finiteOr(waterDensityKgM3, 1_025));
  const diameter = Math.max(EPSILON, config.diameterM);
  const diskAreaM2 = Math.PI * diameter * diameter * 0.25;
  const tipSpeedMps =
    Math.PI * diameter * Math.abs(finiteOr(shaftRevolutionsPerSecond, 0));
  const loadingPressurePa =
    Math.abs(finiteOr(uncorrectedThrustN, 0)) / Math.max(EPSILON, diskAreaM2);
  const dynamicPressurePa =
    0.5 * density * Math.max(EPSILON, config.cavitationReferenceSpeedMps ** 2);
  const loadingRatio = loadingPressurePa / dynamicPressurePa;
  const tipDemand = tipSpeedMps / Math.max(EPSILON, config.cavitationTipSpeedMps);
  const loadingDemand =
    loadingRatio / Math.max(EPSILON, config.cavitationLoadingThreshold);
  const demand = Math.max(tipDemand, loadingDemand);
  const onset = smoothstep(1, 1.55, demand);
  return 1 - onset * (1 - config.minimumCavitationFactor);
}

interface OpenWaterEvaluation {
  shaftRpm: number;
  advanceRatio: number;
  thrustCoefficient: number;
  torqueCoefficient: number;
  uncorrectedThrustN: number;
  propellerThrustN: number;
  shaftTorqueNm: number;
  absorbedPowerW: number;
  cavitationFactor: number;
  ventilationFactor: number;
}

export function evaluatePropellerOpenWater(
  config: PropellerConfig,
  waterDensityKgM3: number,
  shaftRpm: number,
  gearSign: -1 | 0 | 1,
  advanceSpeedMps: number,
  submergenceM: number,
): OpenWaterEvaluation {
  const density = Math.max(1, finiteOr(waterDensityKgM3, 1_025));
  const diameter = Math.max(EPSILON, config.diameterM);
  const signedShaftRpm = finiteOr(shaftRpm, 0);
  const revolutionsPerSecond = Math.abs(signedShaftRpm) / 60;
  const ventilationFactor = propellerVentilationFactor(config, submergenceM);

  if (gearSign === 0 || revolutionsPerSecond <= EPSILON) {
    return {
      shaftRpm: 0,
      advanceRatio: 0,
      thrustCoefficient: 0,
      torqueCoefficient: 0,
      uncorrectedThrustN: 0,
      propellerThrustN: 0,
      shaftTorqueNm: 0,
      absorbedPowerW: 0,
      cavitationFactor: 1,
      ventilationFactor,
    };
  }

  const wakeAdjustedAdvanceMps =
    finiteOr(advanceSpeedMps, 0) * (1 - config.wakeFraction);
  const advanceRatio = clamp(
    (gearSign * wakeAdjustedAdvanceMps) /
      Math.max(EPSILON, revolutionsPerSecond * diameter),
    -config.maximumAbsAdvanceRatio,
    config.maximumAbsAdvanceRatio,
  );
  const geometryScale = clamp(
    (0.84 + config.pitchRatio * 0.16) *
      (0.9 + Math.sqrt(Math.max(1, config.bladeCount) / 3) * 0.1) *
      (0.9 + config.expandedAreaRatio * 0.15),
    0.78,
    1.28,
  );
  const thrustCoefficient = evaluateOpenWaterCoefficient(
    config.thrustCoefficient,
    advanceRatio,
    -config.maximumReverseThrustCoefficient,
    config.maximumThrustCoefficient,
  ) * geometryScale;
  const torqueCoefficient = evaluateOpenWaterCoefficient(
    config.torqueCoefficient,
    Math.abs(advanceRatio),
    config.minimumTorqueCoefficient,
    config.maximumTorqueCoefficient,
  ) * Math.sqrt(geometryScale);

  const baseThrustN =
    density *
    revolutionsPerSecond *
    revolutionsPerSecond *
    diameter ** 4 *
    thrustCoefficient *
    (1 - config.thrustDeductionFraction);
  const uncorrectedThrustN = gearSign * baseThrustN;
  const cavitationFactor = propellerCavitationFactor(
    config,
    density,
    revolutionsPerSecond,
    uncorrectedThrustN,
  );
  const propellerThrustN = clamp(
    uncorrectedThrustN * ventilationFactor * cavitationFactor,
    -config.maximumThrustN,
    config.maximumThrustN,
  );
  const shaftTorqueNm =
    density *
    revolutionsPerSecond *
    revolutionsPerSecond *
    diameter ** 5 *
    torqueCoefficient *
    ventilationFactor *
    Math.sqrt(cavitationFactor);
  const absorbedPowerW = TWO_PI * revolutionsPerSecond * shaftTorqueNm;

  return {
    shaftRpm: signedShaftRpm,
    advanceRatio,
    thrustCoefficient,
    torqueCoefficient,
    uncorrectedThrustN,
    propellerThrustN,
    shaftTorqueNm,
    absorbedPowerW,
    cavitationFactor,
    ventilationFactor,
  };
}

export function computeRudderHydrodynamics(
  input: RudderHydrodynamicsInput,
): RudderHydrodynamicsResult {
  const config = input.config;
  const forwardFlowMps = finiteOr(input.forwardFlowMps, 0);
  const rightFlowMps = finiteOr(input.rightFlowMps, 0);
  const flowSpeedMps = Math.hypot(forwardFlowMps, rightFlowMps);
  const ventilationFactor =
    config.minimumVentilationFactor +
    (1 - config.minimumVentilationFactor) *
      smoothstep(
        config.ventilationStartSubmergenceM,
        config.ventilationFullSubmergenceM,
        Math.max(0, finiteOr(input.submergenceM, 0)),
      );
  const healthRatio = clamp(input.healthRatio, 0, 1);

  if (flowSpeedMps <= EPSILON || healthRatio <= EPSILON) {
    return {
      flowSpeedMps,
      angleOfAttackRad: 0,
      liftCoefficient: 0,
      dragCoefficient: config.baseDragCoefficient,
      liftN: 0,
      dragN: 0,
      forceMagnitudeN: 0,
      ventilationFactor,
    };
  }

  const flowAngleRad = Math.atan2(rightFlowMps, forwardFlowMps);
  const angleOfAttackRad = wrapHalfPi(
    finiteOr(input.rudderAngleRad, 0) - flowAngleRad,
  );
  const absAngle = Math.abs(angleOfAttackRad);
  const preStallLift =
    config.liftSlopePerRad * angleOfAttackRad;
  const stallBlend = smoothstep(
    config.stallAngleRad,
    config.stallAngleRad * 1.65,
    absAngle,
  );
  const saturatedLift = clamp(
    preStallLift,
    -config.maximumLiftCoefficient,
    config.maximumLiftCoefficient,
  );
  const liftCoefficient =
    saturatedLift * (1 - stallBlend * config.postStallLiftLossFraction);
  const dragCoefficient = clamp(
    config.baseDragCoefficient +
      (config.inducedDragFactor /
        Math.max(0.35, config.aspectRatio)) *
        liftCoefficient *
        liftCoefficient +
      stallBlend * config.stallDragCoefficient,
    config.baseDragCoefficient,
    config.maximumDragCoefficient,
  );
  const dynamicPressurePa =
    0.5 *
    Math.max(1, finiteOr(input.waterDensityKgM3, 1_025)) *
    flowSpeedMps *
    flowSpeedMps;
  const authority = ventilationFactor * healthRatio;
  let liftN =
    dynamicPressurePa * config.areaM2 * liftCoefficient * authority;
  let dragN =
    dynamicPressurePa * config.areaM2 * dragCoefficient * authority;
  const forceMagnitudeN = Math.hypot(liftN, dragN);
  if (forceMagnitudeN > config.maximumForceN) {
    const scale = config.maximumForceN / forceMagnitudeN;
    liftN *= scale;
    dragN *= scale;
  }

  return {
    flowSpeedMps,
    angleOfAttackRad,
    liftCoefficient,
    dragCoefficient,
    liftN,
    dragN,
    forceMagnitudeN: Math.hypot(liftN, dragN),
    ventilationFactor,
  };
}

export function resolveRudderForceComponents(
  hydrodynamics: RudderHydrodynamicsResult,
  forwardFlowMps: number,
  rightFlowMps: number,
): RudderForceComponents {
  const flowSpeedMps = Math.max(
    EPSILON,
    Math.hypot(
      finiteOr(forwardFlowMps, 0),
      finiteOr(rightFlowMps, 0),
    ),
  );
  const forwardUnit = finiteOr(forwardFlowMps, 0) / flowSpeedMps;
  const rightUnit = finiteOr(rightFlowMps, 0) / flowSpeedMps;
  return {
    forwardN:
      hydrodynamics.liftN * rightUnit -
      hydrodynamics.dragN * forwardUnit,
    rightN:
      -hydrodynamics.liftN * forwardUnit -
      hydrodynamics.dragN * rightUnit,
  };
}

export class MarinePropulsionSystem {
  private engineRpm = 0;
  private previousLoadRatio = 0;
  private readonly resultValue: PropulsionResult = {
    engineRpm: 0,
    shaftRpm: 0,
    gearSign: 0,
    deliveredShaftPowerW: 0,
    absorbedShaftPowerW: 0,
    shaftTorqueNm: 0,
    propellerThrustN: 0,
    advanceRatio: 0,
    thrustCoefficient: 0,
    torqueCoefficient: 0,
    loadRatio: 0,
    cavitationFactor: 1,
    ventilationFactor: 1,
    propWashSpeedMps: 0,
  };

  reset(config: MarineEngineConfig) {
    this.engineRpm = Math.max(0, config.idleRpm);
    this.previousLoadRatio = 0;
    Object.assign(this.resultValue, {
      engineRpm: this.engineRpm,
      shaftRpm: 0,
      gearSign: 0,
      deliveredShaftPowerW: 0,
      absorbedShaftPowerW: 0,
      shaftTorqueNm: 0,
      propellerThrustN: 0,
      advanceRatio: 0,
      thrustCoefficient: 0,
      torqueCoefficient: 0,
      loadRatio: 0,
      cavitationFactor: 1,
      ventilationFactor: 1,
      propWashSpeedMps: 0,
    });
  }

  get result() {
    return this.resultValue;
  }

  step(
    engine: MarineEngineConfig,
    propeller: PropellerConfig,
    input: PropulsionStepInput,
  ): PropulsionResult {
    if (this.engineRpm <= 0 || !Number.isFinite(this.engineRpm)) {
      this.reset(engine);
    }

    const dt = clamp(input.deltaSeconds, 0, 0.1);
    const throttle = clamp(input.throttle, -1, 1);
    const throttleMagnitude = Math.abs(throttle);
    const gearSign =
      throttleMagnitude > engine.throttleDeadband
        ? signedUnit(throttle)
        : 0;
    const normalizedCommand =
      gearSign === 0
        ? 0
        : clamp(
            (throttleMagnitude - engine.throttleDeadband) /
              Math.max(EPSILON, 1 - engine.throttleDeadband),
            0,
            1,
          );
    const healthRatio = clamp(input.engineHealthRatio, 0, 1);
    const temperatureEfficiency = clamp(input.temperatureEfficiency, 0, 1);
    const combustionEfficiency = clamp(input.combustionEfficiency, 0, 1);
    const ventilationFactor = propellerVentilationFactor(
      propeller,
      input.propellerSubmergenceM,
    );

    let targetRpm = engine.idleRpm;
    if (gearSign !== 0 && healthRatio > 0) {
      const commandCurve = Math.sqrt(normalizedCommand);
      targetRpm =
        engine.idleRpm +
        commandCurve * (engine.maximumRpm - engine.idleRpm);
      const loadDroop = Math.max(0, this.previousLoadRatio - 0.92);
      targetRpm *= 1 - loadDroop * engine.loadDroopFraction;
      targetRpm +=
        (1 - ventilationFactor) *
        normalizedCommand *
        (engine.maximumRpm - engine.ratedRpm) *
        engine.unloadedOverRevFraction;
    }
    if (healthRatio <= EPSILON) targetRpm = 0;
    targetRpm = clamp(targetRpm, 0, engine.maximumRpm * 1.08);

    const rpmRate =
      targetRpm >= this.engineRpm
        ? engine.rpmRisePerSecond
        : engine.rpmFallPerSecond;
    this.engineRpm = moveToward(
      this.engineRpm,
      targetRpm,
      rpmRate * dt,
    );

    const reversePowerFactor = gearSign < 0 ? engine.reversePowerFraction : 1;
    const throttlePowerFactor = Math.pow(normalizedCommand, 0.85);
    const engineAngularSpeedRadPerSecond =
      this.engineRpm * TWO_PI / 60;
    const torqueLimitedEnginePowerW =
      engine.peakTorqueNm * engineAngularSpeedRadPerSecond;
    const ratedEnginePowerW = Math.min(
      engine.ratedPowerW * enginePowerFraction(engine, this.engineRpm),
      torqueLimitedEnginePowerW,
    );
    const deliveredShaftPowerW =
      gearSign === 0
        ? 0
        : ratedEnginePowerW *
          throttlePowerFactor *
          engine.drivelineEfficiency *
          reversePowerFactor *
          healthRatio *
          temperatureEfficiency *
          combustionEfficiency;
    const gearRatio =
      gearSign < 0 ? engine.gearRatioAstern : engine.gearRatioAhead;
    const clutchFactor = smoothstep(0, 0.18, normalizedCommand);
    let shaftRpm =
      gearSign === 0
        ? 0
        : gearSign *
          (this.engineRpm / Math.max(EPSILON, gearRatio)) *
          clutchFactor;

    let openWater = evaluatePropellerOpenWater(
      propeller,
      input.waterDensityKgM3,
      shaftRpm,
      gearSign,
      input.propellerAdvanceSpeedMps,
      input.propellerSubmergenceM,
    );
    for (let iteration = 0; iteration < 3; iteration += 1) {
      if (
        deliveredShaftPowerW <= EPSILON ||
        openWater.absorbedPowerW <= deliveredShaftPowerW * 1.001
      ) {
        break;
      }
      const scale = Math.cbrt(
        deliveredShaftPowerW /
          Math.max(EPSILON, openWater.absorbedPowerW),
      );
      shaftRpm *= clamp(scale, 0.15, 1);
      openWater = evaluatePropellerOpenWater(
        propeller,
        input.waterDensityKgM3,
        shaftRpm,
        gearSign,
        input.propellerAdvanceSpeedMps,
        input.propellerSubmergenceM,
      );
    }

    const absorbedShaftPowerW = openWater.absorbedPowerW;
    const loadRatio =
      deliveredShaftPowerW <= EPSILON
        ? 0
        : absorbedShaftPowerW / deliveredShaftPowerW;
    this.previousLoadRatio = clamp(loadRatio, 0, 2);
    const diskAreaM2 =
      Math.PI * propeller.diameterM * propeller.diameterM * 0.25;
    const propWashSpeedMps =
      gearSign === 0
        ? 0
        : gearSign *
          Math.sqrt(
            (2 * Math.abs(openWater.propellerThrustN)) /
              Math.max(
                EPSILON,
                input.waterDensityKgM3 * diskAreaM2,
              ),
          ) *
          propeller.propWashGain;

    Object.assign(this.resultValue, {
      engineRpm: this.engineRpm,
      shaftRpm: openWater.shaftRpm,
      gearSign,
      deliveredShaftPowerW,
      absorbedShaftPowerW,
      shaftTorqueNm: openWater.shaftTorqueNm,
      propellerThrustN: openWater.propellerThrustN,
      advanceRatio: openWater.advanceRatio,
      thrustCoefficient: openWater.thrustCoefficient,
      torqueCoefficient: openWater.torqueCoefficient,
      loadRatio,
      cavitationFactor: openWater.cavitationFactor,
      ventilationFactor: openWater.ventilationFactor,
      propWashSpeedMps,
    });
    return this.resultValue;
  }
}
