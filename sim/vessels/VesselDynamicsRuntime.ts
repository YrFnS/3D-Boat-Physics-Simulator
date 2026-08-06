import { MathUtils, Vector3 } from 'three';
import type { SixDofBody } from '../core/SixDofBody.ts';
import type { SeededRandom } from '../core/SeededRandom.ts';
import type { WaterSurfaceSampler } from '../water/WaterSurface.ts';
import { createWaterSurfaceSample } from '../water/WaterSurface.ts';
import { setWorldVectorFromHeading } from '../world/WorldDirection.ts';
import { EnvironmentalForces } from './EnvironmentalForces.ts';
import type { FloodingResult } from './FloodingModel.ts';
import { displacementBalanceErrorRatio } from './HydrostaticsMath.ts';
import {
  computeRudderHydrodynamics,
  MarinePropulsionSystem,
  moveToward,
  resolveRudderForceComponents,
  type PropulsionResult,
  type RudderHydrodynamicsResult,
} from './PropulsionSystem.ts';
import {
  planingSpeedRatio,
  waterRelativeSurgeSpeed,
} from './PhysicsCorrectness.ts';
import {
  SectionalHydrostatics,
  type SectionalHydrostaticResult,
} from './SectionalHydrostatics.ts';
import type { VesselConfig } from './VesselConfig.ts';
import type { VesselDamageEvent } from './VesselDamagePolicy.ts';

export interface VesselDynamicsConditionSink {
  readonly hullHealth: number;
  readonly engineHealth: number;
  readonly engineTemperature: number;
  readonly rudderHealth: number;
  applyDamage(event: VesselDamageEvent): unknown;
}

export interface VesselDynamicsFloodingSink {
  registerBreach(
    vessel: VesselConfig,
    compartmentId: string,
    severity: number,
  ): void;
}

export interface VesselDynamicsAudioSink {
  playSlam(severity: number): void;
}

export interface VesselDynamicsStepInput {
  body: SixDofBody;
  vessel: VesselConfig;
  deltaSeconds: number;
  timeSeconds: number;
  throttle: number;
  steering: number;
  calibration: boolean;
  flooding: FloodingResult;
  condition: VesselDynamicsConditionSink;
  floodingSink: VesselDynamicsFloodingSink;
  random: SeededRandom;
  sampleWater: WaterSurfaceSampler;
  windSpeedMps: number;
  windHeadingDegrees: number;
  currentSpeedMps: number;
  currentHeadingDegrees: number;
  winterFactor: number;
  tornadoPosition: Vector3;
  whirlpoolPosition: Vector3;
  audio: VesselDynamicsAudioSink;
}

export interface VesselDynamicsStepResult {
  massKg: number;
  submergedRatio: number;
  forwardWaterRelativeSpeedMps: number;
  activePlaningSpeedRatio: number;
  displacementBalanceErrorRatio: number;
  hydrostaticResult: SectionalHydrostaticResult;
  propulsionResult: PropulsionResult;
  rudderHydrodynamics: RudderHydrodynamicsResult;
  appliedRudderForceN: number;
  rudderAngleRad: number;
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Owns the continuous marine-force pipeline for one mounted vessel.
 *
 * Flooding and condition remain separate authorities. This runtime
 * consumes their current state, configures mass properties, applies
 * sectional hydrostatics, propulsion, wind, planing, rudder, roll
 * stability, and environmental loads, then returns the values needed
 * by collision, calibration, telemetry, thermal, audio, and rendering.
 */
export class VesselDynamicsRuntime {
  private readonly sectionalHydrostatics =
    new SectionalHydrostatics();
  private readonly propulsionSystem =
    new MarinePropulsionSystem();
  private readonly environmentalForces =
    new EnvironmentalForces();
  private readonly previousCompartmentExposureValue:
    Record<string, number> = {};
  private readonly addedMass: [number, number, number] =
    [0, 0, 0];
  private readonly addedInertia: [number, number, number] =
    [0, 0, 0];
  private configuredVesselType: VesselConfig['type'] | null = null;
  private lastSubmergedRatioValue = 1;
  private rudderAngleValue = 0;
  private resultValue: VesselDynamicsStepResult | null = null;

  private readonly forwardDir = new Vector3();
  private readonly rightDir = new Vector3();
  private readonly windVelocity = new Vector3();
  private readonly waterVelocity = new Vector3();
  private readonly baseCurrentVelocity = new Vector3();
  private readonly propellerPointVelocity = new Vector3();
  private readonly propellerWaterVelocity = new Vector3();
  private readonly propellerRelativeVelocity = new Vector3();
  private readonly rudderPointVelocity = new Vector3();
  private readonly rudderWaterVelocity = new Vector3();
  private readonly rudderRelativeVelocity = new Vector3();
  private readonly propellerReactionTorque = new Vector3();
  private readonly propellerWaterSample =
    createWaterSurfaceSample();
  private readonly rudderWaterSample = createWaterSurfaceSample();
  private readonly thrustForce = new Vector3();
  private readonly thrustDirection = new Vector3();
  private readonly apparentWind = new Vector3();
  private readonly apparentWindDir = new Vector3();
  private readonly windForce = new Vector3();
  private readonly gravityForce = new Vector3();
  private readonly localPropeller = new Vector3();
  private readonly localRudder = new Vector3();
  private readonly localWind = new Vector3();
  private readonly localPlaning = new Vector3();
  private readonly worldPropeller = new Vector3();
  private readonly worldRudder = new Vector3();
  private readonly worldWind = new Vector3();
  private readonly worldPlaning = new Vector3();
  private readonly planingForce = new Vector3();
  private readonly rudderForce = new Vector3();
  private readonly rollStabilityTorque = new Vector3();
  private readonly boatUp = new Vector3();
  private readonly worldUp = new Vector3(0, 1, 0);

  get compartmentExposure(): Readonly<Record<string, number>> {
    return this.previousCompartmentExposureValue;
  }

  get submergedRatio() {
    return this.lastSubmergedRatioValue;
  }

  get rudderAngleRad() {
    return this.rudderAngleValue;
  }

  get propulsionResult() {
    return this.propulsionSystem.result;
  }

  reset(vessel: VesselConfig, initialSubmergedRatio = 0.75) {
    this.configuredVesselType = vessel.type;
    this.sectionalHydrostatics.reset(vessel);
    this.propulsionSystem.reset(vessel.engine);
    this.rudderAngleValue = 0;
    this.lastSubmergedRatioValue = MathUtils.clamp(
      Number.isFinite(initialSubmergedRatio)
        ? initialSubmergedRatio
        : 0.75,
      0,
      1,
    );
    for (const key of Object.keys(
      this.previousCompartmentExposureValue,
    )) {
      delete this.previousCompartmentExposureValue[key];
    }
    this.resultValue = null;
  }

  step(input: VesselDynamicsStepInput): VesselDynamicsStepResult {
    if (this.configuredVesselType !== input.vessel.type) {
      this.reset(input.vessel);
    }

    const body = input.body;
    const vessel = input.vessel;
    const flooding = input.flooding;
    const condition = input.condition;
    const dt = finiteNonNegative(input.deltaSeconds);
    const time = Number.isFinite(input.timeSeconds)
      ? input.timeSeconds
      : 0;
    const throttle = MathUtils.clamp(input.throttle, -1, 1);
    const steering = MathUtils.clamp(input.steering, -1, 1);

    const addedMassScale = MathUtils.smoothstep(
      this.lastSubmergedRatioValue,
      0.05,
      0.85,
    );
    for (let axis = 0; axis < 3; axis += 1) {
      this.addedMass[axis] =
        vessel.hydrodynamics.addedMassKg[axis] *
        addedMassScale;
      this.addedInertia[axis] =
        vessel.hydrodynamics.addedInertiaKgM2[axis] *
        addedMassScale;
    }

    body.setMassProperties(
      flooding.physicalMassKg,
      flooding.principalInertiaKgM2,
      vessel.angularDampingPerSecond,
      flooding.centerOfMassLocal,
      this.addedMass,
      this.addedInertia,
    );
    body.beginStep();
    body.addForce(
      this.gravityForce.set(
        0,
        -flooding.physicalMassKg * 9.81,
        0,
      ),
    );

    const massKg = flooding.physicalMassKg;
    const forwardDir = this.forwardDir
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion)
      .normalize();
    const rightDir = this.rightDir
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion)
      .normalize();

    if (input.calibration) {
      this.windVelocity.set(0, 0, 0);
      this.baseCurrentVelocity.set(0, 0, 0);
    } else {
      setWorldVectorFromHeading(
        this.windVelocity,
        input.windHeadingDegrees,
        input.windSpeedMps,
      );
      setWorldVectorFromHeading(
        this.baseCurrentVelocity,
        input.currentHeadingDegrees,
        input.currentSpeedMps,
      );
    }

    const position = body.position;
    const iceNoise =
      Math.sin(position.x * 0.01) *
        Math.cos(position.z * 0.01) +
      Math.sin(position.x * 0.05 + position.z * 0.04) *
        0.5;
    const currentIceFactor = input.calibration
      ? 0
      : MathUtils.clamp(
          (
            iceNoise * 0.3 +
            MathUtils.clamp(input.winterFactor, 0, 1) * 1.5 -
            1
          ) * 2,
          0,
          1,
        );

    const preSolveSurgeSpeed = waterRelativeSurgeSpeed(
      body.linearVelocity,
      this.baseCurrentVelocity,
      forwardDir,
    );
    const preSolvePlaningRatio = planingSpeedRatio(
      preSolveSurgeSpeed,
      vessel.planingReferenceSpeedMps,
    );
    const planingPowerSupport = MathUtils.smoothstep(
      Math.max(0, throttle),
      0.05,
      0.5,
    );
    const fullPlaningDragMultiplier = MathUtils.lerp(
      0.62,
      0.28,
      planingPowerSupport,
    );
    const planingDragReduction = vessel.planingCapable
      ? MathUtils.lerp(
          1,
          fullPlaningDragMultiplier,
          preSolvePlaningRatio * preSolvePlaningRatio,
        )
      : 1;
    const hullDragPenalty =
      1 + ((100 - condition.hullHealth) / 100) * 0.8;

    const hydrostaticResult =
      this.sectionalHydrostatics.apply({
        body,
        vessel,
        timeSeconds: time,
        deltaSeconds: dt,
        baseCurrentVelocity: this.baseCurrentVelocity,
        forwardDragMultiplier:
          planingDragReduction * hullDragPenalty,
        lateralDragMultiplier: hullDragPenalty,
        buoyancyAvailabilityByCompartment:
          flooding.buoyancyAvailabilityByCompartment,
        physicalMassKg: massKg,
        sampleWater: input.sampleWater,
      });
    const submergedRatio = hydrostaticResult.submergedRatio;
    const waterVelocity = this.waterVelocity.copy(
      hydrostaticResult.averageWaterVelocityWorld,
    );

    for (const key of Object.keys(
      this.previousCompartmentExposureValue,
    )) {
      delete this.previousCompartmentExposureValue[key];
    }
    Object.assign(
      this.previousCompartmentExposureValue,
      hydrostaticResult.compartmentExposure,
    );

    const forwardWaterRelativeSpeedMps =
      waterRelativeSurgeSpeed(
        body.linearVelocity,
        waterVelocity,
        forwardDir,
      );
    const activePlaningSpeedRatio = planingSpeedRatio(
      forwardWaterRelativeSpeedMps,
      vessel.planingReferenceSpeedMps,
    );
    const displacementErrorRatio =
      displacementBalanceErrorRatio(
        hydrostaticResult.displacedVolumeM3,
        massKg,
        vessel.waterDensityKgM3,
      );

    if (
      !input.calibration &&
      time > 2 &&
      hydrostaticResult.maximumSlamSeverity > 0
    ) {
      condition.applyDamage({
        source: 'slamming',
        hullDamage: hydrostaticResult.slamHullDamage,
        engineDamage: hydrostaticResult.slamEngineDamage,
        rudderDamage: hydrostaticResult.slamRudderDamage,
      });
      if (hydrostaticResult.slamCompartmentId) {
        input.floodingSink.registerBreach(
          vessel,
          hydrostaticResult.slamCompartmentId,
          MathUtils.clamp(
            (
              hydrostaticResult.maximumSlamSeverity -
              0.45
            ) * 0.035,
            0,
            0.18,
          ),
        );
      }
      input.audio.playSlam(
        hydrostaticResult.maximumSlamSeverity,
      );
    }

    const planingFactor =
      activePlaningSpeedRatio *
      activePlaningSpeedRatio *
      submergedRatio;

    body.localPointToWorld(
      this.localPropeller.fromArray(
        vessel.propeller.pointLocal,
      ),
      this.worldPropeller,
    );
    const propellerWaterSample = input.sampleWater(
      this.worldPropeller.x,
      this.worldPropeller.z,
      time,
      this.propellerWaterSample,
    );
    body.velocityAtPoint(
      this.worldPropeller,
      this.propellerPointVelocity,
    );
    this.propellerWaterVelocity
      .set(
        propellerWaterSample.velocityX,
        propellerWaterSample.velocityY,
        propellerWaterSample.velocityZ,
      )
      .add(this.baseCurrentVelocity);
    const shaftAngleCos = Math.cos(
      vessel.propeller.shaftAngleRad,
    );
    const shaftAngleSin = Math.sin(
      vessel.propeller.shaftAngleRad,
    );
    const thrustDirection = this.thrustDirection
      .copy(forwardDir)
      .multiplyScalar(shaftAngleCos)
      .addScaledVector(
        this.boatUp
          .set(0, 1, 0)
          .applyQuaternion(body.quaternion)
          .normalize(),
        shaftAngleSin,
      )
      .normalize();
    const propellerAdvanceSpeedMps =
      this.propellerRelativeVelocity
        .copy(this.propellerPointVelocity)
        .sub(this.propellerWaterVelocity)
        .dot(thrustDirection);
    const propellerSubmergenceM = Math.max(
      0,
      propellerWaterSample.y - this.worldPropeller.y,
    );

    const engineHealthEfficiency = MathUtils.clamp(
      condition.engineHealth / 100,
      0,
      1,
    );
    const temperatureEfficiency =
      condition.engineTemperature > 90
        ? Math.max(
            0.2,
            1 -
              (condition.engineTemperature - 90) / 20,
          )
        : 1;
    let combustionEfficiency = 1;
    if (
      condition.engineHealth > 0 &&
      condition.engineHealth < 40
    ) {
      const damageRatio =
        (40 - condition.engineHealth) / 40;
      const misfireProbability =
        1 - Math.exp(-damageRatio * 8 * dt);
      if (input.random.next() < misfireProbability) {
        combustionEfficiency = MathUtils.lerp(
          0.08,
          0.28,
          input.random.next(),
        );
      }
    }

    const propulsionResult = this.propulsionSystem.step(
      vessel.engine,
      vessel.propeller,
      {
        deltaSeconds: dt,
        throttle,
        engineHealthRatio: engineHealthEfficiency,
        temperatureEfficiency,
        combustionEfficiency,
        waterDensityKgM3: vessel.waterDensityKgM3,
        propellerAdvanceSpeedMps,
        propellerSubmergenceM,
      },
    );
    const thrustForce = this.thrustForce
      .copy(thrustDirection)
      .multiplyScalar(propulsionResult.propellerThrustN);
    body.addTorque(
      this.propellerReactionTorque
        .copy(thrustDirection)
        .multiplyScalar(
          -vessel.propeller.rotationDirection *
            Math.sign(propulsionResult.shaftRpm) *
            propulsionResult.shaftTorqueNm *
            vessel.propeller.hullReactionTorqueFraction,
        ),
    );

    const apparentWind = this.apparentWind
      .copy(this.windVelocity)
      .sub(body.linearVelocity);
    const apparentWindLengthSq = apparentWind.lengthSq();
    const apparentWindDir = this.apparentWindDir;
    if (apparentWindLengthSq > 1e-8) {
      apparentWindDir
        .copy(apparentWind)
        .multiplyScalar(
          1 / Math.sqrt(apparentWindLengthSq),
        );
    } else {
      apparentWindDir.set(1, 0, 0);
    }

    const windDotForward = apparentWindDir.dot(forwardDir);
    const windDotRight = apparentWindDir.dot(rightDir);
    const exposedProfileArea =
      Math.abs(windDotForward) +
      Math.abs(windDotRight) * vessel.sideAreaMultiplier;
    const trueWindCoefficient =
      vessel.windAreaCoefficient * exposedProfileArea;
    const windForce = this.windForce
      .copy(apparentWind)
      .multiplyScalar(
        Math.sqrt(apparentWindLengthSq) *
          trueWindCoefficient,
      );

    body.addForceAtPoint(
      thrustForce,
      this.worldPropeller,
    );
    body.localPointToWorld(
      this.localWind.fromArray(vessel.windPointLocal),
      this.worldWind,
    );
    body.addForceAtPoint(windForce, this.worldWind);

    if (vessel.planingCapable && planingFactor > 0) {
      const planingCenterOffsetM =
        vessel.halfLengthM *
        MathUtils.lerp(
          0.03,
          0.14,
          activePlaningSpeedRatio,
        );
      body.localPointToWorld(
        this.localPlaning.set(
          0,
          0,
          vessel.centerOfMassLocal[2] +
            planingCenterOffsetM,
        ),
        this.worldPlaning,
      );
      body.addForceAtPoint(
        this.planingForce.set(
          0,
          massKg * 9.81 * planingFactor * 0.2,
          0,
        ),
        this.worldPlaning,
      );
    }

    const rudderHealthRatio = MathUtils.clamp(
      condition.rudderHealth / 100,
      0,
      1,
    );
    let targetRudder =
      -steering *
      vessel.rudder.maximumAngleRad *
      rudderHealthRatio;
    if (
      condition.rudderHealth > 0 &&
      condition.rudderHealth < 40
    ) {
      targetRudder +=
        (input.random.next() - 0.5) *
        vessel.rudder.maximumAngleRad *
        0.3;
    }
    this.rudderAngleValue = moveToward(
      this.rudderAngleValue,
      targetRudder,
      vessel.rudder.rateRadPerSecond * dt,
    );

    body.localPointToWorld(
      this.localRudder.fromArray(vessel.rudder.pointLocal),
      this.worldRudder,
    );
    const rudderWaterSample = input.sampleWater(
      this.worldRudder.x,
      this.worldRudder.z,
      time,
      this.rudderWaterSample,
    );
    body.velocityAtPoint(
      this.worldRudder,
      this.rudderPointVelocity,
    );
    this.rudderWaterVelocity
      .set(
        rudderWaterSample.velocityX,
        rudderWaterSample.velocityY,
        rudderWaterSample.velocityZ,
      )
      .add(this.baseCurrentVelocity);
    this.rudderRelativeVelocity
      .copy(this.rudderPointVelocity)
      .sub(this.rudderWaterVelocity);
    const rudderForwardFlowMps =
      this.rudderRelativeVelocity.dot(forwardDir) +
      propulsionResult.propWashSpeedMps *
        vessel.rudder.propWashFraction;
    const rudderRightFlowMps =
      this.rudderRelativeVelocity.dot(rightDir);
    const rudderSubmergenceM = Math.max(
      0,
      rudderWaterSample.y - this.worldRudder.y,
    );
    const rudderHydrodynamics =
      computeRudderHydrodynamics({
        config: vessel.rudder,
        waterDensityKgM3: vessel.waterDensityKgM3,
        forwardFlowMps: rudderForwardFlowMps,
        rightFlowMps: rudderRightFlowMps,
        rudderAngleRad: this.rudderAngleValue,
        submergenceM: rudderSubmergenceM,
        healthRatio: rudderHealthRatio,
      });
    const rudderForceComponents =
      resolveRudderForceComponents(
        rudderHydrodynamics,
        rudderForwardFlowMps,
        rudderRightFlowMps,
      );
    const uprightY = this.boatUp
      .set(0, 1, 0)
      .applyQuaternion(body.quaternion).y;
    const uprightSteeringAuthority = MathUtils.smoothstep(
      uprightY,
      0.08,
      0.78,
    );
    this.rudderForce
      .copy(forwardDir)
      .multiplyScalar(rudderForceComponents.forwardN)
      .addScaledVector(
        rightDir,
        rudderForceComponents.rightN,
      )
      .multiplyScalar(uprightSteeringAuthority);
    const appliedRudderForceN =
      this.rudderForce.length();
    body.addForceAtPoint(
      this.rudderForce,
      this.worldRudder,
    );

    if (
      vessel.planingCapable &&
      activePlaningSpeedRatio > 0.15
    ) {
      const rollSin = this.rollStabilityTorque
        .copy(this.boatUp)
        .cross(this.worldUp)
        .dot(forwardDir);
      const rollCos = MathUtils.clamp(
        this.boatUp.dot(this.worldUp),
        -1,
        1,
      );
      const signedRollRadians = Math.atan2(
        rollSin,
        rollCos,
      );
      const rollRateRadPerSecond =
        body.angularVelocity.dot(forwardDir);
      const stabilityBlend = MathUtils.smoothstep(
        activePlaningSpeedRatio,
        0.15,
        0.65,
      );
      const rollStabilityTorqueNm = MathUtils.clamp(
        signedRollRadians * massKg * 24 -
          rollRateRadPerSecond * massKg * 8,
        -massKg * 45,
        massKg * 45,
      );
      body.addTorque(
        this.rollStabilityTorque
          .copy(forwardDir)
          .multiplyScalar(
            rollStabilityTorqueNm * stabilityBlend,
          ),
      );
    }

    if (!input.calibration) {
      const environmentalDamage =
        this.environmentalForces.apply({
          body,
          vessel,
          deltaSeconds: dt,
          waterVelocity,
          iceFactor: currentIceFactor,
          submergedRatio,
          throttle,
          tornadoPosition: input.tornadoPosition,
          whirlpoolPosition: input.whirlpoolPosition,
          random: input.random,
        });
      condition.applyDamage({
        source: 'environmental-impact',
        hullDamage: environmentalDamage.hullDamage,
        engineDamage: environmentalDamage.engineDamage,
      });
      if (
        environmentalDamage.hullDamage > 0 &&
        environmentalDamage.iceContactSpeedMps > 3.5
      ) {
        input.floodingSink.registerBreach(
          vessel,
          'bow',
          MathUtils.clamp(
            environmentalDamage.hullDamage * 0.004,
            0,
            0.08,
          ),
        );
      }
    }

    this.lastSubmergedRatioValue = submergedRatio;
    if (!this.resultValue) {
      this.resultValue = {
        massKg,
        submergedRatio,
        forwardWaterRelativeSpeedMps,
        activePlaningSpeedRatio,
        displacementBalanceErrorRatio:
          displacementErrorRatio,
        hydrostaticResult,
        propulsionResult,
        rudderHydrodynamics,
        appliedRudderForceN,
        rudderAngleRad: this.rudderAngleValue,
      };
    } else {
      Object.assign(this.resultValue, {
        massKg,
        submergedRatio,
        forwardWaterRelativeSpeedMps,
        activePlaningSpeedRatio,
        displacementBalanceErrorRatio:
          displacementErrorRatio,
        hydrostaticResult,
        propulsionResult,
        rudderHydrodynamics,
        appliedRudderForceN,
        rudderAngleRad: this.rudderAngleValue,
      });
    }
    return this.resultValue;
  }
}
