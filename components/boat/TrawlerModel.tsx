'use client';

import type { RefObject } from 'react';
import { MeshDistortMaterial } from '@react-three/drei';
import type { Group } from 'three';

interface TrawlerModelProps {
  flagRef: RefObject<Group | null>;
  trawlerEngineRef: RefObject<Group | null>;
}

export default function TrawlerModel({
  flagRef,
  trawlerEngineRef,
}: TrawlerModelProps) {
  return (
        <group>
          {/* Main Hull Body */}
          <group>
            {/* Deep V-Hull base */}
            <mesh position={[0, -0.4, 0.8]} castShadow receiveShadow>
              <boxGeometry args={[2.4, 1.0, 4.4]} />
              <MeshDistortMaterial name="trawlerHullLowerMat" color="#0f766e" roughness={0.8} distort={0} speed={0} />
            </mesh>
            <mesh position={[0, -0.4, -1.9]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.7, 1.0, 1.7]} />
              <MeshDistortMaterial name="trawlerHullLowerMat" color="#0f766e" roughness={0.8} distort={0} speed={0} />
            </mesh>
            {/* Upper Hull */}
            <mesh position={[0, 0.3, 0.8]} castShadow receiveShadow>
              <boxGeometry args={[2.6, 0.4, 4.4]} />
              <MeshDistortMaterial name="trawlerHullUpperMat" color="#0b5c56" roughness={0.7} distort={0} speed={0} />
            </mesh>
            <mesh position={[0, 0.3, -1.9]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.84, 0.4, 1.84]} />
              <MeshDistortMaterial name="trawlerHullUpperMat" color="#0b5c56" roughness={0.7} distort={0} speed={0} />
            </mesh>
          </group>

          {/* Wooden Trim (Gunwale) */}
          <mesh position={[0, 0.55, 0.8]} castShadow receiveShadow>
            <boxGeometry args={[2.8, 0.15, 4.6]} />
            <meshStandardMaterial color="#8B4513" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.55, -2.0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.98, 0.15, 1.98]} />
            <meshStandardMaterial color="#8B4513" roughness={0.9} />
          </mesh>

          {/* Forward Deck Fences/Railings */}
          <group position={[0, 0.8, -2.2]}>
            {[-0.8, 0, 0.8].map((x, i) => (
              <mesh key={`rail-p-${i}`} position={[x, 0, 0.4 - Math.abs(x)*0.8]} castShadow>
                <cylinderGeometry args={[0.03, 0.03, 0.5]} />
                <meshStandardMaterial color="#d1d5db" metalness={0.6} roughness={0.4} />
              </mesh>
            ))}
            {/* Top rail loop approximation */}
            <mesh position={[0, 0.25, 0]} rotation={[Math.PI/2, 0, 0]} castShadow>
               <torusGeometry args={[0.9, 0.03, 8, 12, Math.PI]} />
               <meshStandardMaterial color="#d1d5db" metalness={0.6} roughness={0.4} />
            </mesh>
          </group>

          {/* Internal Deck Floor (Teak Wood Planks) */}
          <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.4, 0.1, 5.0]} />
            <meshStandardMaterial color="#d97706" roughness={0.8} />
          </mesh>

          {/* --- WHEELHOUSE (CABIN) --- */}
          <group position={[0, 1.5, 1.6]}>
            {/* Exterior Walls */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[2.0, 1.6, 2.2]} />
              <meshStandardMaterial color="#f1f5f9" roughness={0.4} />
            </mesh>

            {/* Extended Roof (Sunshade) */}
            <mesh position={[0, 0.85, -0.4]} rotation={[0.05, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[2.6, 0.15, 3.4]} />
              <meshStandardMaterial color="#b91c1c" roughness={0.6} />
            </mesh>

            {/* Aft Deck Cover Support Poles */}
            <mesh position={[-1.2, -0.3, 1.1]} castShadow>
               <cylinderGeometry args={[0.04, 0.04, 2.2]} />
               <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <mesh position={[1.2, -0.3, 1.1]} castShadow>
               <cylinderGeometry args={[0.04, 0.04, 2.2]} />
               <meshStandardMaterial color="#94a3b8" />
            </mesh>

            {/* Front Windshield Frame and Glass */}
            <group position={[0, 0.2, -1.1]}>
               <mesh castShadow>
                 <boxGeometry args={[1.8, 0.9, 0.1]} />
                 <meshStandardMaterial color="#1e293b" />
               </mesh>
               <mesh position={[0, 0, -0.05]} castShadow>
                 <planeGeometry args={[1.7, 0.8]} />
                 <meshStandardMaterial color="#0ea5e9" roughness={0.1} metalness={0.9} transparent opacity={0.6} />
               </mesh>
            </group>

            {/* Side Windows with frames */}
            {[-1.05, 1.05].map((x, i) => (
              <group key={`win-${i}`} position={[x, 0.2, 0]} rotation={[0, x > 0 ? Math.PI/2 : -Math.PI/2, 0]}>
                 <mesh castShadow>
                   <boxGeometry args={[1.2, 0.8, 0.1]} />
                   <meshStandardMaterial color="#1e293b" />
                 </mesh>
                 <mesh position={[0, 0, -0.05]} castShadow>
                   <planeGeometry args={[1.1, 0.7]} />
                   <meshStandardMaterial color="#0ea5e9" roughness={0.1} metalness={0.9} transparent opacity={0.6} />
                 </mesh>
              </group>
            ))}

            {/* Interior Steering Wheel & Dashboard */}
            <group position={[0, -0.2, -0.8]}>
              <mesh position={[0, -0.2, 0]} rotation={[-Math.PI/4, 0, 0]} castShadow>
                <boxGeometry args={[1.6, 0.4, 0.4]} />
                <meshStandardMaterial color="#334155" />
              </mesh>
              <mesh position={[-0.4, 0.2, 0.1]} rotation={[-Math.PI/4, 0, 0]} castShadow>
                <torusGeometry args={[0.2, 0.04, 8, 16]} />
                <meshStandardMaterial color="#9ca3af" metalness={0.8} />
              </mesh>
            </group>
          </group>

          {/* --- RADAR AND MAST --- */}
          <group position={[0, 2.5, 1.6]}>
            {/* Spinning Radar */}
            <mesh position={[0, 0.2, -0.4]} castShadow>
               <boxGeometry args={[0.8, 0.1, 0.1]} />
               <meshStandardMaterial color="#f8fafc" />
            </mesh>
            <mesh position={[0, 0.1, -0.4]} castShadow>
               <cylinderGeometry args={[0.05, 0.05, 0.2]} />
               <meshStandardMaterial color="#9ca3af" />
            </mesh>

            {/* Tall Comm Mast */}
            <mesh position={[0.6, 0.8, 0.8]} castShadow>
              <cylinderGeometry args={[0.02, 0.04, 1.8]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.8} />
            </mesh>
            {/* Secondary Antenna */}
            <mesh position={[-0.4, 0.6, 0.6]} castShadow>
              <cylinderGeometry args={[0.01, 0.02, 1.2]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.8} />
            </mesh>
            
            {/* Apparent Wind Flag on short mast */}
            <group ref={flagRef} position={[0, 0.6, 0.2]}>
              <mesh position={[0, -0.2, 0]} castShadow>
                <cylinderGeometry args={[0.02, 0.02, 0.6]} />
                <meshStandardMaterial color="#64748b" />
              </mesh>
              <mesh position={[0, 0.1, 0.25]} castShadow>
                <planeGeometry args={[0.4, 0.2]} />
                <meshStandardMaterial color="#fcd34d" side={2} />
              </mesh>
            </group>
          </group>

          {/* --- EXHAUST & DETAILS --- */}
          {/* Vertical Exhaust Pipe */}
          <mesh position={[-0.8, 1.5, 3.0]} castShadow>
             <cylinderGeometry args={[0.1, 0.1, 2.5]} />
             <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.5} />
          </mesh>

          {/* Cargo Box */}
          <mesh position={[0, 0.7, 3.2]} castShadow receiveShadow>
             <boxGeometry args={[1.5, 0.5, 1.2]} />
             <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
          </mesh>

          {/* Life Rings (Port & Starboard) */}
          <mesh position={[-1.05, 1.2, 1.0]} rotation={[0, -Math.PI/2, 0]} castShadow>
             <torusGeometry args={[0.25, 0.08, 12, 24]} />
             <meshStandardMaterial color="#ea580c" roughness={0.5} />
          </mesh>
          <mesh position={[1.05, 1.2, 1.0]} rotation={[0, Math.PI/2, 0]} castShadow>
             <torusGeometry args={[0.25, 0.08, 12, 24]} />
             <meshStandardMaterial color="#ea580c" roughness={0.5} />
          </mesh>

          {/* Front Cargo Barrels */}
          <mesh position={[-0.5, 0.9, -0.8]} castShadow receiveShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.8, 16]} />
            <meshStandardMaterial color="#2563eb" roughness={0.6} metalness={0.2} />
          </mesh>
          <mesh position={[0.4, 0.9, -0.6]} castShadow receiveShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.8, 16]} />
            <meshStandardMaterial color="#2563eb" roughness={0.6} metalness={0.2} />
          </mesh>

          {/* Outboard Motor / Stern Drive */}
          <group position={[0, -0.2, 3.2]} ref={trawlerEngineRef}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.6, 1.6, 0.8]} />
              <meshStandardMaterial color="#1f2937" roughness={0.8} />
            </mesh>
            {/* Propeller Hub */}
            <mesh position={[0, -0.8, 0.1]} rotation={[Math.PI/2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.8]} />
              <meshStandardMaterial color="#475569" />
            </mesh>
            {/* Misfire Smoke (controlled via useFrame) */}
            <mesh name="engineSmoke" position={[0, 1.0, 0]} scale={0.001}>
              <sphereGeometry args={[0.5, 8, 8]} />
              <meshBasicMaterial name="engineSmokeMat" color="#333333" transparent opacity={0.4} />
            </mesh>
          </group>
        </group>
  );
}
