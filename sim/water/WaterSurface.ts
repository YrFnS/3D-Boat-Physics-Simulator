export interface WaterSurfaceSample {
  x: number;
  y: number;
  z: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;
}

export type WaterSurfaceSampler = (
  x: number,
  z: number,
  timeSeconds: number,
  target: WaterSurfaceSample,
) => WaterSurfaceSample;

export function createWaterSurfaceSample(): WaterSurfaceSample {
  return {
    x: 0,
    y: 0,
    z: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    accelerationX: 0,
    accelerationY: 0,
    accelerationZ: 0,
  };
}

export function setFlatWaterSample(
  target: WaterSurfaceSample,
  x: number,
  y: number,
  z: number,
) {
  target.x = x;
  target.y = y;
  target.z = z;
  target.normalX = 0;
  target.normalY = 1;
  target.normalZ = 0;
  target.velocityX = 0;
  target.velocityY = 0;
  target.velocityZ = 0;
  target.accelerationX = 0;
  target.accelerationY = 0;
  target.accelerationZ = 0;
  return target;
}
