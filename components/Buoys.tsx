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
import { getTerrainHeight } from '@/lib/terrain';
import { getWaveHeight } from './Ocean';
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

interface BuoyProps {
  x: number;
  z: number;
  id: number;
}

function Buoy({ x, z, id }: BuoyProps) {
  const meshRef = useRef<Mesh>(null);
  const beaconMaterialRef = useRef<MeshStandardMaterial>(null);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const showTelemetryRef = useRef(false);
  const frameCounter = useRef(id % 10);
  const lastSurfaceHeight = useRef(0);

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
    }),
    [],
  );

  useEffect(() => {
    const obstacleOffset = id * 4;
    sharedPhysics.obstacles[obstacleOffset] = x;
    sharedPhysics.obstacles[obstacleOffset + 1] = 0;
    sharedPhysics.obstacles[obstacleOffset + 2] = z;
    sharedPhysics.obstacles[obstacleOffset + 3] = 1;

    return () => {
      sharedPhysics.obstacles.fill(0, obstacleOffset, obstacleOffset + 4);
    };
  }, [id, x, z]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const elapsed = state.clock.elapsedTime;
    const deltaX = sharedPhysics.boatPos.x - x;
    const deltaZ = sharedPhysics.boatPos.z - z;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    const isInteractive = distanceSquared < 100;

    if (isInteractive !== showTelemetryRef.current) {
      showTelemetryRef.current = isInteractive;
      setShowTelemetry(isInteractive);
    }

    // Distant buoys do not need full wave sampling every rendered frame.
    const updateEvery =
      distanceSquared < 40_000 ? 1 : distanceSquared < 360_000 ? 3 : 10;
    frameCounter.current = (frameCounter.current + 1) % updateEvery;

    if (frameCounter.current === 0) {
      const wave = getWaveHeight(x, z, elapsed);
      lastSurfaceHeight.current = wave.y;
      mesh.position.y = wave.y;

      if (distanceSquared < 360_000) {
        const sampleDistance = 0.75;
        const waveX = getWaveHeight(x + sampleDistance, z, elapsed);
        const waveZ = getWaveHeight(x, z + sampleDistance, elapsed);
        temporary.normal
          .set(
            (wave.y - waveX.y) / sampleDistance,
            1,
            (wave.y - waveZ.y) / sampleDistance,
          )
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

      sharedPhysics.obstacles[id * 4 + 1] = wave.y;
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
          <Html position={[0, 2.5, 0]} center distanceFactor={15}>
            <div className="whitespace-nowrap rounded-lg border border-white/20 bg-black/80 p-2 font-mono text-[10px] text-white backdrop-blur-md">
              <div className="mb-1 border-b border-white/10 font-bold text-cyan-400">
                BUOY #{id.toString().padStart(3, '0')}
              </div>
              <div>SURFACE: {lastSurfaceHeight.current.toFixed(2)}m</div>
              <div>
                WIND: {useSimStore.getState().windSpeed.toFixed(1)} m/s
              </div>
              <div className="text-yellow-400">STATUS: ACTIVE</div>
            </div>
          </Html>
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

      if (getTerrainHeight(x, z) < -5) {
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
