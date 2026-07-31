'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Material, Mesh, Vector3 } from 'three';
import {
  type RenderQuality,
  sharedPhysics,
  useSimStore,
} from '@/store/useSimStore';

interface ShadowBudgetConfig {
  minimumCasterRadius: number;
  casterDistance: number;
  receiverDistance: number;
  updateInterval: number;
}

const QUALITY_CONFIG: Record<RenderQuality, ShadowBudgetConfig> = {
  low: {
    minimumCasterRadius: Number.POSITIVE_INFINITY,
    casterDistance: 0,
    receiverDistance: 0,
    updateInterval: 1,
  },
  medium: {
    minimumCasterRadius: 0.45,
    casterDistance: 130,
    receiverDistance: 170,
    updateInterval: 0.75,
  },
  high: {
    minimumCasterRadius: 0.12,
    casterDistance: 220,
    receiverDistance: 280,
    updateInterval: 0.6,
  },
  ultra: {
    minimumCasterRadius: 0.03,
    casterDistance: 340,
    receiverDistance: 420,
    updateInterval: 0.5,
  },
};

interface ShadowBudgetUserData {
  baseCastShadow?: boolean;
  baseReceiveShadow?: boolean;
  shadowBudgetMode?: 'terrain' | 'ignore';
}

function getMaterials(mesh: Mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function materialBlocksShadow(material: Material) {
  const candidate = material as Material & {
    opacity?: number;
    transparent?: boolean;
  };
  return Boolean(
    candidate.transparent &&
      typeof candidate.opacity === 'number' &&
      candidate.opacity < 0.98,
  );
}

export default function ShadowBudget() {
  const { scene } = useThree();
  const renderQuality = useSimStore((state) => state.renderQuality);
  const config = QUALITY_CONFIG[renderQuality];
  const accumulatorRef = useRef(1);
  const temporary = useMemo(
    () => ({
      worldPosition: new Vector3(),
      worldScale: new Vector3(),
    }),
    [],
  );

  useEffect(() => {
    accumulatorRef.current = 1;
  }, [renderQuality]);

  useFrame((_, delta) => {
    accumulatorRef.current += Math.min(delta, 0.1);
    if (accumulatorRef.current < config.updateInterval) return;
    accumulatorRef.current %= config.updateInterval;

    scene.updateMatrixWorld();
    const centerX = sharedPhysics.boatPos.x;
    const centerZ = sharedPhysics.boatPos.z;
    const casterDistanceSquared = config.casterDistance ** 2;
    const receiverDistanceSquared = config.receiverDistance ** 2;

    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;

      const userData = mesh.userData as ShadowBudgetUserData;
      if (userData.shadowBudgetMode === 'terrain') return;
      if (userData.shadowBudgetMode === 'ignore') return;

      if (userData.baseCastShadow === undefined) {
        userData.baseCastShadow = mesh.castShadow;
      }
      if (userData.baseReceiveShadow === undefined) {
        userData.baseReceiveShadow = mesh.receiveShadow;
      }

      if (renderQuality === 'low') {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return;
      }

      mesh.getWorldPosition(temporary.worldPosition);
      const deltaX = temporary.worldPosition.x - centerX;
      const deltaZ = temporary.worldPosition.z - centerZ;
      const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;

      if (!mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }
      mesh.getWorldScale(temporary.worldScale);
      const maximumScale = Math.max(
        temporary.worldScale.x,
        temporary.worldScale.y,
        temporary.worldScale.z,
      );
      const radius =
        (mesh.geometry.boundingSphere?.radius ?? 0) * maximumScale;
      const transparent = getMaterials(mesh).some(materialBlocksShadow);

      mesh.castShadow = Boolean(
        userData.baseCastShadow &&
          !transparent &&
          radius >= config.minimumCasterRadius &&
          distanceSquared <= casterDistanceSquared,
      );
      mesh.receiveShadow = Boolean(
        userData.baseReceiveShadow &&
          distanceSquared <= receiverDistanceSquared,
      );
    });
  }, -25);

  return null;
}
