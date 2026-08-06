'use client';

import type { RefObject } from 'react';
import type { Group } from 'three';

interface SpeedboatEnginesProps {
  speedboatEngineLeftRef: RefObject<Group | null>;
  speedboatEngineRightRef: RefObject<Group | null>;
}

export default function SpeedboatEngines({
  speedboatEngineLeftRef: speedboatEngineLRef,
  speedboatEngineRightRef: speedboatEngineRRef,
}: SpeedboatEnginesProps) {
  return (
    <>
          {/* --- ENGINES --- */}
          {/* Twin V8 Outboard Motors (Detailed) */}
          {[-0.35, 0.35].map((x, i) => (
            <group key={`engine-${i}`} position={[x, 0.1, 2.3]} ref={i === 0 ? speedboatEngineLRef : speedboatEngineRRef}>
              {/* Engine Cowling */}
              <mesh castShadow receiveShadow>
                <boxGeometry args={[0.35, 0.9, 0.5]} />
                <meshStandardMaterial color="#020617" roughness={0.2} metalness={0.9} />
              </mesh>
              {/* Red Accent Stripe */}
              <mesh position={[0, 0.2, 0.26]} castShadow>
                <planeGeometry args={[0.36, 0.1]} />
                <meshStandardMaterial color="#e11d48" />
              </mesh>
              {/* Lower Unit (Drive shaft housing) */}
              <mesh position={[0, -0.6, 0]} castShadow receiveShadow>
                 <boxGeometry args={[0.15, 0.8, 0.3]} />
                 <meshStandardMaterial color="#1e293b" />
              </mesh>
              {/* Propeller Hub */}
              <mesh position={[0, -0.9, 0.1]} rotation={[Math.PI/2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.12, 0.12, 0.4]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.8} />
              </mesh>
              {/* Misfire Smoke */}
              <mesh name="engineSmoke" position={[0, 0.8, 0]} scale={0.001}>
                <sphereGeometry args={[0.5, 8, 8]} />
                <meshBasicMaterial name="engineSmokeMat" color="#333333" transparent opacity={0.5} />
              </mesh>
            </group>
          ))}

          {/* Chrome Railings */}
          <group position={[0, 0.45, -1.0]}>
             <mesh position={[-0.6, 0, 0]} rotation={[0, 0, Math.PI/2]} castShadow>
                <cylinderGeometry args={[0.02, 0.02, 1.2]} />
                <meshStandardMaterial color="#f1f5f9" metalness={1.0} roughness={0.1} />
             </mesh>
             <mesh position={[0.6, 0, 0]} rotation={[0, 0, Math.PI/2]} castShadow>
                <cylinderGeometry args={[0.02, 0.02, 1.2]} />
                <meshStandardMaterial color="#f1f5f9" metalness={1.0} roughness={0.1} />
             </mesh>
          </group>
    </>
  );
}
