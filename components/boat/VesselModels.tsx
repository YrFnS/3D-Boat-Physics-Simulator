'use client';

import type { RefObject } from 'react';
import type { Group } from 'three';
import type { BoatType } from '@/store/useSimStore';
import SpeedboatModel from './SpeedboatModel';
import TrawlerModel from './TrawlerModel';

interface VesselModelsProps {
  activeBoat: BoatType;
  boatRef: RefObject<Group | null>;
  flagRef: RefObject<Group | null>;
  trawlerEngineRef: RefObject<Group | null>;
  speedboatEngineLeftRef: RefObject<Group | null>;
  speedboatEngineRightRef: RefObject<Group | null>;
}

export default function VesselModels({
  activeBoat,
  boatRef,
  flagRef,
  trawlerEngineRef,
  speedboatEngineLeftRef,
  speedboatEngineRightRef,
}: VesselModelsProps) {
  return (
    <group ref={boatRef} position={[0, 0, 0]}>
      <group position={[0, 0.2, 0]}>
        {activeBoat === 'trawler' ? (
          <TrawlerModel
            flagRef={flagRef}
            trawlerEngineRef={trawlerEngineRef}
          />
        ) : (
          <SpeedboatModel
            speedboatEngineLeftRef={speedboatEngineLeftRef}
            speedboatEngineRightRef={speedboatEngineRightRef}
          />
        )}
      </group>
    </group>
  );
}
