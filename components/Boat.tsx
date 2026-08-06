'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group, MathUtils, Quaternion } from 'three';
import { MeshDistortMaterial } from '@react-three/drei';
import { useSimStore, sharedPhysics } from '@/store/useSimStore';
import { sampleOceanSurface } from './Ocean';
import { useBoatAudio } from './boat/useBoatAudio';
import { useBoatVisualDamage } from './boat/useBoatVisualDamage';
import { FixedStepRunner } from '@/sim/core/FixedStepRunner';
import { canAdvanceAuthoritativeSimulation } from '@/sim/core/SimulationRuntimeAuthority';
import { SixDofBody } from '@/sim/core/SixDofBody';
import { SeededRandom } from '@/sim/core/SeededRandom';
import { getVesselConfig } from '@/sim/vessels/VesselConfig';
import { createWaterSurfaceSample } from '@/sim/water/WaterSurface';
import {
  computeRudderHydrodynamics,
  MarinePropulsionSystem,
  moveToward,
  resolveRudderForceComponents,
} from '@/sim/vessels/PropulsionSystem';
import { SectionalHydrostatics } from '@/sim/vessels/SectionalHydrostatics';
import { FloodingModel } from '@/sim/vessels/FloodingModel';
import { displacementBalanceErrorRatio } from '@/sim/vessels/HydrostaticsMath';
import { EnvironmentalForces } from '@/sim/vessels/EnvironmentalForces';
import { VesselConditionRuntime } from '@/sim/vessels/VesselConditionRuntime';
import {
  calculateFieldRepairPenalty,
  isFieldRepairEligible,
} from '@/sim/vessels/FieldRepairPolicy';
import {
  setWorldVectorFromHeading,
  worldDirectionToHeadingDegrees,
} from '@/sim/world/WorldDirection';
import {
  planingSpeedRatio,
  waterRelativeSurgeSpeed,
} from '@/sim/vessels/PhysicsCorrectness';
import { RapierCollisionWorld } from '@/sim/collision/RapierCollisionWorld';
import { VesselCollisionRuntime } from '@/sim/collision/VesselCollisionRuntime';
import { sharedMissionRuntimeStatistics } from '@/sim/scenarios/MissionRuntimeStatistics';
import { useNavigationPlanner } from '@/store/useNavigationPlanner';
import {
  parseCalibrationRequest,
  sampleFlatCalibrationWater,
  VesselCalibrationRunner,
} from '@/sim/calibration/VesselCalibration';
import {
  CollisionCalibrationRunner,
  parseCollisionCalibrationRequest,
} from '@/sim/calibration/CollisionCalibration';

type SimulationCalibrationRunner =
  | VesselCalibrationRunner
  | CollisionCalibrationRunner;

export default function Boat() {
  const boatRef = useRef<Group>(null);
  const physicsBody = useRef(new SixDofBody());
  const fixedStepRunner = useRef(new FixedStepRunner());
  const simulationRandom = useRef(new SeededRandom(0xb0475eed));
  const sectionalHydrostatics = useRef(new SectionalHydrostatics());
  const propulsionSystem = useRef(new MarinePropulsionSystem());
  const floodingModel = useRef(new FloodingModel());
  const previousCompartmentExposure = useRef<Record<string, number>>({});
  const configuredVesselType = useRef<string | null>(null);
  const addedMass = useRef<[number, number, number]>([0, 0, 0]);
  const addedInertia = useRef<[number, number, number]>([0, 0, 0]);
  const environmentalForces = useRef(new EnvironmentalForces());
  const rapierCollisionWorld = useRef<RapierCollisionWorld | null>(null);
  const collisionRuntime = useRef(new VesselCollisionRuntime());
  const collisionTestEnabled = useRef(false);
  const repairTestEnabled = useRef(false);
  const previousPosition = useRef(new Vector3());
  const currentPosition = useRef(new Vector3());
  const previousQuaternion = useRef(new Quaternion());
  const currentQuaternion = useRef(new Quaternion());
  const lastSubmergedRatio = useRef(1);
  const rudderAngle = useRef(0);
  const trawlerEngineRef = useRef<Group>(null);
  const speedboatEngineLRef = useRef<Group>(null);
  const speedboatEngineRRef = useRef<Group>(null);
  const telemetryAccumulator = useRef(0);
  const calibrationRunner =
    useRef<SimulationCalibrationRunner | null>(null);
  const calibrationSimulationTime = useRef(0);
  const motionLimits = useRef({
    maxHorizontalSpeedMps: 80,
    maxVerticalSpeedMps: 40,
    maxAngularSpeedRadPerSecond: 4,
  });

  const scratch = useMemo(
    () => ({
      forwardDir: new Vector3(),
      rightDir: new Vector3(),
      windVelocity: new Vector3(),
      waterVelocity: new Vector3(),
      baseCurrentVelocity: new Vector3(),
      propellerPointVelocity: new Vector3(),
      propellerWaterVelocity: new Vector3(),
      propellerRelativeVelocity: new Vector3(),
      rudderPointVelocity: new Vector3(),
      rudderWaterVelocity: new Vector3(),
      rudderRelativeVelocity: new Vector3(),
      rudderFlowDirection: new Vector3(),
      rudderLiftDirection: new Vector3(),
      rudderDragForce: new Vector3(),
      propellerReactionTorque: new Vector3(),
      propellerWaterSample: createWaterSurfaceSample(),
      rudderWaterSample: createWaterSurfaceSample(),
      thrustForce: new Vector3(),
      thrustDirection: new Vector3(),
      apparentWind: new Vector3(),
      apparentWindDir: new Vector3(),
      flagApparentWindLocal: new Vector3(),
      inverseBoatQuaternion: new Quaternion(),
      windForce: new Vector3(),
      gravityForce: new Vector3(),
      localPropeller: new Vector3(),
      localRudder: new Vector3(),
      localWind: new Vector3(),
      localPlaning: new Vector3(),
      worldPropeller: new Vector3(),
      worldRudder: new Vector3(),
      worldWind: new Vector3(),
      worldPlaning: new Vector3(),
      planingForce: new Vector3(),
      rudderForce: new Vector3(),
      rollStabilityTorque: new Vector3(),
      boatForward: new Vector3(),
      boatRight: new Vector3(),
      boatUp: new Vector3(),
      worldUp: new Vector3(0, 1, 0),
    }),
    [],
  );
  
  const initialCondition = useMemo(() => {
    const state = useSimStore.getState();
    const preserveConditionAcrossRecovery =
      state.sessionPhase !== 'menu' &&
      state.scenarioRunStatus === 'active';
    return preserveConditionAcrossRecovery
      ? {
          hullHealth: state.hullHealth,
          engineHealth: state.engineHealth,
          engineTemperature: state.engineTemperature,
          rudderHealth: state.rudderHealth,
        }
      : {
          hullHealth: 100,
          engineHealth: 100,
          engineTemperature: 20,
          rudderHealth: 100,
        };
  }, []);

  // Component condition survives a recovery remount, while a fresh scenario
  // still enters through the store's reset telemetry at 100%.
  const conditionRuntime = useRef(
    new VesselConditionRuntime({
      hullHealth: initialCondition.hullHealth,
      engineHealth: initialCondition.engineHealth,
      engineTemperature: initialCondition.engineTemperature,
      rudderHealth: initialCondition.rudderHealth,
    }),
  );

  // Read active boat reactively to trigger re-renders
  const activeBoat = useSimStore((state) => state.activeBoat);
  const instantRepairTrigger = useSimStore((state) => state.instantRepairTrigger);
  const audio = useBoatAudio();
  const updateVisualDamage = useBoatVisualDamage(boatRef, activeBoat);

  // Instant Repair Reset Catch
  useEffect(() => {
    if (instantRepairTrigger > 0) {
      const vessel = getVesselConfig(activeBoat);
      conditionRuntime.current.reset();
      floodingModel.current.reset(vessel);
      sectionalHydrostatics.current.reset(vessel);
      propulsionSystem.current.reset(vessel.engine);
      previousCompartmentExposure.current = {};
      configuredVesselType.current = vessel.type;
      sharedPhysics.maximumSlamSeverity = 0;
      useSimStore.getState().setFloodingTelemetry(0, 0);
    }
  }, [activeBoat, instantRepairTrigger]);

  useEffect(() => {
    const vesselRequest = parseCalibrationRequest(window.location.search);
    const collisionRequest = parseCollisionCalibrationRequest(
      window.location.search,
    );
    const request = vesselRequest ?? collisionRequest;
    if (!request) return undefined;

    const store = useSimStore.getState();
    const vessel = getVesselConfig(request.vessel);
    const runner: SimulationCalibrationRunner = vesselRequest
      ? new VesselCalibrationRunner(vesselRequest)
      : new CollisionCalibrationRunner(collisionRequest!);
    const body = physicsBody.current;

    calibrationRunner.current = runner;
    calibrationSimulationTime.current = 0;
    fixedStepRunner.current.reset(0);
    store.setActiveBoat(request.vessel);
    store.setWindSpeed(0);
    store.setCurrentSpeed(0);
    store.setEngineThrust(0);
    store.setTargetTime(12);
    store.setTargetSeason(0.25);
    store.setQualityMode('low');
    sharedPhysics.season = 0.25;
    sharedPhysics.tornadoPos.set(10_000, 0, 10_000);
    sharedPhysics.whirlpoolPos.set(-10_000, 0, -10_000);

    conditionRuntime.current.reset();
    propulsionSystem.current.reset(vessel.engine);
    rudderAngle.current = 0;
    telemetryAccumulator.current = 0;
    floodingModel.current.reset(vessel);
    sectionalHydrostatics.current.reset(vessel);
    previousCompartmentExposure.current = {};
    configuredVesselType.current = vessel.type;
    lastSubmergedRatio.current = 0.75;

    runner.initialize(body, vessel);
    previousPosition.current.copy(body.position);
    currentPosition.current.copy(body.position);
    previousQuaternion.current.copy(body.quaternion);
    currentQuaternion.current.copy(body.quaternion);

    sharedPhysics.calibrationReady = 0;
    sharedPhysics.calibrationPassed = 0;
    sharedPhysics.calibrationProgress = 0;
    sharedPhysics.calibrationScenario = request.scenario;
    sharedPhysics.calibrationVessel = request.vessel;
    sharedPhysics.calibrationResult = '';
    sharedPhysics.boatPos.copy(body.position);
    sharedPhysics.boatQuaternion.copy(body.quaternion);
    sharedPhysics.boatLinearVelocity.set(0, 0, 0);
    sharedPhysics.boatAngularVelocity.set(0, 0, 0);
    sharedPhysics.displacedVolumeM3 = 0;
    sharedPhysics.floodingRatio = 0;
    sharedPhysics.floodedVolumeM3 = 0;
    sharedPhysics.physicalMassKg = vessel.massKg;
    sharedPhysics.displacementBalanceErrorRatio = 0;
    sharedPhysics.centerOfBuoyancy.copy(body.position);
    sharedPhysics.averageWaterVelocity.set(0, 0, 0);
    sharedPhysics.maximumSlamSeverity = 0;
    sharedPhysics.engineRpm = vessel.engine.idleRpm;
    sharedPhysics.shaftRpm = 0;
    sharedPhysics.deliveredShaftPowerW = 0;
    sharedPhysics.absorbedShaftPowerW = 0;
    sharedPhysics.propellerThrustN = 0;
    sharedPhysics.propellerAdvanceRatio = 0;
    sharedPhysics.propellerLoadRatio = 0;
    sharedPhysics.cavitationFactor = 1;
    sharedPhysics.ventilationFactor = 1;
    sharedPhysics.propWashSpeedMps = 0;
    sharedPhysics.rudderAngleRad = 0;
    sharedPhysics.rudderForceN = 0;
    sharedPhysics.rudderFlowSpeedMps = 0;
    sharedPhysics.rudderAngleOfAttackRad = 0;
    sharedPhysics.simulationTime = 0;
    sharedPhysics.renderTime = 0;
    store.setTelemetry(0, 0, 100, 100, 20, 100);
    store.setFloodingTelemetry(0, 0);

    return () => {
      calibrationRunner.current = null;
      sharedPhysics.calibrationReady = 0;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const activeCollisionRuntime = collisionRuntime.current;
    const searchParams = new URLSearchParams(window.location.search);
    collisionTestEnabled.current = searchParams.get('collisionTest') === '1';
    repairTestEnabled.current = searchParams.get('repairTest') === '1';

    const repairTestStore = useSimStore.getState();
    if (
      repairTestEnabled.current &&
      repairTestStore.hullHealth >= 99.9 &&
      repairTestStore.engineHealth >= 99.9 &&
      repairTestStore.rudderHealth >= 99.9
    ) {
      conditionRuntime.current.reset({
        hullHealth: 72,
        engineHealth: 35,
        engineTemperature: 78,
        rudderHealth: 42,
      });
      repairTestStore.setTelemetry(0, 0, 72, 35, 78, 42);
    }

    activeCollisionRuntime.reset(sharedPhysics);

    void RapierCollisionWorld.create()
      .then((collisionWorld) => {
        if (cancelled) {
          collisionWorld.dispose();
          return;
        }
        rapierCollisionWorld.current = collisionWorld;
        activeCollisionRuntime.setReady(sharedPhysics, true);
      })
      .catch((error: unknown) => {
        console.error('Failed to initialize Rapier collision world.', error);
      });

    return () => {
      cancelled = true;
      rapierCollisionWorld.current?.dispose();
      rapierCollisionWorld.current = null;
      activeCollisionRuntime.setReady(sharedPhysics, false);
    };
  }, []);

  // Apparent wind flag rotation
  const flagRef = useRef<Group>(null);


  const stepSimulation = (dt: number, time: number) => {
    const body = physicsBody.current;
    previousPosition.current.copy(currentPosition.current);
    previousQuaternion.current.copy(currentQuaternion.current);
    sharedPhysics.simulationTime = time;

    const {
      keys,
      windSpeed,
      windDir,
      currentSpeed,
      currentDir,
      engineThrust,
      activeBoat,
      sessionPhase,
      scenarioRunStatus,
      scenarioRunId,
      resetVesselTrigger,
      setTelemetry,
      setFloodingTelemetry,
      setFieldRepairTelemetry,
    } = useSimStore.getState();

    const vessel = getVesselConfig(activeBoat);
    if (configuredVesselType.current !== vessel.type) {
      floodingModel.current.reset(vessel);
      sectionalHydrostatics.current.reset(vessel);
      propulsionSystem.current.reset(vessel.engine);
      previousCompartmentExposure.current = {};
      configuredVesselType.current = vessel.type;
      lastSubmergedRatio.current = 0.75;
      sharedPhysics.maximumSlamSeverity = 0;
    }

    const calibration = calibrationRunner.current;
    const calibrationControls = calibration?.controls(time);
    const keyboardThrottle =
      (keys.w || keys.arrowup ? 1 : 0) -
      (keys.s || keys.arrowdown ? 1 : 0);
    const thrustRaw =
      calibrationControls?.throttle ??
      (keyboardThrottle !== 0
        ? keyboardThrottle
        : MathUtils.clamp(engineThrust, -1, 1));
    const steerRaw =
      calibrationControls?.steer ??
      ((keys.a || keys.arrowleft ? 1 : 0) -
        (keys.d || keys.arrowright ? 1 : 0));

    const isWinter = MathUtils.clamp(
      1 - Math.abs(sharedPhysics.season - 0.75) * 4,
      0,
      1,
    );
    const currentSpeedKnots =
      Math.hypot(body.linearVelocity.x, body.linearVelocity.z) /
      0.514444;
    const propulsionInputActive =
      keys.w ||
      keys.s ||
      keys.arrowup ||
      keys.arrowdown;
    const activeFieldRepair =
      !calibration &&
      isFieldRepairEligible({
        requested: keys.r,
        speedKnots: currentSpeedKnots,
        throttle: thrustRaw,
        propulsionInputActive,
      });
    const floodingResult = floodingModel.current.step({
      vessel,
      deltaSeconds: dt,
      hullHealth: calibration ? 100 : conditionRuntime.current.hullHealth,
      engineHealth: conditionRuntime.current.engineHealth,
      compartmentExposure: previousCompartmentExposure.current,
      activePump: activeFieldRepair,
      winterFactor: calibration ? 0 : isWinter,
    });

    const addedMassScale = MathUtils.smoothstep(
      lastSubmergedRatio.current,
      0.05,
      0.85,
    );
    for (let axis = 0; axis < 3; axis += 1) {
      addedMass.current[axis] =
        vessel.hydrodynamics.addedMassKg[axis] * addedMassScale;
      addedInertia.current[axis] =
        vessel.hydrodynamics.addedInertiaKgM2[axis] * addedMassScale;
    }

    body.setMassProperties(
      floodingResult.physicalMassKg,
      floodingResult.principalInertiaKgM2,
      vessel.angularDampingPerSecond,
      floodingResult.centerOfMassLocal,
      addedMass.current,
      addedInertia.current,
    );
    body.beginStep();
    body.addForce(
      scratch.gravityForce.set(
        0,
        -floodingResult.physicalMassKg * 9.81,
        0,
      ),
    );

    // --- Vessel Dynamics Configuration ---
    const mass = floodingResult.physicalMassKg;
    const windCoeff = vessel.windAreaCoefficient;

    // Physics keeps pitch and roll in these axes. Horizontal projection is
    // reserved for navigation heading after the completed simulation step.
    const forwardDir = scratch.forwardDir
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion)
      .normalize();
    const rightDir = scratch.rightDir
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion)
      .normalize();

    const pos = body.position;
    const halfL = vessel.halfLengthM;
    const windVelocity = scratch.windVelocity;
    const baseCurrentVelocity = scratch.baseCurrentVelocity;
    if (calibration) {
      windVelocity.set(0, 0, 0);
      baseCurrentVelocity.set(0, 0, 0);
    } else {
      setWorldVectorFromHeading(windVelocity, windDir, windSpeed);
      setWorldVectorFromHeading(
        baseCurrentVelocity,
        currentDir,
        currentSpeed,
      );
    }

    // Recreate the localized ice field used by the ocean shader.
    const iceNoise =
      Math.sin(pos.x * 0.01) * Math.cos(pos.z * 0.01) +
      Math.sin(pos.x * 0.05 + pos.z * 0.04) * 0.5;
    const currentIceFactor = calibration
      ? 0
      : MathUtils.clamp(
          (iceNoise * 0.3 + isWinter * 1.5 - 1) * 2,
          0,
          1,
        );

    // Use the base current for the drag pre-pass. The current step's local
    // Gerstner orbital velocity is available after the sectional solve and is
    // used by propulsion, steering, hazards, telemetry, and the next step.
    const preSolveSurgeSpeed = waterRelativeSurgeSpeed(
      body.linearVelocity,
      baseCurrentVelocity,
      forwardDir,
    );
    const preSolvePlaningRatio = planingSpeedRatio(
      preSolveSurgeSpeed,
      vessel.planingReferenceSpeedMps,
    );
    // Powered trim reduces wetted area more than a coasting hull at the same
    // speed. When throttle is cut, the planing craft progressively settles and
    // regains resistance instead of retaining its minimum powered drag until
    // it has almost stopped.
    const planingPowerSupport = MathUtils.smoothstep(
      Math.max(0, thrustRaw),
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
      1 + ((100 - conditionRuntime.current.hullHealth) / 100) * 0.8;

    const sampleWater = calibration
      ? sampleFlatCalibrationWater
      : sampleOceanSurface;
    const hydrostaticResult = sectionalHydrostatics.current.apply({
      body,
      vessel,
      timeSeconds: time,
      deltaSeconds: dt,
      baseCurrentVelocity,
      forwardDragMultiplier:
        planingDragReduction * hullDragPenalty,
      lateralDragMultiplier: hullDragPenalty,
      buoyancyAvailabilityByCompartment:
        floodingResult.buoyancyAvailabilityByCompartment,
      physicalMassKg: mass,
      sampleWater,
    });
    const submergedRatio = hydrostaticResult.submergedRatio;
    const waterVelocity = scratch.waterVelocity.copy(
      hydrostaticResult.averageWaterVelocityWorld,
    );

    const previousExposure = previousCompartmentExposure.current;
    for (const key of Object.keys(previousExposure)) {
      delete previousExposure[key];
    }
    Object.assign(previousExposure, hydrostaticResult.compartmentExposure);

    const vRelForward = waterRelativeSurgeSpeed(
      body.linearVelocity,
      waterVelocity,
      forwardDir,
    );
    const activePlaningSpeedRatio = planingSpeedRatio(
      vRelForward,
      vessel.planingReferenceSpeedMps,
    );
    const displacementErrorRatio = displacementBalanceErrorRatio(
      hydrostaticResult.displacedVolumeM3,
      mass,
      vessel.waterDensityKgM3,
    );

    if (
      !calibration &&
      time > 2 &&
      hydrostaticResult.maximumSlamSeverity > 0
    ) {
      conditionRuntime.current.applyDamage({
        source: 'slamming',
        hullDamage: hydrostaticResult.slamHullDamage,
        engineDamage: hydrostaticResult.slamEngineDamage,
        rudderDamage: hydrostaticResult.slamRudderDamage,
      });
      if (hydrostaticResult.slamCompartmentId) {
        floodingModel.current.registerBreach(
          vessel,
          hydrostaticResult.slamCompartmentId,
          MathUtils.clamp(
            (hydrostaticResult.maximumSlamSeverity - 0.45) * 0.035,
            0,
            0.18,
          ),
        );
      }
      audio.playSlam(hydrostaticResult.maximumSlamSeverity);
    }

    // --- Applied body-relative forces ---

    // PLANING HYDRODYNAMICS
    // The speedboat receives bow lift once forward speed builds. Hull
    // resistance is already reduced inside the sectional hull model.
    const planingFactor =
      activePlaningSpeedRatio *
      activePlaningSpeedRatio *
      submergedRatio;

    // --- ENGINE, DRIVELINE, AND PROPELLER OPEN-WATER MODEL ---
    body.localPointToWorld(
      scratch.localPropeller.fromArray(vessel.propeller.pointLocal),
      scratch.worldPropeller,
    );
    const propellerWaterSample = sampleWater(
      scratch.worldPropeller.x,
      scratch.worldPropeller.z,
      time,
      scratch.propellerWaterSample,
    );
    body.velocityAtPoint(
      scratch.worldPropeller,
      scratch.propellerPointVelocity,
    );
    scratch.propellerWaterVelocity
      .set(
        propellerWaterSample.velocityX,
        propellerWaterSample.velocityY,
        propellerWaterSample.velocityZ,
      )
      .add(baseCurrentVelocity);
    const shaftAngleCos = Math.cos(vessel.propeller.shaftAngleRad);
    const shaftAngleSin = Math.sin(vessel.propeller.shaftAngleRad);
    const thrustDirection = scratch.thrustDirection
      .copy(forwardDir)
      .multiplyScalar(shaftAngleCos)
      .addScaledVector(
        scratch.boatUp
          .set(0, 1, 0)
          .applyQuaternion(body.quaternion)
          .normalize(),
        shaftAngleSin,
      )
      .normalize();
    const propellerAdvanceSpeedMps = scratch.propellerRelativeVelocity
      .copy(scratch.propellerPointVelocity)
      .sub(scratch.propellerWaterVelocity)
      .dot(thrustDirection);
    const propellerSubmergenceM = Math.max(
      0,
      propellerWaterSample.y - scratch.worldPropeller.y,
    );

    const engineHealthEfficiency = MathUtils.clamp(
      conditionRuntime.current.engineHealth / 100,
      0,
      1,
    );
    const temperatureEfficiency =
      conditionRuntime.current.engineTemperature > 90
        ? Math.max(
            0.2,
            1 - (conditionRuntime.current.engineTemperature - 90) / 20,
          )
        : 1;
    let combustionEfficiency = 1;
    if (conditionRuntime.current.engineHealth > 0 && conditionRuntime.current.engineHealth < 40) {
      const damageRatio = (40 - conditionRuntime.current.engineHealth) / 40;
      const misfireProbability = 1 - Math.exp(-damageRatio * 8 * dt);
      if (simulationRandom.current.next() < misfireProbability) {
        combustionEfficiency = MathUtils.lerp(
          0.08,
          0.28,
          simulationRandom.current.next(),
        );
      }
    }

    const propulsionResult = propulsionSystem.current.step(
      vessel.engine,
      vessel.propeller,
      {
        deltaSeconds: dt,
        throttle: thrustRaw,
        engineHealthRatio: engineHealthEfficiency,
        temperatureEfficiency,
        combustionEfficiency,
        waterDensityKgM3: vessel.waterDensityKgM3,
        propellerAdvanceSpeedMps,
        propellerSubmergenceM,
      },
    );
    const thrustForce = scratch.thrustForce
      .copy(thrustDirection)
      .multiplyScalar(propulsionResult.propellerThrustN);
    body.addTorque(
      scratch.propellerReactionTorque
        .copy(thrustDirection)
        .multiplyScalar(
          -vessel.propeller.rotationDirection *
            Math.sign(propulsionResult.shaftRpm) *
            propulsionResult.shaftTorqueNm *
            vessel.propeller.hullReactionTorqueFraction,
        ),
    );

    // DIRECTIONAL WIND CATCHING
    const apparentWind = scratch.apparentWind
      .copy(windVelocity)
      .sub(body.linearVelocity);
    const apparentWindLengthSq = apparentWind.lengthSq();
    const apparentWindDir = scratch.apparentWindDir;
    if (apparentWindLengthSq > 1e-8) {
      apparentWindDir.copy(apparentWind).multiplyScalar(
        1 / Math.sqrt(apparentWindLengthSq),
      );
    } else {
      apparentWindDir.set(1, 0, 0);
    }
    
    const windDotForward = apparentWindDir.dot(forwardDir);
    const windDotRight = apparentWindDir.dot(rightDir);
    const sideAreaMultiplier = vessel.sideAreaMultiplier;
    const exposedProfileArea =
      Math.abs(windDotForward) +
      Math.abs(windDotRight) * sideAreaMultiplier;
    const trueWindCoeff = windCoeff * exposedProfileArea;
    const windForce = scratch.windForce.copy(apparentWind).multiplyScalar(
      Math.sqrt(apparentWindLengthSq) * trueWindCoeff,
    );

    body.addForceAtPoint(thrustForce, scratch.worldPropeller);
    body.localPointToWorld(
      scratch.localWind.fromArray(vessel.windPointLocal),
      scratch.worldWind,
    );
    body.addForceAtPoint(windForce, scratch.worldWind);

    if (vessel.planingCapable && planingFactor > 0) {
      // The pressure center stays close to the center of mass and moves
      // modestly aft as the hull climbs onto plane. The angled shaft already
      // carries its own trim moment, so planing lift must not act as a large
      // artificial bow or transom lever.
      const planingCenterOffsetM = halfL * MathUtils.lerp(
        0.03,
        0.14,
        activePlaningSpeedRatio,
      );
      body.localPointToWorld(
        scratch.localPlaning.set(
          0,
          0,
          vessel.centerOfMassLocal[2] + planingCenterOffsetM,
        ),
        scratch.worldPlaning,
      );
      body.addForceAtPoint(
        scratch.planingForce.set(
          0,
          mass * 9.81 * planingFactor * 0.2,
          0,
        ),
        scratch.worldPlaning,
      );
    }
    
    // Ice, tornado, and whirlpool loads are accumulated below through the
    // environmental force model before the authoritative integration step.

    // --- LOCAL-FLOW RUDDER WITH SIGNED PROP WASH ---
    const rudderHealthRatio = MathUtils.clamp(
      conditionRuntime.current.rudderHealth / 100,
      0,
      1,
    );
    // Positive input means port/left in the UI, while positive physical
    // rudder angle is starboard/right in the body-axis hydrodynamic model.
    let targetRudder =
      -steerRaw * vessel.rudder.maximumAngleRad * rudderHealthRatio;
    if (conditionRuntime.current.rudderHealth > 0 && conditionRuntime.current.rudderHealth < 40) {
      targetRudder +=
        (simulationRandom.current.next() - 0.5) *
        vessel.rudder.maximumAngleRad *
        0.3;
    }
    rudderAngle.current = moveToward(
      rudderAngle.current,
      targetRudder,
      vessel.rudder.rateRadPerSecond * dt,
    );

    body.localPointToWorld(
      scratch.localRudder.fromArray(vessel.rudder.pointLocal),
      scratch.worldRudder,
    );
    const rudderWaterSample = sampleWater(
      scratch.worldRudder.x,
      scratch.worldRudder.z,
      time,
      scratch.rudderWaterSample,
    );
    body.velocityAtPoint(
      scratch.worldRudder,
      scratch.rudderPointVelocity,
    );
    scratch.rudderWaterVelocity
      .set(
        rudderWaterSample.velocityX,
        rudderWaterSample.velocityY,
        rudderWaterSample.velocityZ,
      )
      .add(baseCurrentVelocity);
    scratch.rudderRelativeVelocity
      .copy(scratch.rudderPointVelocity)
      .sub(scratch.rudderWaterVelocity);
    const rudderForwardFlowMps =
      scratch.rudderRelativeVelocity.dot(forwardDir) +
      propulsionResult.propWashSpeedMps * vessel.rudder.propWashFraction;
    const rudderRightFlowMps =
      scratch.rudderRelativeVelocity.dot(rightDir);
    const rudderSubmergenceM = Math.max(
      0,
      rudderWaterSample.y - scratch.worldRudder.y,
    );
    const rudderHydrodynamics = computeRudderHydrodynamics({
      config: vessel.rudder,
      waterDensityKgM3: vessel.waterDensityKgM3,
      forwardFlowMps: rudderForwardFlowMps,
      rightFlowMps: rudderRightFlowMps,
      rudderAngleRad: rudderAngle.current,
      submergenceM: rudderSubmergenceM,
      healthRatio: rudderHealthRatio,
    });

    const rudderForceComponents = resolveRudderForceComponents(
      rudderHydrodynamics,
      rudderForwardFlowMps,
      rudderRightFlowMps,
    );
    const uprightY = scratch.boatUp
      .set(0, 1, 0)
      .applyQuaternion(body.quaternion).y;
    const uprightSteeringAuthority = MathUtils.smoothstep(
      uprightY,
      0.08,
      0.78,
    );
    scratch.rudderForce
      .copy(forwardDir)
      .multiplyScalar(rudderForceComponents.forwardN)
      .addScaledVector(rightDir, rudderForceComponents.rightN)
      .multiplyScalar(uprightSteeringAuthority);
    const appliedRudderForceN = scratch.rudderForce.length();
    body.addForceAtPoint(scratch.rudderForce, scratch.worldRudder);

    if (vessel.planingCapable && activePlaningSpeedRatio > 0.15) {
      // atan2(sin, cos) provides a signed roll error through the full
      // orientation range. Unlike a sine-only term, it does not lose all
      // righting authority when the hull approaches an inverted attitude.
      const rollSin = scratch.rollStabilityTorque
        .copy(scratch.boatUp)
        .cross(scratch.worldUp)
        .dot(forwardDir);
      const rollCos = MathUtils.clamp(
        scratch.boatUp.dot(scratch.worldUp),
        -1,
        1,
      );
      const signedRollRadians = Math.atan2(rollSin, rollCos);
      const rollRateRadPerSecond =
        body.angularVelocity.dot(forwardDir);
      const stabilityBlend = MathUtils.smoothstep(
        activePlaningSpeedRatio,
        0.15,
        0.65,
      );
      const rollStabilityTorqueNm = MathUtils.clamp(
        signedRollRadians * mass * 24 -
          rollRateRadPerSecond * mass * 8,
        -mass * 45,
        mass * 45,
      );
      body.addTorque(
        scratch.rollStabilityTorque
          .copy(forwardDir)
          .multiplyScalar(rollStabilityTorqueNm * stabilityBlend),
      );
    }

    if (!calibration) {
      const environmentalDamage = environmentalForces.current.apply({
        body,
        vessel,
        deltaSeconds: dt,
        waterVelocity,
        iceFactor: currentIceFactor,
        submergedRatio,
        throttle: thrustRaw,
        tornadoPosition: sharedPhysics.tornadoPos,
        whirlpoolPosition: sharedPhysics.whirlpoolPos,
        random: simulationRandom.current,
      });
      conditionRuntime.current.applyDamage({
        source: 'environmental-impact',
        hullDamage: environmentalDamage.hullDamage,
        engineDamage: environmentalDamage.engineDamage,
      });
      if (
        environmentalDamage.hullDamage > 0 &&
        environmentalDamage.iceContactSpeedMps > 3.5
      ) {
        floodingModel.current.registerBreach(
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

    // The custom marine solver updates anisotropic velocity first. Rapier then
    // advances the pose exactly once and owns every contact impulse, friction
    // constraint, restitution response, and penetration recovery.
    motionLimits.current.maxAngularSpeedRadPerSecond =
      vessel.maxAngularSpeedRadPerSecond;
    body.integrateVelocities(dt);
    body.enforceMotionLimits(motionLimits.current);

    const collisionWorldEnabled =
      !calibration || calibration.usesCollisionWorld;
    const collisionSummary =
      collisionWorldEnabled && rapierCollisionWorld.current
        ? rapierCollisionWorld.current.step(
            body,
            vessel,
            dt,
            sharedPhysics.obstacles,
            !calibration &&
              collisionTestEnabled.current &&
              thrustRaw > 0.1 &&
              vRelForward > 0.35,
            calibration?.collisionFixture ?? null,
            mass,
          )
        : undefined;
    if (!collisionSummary) {
      body.integratePose(dt);
    }

    // Contact resolution can change both linear and angular velocity, so clamp
    // and validate the authoritative post-solve state.
    body.enforceMotionLimits(motionLimits.current);


    if (collisionSummary) {
      collisionRuntime.current.process({
        summary: collisionSummary,
        scenarioRunId,
        vesselGeneration: resetVesselTrigger,
        simulationTimeSeconds: time,
        effectiveMassKg: mass,
        forwardWaterRelativeSpeedMps: vRelForward,
        vessel,
        condition: conditionRuntime.current,
        flooding: floodingModel.current,
        telemetry: sharedPhysics,
        random: simulationRandom.current,
        audio,
      });
    }

    forwardDir.set(0, 0, -1).applyQuaternion(body.quaternion);
    forwardDir.y = 0;
    if (forwardDir.lengthSq() > 1e-8) forwardDir.normalize();
    else forwardDir.set(0, 0, -1);

    // Update Shared Physics for Shaders (Ocean Wake)
    sharedPhysics.boatPos.copy(body.position);
    sharedPhysics.boatDir.copy(forwardDir);
    const speed2D = Math.hypot(body.linearVelocity.x, body.linearVelocity.z);
    sharedPhysics.boatSpeed = Math.min(speed2D, 35.0);

    // --- Update Telemetry UI & Health Degradation ---
    // 1 knot = 0.514444 m/s
    const speedKnots = speed2D / 0.514444;
    const headingDeg = worldDirectionToHeadingDegrees(
      forwardDir.x,
      forwardDir.z,
    );

    const calibrationResult = calibration?.recordStep(time, {
      body,
      submergedRatio,
      speedMps: speed2D,
      forwardSpeedMps: vRelForward,
      headingRadians: MathUtils.degToRad(headingDeg),
      hullHealth: conditionRuntime.current.hullHealth,
      engineHealth: conditionRuntime.current.engineHealth,
      rudderHealth: conditionRuntime.current.rudderHealth,
      displacedVolumeM3: hydrostaticResult.displacedVolumeM3,
      physicalMassKg: mass,
      floodingRatio: floodingResult.floodingRatio,
      displacementBalanceErrorRatio: displacementErrorRatio,
      collisionSummary,
    });
    sharedPhysics.calibrationProgress = calibration?.progress ?? 0;
    if (calibrationResult) {
      sharedPhysics.calibrationReady = 1;
      sharedPhysics.calibrationPassed = calibrationResult.passed ? 1 : 0;
      sharedPhysics.calibrationResult = JSON.stringify(calibrationResult);
      setTelemetry(
        speedKnots,
        headingDeg,
        conditionRuntime.current.hullHealth,
        conditionRuntime.current.engineHealth,
        conditionRuntime.current.engineTemperature,
        conditionRuntime.current.rudderHealth,
      );
      setFloodingTelemetry(
        floodingResult.floodingRatio,
        floodingResult.totalFloodedVolumeM3,
      );
    }

    // --- Component temperature and explicit condition damage ---
    conditionRuntime.current.stepThermalAndFlooding({
      deltaSeconds: dt,
      engineRpm: propulsionResult.engineRpm,
      ratedEngineRpm: vessel.engine.ratedRpm,
      absorbedShaftPowerW: propulsionResult.absorbedShaftPowerW,
      ratedEnginePowerW: vessel.engine.ratedPowerW,
      ventilationFactor: propulsionResult.ventilationFactor,
      submergedRatio,
      engineCompartmentFloodingRatio:
        floodingResult.engineCompartmentFloodingRatio,
      simulationTimeSeconds: time,
    });

    // --- Bilge pump and limited emergency field repair ---
    const repairStatisticsBeforeStep =
      sharedMissionRuntimeStatistics.snapshot;
    const repairUsageMatchesRun =
      repairStatisticsBeforeStep.runId === scenarioRunId;
    const fieldRepairResult =
      conditionRuntime.current.applyFieldRepair({
        active: activeFieldRepair,
        deltaSeconds: dt,
        engineConditionRestoredThisRun: repairUsageMatchesRun
          ? repairStatisticsBeforeStep.engineConditionRestored
          : 0,
        rudderConditionRestoredThisRun: repairUsageMatchesRun
          ? repairStatisticsBeforeStep.rudderConditionRestored
          : 0,
      });

    const missionStatistics = !calibration
      ? sharedMissionRuntimeStatistics.advance({
          runId: scenarioRunId,
          vesselGeneration: resetVesselTrigger,
          enabled:
            canAdvanceAuthoritativeSimulation(sessionPhase) &&
            scenarioRunStatus === 'active' &&
            useNavigationPlanner.getState().mode === 'mission',
          repairTrackingEnabled:
            canAdvanceAuthoritativeSimulation(sessionPhase) &&
            scenarioRunStatus === 'active',
          deltaSeconds: dt,
          boatX: body.position.x,
          boatZ: body.position.z,
          speedKnots,
          repairActive: activeFieldRepair,
          engineConditionRestored:
            fieldRepairResult.engineConditionRestored,
          rudderConditionRestored:
            fieldRepairResult.rudderConditionRestored,
        })
      : sharedMissionRuntimeStatistics.snapshot;

    // Publish telemetry at a deterministic 10 Hz, independent of render FPS.
    if (!calibration) {
      telemetryAccumulator.current += dt;
      if (telemetryAccumulator.current >= 0.1) {
        telemetryAccumulator.current %= 0.1;
        setTelemetry(
          speedKnots,
          headingDeg,
          conditionRuntime.current.hullHealth,
          conditionRuntime.current.engineHealth,
          conditionRuntime.current.engineTemperature,
          conditionRuntime.current.rudderHealth,
        );
        setFloodingTelemetry(
          floodingResult.floodingRatio,
          floodingResult.totalFloodedVolumeM3,
        );
        setFieldRepairTelemetry({
          active: activeFieldRepair,
          activeSeconds: missionStatistics.repairActiveSeconds,
          activationCount: missionStatistics.repairActivationCount,
          engineConditionRestored:
            missionStatistics.engineConditionRestored,
          rudderConditionRestored:
            missionStatistics.rudderConditionRestored,
          penaltyPoints: calculateFieldRepairPenalty(missionStatistics),
        });
      }
    }

    sharedPhysics.boatPos.copy(body.position);
    sharedPhysics.boatQuaternion.copy(body.quaternion);
    sharedPhysics.boatLinearVelocity.copy(body.linearVelocity);
    sharedPhysics.boatAngularVelocity.copy(body.angularVelocity);
    sharedPhysics.boatSpeed = Math.min(
      Math.hypot(body.linearVelocity.x, body.linearVelocity.z),
      35,
    );
    sharedPhysics.submergedRatio = submergedRatio;
    sharedPhysics.displacedVolumeM3 =
      hydrostaticResult.displacedVolumeM3;
    sharedPhysics.floodingRatio = floodingResult.floodingRatio;
    sharedPhysics.floodedVolumeM3 =
      floodingResult.totalFloodedVolumeM3;
    sharedPhysics.physicalMassKg = mass;
    sharedPhysics.displacementBalanceErrorRatio = displacementErrorRatio;
    sharedPhysics.centerOfBuoyancy.copy(
      hydrostaticResult.centerOfBuoyancyWorld,
    );
    sharedPhysics.averageWaterVelocity.copy(
      hydrostaticResult.averageWaterVelocityWorld,
    );
    sharedPhysics.maximumSlamSeverity = Math.max(
      sharedPhysics.maximumSlamSeverity,
      hydrostaticResult.maximumSlamSeverity,
    );
    sharedPhysics.engineRpm = propulsionResult.engineRpm;
    sharedPhysics.shaftRpm = propulsionResult.shaftRpm;
    sharedPhysics.deliveredShaftPowerW =
      propulsionResult.deliveredShaftPowerW;
    sharedPhysics.absorbedShaftPowerW =
      propulsionResult.absorbedShaftPowerW;
    sharedPhysics.propellerThrustN =
      propulsionResult.propellerThrustN;
    sharedPhysics.propellerAdvanceRatio = propulsionResult.advanceRatio;
    sharedPhysics.propellerLoadRatio = propulsionResult.loadRatio;
    sharedPhysics.cavitationFactor = propulsionResult.cavitationFactor;
    sharedPhysics.ventilationFactor = propulsionResult.ventilationFactor;
    sharedPhysics.propWashSpeedMps = propulsionResult.propWashSpeedMps;
    sharedPhysics.rudderAngleRad = rudderAngle.current;
    sharedPhysics.rudderForceN = appliedRudderForceN;
    sharedPhysics.rudderFlowSpeedMps =
      rudderHydrodynamics.flowSpeedMps;
    sharedPhysics.rudderAngleOfAttackRad =
      rudderHydrodynamics.angleOfAttackRad;

    lastSubmergedRatio.current = submergedRatio;
    currentPosition.current.copy(body.position);
    currentQuaternion.current.copy(body.quaternion);
  };

  useFrame((state, delta) => {
    const boat = boatRef.current;
    if (!boat) return;

    const runtimeState = useSimStore.getState();
    const simulationRunning = canAdvanceAuthoritativeSimulation(
      runtimeState.sessionPhase,
    );
    const calibration = calibrationRunner.current;
    let stepResult;

    if (
      calibration?.usesCollisionWorld &&
      !rapierCollisionWorld.current
    ) {
      stepResult = {
        steps: 0,
        alpha: 1,
        simulationTimeSeconds: calibrationSimulationTime.current,
        droppedTimeSeconds: 0,
      };
    } else if (calibration) {
      const stepSeconds = fixedStepRunner.current.stepSeconds;
      let steps = 0;

      while (
        !calibration.isComplete &&
        steps < calibration.stepsPerRenderFrame
      ) {
        calibrationSimulationTime.current += stepSeconds;
        stepSimulation(
          stepSeconds,
          calibrationSimulationTime.current,
        );
        steps += 1;
      }

      stepResult = {
        steps,
        alpha: 1,
        simulationTimeSeconds: calibrationSimulationTime.current,
        droppedTimeSeconds: 0,
      };
    } else if (!simulationRunning) {
      stepResult = {
        steps: 0,
        alpha: 1,
        simulationTimeSeconds:
          fixedStepRunner.current.simulationTimeSeconds,
        droppedTimeSeconds: fixedStepRunner.current.droppedTimeSeconds,
      };
    } else {
      stepResult = fixedStepRunner.current.advance(
        delta,
        (stepSeconds, simulationTimeSeconds) => {
          stepSimulation(stepSeconds, simulationTimeSeconds);
        },
      );
    }

    sharedPhysics.renderTime =
      stepResult.simulationTimeSeconds +
      stepResult.alpha * fixedStepRunner.current.stepSeconds;
    sharedPhysics.fixedStepAlpha = stepResult.alpha;
    sharedPhysics.fixedStepCount = stepResult.steps;
    sharedPhysics.droppedSimulationTime = stepResult.droppedTimeSeconds;

    boat.position.lerpVectors(
      previousPosition.current,
      currentPosition.current,
      stepResult.alpha,
    );
    boat.quaternion.slerpQuaternions(
      previousQuaternion.current,
      currentQuaternion.current,
      stepResult.alpha,
    );

    const renderDelta = simulationRunning
      ? Math.min(delta, 0.1)
      : 0;
    const { windSpeed, windDir, activeBoat } = runtimeState;
    const isSpeedboat = activeBoat === 'speedboat';
    const forwardDir = scratch.forwardDir
      .set(0, 0, -1)
      .applyQuaternion(boat.quaternion);
    forwardDir.y = 0;
    if (forwardDir.lengthSq() > 1e-8) {
      forwardDir.normalize();
    } else {
      forwardDir.set(0, 0, -1);
    }

    setWorldVectorFromHeading(
      scratch.windVelocity,
      windDir,
      windSpeed,
    );
    const apparentWind = scratch.apparentWind
      .copy(scratch.windVelocity)
      .sub(physicsBody.current.linearVelocity);
    const speed2D = Math.hypot(physicsBody.current.linearVelocity.x, physicsBody.current.linearVelocity.z);
    const submergedRatio = lastSubmergedRatio.current;
    const pos = boat.position;

    // --- Update Flag (Apparent Wind) ---
    if (flagRef.current && apparentWind.lengthSq() > 0.1) {
      const localAirflow = scratch.flagApparentWindLocal
        .copy(apparentWind)
        .applyQuaternion(
          scratch.inverseBoatQuaternion.copy(boat.quaternion).invert(),
        );
      localAirflow.y = 0;
      if (localAirflow.lengthSq() > 1e-8) {
        // The flag mesh extends along local +Z and trails with the airflow.
        flagRef.current.rotation.y = Math.atan2(
          localAirflow.x,
          localAirflow.z,
        );
      }
    }
    
    // --- Update Visual Rudders/Engines ---
    if (trawlerEngineRef.current) trawlerEngineRef.current.rotation.y = rudderAngle.current;
    if (speedboatEngineLRef.current) speedboatEngineLRef.current.rotation.y = rudderAngle.current;
    if (speedboatEngineRRef.current) speedboatEngineRRef.current.rotation.y = rudderAngle.current;

    // Damage visuals are cached and updated at a controlled rate.
    updateVisualDamage(
      conditionRuntime.current.hullHealth,
      conditionRuntime.current.engineHealth,
      renderDelta,
    );

    // Wake Particle system has been removed in favor of the shader-based Analytical Kelvin Wake
    
    if (!calibration && simulationRunning) {
      audio.updateFrame(
        pos,
        forwardDir,
        state.camera.position,
        state.camera.quaternion,
        propulsionSystem.current.result.engineRpm,
        isSpeedboat,
        speed2D,
        submergedRatio,
      );
    }
  });

  return (
    <>
    <group ref={boatRef} position={[0, 0, 0]}>
      {/* V-Hull Group to lift the boat correctly relative to the water line */}
      <group position={[0, 0.2, 0]}>

        {/* --- TRAWLER MESH --- */}
        {activeBoat === 'trawler' && (
        <group>
          {/* Main Hull Body */}
          <group>
            {/* Deep V-Hull base */}
            <mesh position={[0, -0.4, 0.8]} castShadow receiveShadow>
              <boxGeometry args={[2.4, 1.0, 4.4]} />
              <MeshDistortMaterial name="trawlerHullLowerMat" color="#0f766e" roughness={0.8} distort={0} speed={0} />
            </mesh>
            <mesh position={[0, -0.4, -1.9]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.7, 1.0, 1.7]} />
              <MeshDistortMaterial name="trawlerHullLowerMat" color="#0f766e" roughness={0.8} distort={0} speed={0} />
            </mesh>
            {/* Upper Hull */}
            <mesh position={[0, 0.3, 0.8]} castShadow receiveShadow>
              <boxGeometry args={[2.6, 0.4, 4.4]} />
              <MeshDistortMaterial name="trawlerHullUpperMat" color="#0b5c56" roughness={0.7} distort={0} speed={0} />
            </mesh>
            <mesh position={[0, 0.3, -1.9]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.84, 0.4, 1.84]} />
              <MeshDistortMaterial name="trawlerHullUpperMat" color="#0b5c56" roughness={0.7} distort={0} speed={0} />
            </mesh>
          </group>

          {/* Wooden Trim (Gunwale) */}
          <mesh position={[0, 0.55, 0.8]} castShadow receiveShadow>
            <boxGeometry args={[2.8, 0.15, 4.6]} />
            <meshStandardMaterial color="#8B4513" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.55, -2.0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.98, 0.15, 1.98]} />
            <meshStandardMaterial color="#8B4513" roughness={0.9} />
          </mesh>

          {/* Forward Deck Fences/Railings */}
          <group position={[0, 0.8, -2.2]}>
            {[-0.8, 0, 0.8].map((x, i) => (
              <mesh key={`rail-p-${i}`} position={[x, 0, 0.4 - Math.abs(x)*0.8]} castShadow>
                <cylinderGeometry args={[0.03, 0.03, 0.5]} />
                <meshStandardMaterial color="#d1d5db" metalness={0.6} roughness={0.4} />
              </mesh>
            ))}
            {/* Top rail loop approximation */}
            <mesh position={[0, 0.25, 0]} rotation={[Math.PI/2, 0, 0]} castShadow>
               <torusGeometry args={[0.9, 0.03, 8, 12, Math.PI]} />
               <meshStandardMaterial color="#d1d5db" metalness={0.6} roughness={0.4} />
            </mesh>
          </group>

          {/* Internal Deck Floor (Teak Wood Planks) */}
          <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.4, 0.1, 5.0]} />
            <meshStandardMaterial color="#d97706" roughness={0.8} />
          </mesh>

          {/* --- WHEELHOUSE (CABIN) --- */}
          <group position={[0, 1.5, 1.6]}>
            {/* Exterior Walls */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[2.0, 1.6, 2.2]} />
              <meshStandardMaterial color="#f1f5f9" roughness={0.4} />
            </mesh>
            
            {/* Extended Roof (Sunshade) */}
            <mesh position={[0, 0.85, -0.4]} rotation={[0.05, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[2.6, 0.15, 3.4]} />
              <meshStandardMaterial color="#b91c1c" roughness={0.6} /> 
            </mesh>

            {/* Aft Deck Cover Support Poles */}
            <mesh position={[-1.2, -0.3, 1.1]} castShadow>
               <cylinderGeometry args={[0.04, 0.04, 2.2]} />
               <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <mesh position={[1.2, -0.3, 1.1]} castShadow>
               <cylinderGeometry args={[0.04, 0.04, 2.2]} />
               <meshStandardMaterial color="#94a3b8" />
            </mesh>

            {/* Front Windshield Frame and Glass */}
            <group position={[0, 0.2, -1.1]}>
               <mesh castShadow>
                 <boxGeometry args={[1.8, 0.9, 0.1]} />
                 <meshStandardMaterial color="#1e293b" />
               </mesh>
               <mesh position={[0, 0, -0.05]} castShadow>
                 <planeGeometry args={[1.7, 0.8]} />
                 <meshStandardMaterial color="#0ea5e9" roughness={0.1} metalness={0.9} transparent opacity={0.6} />
               </mesh>
            </group>

            {/* Side Windows with frames */}
            {[-1.05, 1.05].map((x, i) => (
              <group key={`win-${i}`} position={[x, 0.2, 0]} rotation={[0, x > 0 ? Math.PI/2 : -Math.PI/2, 0]}>
                 <mesh castShadow>
                   <boxGeometry args={[1.2, 0.8, 0.1]} />
                   <meshStandardMaterial color="#1e293b" />
                 </mesh>
                 <mesh position={[0, 0, -0.05]} castShadow>
                   <planeGeometry args={[1.1, 0.7]} />
                   <meshStandardMaterial color="#0ea5e9" roughness={0.1} metalness={0.9} transparent opacity={0.6} />
                 </mesh>
              </group>
            ))}

            {/* Interior Steering Wheel & Dashboard */}
            <group position={[0, -0.2, -0.8]}>
              <mesh position={[0, -0.2, 0]} rotation={[-Math.PI/4, 0, 0]} castShadow>
                <boxGeometry args={[1.6, 0.4, 0.4]} />
                <meshStandardMaterial color="#334155" />
              </mesh>
              <mesh position={[-0.4, 0.2, 0.1]} rotation={[-Math.PI/4, 0, 0]} castShadow>
                <torusGeometry args={[0.2, 0.04, 8, 16]} />
                <meshStandardMaterial color="#9ca3af" metalness={0.8} />
              </mesh>
            </group>
          </group>

          {/* --- RADAR AND MAST --- */}
          <group position={[0, 2.5, 1.6]}>
            {/* Spinning Radar */}
            <mesh position={[0, 0.2, -0.4]} castShadow>
               <boxGeometry args={[0.8, 0.1, 0.1]} />
               <meshStandardMaterial color="#f8fafc" />
            </mesh>
            <mesh position={[0, 0.1, -0.4]} castShadow>
               <cylinderGeometry args={[0.05, 0.05, 0.2]} />
               <meshStandardMaterial color="#9ca3af" />
            </mesh>

            {/* Tall Comm Mast */}
            <mesh position={[0.6, 0.8, 0.8]} castShadow>
              <cylinderGeometry args={[0.02, 0.04, 1.8]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.8} />
            </mesh>
            {/* Secondary Antenna */}
            <mesh position={[-0.4, 0.6, 0.6]} castShadow>
              <cylinderGeometry args={[0.01, 0.02, 1.2]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.8} />
            </mesh>
            
            {/* Apparent Wind Flag on short mast */}
            <group ref={flagRef} position={[0, 0.6, 0.2]}>
              <mesh position={[0, -0.2, 0]} castShadow>
                <cylinderGeometry args={[0.02, 0.02, 0.6]} />
                <meshStandardMaterial color="#64748b" />
              </mesh>
              <mesh position={[0, 0.1, 0.25]} castShadow>
                <planeGeometry args={[0.4, 0.2]} />
                <meshStandardMaterial color="#fcd34d" side={2} />
              </mesh>
            </group>
          </group>

          {/* --- EXHAUST & DETAILS --- */}
          {/* Vertical Exhaust Pipe */}
          <mesh position={[-0.8, 1.5, 3.0]} castShadow>
             <cylinderGeometry args={[0.1, 0.1, 2.5]} />
             <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.5} />
          </mesh>

          {/* Cargo Box */}
          <mesh position={[0, 0.7, 3.2]} castShadow receiveShadow>
             <boxGeometry args={[1.5, 0.5, 1.2]} />
             <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
          </mesh>

          {/* Life Rings (Port & Starboard) */}
          <mesh position={[-1.05, 1.2, 1.0]} rotation={[0, -Math.PI/2, 0]} castShadow>
             <torusGeometry args={[0.25, 0.08, 12, 24]} />
             <meshStandardMaterial color="#ea580c" roughness={0.5} />
          </mesh>
          <mesh position={[1.05, 1.2, 1.0]} rotation={[0, Math.PI/2, 0]} castShadow>
             <torusGeometry args={[0.25, 0.08, 12, 24]} />
             <meshStandardMaterial color="#ea580c" roughness={0.5} />
          </mesh>

          {/* Front Cargo Barrels */}
          <mesh position={[-0.5, 0.9, -0.8]} castShadow receiveShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.8, 16]} />
            <meshStandardMaterial color="#2563eb" roughness={0.6} metalness={0.2} />
          </mesh>
          <mesh position={[0.4, 0.9, -0.6]} castShadow receiveShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.8, 16]} />
            <meshStandardMaterial color="#2563eb" roughness={0.6} metalness={0.2} />
          </mesh>

          {/* Outboard Motor / Stern Drive */}
          <group position={[0, -0.2, 3.2]} ref={trawlerEngineRef}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.6, 1.6, 0.8]} />
              <meshStandardMaterial color="#1f2937" roughness={0.8} />
            </mesh>
            {/* Propeller Hub */}
            <mesh position={[0, -0.8, 0.1]} rotation={[Math.PI/2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.8]} />
              <meshStandardMaterial color="#475569" />
            </mesh>
            {/* Misfire Smoke (controlled via useFrame) */}
            <mesh name="engineSmoke" position={[0, 1.0, 0]} scale={0.001}>
              <sphereGeometry args={[0.5, 8, 8]} />
              <meshBasicMaterial name="engineSmokeMat" color="#333333" transparent opacity={0.4} />
            </mesh>
          </group>
        </group>
        )}

        {/* --- SPEEDBOAT MESH --- */}
        {activeBoat === 'speedboat' && (
        <group>
          {/* Main Sleek Hull */}
          <group>
            {/* Deep V-Hull base */}
            <mesh position={[0, -0.4, 0.4]} castShadow receiveShadow>
              <boxGeometry args={[1.4, 0.8, 3.2]} />
              <MeshDistortMaterial name="speedboatHullLowerMat" color="#881337" roughness={0.3} metalness={0.2} distort={0} speed={0} />
            </mesh>
            <mesh position={[0, -0.4, -1.45]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
               <boxGeometry args={[0.99, 0.8, 0.99]} />
               <MeshDistortMaterial name="speedboatHullLowerMat" color="#881337" roughness={0.3} metalness={0.2} distort={0} speed={0} />
            </mesh>
            
            {/* Upper Hull Body (Sleek Red) */}
            <mesh position={[0, 0.1, 0.5]} castShadow receiveShadow>
              <boxGeometry args={[1.5, 0.4, 3.4]} />
              <MeshDistortMaterial name="speedboatHullUpperMatBody" color="#e11d48" roughness={0.2} metalness={0.1} distort={0} speed={0} />
            </mesh>
            {/* Pointy Bow */}
            <mesh position={[0, 0.1, -1.5]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.06, 0.4, 1.06]} />
              <MeshDistortMaterial name="speedboatHullUpperMatBow" color="#be123c" roughness={0.2} metalness={0.1} distort={0} speed={0} />
            </mesh>
          </group>

          {/* White Deck Trim (Crisp boundary) */}
          <mesh position={[0, 0.35, 0.5]} castShadow receiveShadow>
            <boxGeometry args={[1.55, 0.1, 3.45]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.1} />
          </mesh>
          <mesh position={[0, 0.35, -1.53]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.09, 0.1, 1.09]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.1} />
          </mesh>

          {/* Open Cockpit Area (Sunken Deck) */}
          <mesh position={[0, 0.25, 1.0]} castShadow receiveShadow>
            <boxGeometry args={[1.3, 0.1, 2.2]} />
            <meshStandardMaterial color="#d4d4d8" roughness={0.8} />
          </mesh>
          {/* Teak Wood Floor Inlay */}
          <mesh position={[0, 0.31, 1.0]} castShadow receiveShadow>
            <boxGeometry args={[1.1, 0.05, 2.0]} />
            <meshStandardMaterial color="#b45309" roughness={0.9} />
          </mesh>

          {/* Windshield (Swept Back and Curved illusion) */}
          <group position={[0, 0.6, -0.2]} rotation={[-0.4, 0, 0]}>
            <mesh castShadow>
               <boxGeometry args={[1.4, 0.6, 0.05]} />
               <meshStandardMaterial color="#0284c7" roughness={0.0} metalness={1.0} transparent opacity={0.6} />
            </mesh>
            <mesh castShadow>
               <boxGeometry args={[1.45, 0.65, 0.02]} />
               <meshStandardMaterial color="#0f172a" roughness={0.2} />
            </mesh>
          </group>

          {/* --- LUXURY INTERIOR --- */}
          {/* Dashboard Console */}
          <mesh position={[0, 0.55, -0.05]} rotation={[-Math.PI/6, 0, 0]} castShadow receiveShadow>
             <boxGeometry args={[1.2, 0.4, 0.3]} />
             <meshStandardMaterial color="#1f2937" roughness={0.4} />
          </mesh>
          {/* Glowing Digital Dash Screen */}
          <mesh position={[0.2, 0.6, 0.05]} rotation={[-Math.PI/6, 0, 0]} castShadow>
             <planeGeometry args={[0.6, 0.2]} />
             <meshBasicMaterial color="#38bdf8" />
          </mesh>
          {/* Steering Wheel */}
          <mesh position={[-0.3, 0.65, 0.05]} rotation={[-Math.PI/4, 0, 0]} castShadow>
             <torusGeometry args={[0.12, 0.03, 8, 16]} />
             <meshStandardMaterial color="#cbd5e1" metalness={0.9} />
          </mesh>

          {/* Front Pilot Seats (Leather) */}
          <group position={[-0.3, 0.6, 0.4]}>
            <mesh castShadow>
              <boxGeometry args={[0.4, 0.1, 0.4]} />
              <meshStandardMaterial color="#fef08a" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.25, 0.15]} castShadow>
              <boxGeometry args={[0.4, 0.6, 0.1]} />
              <meshStandardMaterial color="#fef08a" roughness={0.6} />
            </mesh>
          </group>
          <group position={[0.3, 0.6, 0.4]}>
            <mesh castShadow>
              <boxGeometry args={[0.4, 0.1, 0.4]} />
              <meshStandardMaterial color="#fef08a" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.25, 0.15]} castShadow>
              <boxGeometry args={[0.4, 0.6, 0.1]} />
              <meshStandardMaterial color="#fef08a" roughness={0.6} />
            </mesh>
          </group>

          {/* Rear Bench Seat Line */}
          <group position={[0, 0.55, 1.7]}>
             <mesh castShadow>
                <boxGeometry args={[1.2, 0.15, 0.5]} />
                <meshStandardMaterial color="#fef08a" roughness={0.6} />
             </mesh>
             <mesh position={[0, 0.3, 0.2]} castShadow>
                <boxGeometry args={[1.2, 0.5, 0.1]} />
                <meshStandardMaterial color="#fef08a" roughness={0.6} />
             </mesh>
          </group>

          {/* Rollbar / Spoiler (Sporty Arch over rear seats) */}
          <group position={[0, 0.8, 1.7]} rotation={[-0.2, 0, 0]}>
             <mesh position={[-0.65, 0.4, 0]} castShadow>
               <boxGeometry args={[0.1, 0.8, 0.2]} />
               <meshStandardMaterial color="#f8fafc" />
             </mesh>
             <mesh position={[0.65, 0.4, 0]} castShadow>
               <boxGeometry args={[0.1, 0.8, 0.2]} />
               <meshStandardMaterial color="#f8fafc" />
             </mesh>
             <mesh position={[0, 0.8, 0]} castShadow>
               <boxGeometry args={[1.4, 0.1, 0.25]} />
               <meshStandardMaterial color="#f8fafc" />
             </mesh>
          </group>
          
          {/* --- ENGINES --- */}
          {/* Twin V8 Outboard Motors (Detailed) */}
          {[-0.35, 0.35].map((x, i) => (
            <group key={`engine-${i}`} position={[x, 0.1, 2.3]} ref={i === 0 ? speedboatEngineLRef : speedboatEngineRRef}>
              {/* Engine Cowling */}
              <mesh castShadow receiveShadow>
                <boxGeometry args={[0.35, 0.9, 0.5]} />
                <meshStandardMaterial color="#020617" roughness={0.2} metalness={0.9} />
              </mesh>
              {/* Red Accent Stripe */}
              <mesh position={[0, 0.2, 0.26]} castShadow>
                <planeGeometry args={[0.36, 0.1]} />
                <meshStandardMaterial color="#e11d48" />
              </mesh>
              {/* Lower Unit (Drive shaft housing) */}
              <mesh position={[0, -0.6, 0]} castShadow receiveShadow>
                 <boxGeometry args={[0.15, 0.8, 0.3]} />
                 <meshStandardMaterial color="#1e293b" />
              </mesh>
              {/* Propeller Hub */}
              <mesh position={[0, -0.9, 0.1]} rotation={[Math.PI/2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.12, 0.12, 0.4]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.8} />
              </mesh>
              {/* Misfire Smoke */}
              <mesh name="engineSmoke" position={[0, 0.8, 0]} scale={0.001}>
                <sphereGeometry args={[0.5, 8, 8]} />
                <meshBasicMaterial name="engineSmokeMat" color="#333333" transparent opacity={0.5} />
              </mesh>
            </group>
          ))}

          {/* Chrome Railings */}
          <group position={[0, 0.45, -1.0]}>
             <mesh position={[-0.6, 0, 0]} rotation={[0, 0, Math.PI/2]} castShadow>
                <cylinderGeometry args={[0.02, 0.02, 1.2]} />
                <meshStandardMaterial color="#f1f5f9" metalness={1.0} roughness={0.1} />
             </mesh>
             <mesh position={[0.6, 0, 0]} rotation={[0, 0, Math.PI/2]} castShadow>
                <cylinderGeometry args={[0.02, 0.02, 1.2]} />
                <meshStandardMaterial color="#f1f5f9" metalness={1.0} roughness={0.1} />
             </mesh>
          </group>

        </group>
        )}

      </group>
    </group>
    </>
  );
}
