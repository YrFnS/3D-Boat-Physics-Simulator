import { createNoise2D } from 'simplex-noise';
import { MathUtils, Vector3 } from 'three';
import { sharedPhysics } from '@/store/useSimStore';

// Create a deterministic pseudo-random number generator
function seededRandom(seed = 1337) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
}

// Create a deterministic noise instance
const seedNoise = createNoise2D(seededRandom(12345));

export function getTerrainHeight(x: number, z: number): number {
  // Multi-octave noise for varied terrain
  const elevationScale = 500;
  const octave1 = seedNoise(x / elevationScale, z / elevationScale);
  const octave2 = seedNoise(x / (elevationScale * 0.5), z / (elevationScale * 0.5)) * 0.5;
  const octave3 = seedNoise(x / (elevationScale * 0.25), z / (elevationScale * 0.25)) * 0.25;
  const octave4 = seedNoise(x / (elevationScale * 0.1), z / (elevationScale * 0.1)) * 0.1;
  
  // Combine octaves
  let elevation = octave1 + octave2 + octave3 + octave4;
  
  // Create defined islands by thresholding
  // Lower the overall elevation so water takes up more space
  elevation -= 0.6;

  // Cut a giant hole in the terrain for the whirlpool so no islands intersect it
  const wx = sharedPhysics.whirlpoolPos.x;
  const wz = sharedPhysics.whirlpoolPos.z;
  const distSq = (x - wx)**2 + (z - wz)**2;
  const vDist = Math.sqrt(distSq);
  
  // Force elevation to completely sink if within 250m of the vortex
  if (vDist < 250.0) {
      const dropFactor = 1.0 - MathUtils.smoothstep(vDist, 0.0, 250.0);
      elevation -= dropFactor * 2.5; // Huge suppression of the terrain noise function
  }
  
  // Flatten out the ocean floor and steepen the islands
  if (elevation < 0) {
    // A single continuous smooth power-curve that transitions from gentle beaches directly into a deep abyss.
    // e = -0.06 yields terrainY = -1.0 (approx the water surface)
    // e = -0.2 yields terrainY = -6.0 
    // e = -1.0 yields terrainY = -110.0
    elevation = -(Math.pow(Math.abs(elevation), 2.0) * 100.0 + Math.abs(elevation) * 10.0);
  } else {
    // Square the elevation above water to make peaks
    elevation = Math.pow(Math.abs(elevation), 1.5) * 60; // Max height around 60m
  }
  
  // Prevent NaN infections by wrapping
  return isNaN(elevation) ? -100 : elevation;
}

