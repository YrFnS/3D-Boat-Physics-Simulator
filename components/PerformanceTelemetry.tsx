'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { sharedPhysics, useSimStore } from '@/store/useSimStore';

const SAMPLE_WINDOW_SECONDS = 0.5;
const PHYSICS_DATASET_KEYS = [
  'simReady',
  'simTime',
  'simBoatX',
  'simBoatY',
  'simBoatZ',
  'simLinearSpeed',
  'simAngularSpeed',
  'simQuaternionNorm',
  'simDirectionLength',
  'simSubmergedRatio',
  'simDroppedTime',
  'simCollisionReady',
  'simCollisionSequence',
  'simTerrainCollisionSequence',
  'simObstacleCollisionSequence',
  'simDebugProbeCollisionSequence',
  'simCollisionMaxImpactSpeed',
  'simCollisionMaxImpulse',
  'simCollisionMaxPenetration',
  'simHullHealth',
  'simFps',
  'simFrameTimeMs',
  'simDrawCalls',
  'simTriangles',
  'simRenderQuality',
  'simCalibrationReady',
  'simCalibrationPassed',
  'simCalibrationProgress',
  'simCalibrationScenario',
  'simCalibrationVessel',
  'simCalibrationResult',
] as const;

function publishPhysicsDiagnostics() {
  const root = document.documentElement;
  const quaternion = sharedPhysics.boatQuaternion;
  const simulator = useSimStore.getState();

  root.dataset.simReady = '1';
  root.dataset.simTime = String(sharedPhysics.simulationTime);
  root.dataset.simBoatX = String(sharedPhysics.boatPos.x);
  root.dataset.simBoatY = String(sharedPhysics.boatPos.y);
  root.dataset.simBoatZ = String(sharedPhysics.boatPos.z);
  root.dataset.simLinearSpeed = String(
    sharedPhysics.boatLinearVelocity.length(),
  );
  root.dataset.simAngularSpeed = String(
    sharedPhysics.boatAngularVelocity.length(),
  );
  root.dataset.simQuaternionNorm = String(
    Math.hypot(
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
    ),
  );
  root.dataset.simDirectionLength = String(sharedPhysics.boatDir.length());
  root.dataset.simSubmergedRatio = String(sharedPhysics.submergedRatio);
  root.dataset.simDroppedTime = String(sharedPhysics.droppedSimulationTime);
  root.dataset.simCollisionReady = String(sharedPhysics.collisionReady);
  root.dataset.simCollisionSequence = String(sharedPhysics.collisionSequence);
  root.dataset.simTerrainCollisionSequence = String(
    sharedPhysics.terrainCollisionSequence,
  );
  root.dataset.simObstacleCollisionSequence = String(
    sharedPhysics.obstacleCollisionSequence,
  );
  root.dataset.simDebugProbeCollisionSequence = String(
    sharedPhysics.debugProbeCollisionSequence,
  );
  root.dataset.simCollisionMaxImpactSpeed = String(
    sharedPhysics.collisionMaxImpactSpeed,
  );
  root.dataset.simCollisionMaxImpulse = String(
    sharedPhysics.collisionMaxImpulse,
  );
  root.dataset.simCollisionMaxPenetration = String(
    sharedPhysics.collisionMaxPenetration,
  );
  root.dataset.simHullHealth = String(simulator.hullHealth);
  root.dataset.simFps = String(simulator.fps);
  root.dataset.simFrameTimeMs = String(simulator.frameTimeMs);
  root.dataset.simDrawCalls = String(simulator.drawCalls);
  root.dataset.simTriangles = String(simulator.triangles);
  root.dataset.simRenderQuality = simulator.renderQuality;
  root.dataset.simCalibrationReady = String(sharedPhysics.calibrationReady);
  root.dataset.simCalibrationPassed = String(sharedPhysics.calibrationPassed);
  root.dataset.simCalibrationProgress = String(
    sharedPhysics.calibrationProgress,
  );
  root.dataset.simCalibrationScenario = sharedPhysics.calibrationScenario;
  root.dataset.simCalibrationVessel = sharedPhysics.calibrationVessel;
  root.dataset.simCalibrationResult = sharedPhysics.calibrationResult;
}

export default function PerformanceTelemetry() {
  const { gl } = useThree();
  const sampleTime = useRef(0);
  const frameCount = useRef(0);
  const drawCallTotal = useRef(0);
  const triangleTotal = useRef(0);

  useEffect(() => {
    const previousAutoReset = gl.info.autoReset;
    gl.info.autoReset = false;

    return () => {
      gl.info.autoReset = previousAutoReset;
      for (const key of PHYSICS_DATASET_KEYS) {
        delete document.documentElement.dataset[key];
      }
    };
  }, [gl]);

  // Reset before offscreen work such as the wake texture pass begins.
  useFrame((state) => {
    state.gl.info.reset();
  }, -1000);

  // A positive priority intentionally owns the final scene render. This lets us
  // read complete counters after both offscreen passes and the visible render.
  useFrame((state, delta) => {
    state.gl.render(state.scene, state.camera);

    const safeDelta = Math.min(delta, 0.25);
    sampleTime.current += safeDelta;
    frameCount.current += 1;
    drawCallTotal.current += state.gl.info.render.calls;
    triangleTotal.current += state.gl.info.render.triangles;

    if (sampleTime.current < SAMPLE_WINDOW_SECONDS) return;

    const elapsed = sampleTime.current;
    const frames = Math.max(1, frameCount.current);

    useSimStore.getState().setPerformanceTelemetry({
      fps: frames / elapsed,
      frameTimeMs: (elapsed / frames) * 1000,
      drawCalls: Math.round(drawCallTotal.current / frames),
      triangles: Math.round(triangleTotal.current / frames),
    });
    publishPhysicsDiagnostics();

    sampleTime.current = 0;
    frameCount.current = 0;
    drawCallTotal.current = 0;
    triangleTotal.current = 0;
  }, 1000);

  return null;
}
