'use client';

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Color,
  Euler,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { sampleTerrainHeightfield } from '@/sim/terrain/TerrainHeightfield';
import { sampleOceanSurface } from './Ocean';
import { createWaterSurfaceSample } from '@/sim/water/WaterSurface';
import {
  type RenderQuality,
  sharedPhysics,
  useSimStore,
} from '@/store/useSimStore';

const MAX_BUOYS = 36;
const UP = new Vector3(0, 1, 0);

const BUOY_COUNT_BY_QUALITY: Record<RenderQuality, number> = {
  low: 14,
  medium: 22,
  high: 30,
  ultra: MAX_BUOYS,
};

function seededRandom(seed = 91_273) {
  let currentSeed = seed;
  return () => {
    currentSeed = (currentSeed * 16_807) % 2_147_483_647;
    return (currentSeed - 1) / 2_147_483_646;
  };
}

interface BuoyTelemetryProps {
  id: number;
  surfaceHeight: number;
}

function BuoyTelemetry({ id, surfaceHeight }: BuoyTelemetryProps) {
  const windSpeed = useSimStore((state) => state.windSpeed);

  return (
    <Html position={[0, 2.5, 0]} center distanceFactor={15}>
      <div className="whitespace-nowrap rounded-lg border border-white/20 bg-black/80 p-2 font-mono text-[10px] text-white backdrop-blur-md">
        <div className="mb-1 border-b border-white/10 font-bold text-cyan-400">
          BUOY #{id.toString().padStart(3, '0')}
        </div>
        <div>SURFACE: {surfaceHeight.toFixed(2)}m</div>
        <div>WIND: {windSpeed.toFixed(1)} m/s</div>
        <div className="text-yellow-400">STATUS: ACTIVE</div>
      </div>
    </Html>
  );
}

interface BuoyProps {
  x: number;
  z: number;
  id: number;
}

function Buoy({ x, z, id }: BuoyProps) {
  const meshRef = useRef<Mesh>(null);
  const beaconMaterialRef = useRef<MeshStandardMaterial>(null);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [surfaceHeight, setSurfaceHeight] = useState(0);
  const showTelemetryRef = useRef(false);
  const frameCounter = useRef(id % 10);
  const lastSurfaceHeight = useRef(0);
  const telemetryAccumulator = useRef(0);

  const phase = useMemo(() => id * 1.61803398875, [id]);
  const color = useMemo(
    () => new Color(id % 2 === 0 ? '#e11d48' : '#10b981'),
    [id],
  );
  const temporary = useMemo(
    () => ({
      normal: new Vector3(0, 1, 0),
      targetQuaternion: new Quaternion(),
      rockQuaternion: new Quaternion(),
      euler: new Euler(),
      waterSample: createWaterSurfaceSample(),
    }),
    [],
  );

  useEffect(() => {
    sharedPhysics.obstacleField.set(id, x, 0, z, 1);

    return () => {
      sharedPhysics.obstacleField.clear(id);
    };
  }, [id, x, z]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const elapsed = sharedPhysics.renderTime || state.clock.elapsedTime;
    const deltaX = sharedPhysics.boatPos.x - x;
    const deltaZ = sharedPhysics.boatPos.z - z;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    const isInteractive = distanceSquared < 100;

    if (isInteractive !== showTelemetryRef.current) {
      showTelemetryRef.current = isInteractive;
      setShowTelemetry(isInteractive);
      telemetryAccumulator.current = 0;
    }

    // Distant buoys do not need full wave sampling every rendered frame.
    const updateEvery =
      distanceSquared < 40_000 ? 1 : distanceSquared < 360_000 ? 3 : 10;
    frameCounter.current = (frameCounter.current + 1) % updateEvery;

    if (frameCounter.current === 0) {
      const wave = sampleOceanSurface(
        x,
        z,
        elapsed,
        temporary.waterSample,
      );
      lastSurfaceHeight.current = wave.y;
      mesh.position.y = wave.y;

      if (distanceSquared < 360_000) {
        temporary.normal
          .set(wave.normalX, wave.normalY, wave.normalZ)
          .normalize();
      } else {
        temporary.normal.set(0, 1, 0);
      }

      temporary.targetQuaternion.setFromUnitVectors(UP, temporary.normal);
      temporary.euler.set(
        Math.sin(elapsed * 1.5 + phase) * 0.1,
        0,
        Math.cos(elapsed * 1.8 + phase) * 0.1,
      );
      temporary.rockQuaternion.setFromEuler(temporary.euler);
      temporary.targetQuaternion.multiply(temporary.rockQuaternion);

      mesh.quaternion.slerp(
        temporary.targetQuaternion,
        Math.min(1, 5 * delta * updateEvery),
      );

      sharedPhysics.obstacleField.set(id, x, wave.y, z, 1);
    }

    if (isInteractive) {
      telemetryAccumulator.current += delta;
      if (telemetryAccumulator.current >= 0.2) {
        telemetryAccumulator.current %= 0.2;
        setSurfaceHeight(lastSurfaceHeight.current);
      }
    }

    if (beaconMaterialRef.current) {
      beaconMaterialRef.current.emissiveIntensity =
        Math.sin(elapsed * 4 + phase) > 0.72 ? 3 : 0.15;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh ref={meshRef} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.7, 1.8, 12]} />
        <meshStandardMaterial
          color={color}
          roughness={0.2}
          metalness={0.4}
          emissive={color}
          emissiveIntensity={showTelemetry ? 1.5 : 0.2}
        />

        <mesh position={[0, 1.2, 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial
            ref={beaconMaterialRef}
            color="white"
            emissive="white"
            emissiveIntensity={0.15}
          />
        </mesh>

        {showTelemetry && (
          <BuoyTelemetry id={id} surfaceHeight={surfaceHeight} />
        )}
      </mesh>
    </group>
  );
}

export default function Buoys() {
  const renderQuality = useSimStore((state) => state.renderQuality);
  const buoyCount = BUOY_COUNT_BY_QUALITY[renderQuality];

  const allBuoyPoints = useMemo(() => {
    const random = seededRandom();
    const points: Array<{ x: number; z: number }> = [];
    let attempts = 0;

    while (points.length < MAX_BUOYS && attempts < 8_000) {
      attempts += 1;
      const x = (random() - 0.5) * 1500;
      const z = (random() - 0.5) * 1500;

      if (sampleTerrainHeightfield(x, z) < -5) {
        points.push({ x, z });
      }
    }

    return points;
  }, []);

  return (
    <group>
      {allBuoyPoints.slice(0, buoyCount).map((point, index) => (
        <Buoy key={index} x={point.x} z={point.z} id={index} />
      ))}
    </group>
  );
}
