'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, InstancedMesh, MathUtils, Object3D, Group } from 'three';
import { Grid } from '@react-three/drei';
import { useSimStore, sharedPhysics } from '@/store/useSimStore';

export default function River() {
  const numDebris = 50;
  const numTrees = 200;
  
  const debrisRef = useRef<InstancedMesh>(null);
  const treesRef = useRef<InstancedMesh>(null);
  const trunksRef = useRef<InstancedMesh>(null);
  const gridGroupRef = useRef<Group>(null);

  const dummy = useMemo(() => new Object3D(), []);

  // Initialize random positions
  const [debrisData] = useState(() => {
    return Array.from({ length: numDebris }).map(() => ({
      position: new Vector3(
        (Math.random() - 0.5) * 80, // River width
        0,
        (Math.random() - 0.5) * 200 // Initial spawn area
      ),
      scale: 0.5 + Math.random() * 1.5,
      rotation: Math.random() * Math.PI * 2,
    }));
  });

  const [treeData] = useState(() => {
    return Array.from({ length: numTrees }).map(() => {
      const isLeft = Math.random() > 0.5;
      const xOffset = 50 + Math.random() * 100;
      return {
        position: new Vector3(
          isLeft ? -xOffset : xOffset,
          0,
          (Math.random() - 0.5) * 1000 // Very long spread
        ),
        scale: 1 + Math.random() * 2,
      };
    });
  });

  // Set initial matrices
  useEffect(() => {
    if (treesRef.current) {
      treeData.forEach((data, i) => {
        dummy.position.copy(data.position);
        dummy.scale.set(data.scale, data.scale, data.scale);
        dummy.updateMatrix();
        treesRef.current!.setMatrixAt(i, dummy.matrix);
        if (trunksRef.current) trunksRef.current.setMatrixAt(i, dummy.matrix);
      });
      treesRef.current.instanceMatrix.needsUpdate = true;
      if (trunksRef.current) trunksRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [treeData, dummy]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const cx = state.camera.position.x;
    const cz = state.camera.position.z;
    
    // Make the grid follow the camera perfectly to look infinite
    if (gridGroupRef.current) {
      gridGroupRef.current.position.x = Math.round(cx / 10) * 10;
      gridGroupRef.current.position.z = Math.round(cz / 10) * 10;
    }

    // Move Debris with the Current
    const currentSpeed = useSimStore.getState().currentSpeed;
    const currentDir = useSimStore.getState().currentDir;
    const currentRad = MathUtils.degToRad(currentDir);
    const waterVelocity = new Vector3(Math.sin(currentRad), 0, Math.cos(currentRad)).multiplyScalar(currentSpeed);

    if (debrisRef.current) {
      debrisData.forEach((data, i) => {
        // Move with current
        data.position.add(waterVelocity.clone().multiplyScalar(dt));
        
        // Loop debris if they fall too far behind or ahead of camera
        if (data.position.z - cz > 100) data.position.z -= 200;
        if (data.position.z - cz < -100) data.position.z += 200;
        
        // Slightly rotate for effect
        data.rotation += dt * 0.5;

        dummy.position.copy(data.position);
        dummy.rotation.set(data.rotation, data.rotation, data.rotation);
        dummy.scale.set(data.scale, data.scale, data.scale);
        dummy.updateMatrix();
        debrisRef.current!.setMatrixAt(i, dummy.matrix);
        
        sharedPhysics.obstacles[i*4 + 0] = data.position.x;
        sharedPhysics.obstacles[i*4 + 1] = data.position.y;
        sharedPhysics.obstacles[i*4 + 2] = data.position.z;
        sharedPhysics.obstacles[i*4 + 3] = data.scale * 1.5; // Radius
      });
      debrisRef.current.instanceMatrix.needsUpdate = true;
    }

    // Loop trees lazily
    if (treesRef.current) {
      let needsUpdate = false;
      treeData.forEach((data, i) => {
        if (data.position.z - cz > 500) { data.position.z -= 1000; needsUpdate = true; }
        if (data.position.z - cz < -500) { data.position.z += 1000; needsUpdate = true; }
        
        sharedPhysics.obstacles[(numDebris + i)*4 + 0] = data.position.x;
        sharedPhysics.obstacles[(numDebris + i)*4 + 1] = data.position.y;
        sharedPhysics.obstacles[(numDebris + i)*4 + 2] = data.position.z;
        sharedPhysics.obstacles[(numDebris + i)*4 + 3] = data.scale * 2.5; // Tree radius

        if (needsUpdate) {
            dummy.position.copy(data.position);
            dummy.scale.set(data.scale, data.scale, data.scale);
            dummy.updateMatrix();
            treesRef.current!.setMatrixAt(i, dummy.matrix);
            if (trunksRef.current) trunksRef.current.setMatrixAt(i, dummy.matrix);
        }
      });
      if (needsUpdate) {
        treesRef.current.instanceMatrix.needsUpdate = true;
        if (trunksRef.current) trunksRef.current.instanceMatrix.needsUpdate = true;
      }
    }
  });

  return (
    <>
      {/* Infinite fading river water Grid */}
      <group ref={gridGroupRef} position={[0, -0.1, 0]}>
        <Grid
          infiniteGrid
          fadeDistance={200}
          sectionColor="#0ea5e9"
          sectionThickness={1}
          cellColor="#0284c7"
          cellThickness={0.5}
          cellSize={2}
          sectionSize={10}
        />
      </group>

      {/* Floating Logs / Buoys visualizing the current */}
      <instancedMesh ref={debrisRef} args={[undefined, undefined, numDebris]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial color="#a16207" roughness={0.9} />
      </instancedMesh>

      {/* Left River Bank */}
      <mesh position={[-540, -1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1000, 2000]} />
        <meshStandardMaterial color="#166534" roughness={1} />
      </mesh>

      {/* Right River Bank */}
      <mesh position={[540, -1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1000, 2000]} />
        <meshStandardMaterial color="#166534" roughness={1} />
      </mesh>

      {/* Trees on the banks */}
      <instancedMesh ref={treesRef} args={[undefined, undefined, numTrees]} castShadow receiveShadow position={[0, 4, 0]}>
        <coneGeometry args={[3, 10, 5]} />
        <meshStandardMaterial color="#14532d" roughness={0.8} />
      </instancedMesh>
      
      {/* Tree Trunks */}
      <instancedMesh ref={trunksRef} args={[undefined, undefined, numTrees]} castShadow receiveShadow position={[0, -1, 0]}>
         <cylinderGeometry args={[0.5, 0.8, 4]} />
         <meshStandardMaterial color="#78350f" roughness={0.9} />
      </instancedMesh>
    </>
  );
}
