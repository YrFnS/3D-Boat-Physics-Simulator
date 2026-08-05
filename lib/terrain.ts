import { createNoise2D } from 'simplex-noise';
import { MathUtils } from 'three';
import {
  distanceToWhirlpoolBasinCenterM,
  WHIRLPOOL_TERRAIN_CLEARANCE_RADIUS_M,
} from '@/sim/world/WorldEnvironment';

// Create a deterministic pseudo-random number generator
function seededRandom(seed = 1337) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

// Create a deterministic noise instance
const seedNoise = createNoise2D(seededRandom(12345));

export function getTerrainHeight(x: number, z: number): number {
  // Multi-octave noise for varied terrain
  const elevationScale = 500;
  const octave1 = seedNoise(x / elevationScale, z / elevationScale);
  const octave2 =
    seedNoise(x / (elevationScale * 0.5), z / (elevationScale * 0.5)) * 0.5;
  const octave3 =
    seedNoise(x / (elevationScale * 0.25), z / (elevationScale * 0.25)) * 0.25;
  const octave4 =
    seedNoise(x / (elevationScale * 0.1), z / (elevationScale * 0.1)) * 0.1;

  // Combine octaves and lower the overall elevation so water dominates.
  let elevation = octave1 + octave2 + octave3 + octave4 - 0.6;

  // Terrain, shoreline dampening, and Rapier cache this function at different
  // times. The cleared seabed basin must therefore depend only on immutable
  // world coordinates, never on the moving visual/force whirlpool position.
  const vortexDistanceM = distanceToWhirlpoolBasinCenterM(x, z);
  if (vortexDistanceM < WHIRLPOOL_TERRAIN_CLEARANCE_RADIUS_M) {
    const dropFactor =
      1 -
      MathUtils.smoothstep(
        vortexDistanceM,
        0,
        WHIRLPOOL_TERRAIN_CLEARANCE_RADIUS_M,
      );
    elevation -= dropFactor * 2.5;
  }

  // Flatten out the ocean floor and steepen the islands.
  if (elevation < 0) {
    // A single continuous curve transitions beaches into deep water.
    const depth = Math.abs(elevation);
    elevation = -(depth * depth * 100 + depth * 10);
  } else {
    elevation = Math.pow(Math.abs(elevation), 1.5) * 60;
  }

  return Number.isFinite(elevation) ? elevation : -100;
}
