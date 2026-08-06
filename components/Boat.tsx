'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils, Quaternion, Vector3 } from 'three';
import { useSimStore, sharedPhysics } from '@/store/useSimStore';
import { sampleOceanSurface } from './Ocean';
import VesselModels from './boat/VesselModels';
import { useBoatAudio } from './boat/useBoatAudio';
import { useBoatVisualDamage } from './boat/useBoatVisualDamage';
import { FixedStepRunner } from '@/sim/core/FixedStepRunner';
import { canAdvanceAuthoritativeSimulation } from '@/sim/core/SimulationRuntimeAuthority';
import { SixDofBody } from '@/sim/core/SixDofBody';
import { SeededRandom } from '@/sim/core/SeededRandom';
import { getVesselConfig } from '@/sim/vessels/VesselConfig';
import { FloodingModel } from '@/sim/vessels/FloodingModel';
import { VesselConditionRuntime } from '@/sim/vessels/VesselConditionRuntime';
import { VesselDynamicsRuntime } from '@/sim/vessels/VesselDynamicsRuntime';
import { VesselTelemetryRuntime } from '@/sim/vessels/VesselTelemetryRuntime';
import { VesselPresentationRuntime } from '@/sim/vessels/VesselPresentationRuntime';
import { isFieldRepairEligible } from '@/sim/vessels/FieldRepairPolicy';
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
  const dynamicsRuntime = useRef(new VesselDynamicsRuntime());
  const telemetryRuntime = useRef(new VesselTelemetryRuntime());
  const presentationRuntime = useRef(new VesselPresentationRuntime());
  const floodingModel = useRef(new FloodingModel());
  const configuredVesselType = useRef<string | null>(null);
  const rapierCollisionWorld = useRef<RapierCollisionWorld | null>(null);
  const collisionRuntime = useRef(new VesselCollisionRuntime());
  const collisionTestEnabled = useRef(false);
  const repairTestEnabled = useRef(false);
  const previousPosition = useRef(new Vector3());
  const currentPosition = useRef(new Vector3());
  const previousQuaternion = useRef(new Quaternion());
  const currentQuaternion = useRef(new Quaternion());
  const flagRef = useRef<Group>(null);
  const trawlerEngineRef = useRef<Group>(null);
  const speedboatEngineLRef = useRef<Group>(null);
  const speedboatEngineRRef = useRef<Group>(null);
  const calibrationRunner =
    useRef<SimulationCalibrationRunner | null>(null);
  const calibrationSimulationTime = useRef(0);
  const motionLimits = useRef({
    maxHorizontalSpeedMps: 80,
    maxVerticalSpeedMps: 40,
    maxAngularSpeedRadPerSecond: 4,
  });

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

  const conditionRuntime = useRef(
    new VesselConditionRuntime(initialCondition),
  );

  const activeBoat = useSimStore((state) => state.activeBoat);
  const instantRepairTrigger = useSimStore(
    (state) => state.instantRepairTrigger,
  );
  const audio = useBoatAudio();
  const updateVisualDamage = useBoatVisualDamage(boatRef, activeBoat);

  useEffect(() => {
    if (instantRepairTrigger <= 0) return;

    const vessel = getVesselConfig(activeBoat);
    conditionRuntime.current.reset();
    floodingModel.current.reset(vessel);
    dynamicsRuntime.current.reset(
      vessel,
      dynamicsRuntime.current.submergedRatio,
    );
    configuredVesselType.current = vessel.type;
    sharedPhysics.maximumSlamSeverity = 0;
    useSimStore.getState().setFloodingTelemetry(0, 0);
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
    dynamicsRuntime.current.reset(vessel);
    telemetryRuntime.current.reset();
    floodingModel.current.reset(vessel);
    configuredVesselType.current = vessel.type;

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
    sharedPhysics.boatDir.set(0, 0, -1);
    sharedPhysics.boatQuaternion.copy(body.quaternion);
    sharedPhysics.boatLinearVelocity.set(0, 0, 0);
    sharedPhysics.boatAngularVelocity.set(0, 0, 0);
    sharedPhysics.boatSpeed = 0;
    sharedPhysics.submergedRatio = 0;
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
      activeBoat: activeVessel,
      sessionPhase,
      scenarioRunStatus,
      scenarioRunId,
      resetVesselTrigger,
      setTelemetry,
      setFloodingTelemetry,
      setFieldRepairTelemetry,
    } = useSimStore.getState();

    const vessel = getVesselConfig(activeVessel);
    if (configuredVesselType.current !== vessel.type) {
      floodingModel.current.reset(vessel);
      dynamicsRuntime.current.reset(vessel);
      telemetryRuntime.current.reset();
      configuredVesselType.current = vessel.type;
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

    const winterFactor = MathUtils.clamp(
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
      hullHealth: calibration
        ? 100
        : conditionRuntime.current.hullHealth,
      engineHealth: conditionRuntime.current.engineHealth,
      compartmentExposure: dynamicsRuntime.current.compartmentExposure,
      activePump: activeFieldRepair,
      winterFactor: calibration ? 0 : winterFactor,
    });

    const dynamicsResult = dynamicsRuntime.current.step({
      body,
      vessel,
      deltaSeconds: dt,
      timeSeconds: time,
      throttle: thrustRaw,
      steering: steerRaw,
      calibration: Boolean(calibration),
      flooding: floodingResult,
      condition: conditionRuntime.current,
      floodingSink: floodingModel.current,
      random: simulationRandom.current,
      sampleWater: calibration
        ? sampleFlatCalibrationWater
        : sampleOceanSurface,
      windSpeedMps: windSpeed,
      windHeadingDegrees: windDir,
      currentSpeedMps: currentSpeed,
      currentHeadingDegrees: currentDir,
      winterFactor,
      tornadoPosition: sharedPhysics.tornadoPos,
      whirlpoolPosition: sharedPhysics.whirlpoolPos,
      audio,
    });

    const {
      massKg: effectiveMassKg,
      hydrostaticResult,
      submergedRatio,
      forwardWaterRelativeSpeedMps,
      displacementBalanceErrorRatio,
      propulsionResult,
    } = dynamicsResult;

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
            sharedPhysics.obstacleField,
            !calibration &&
              collisionTestEnabled.current &&
              thrustRaw > 0.1 &&
              forwardWaterRelativeSpeedMps > 0.35,
            calibration?.collisionFixture ?? null,
            effectiveMassKg,
          )
        : undefined;

    if (!collisionSummary) {
      body.integratePose(dt);
    }
    body.enforceMotionLimits(motionLimits.current);

    if (collisionSummary) {
      collisionRuntime.current.process({
        summary: collisionSummary,
        scenarioRunId,
        vesselGeneration: resetVesselTrigger,
        simulationTimeSeconds: time,
        effectiveMassKg,
        forwardWaterRelativeSpeedMps,
        vessel,
        condition: conditionRuntime.current,
        flooding: floodingModel.current,
        telemetry: sharedPhysics,
        random: simulationRandom.current,
        audio,
      });
    }

    const motionTelemetry = telemetryRuntime.current.sampleMotion({
      body,
      telemetry: sharedPhysics,
    });

    const calibrationResult = calibration?.recordStep(time, {
      body,
      submergedRatio,
      speedMps: motionTelemetry.speedMps,
      forwardSpeedMps: forwardWaterRelativeSpeedMps,
      headingRadians: MathUtils.degToRad(
        motionTelemetry.headingDegrees,
      ),
      hullHealth: conditionRuntime.current.hullHealth,
      engineHealth: conditionRuntime.current.engineHealth,
      rudderHealth: conditionRuntime.current.rudderHealth,
      displacedVolumeM3: hydrostaticResult.displacedVolumeM3,
      physicalMassKg: effectiveMassKg,
      floodingRatio: floodingResult.floodingRatio,
      displacementBalanceErrorRatio,
      collisionSummary,
    });

    telemetryRuntime.current.publishCalibration({
      progress: calibration?.progress ?? 0,
      result: calibrationResult,
      motion: motionTelemetry,
      condition: conditionRuntime.current,
      flooding: floodingResult,
      telemetry: sharedPhysics,
      store: {
        setTelemetry,
        setFloodingTelemetry,
      },
    });

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
          speedKnots: motionTelemetry.speedKnots,
          repairActive: activeFieldRepair,
          engineConditionRestored:
            fieldRepairResult.engineConditionRestored,
          rudderConditionRestored:
            fieldRepairResult.rudderConditionRestored,
        })
      : sharedMissionRuntimeStatistics.snapshot;

    telemetryRuntime.current.publishFixedStep({
      deltaSeconds: dt,
      calibrationActive: Boolean(calibration),
      body,
      motion: motionTelemetry,
      dynamics: dynamicsResult,
      flooding: floodingResult,
      condition: conditionRuntime.current,
      missionStatistics,
      repairActive: activeFieldRepair,
      telemetry: sharedPhysics,
      store: {
        setTelemetry,
        setFloodingTelemetry,
        setFieldRepairTelemetry,
      },
    });

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
        droppedTimeSeconds:
          fixedStepRunner.current.droppedTimeSeconds,
      };
    } else {
      stepResult = fixedStepRunner.current.advance(
        delta,
        (stepSeconds, simulationTimeSeconds) => {
          stepSimulation(stepSeconds, simulationTimeSeconds);
        },
      );
    }

    presentationRuntime.current.updateFrame({
      boat,
      body: physicsBody.current,
      previousPosition: previousPosition.current,
      currentPosition: currentPosition.current,
      previousQuaternion: previousQuaternion.current,
      currentQuaternion: currentQuaternion.current,
      stepResult,
      fixedStepSeconds: fixedStepRunner.current.stepSeconds,
      simulationRunning,
      calibrationActive: Boolean(calibration),
      deltaSeconds: delta,
      windSpeedMps: runtimeState.windSpeed,
      windHeadingDegrees: runtimeState.windDir,
      activeBoat: runtimeState.activeBoat,
      flag: flagRef.current,
      trawlerEngine: trawlerEngineRef.current,
      speedboatEngineLeft: speedboatEngineLRef.current,
      speedboatEngineRight: speedboatEngineRRef.current,
      condition: conditionRuntime.current,
      dynamics: dynamicsRuntime.current,
      cameraPosition: state.camera.position,
      cameraQuaternion: state.camera.quaternion,
      telemetry: sharedPhysics,
      updateVisualDamage,
      audio,
    });
  });

  return (
    <VesselModels
      activeBoat={activeBoat}
      boatRef={boatRef}
      flagRef={flagRef}
      trawlerEngineRef={trawlerEngineRef}
      speedboatEngineLeftRef={speedboatEngineLRef}
      speedboatEngineRightRef={speedboatEngineRRef}
    />
  );
}
