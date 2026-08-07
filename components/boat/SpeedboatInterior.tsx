'use client';

export default function SpeedboatInterior() {
  return (
    <>
          {/* --- LUXURY INTERIOR --- */}
          {/* Dashboard Console */}
          <mesh position={[0, 0.55, -0.05]} rotation={[-Math.PI/6, 0, 0]} castShadow receiveShadow>
             <boxGeometry args={[1.2, 0.4, 0.3]} />
             <meshStandardMaterial color="#1f2937" roughness={0.4} />
          </mesh>
          {/* Glowing Digital Dash Screen */}
          <mesh position={[0.2, 0.6, 0.05]} rotation={[-Math.PI/6, 0, 0]} castShadow>
             <planeGeometry args={[0.6, 0.2]} />
             <meshBasicMaterial color="#38bdf8" />
          </mesh>
          {/* Steering Wheel */}
          <mesh position={[-0.3, 0.65, 0.05]} rotation={[-Math.PI/4, 0, 0]} castShadow>
             <torusGeometry args={[0.12, 0.03, 8, 16]} />
             <meshStandardMaterial color="#cbd5e1" metalness={0.9} />
          </mesh>

          {/* Front Pilot Seats (Leather) */}
          <group position={[-0.3, 0.6, 0.4]}>
            <mesh castShadow>
              <boxGeometry args={[0.4, 0.1, 0.4]} />
              <meshStandardMaterial color="#fef08a" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.25, 0.15]} castShadow>
              <boxGeometry args={[0.4, 0.6, 0.1]} />
              <meshStandardMaterial color="#fef08a" roughness={0.6} />
            </mesh>
          </group>
          <group position={[0.3, 0.6, 0.4]}>
            <mesh castShadow>
              <boxGeometry args={[0.4, 0.1, 0.4]} />
              <meshStandardMaterial color="#fef08a" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.25, 0.15]} castShadow>
              <boxGeometry args={[0.4, 0.6, 0.1]} />
              <meshStandardMaterial color="#fef08a" roughness={0.6} />
            </mesh>
          </group>

          {/* Rear Bench Seat Line */}
          <group position={[0, 0.55, 1.7]}>
             <mesh castShadow>
                <boxGeometry args={[1.2, 0.15, 0.5]} />
                <meshStandardMaterial color="#fef08a" roughness={0.6} />
             </mesh>
             <mesh position={[0, 0.3, 0.2]} castShadow>
                <boxGeometry args={[1.2, 0.5, 0.1]} />
                <meshStandardMaterial color="#fef08a" roughness={0.6} />
             </mesh>
          </group>

          {/* Rollbar / Spoiler (Sporty Arch over rear seats) */}
          <group position={[0, 0.8, 1.7]} rotation={[-0.2, 0, 0]}>
             <mesh position={[-0.65, 0.4, 0]} castShadow>
               <boxGeometry args={[0.1, 0.8, 0.2]} />
               <meshStandardMaterial color="#f8fafc" />
             </mesh>
             <mesh position={[0.65, 0.4, 0]} castShadow>
               <boxGeometry args={[0.1, 0.8, 0.2]} />
               <meshStandardMaterial color="#f8fafc" />
             </mesh>
             <mesh position={[0, 0.8, 0]} castShadow>
               <boxGeometry args={[1.4, 0.1, 0.25]} />
               <meshStandardMaterial color="#f8fafc" />
             </mesh>
          </group>
    </>
  );
}
