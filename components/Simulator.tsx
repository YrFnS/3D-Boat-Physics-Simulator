'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useSimStore } from '@/store/useSimStore';
import Boat from './Boat';
import Ocean from './Ocean'; // Changed from River
import Islands from './Islands';
import Buoys from './Buoys';
import HUD from './HUD';
import WeatherEffects from './WeatherEffects';
import EnvironmentRig from './EnvironmentRig';
import Tornado from './Tornado';
import HurricaneClouds from './HurricaneClouds';

export default function Simulator() {
  const setKey = useSimStore((state) => state.setKey);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'r', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        setKey(k, isDown);
      }
    };
    
    const down = (e: KeyboardEvent) => handleKey(e, true);
    const up = (e: KeyboardEvent) => handleKey(e, false);
    
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [setKey]);

  return (
    <div className="w-full h-screen relative bg-slate-900 overflow-hidden select-none">
      <Canvas camera={{ position: [0, 15, -25], fov: 60 }} shadows>
        <fog attach="fog" args={['#aab8c2', 200, 1000]} />
        <Suspense fallback={null}>
          <OrbitControls 
            makeDefault 
            enablePan={false} 
            maxPolarAngle={Math.PI / 2 - 0.05} 
            minDistance={5} 
            maxDistance={150} 
          />
          <EnvironmentRig />
          <ambientLight intensity={0.3} />
          <Boat />
          <HurricaneClouds />
          <Tornado />
          <Islands />
          <Buoys />
          <Ocean />
          <WeatherEffects />
        </Suspense>
      </Canvas>
      <HUD />
    </div>
  );
}

