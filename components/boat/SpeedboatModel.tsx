'use client';

import type { RefObject } from 'react';
import type { Group } from 'three';
import SpeedboatEngines from './SpeedboatEngines';
import SpeedboatHull from './SpeedboatHull';
import SpeedboatInterior from './SpeedboatInterior';

interface SpeedboatModelProps {
  speedboatEngineLeftRef: RefObject<Group | null>;
  speedboatEngineRightRef: RefObject<Group | null>;
}

export default function SpeedboatModel({
  speedboatEngineLeftRef,
  speedboatEngineRightRef,
}: SpeedboatModelProps) {
  return (
    <group>
      <SpeedboatHull />
      <SpeedboatInterior />
      <SpeedboatEngines
        speedboatEngineLeftRef={speedboatEngineLeftRef}
        speedboatEngineRightRef={speedboatEngineRightRef}
      />
    </group>
  );
}
