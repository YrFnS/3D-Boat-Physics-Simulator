'use client';

import { MeshDistortMaterial } from '@react-three/drei';

export default function SpeedboatHull() {
  return (
    <>
          {/* Main Sleek Hull */}
          <group>
            {/* Deep V-Hull base */}
            <mesh position={[0, -0.4, 0.4]} castShadow receiveShadow>
              <boxGeometry args={[1.4, 0.8, 3.2]} />
              <MeshDistortMaterial name="speedboatHullLowerMat" color="#881337" roughness={0.3} metalness={0.2} distort={0} speed={0} />
            </mesh>
            <mesh position={[0, -0.4, -1.45]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
               <boxGeometry args={[0.99, 0.8, 0.99]} />
               <MeshDistortMaterial name="speedboatHullLowerMat" color="#881337" roughness={0.3} metalness={0.2} distort={0} speed={0} />
            </mesh>
            
            {/* Upper Hull Body (Sleek Red) */}
            <mesh position={[0, 0.1, 0.5]} castShadow receiveShadow>
              <boxGeometry args={[1.5, 0.4, 3.4]} />
              <MeshDistortMaterial name="speedboatHullUpperMatBody" color="#e11d48" roughness={0.2} metalness={0.1} distort={0} speed={0} />
            </mesh>
            {/* Pointy Bow */}
            <mesh position={[0, 0.1, -1.5]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.06, 0.4, 1.06]} />
              <MeshDistortMaterial name="speedboatHullUpperMatBow" color="#be123c" roughness={0.2} metalness={0.1} distort={0} speed={0} />
            </mesh>
          </group>

          {/* White Deck Trim (Crisp boundary) */}
          <mesh position={[0, 0.35, 0.5]} castShadow receiveShadow>
            <boxGeometry args={[1.55, 0.1, 3.45]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.1} />
          </mesh>
          <mesh position={[0, 0.35, -1.53]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.09, 0.1, 1.09]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.1} />
          </mesh>

          {/* Open Cockpit Area (Sunken Deck) */}
          <mesh position={[0, 0.25, 1.0]} castShadow receiveShadow>
            <boxGeometry args={[1.3, 0.1, 2.2]} />
            <meshStandardMaterial color="#d4d4d8" roughness={0.8} />
          </mesh>
          {/* Teak Wood Floor Inlay */}
          <mesh position={[0, 0.31, 1.0]} castShadow receiveShadow>
            <boxGeometry args={[1.1, 0.05, 2.0]} />
            <meshStandardMaterial color="#b45309" roughness={0.9} />
          </mesh>

          {/* Windshield (Swept Back and Curved illusion) */}
          <group position={[0, 0.6, -0.2]} rotation={[-0.4, 0, 0]}>
            <mesh castShadow>
               <boxGeometry args={[1.4, 0.6, 0.05]} />
               <meshStandardMaterial color="#0284c7" roughness={0.0} metalness={1.0} transparent opacity={0.6} />
            </mesh>
            <mesh castShadow>
               <boxGeometry args={[1.45, 0.65, 0.02]} />
               <meshStandardMaterial color="#0f172a" roughness={0.2} />
            </mesh>
          </group>
    </>
  );
}
