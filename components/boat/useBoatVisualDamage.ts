'use client';

import { type RefObject, useCallback, useEffect, useRef } from 'react';
import type { Group, Material, Mesh } from 'three';

interface DamageMaterial extends Material {
  color?: { set: (value: string) => void };
  distort?: number;
  roughness?: number;
}

interface CachedVisuals {
  smokeMeshes: Mesh[];
  hullMaterials: DamageMaterial[];
}

const EMPTY_VISUALS: CachedVisuals = {
  smokeMeshes: [],
  hullMaterials: [],
};

/**
 * Caches damage-related meshes/materials after a vessel switch.
 *
 * The old implementation traversed the entire boat every rendered frame and
 * checked `child.isMaterial`, even though materials are not scene children.
 */
export function useBoatVisualDamage(
  boatRef: RefObject<Group | null>,
  activeBoat: string,
) {
  const visualsRef = useRef<CachedVisuals>(EMPTY_VISUALS);
  const updateAccumulatorRef = useRef(0);

  useEffect(() => {
    const smokeMeshes: Mesh[] = [];
    const hullMaterials: DamageMaterial[] = [];

    boatRef.current?.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;

      if (mesh.name === 'engineSmoke') smokeMeshes.push(mesh);

      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      for (const material of materials) {
        if (material?.name?.endsWith('Mat')) {
          hullMaterials.push(material as DamageMaterial);
        }
      }
    });

    visualsRef.current = { smokeMeshes, hullMaterials };
    updateAccumulatorRef.current = 1;

    return () => {
      visualsRef.current = EMPTY_VISUALS;
    };
  }, [activeBoat, boatRef]);

  return useCallback(
    (hullHealth: number, engineHealth: number, delta: number) => {
      updateAccumulatorRef.current += delta;
      if (updateAccumulatorRef.current < 0.08) return;
      updateAccumulatorRef.current %= 0.08;

      for (const smokeMesh of visualsRef.current.smokeMeshes) {
        const material = (Array.isArray(smokeMesh.material)
          ? smokeMesh.material[0]
          : smokeMesh.material) as DamageMaterial;

        if (engineHealth <= 0) {
          smokeMesh.scale.setScalar(1.2 + Math.random() * 0.8);
          material.color?.set(Math.random() > 0.8 ? '#9a3412' : '#0f172a');
          if ('opacity' in material) material.opacity = 0.8;
        } else if (engineHealth < 50) {
          smokeMesh.scale.setScalar(0.6 + Math.random() * 0.4);
          material.color?.set('#333333');
          if ('opacity' in material) material.opacity = 0.4;
        } else {
          smokeMesh.scale.setScalar(0.001);
        }
      }

      for (const material of visualsRef.current.hullMaterials) {
        switch (material.name) {
          case 'trawlerHullLowerMat':
            material.color?.set(hullHealth < 40 ? '#064e3b' : '#0f766e');
            material.roughness = 0.8 + (100 - hullHealth) / 200;
            material.distort = hullHealth < 50 ? 0.3 : 0;
            break;
          case 'trawlerHullUpperMat':
            material.color?.set(hullHealth < 40 ? '#0a4a45' : '#0b5c56');
            material.distort = hullHealth < 50 ? 0.2 : 0;
            break;
          case 'speedboatHullLowerMat':
            material.color?.set(hullHealth < 40 ? '#4c0519' : '#881337');
            material.roughness = 0.3 + (100 - hullHealth) / 200;
            material.distort = hullHealth < 50 ? 0.3 : 0;
            break;
          case 'speedboatHullUpperMatBody':
            material.color?.set(hullHealth < 40 ? '#881337' : '#e11d48');
            material.distort = hullHealth < 50 ? 0.2 : 0;
            break;
          case 'speedboatHullUpperMatBow':
            material.color?.set(hullHealth < 40 ? '#881337' : '#be123c');
            material.distort = hullHealth < 50 ? 0.2 : 0;
            break;
          default:
            break;
        }
      }
    },
    [],
  );
}
