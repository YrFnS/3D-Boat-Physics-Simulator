'use client';

import { OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { Vector3 } from 'three';
import {
  sharedPhysics,
  type CameraMode,
  useSimStore,
} from '@/store/useSimStore';

interface CameraDriverProps {
  mode: Exclude<CameraMode, 'orbit'>;
}

function CameraDriver({ mode }: CameraDriverProps) {
  const activeBoat = useSimStore((state) => state.activeBoat);
  const scratch = useMemo(
    () => ({
      forward: new Vector3(),
      up: new Vector3(),
      desiredPosition: new Vector3(),
      desiredLookAt: new Vector3(),
      smoothedLookAt: new Vector3(),
      localPosition: new Vector3(),
      localLookAt: new Vector3(),
      worldUp: new Vector3(0, 1, 0),
    }),
    [],
  );

  useFrame((state, delta) => {
    const camera = state.camera;
    const boatPosition = sharedPhysics.boatPos;
    const boatQuaternion = sharedPhysics.boatQuaternion;
    const response = 1 - Math.exp(-Math.min(delta, 0.1) * 6.5);

    const forward = scratch.forward
      .set(0, 0, -1)
      .applyQuaternion(boatQuaternion);

    if (mode !== 'helm') {
      forward.y = 0;
      if (forward.lengthSq() > 1e-8) forward.normalize();
      else forward.set(0, 0, -1);
    }

    if (mode === 'chase') {
      const followDistance = activeBoat === 'speedboat' ? 12 : 15;
      const followHeight = activeBoat === 'speedboat' ? 5.2 : 7.4;

      scratch.desiredPosition
        .copy(boatPosition)
        .addScaledVector(forward, -followDistance);
      scratch.desiredPosition.y += followHeight;
      scratch.desiredLookAt
        .copy(boatPosition)
        .addScaledVector(forward, activeBoat === 'speedboat' ? 4 : 3);
      scratch.desiredLookAt.y += activeBoat === 'speedboat' ? 1.1 : 1.7;
      camera.up.lerp(scratch.worldUp, response).normalize();
    } else if (mode === 'helm') {
      const helmPosition =
        activeBoat === 'speedboat'
          ? scratch.localPosition.set(0, 1.28, -0.45)
          : scratch.localPosition.set(0, 2.35, 0.25);
      const helmLookAt =
        activeBoat === 'speedboat'
          ? scratch.localLookAt.set(0, 1.05, -24)
          : scratch.localLookAt.set(0, 2.05, -30);

      scratch.desiredPosition
        .copy(helmPosition)
        .applyQuaternion(boatQuaternion)
        .add(boatPosition);
      scratch.desiredLookAt
        .copy(helmLookAt)
        .applyQuaternion(boatQuaternion)
        .add(boatPosition);
      scratch.up.set(0, 1, 0).applyQuaternion(boatQuaternion).normalize();
      camera.up.lerp(scratch.up, response).normalize();
    } else {
      const orbitTime = sharedPhysics.renderTime * 0.13 + 0.65;
      const radius = activeBoat === 'speedboat' ? 17 : 21;
      scratch.desiredPosition.set(
        boatPosition.x + Math.cos(orbitTime) * radius,
        boatPosition.y + 7.5 + Math.sin(orbitTime * 0.7) * 1.8,
        boatPosition.z + Math.sin(orbitTime) * radius,
      );
      scratch.desiredLookAt.copy(boatPosition);
      scratch.desiredLookAt.y += activeBoat === 'speedboat' ? 1 : 1.6;
      camera.up.lerp(scratch.worldUp, response).normalize();
    }

    if (scratch.smoothedLookAt.lengthSq() < 1e-8) {
      scratch.smoothedLookAt.copy(scratch.desiredLookAt);
    }

    camera.position.lerp(scratch.desiredPosition, response);
    scratch.smoothedLookAt.lerp(scratch.desiredLookAt, response);
    camera.lookAt(scratch.smoothedLookAt);
  });

  return null;
}

export default function CameraRig() {
  const cameraMode = useSimStore((state) => state.cameraMode);
  const sessionPhase = useSimStore((state) => state.sessionPhase);
  const effectiveMode: CameraMode =
    sessionPhase === 'menu' ? 'cinematic' : cameraMode;

  return (
    <>
      <OrbitControls
        makeDefault
        enabled={effectiveMode === 'orbit'}
        enablePan={false}
        enableDamping={effectiveMode === 'orbit'}
        dampingFactor={0.08}
        rotateSpeed={0.65}
        zoomSpeed={0.8}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minDistance={4}
        maxDistance={150}
      />
      {effectiveMode !== 'orbit' && <CameraDriver mode={effectiveMode} />}
    </>
  );
}
