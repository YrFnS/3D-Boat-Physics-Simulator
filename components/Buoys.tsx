import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Color, Euler, Quaternion } from 'three';
import { getTerrainHeight } from '@/lib/terrain';
import { getWaveHeight } from './Ocean';
import { sharedPhysics, useSimStore } from '@/store/useSimStore';
import { Html } from '@react-three/drei';

function Buoy({ x, z, id }: { x: number; z: number; id: number }) {
  const meshRef = useRef<any>(null);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const waveData = useRef({ height: 0, slope: new Vector3(0, 1, 0) });
  
  // Random personality for the buoy
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  const color = useMemo(() => new Color(id % 2 === 0 ? '#E11d48' : '#10b981'), [id]);

  useFrame((state, dt) => {
    if (!meshRef.current) return;
    const time = state.clock.elapsedTime;
    
    // 1. Get Wave Height and normal (approximate normal by sampling nearby)
    const wave = getWaveHeight(x, z, time);
    const waveNextX = getWaveHeight(x + 0.5, z, time);
    const waveNextZ = getWaveHeight(x, z + 0.5, time);
    
    const normal = new Vector3(
        (wave.y - waveNextX.y) / 0.5,
        1.0,
        (wave.y - waveNextZ.y) / 0.5
    ).normalize();
    
    // 2. Interaction check: If boat is close, pulse/glow or show telemetry
    const boatPos = sharedPhysics.boatPos;
    const distSq = (boatPos.x - x)**2 + (boatPos.z - z)**2;
    const isNear = distSq < 100; // 10m range
    
    if (isNear && !showTelemetry) setShowTelemetry(true);
    if (!isNear && showTelemetry) setShowTelemetry(false);

    // 3. Update Position & Orientation (Bobbing + Tilting with waves)
    meshRef.current.position.y = wave.y;
    
    // Target orientation based on wave normal
    const targetQuat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal);
    
    // Add some random "rocking" from wind/current
    const rockX = Math.sin(time * 1.5 + phase) * 0.1;
    const rockZ = Math.cos(time * 1.8 + phase) * 0.1;
    const rockQuat = new Quaternion().setFromEuler(new Euler(rockX, 0, rockZ));
    
    targetQuat.multiply(rockQuat);
    
    // Smoothly interpolate to target (physics lag)
    meshRef.current.quaternion.slerp(targetQuat, 5 * dt);
    
    // Update collision proxy in shared physics
    sharedPhysics.obstacles[id*4 + 0] = x;
    sharedPhysics.obstacles[id*4 + 1] = wave.y;
    sharedPhysics.obstacles[id*4 + 2] = z;
    sharedPhysics.obstacles[id*4 + 3] = 1.0;
  });

  return (
    <group position={[x, 0, z]}>
      <mesh ref={meshRef} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.7, 1.8, 12]} />
        <meshStandardMaterial color={color} roughness={0.2} metalness={0.4} emissive={color} emissiveIntensity={showTelemetry ? 1.5 : 0.2} />
        
        {/* Anthenna / Beacon */}
        <mesh position={[0, 1.2, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={Math.sin(Date.now() * 0.005) > 0 ? 2 : 0} />
        </mesh>

        {showTelemetry && (
          <Html position={[0, 2.5, 0]} center distanceFactor={15}>
            <div className="bg-black/80 backdrop-blur-md text-white p-2 rounded-lg border border-white/20 text-[10px] whitespace-nowrap font-mono">
                <div className="text-cyan-400 font-bold border-b border-white/10 mb-1">BUOY #{id.toString().padStart(3, '0')}</div>
                <div>SURFACE: {meshRef.current.position.y.toFixed(2)}m</div>
                <div>WIND: {useSimStore.getState().windSpeed.toFixed(1)}kts</div>
                <div className="text-yellow-400">STATUS: ACTIVE</div>
            </div>
          </Html>
        )}
      </mesh>
    </group>
  );
}

export default function Buoys() {
  const COUNT = 30; // Reduced count for better per-buoy physics and interactivity
  
  // Store logical positions
  const buoyPoints = useMemo(() => {
     const items = [];
     let added = 0;
     let attempts = 0;
     // Scatter in a 1500x1500 grid
     while(added < COUNT && attempts < 5000) {
         attempts++;
         const x = (Math.random() - 0.5) * 1500;
         const z = (Math.random() - 0.5) * 1500;
         // Only place them in water
         if (getTerrainHeight(x, z) < -5) {
             items.push({ x, z });
             added++;
         }
     }
     return items;
  }, []);

  return (
    <group>
        {buoyPoints.map((p, i) => (
            <Buoy key={i} x={p.x} z={p.z} id={i} />
        ))}
    </group>
  );
}
