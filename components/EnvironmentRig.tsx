'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import { Group, DirectionalLight, Color, Vector3, Mesh, MathUtils } from 'three';
import { Sky, Stars } from '@react-three/drei';
import { useSimStore, sharedPhysics } from '@/store/useSimStore';

export default function EnvironmentRig() {
  const skyRef = useRef<Group>(null);
  const starsRef = useRef<Group>(null);
  const lightRef = useRef<DirectionalLight>(null);
  const { scene } = useThree();
  
  // Stored color objects to avoid instantiating every frame
  const colors = useMemo(() => ({
    daySky: new Color('#aab8c2'),
    nightSky: new Color('#050810'),
    sunsetSky: new Color('#ff9a55'),
    stormDaySky: new Color('#1a2430'),
    stormNightSky: new Color('#020305'),
    
    dayLight: new Color('#ffffff'),
    sunsetLight: new Color('#ff7e42'),
    nightLight: new Color('#446699')
  }), []);

  useFrame((state, dt) => {
    const { camera } = state;
    
    // Time progression (Smooth transition towards targets)
    const storeTargetTime = useSimStore.getState().targetTime;
    const storeTargetSeason = useSimStore.getState().targetSeason;

    let timeDiff = storeTargetTime - sharedPhysics.worldTime;
    if (timeDiff > 12) timeDiff -= 24;
    if (timeDiff < -12) timeDiff += 24;
    
    const timeSpeed = 2.0; 
    if (Math.abs(timeDiff) < timeSpeed * dt) {
        sharedPhysics.worldTime = storeTargetTime;
    } else {
        sharedPhysics.worldTime += Math.sign(timeDiff) * timeSpeed * dt;
    }
    
    if (sharedPhysics.worldTime < 0) sharedPhysics.worldTime += 24;
    if (sharedPhysics.worldTime >= 24) sharedPhysics.worldTime -= 24;

    let seasonDiff = storeTargetSeason - sharedPhysics.season;
    if (seasonDiff > 0.5) seasonDiff -= 1.0;
    if (seasonDiff < -0.5) seasonDiff += 1.0;
    
    const seasonSpeed = 0.15;
    if (Math.abs(seasonDiff) < seasonSpeed * dt) {
        sharedPhysics.season = storeTargetSeason;
    } else {
        sharedPhysics.season += Math.sign(seasonDiff) * seasonSpeed * dt;
    }
    
    if (sharedPhysics.season < 0) sharedPhysics.season += 1.0;
    if (sharedPhysics.season >= 1.0) sharedPhysics.season -= 1.0;
    
    // --- Update Wandering Hazard Positions ---
    const tTime = state.clock.elapsedTime;
    
    // Tornado orbits slowly
    const tornadoOrbitRadius = 250;
    const tornadoOrbitSpeed = 0.04;
    sharedPhysics.tornadoPos.x = Math.sin(tTime * tornadoOrbitSpeed) * tornadoOrbitRadius;
    sharedPhysics.tornadoPos.z = Math.cos(tTime * tornadoOrbitSpeed) * tornadoOrbitRadius;

    // Whirlpool stays at a fixed location (the 'static' trap) way out in the South-West
    sharedPhysics.whirlpoolPos.x = -400 + Math.sin(tTime * 0.01) * 20.0;
    sharedPhysics.whirlpoolPos.z = -400 + Math.cos(tTime * 0.01) * 20.0;

    // --- Seasonal Logic ---
    // Spring (0.0), Summer (0.25), Fall (0.5), Winter (0.75)
    // Wrap spring around 0 and 1 so it blends correctly from winter
    const sprProximity = clamp(1.0 - Math.min(Math.abs(sharedPhysics.season), Math.abs(sharedPhysics.season - 1.0)) * 4.0, 0.0, 1.0);
    const sumProximity = clamp(1.0 - Math.abs(sharedPhysics.season - 0.25) * 4.0, 0.0, 1.0);
    const falProximity = clamp(1.0 - Math.abs(sharedPhysics.season - 0.5) * 4.0, 0.0, 1.0);
    const winProximity = clamp(1.0 - Math.abs(sharedPhysics.season - 0.75) * 4.0, 0.0, 1.0);
    
    // Summer heat causes intense blinding sunlight, winter gets weak sunlight
    const maxSunHeight = MathUtils.lerp(500, 1500, sumProximity); 
    const minSunHeight = MathUtils.lerp(maxSunHeight, 350, winProximity);
    
    // 6 AM = Sunrise (0 deg), 12 PM = Noon (90 deg), 18 PM = Sunset (180 deg)
    const timePitch = ((sharedPhysics.worldTime - 6) / 12) * Math.PI; 
    const sunX = Math.cos(timePitch) * 1000;
    const sunY = clamp(Math.sin(timePitch) * minSunHeight, -100, 1500); // Prevent sun from going crazy deep
    const sunZ = Math.sin(sharedPhysics.worldTime * 0.5) * 200; 

    // Time of day factors for blending
    const isNight = sharedPhysics.worldTime < 5.0 || sharedPhysics.worldTime > 19.0;
    const sunsetMorningFactor = clamp(1.0 - Math.abs(sharedPhysics.worldTime - 6.0) / 1.5, 0.0, 1.0);
    const sunsetEveningFactor = clamp(1.0 - Math.abs(sharedPhysics.worldTime - 18.0) / 1.5, 0.0, 1.0);
    const sunsetFactor = Math.max(sunsetMorningFactor, sunsetEveningFactor);
    const dayFactor = clamp(Math.sin(timePitch), 0.0, 1.0);

    // Weather factors
    const windSpeed = useSimStore.getState().windSpeed;
    const stormIntensity = Math.max(0, Math.min(1.0, (windSpeed - 15) / 35.0));

    // Dynamic Fog Blending
    if (scene.fog && 'color' in scene.fog) {
        let baseFog = colors.daySky.clone();
        
        // Heat haze in summer makes the distance distinctly lighter and almost white-hot
        const heatHazeColor = new Color('#e8f4fc');
        baseFog.lerp(heatHazeColor, sumProximity * 0.8 * dayFactor);
        
        // Blend sunset over day
        baseFog.lerp(colors.sunsetSky, sunsetFactor);
        
        // Blend night over everything
        if (isNight) {
            baseFog = colors.nightSky.clone();
        } else if (dayFactor < 0.2) {
             // Deep twilight blend
             const twilight = clamp(1.0 - (dayFactor / 0.2), 0.0, 1.0);
             baseFog.lerp(colors.nightSky, twilight);
        }
        
        let stormFog = isNight ? colors.stormNightSky : colors.stormDaySky;
        scene.fog.color.copy(baseFog).lerp(stormFog, stormIntensity); 

        // Make fog denser during storms, night, or summer heat haze
        if ('near' in scene.fog && 'far' in scene.fog) {
            const heatHazeDensity = sumProximity * 150 * dayFactor; // Reduces viewing distance from humidity
            const crispWinterClarity = winProximity * 150; // Winter air is crisp and clear, extending visibility
            
            // Hurricane level storms reduce visibility but shouldn't blind the camera 
            const stormNearCloseness = stormIntensity * 100;
            const stormFarCloseness = Math.pow(stormIntensity, 1.5) * 550; 

            scene.fog.near = 200 - stormNearCloseness - (isNight ? 50 : 0) + crispWinterClarity;
            scene.fog.far = 1000 - stormFarCloseness - (isNight ? 300 : 0) - heatHazeDensity + crispWinterClarity * 2.0;
        }
    }
    
    // Snap sky box, stars, and directional light to the camera
    if (skyRef.current) {
      skyRef.current.position.set(camera.position.x, 0, camera.position.z);
      
      // Intense ocean summer haze vs crisp winter air
      const targetTurbidity = MathUtils.lerp(0.5, 12.0, sumProximity); 
      const targetRayleigh = MathUtils.lerp(0.8, 2.5, sumProximity) - (winProximity * 0.5);

      skyRef.current.children.forEach(c => {
          if (c instanceof Mesh && c.material.uniforms) {
              if (c.material.uniforms.sunPosition) {
                  c.material.uniforms.sunPosition.value.set(sunX, sunY, sunZ);
              }
              if (c.material.uniforms.turbidity) {
                  c.material.uniforms.turbidity.value = targetTurbidity;
              }
              if (c.material.uniforms.rayleigh) {
                  c.material.uniforms.rayleigh.value = targetRayleigh;
              }
          }
      });
    }

    if (starsRef.current) {
      starsRef.current.position.set(camera.position.x, 0, camera.position.z);
      // Fade stars in at night
      const starOpacity = clamp(1.0 - dayFactor * 2.0, 0.0, 1.0) * (1.0 - stormIntensity);
      starsRef.current.children.forEach(c => {
          if (c instanceof Mesh && c.material) {
              c.material.transparent = true;
              c.material.opacity = starOpacity;
          }
      });
    }

    if (lightRef.current && lightRef.current.target) {
      lightRef.current.position.set(
        camera.position.x + sunX * 0.1, 
        camera.position.y + sunY * 0.1, 
        camera.position.z + sunZ * 0.1
      );
      
      // Light color changes at sunset/night
      let targetLightColor = colors.dayLight.clone();
      targetLightColor.lerp(colors.sunsetLight, sunsetFactor);
      
      // Nighttime uses moon logic (dim blue light opposite of sun)
      if (dayFactor <= 0.0) {
          lightRef.current.position.set(
             camera.position.x - sunX * 0.1, 
             camera.position.y - sunY * 0.1, // Moon is up when sun is down
             camera.position.z - sunZ * 0.1
          );
          targetLightColor = colors.nightLight.clone();
          lightRef.current.intensity = 0.15; // Moonlight is weak
      } else {
          // Daylight varies based on height (softer at sunset)
          let seasonalIntensity = MathUtils.lerp(1.5, 1.0, winProximity); // Winter sun is weaker
          seasonalIntensity = MathUtils.lerp(seasonalIntensity, 3.0, sumProximity); // Summer sun is blindingly hot
          lightRef.current.intensity = Math.max(0, dayFactor) * seasonalIntensity; 
      }
      
      lightRef.current.color.copy(targetLightColor);
      
      lightRef.current.target.position.set(camera.position.x, 0, camera.position.z);
      lightRef.current.target.updateMatrixWorld();
    }
  });

  return (
    <group>
      <group ref={skyRef}>
         <Sky sunPosition={[100, 20, 100]} turbidity={0.1} distance={450000} />
      </group>
      <group ref={starsRef}>
         <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      </group>
      <directionalLight
        ref={lightRef}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />
    </group>
  );
}

// Helper math function
function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
}
