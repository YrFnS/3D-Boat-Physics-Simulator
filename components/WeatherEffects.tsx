'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useSimStore } from '@/store/useSimStore';
import { MathUtils, Color, FogExp2, Object3D, InstancedMesh, Vector3 } from 'three';
import { useEffect, useRef, useMemo } from 'react';

const MAX_RAIN = 15000;

import { sharedPhysics } from '@/store/useSimStore';

export default function WeatherEffects() {
  const rainRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  
  // Custom arrays for rain state
  const rainPositionsRef = useRef(new Float32Array(MAX_RAIN * 3));
  const rainSpeedsRef = useRef(new Float32Array(MAX_RAIN));
  
  // Audio state
  const audioCtxRef = useRef<AudioContext | null>(null);
  const windGainRef = useRef<GainNode | null>(null);
  const windFilterRef = useRef<BiquadFilterNode | null>(null);
  const windPannerRef = useRef<PannerNode | null>(null);
  const thunderFilterRef = useRef<BiquadFilterNode | null>(null);
  const rumbleGainRef = useRef<GainNode | null>(null);

  const lightningFlashRef = useRef<number>(0);

  // Initialize Rain Data
  useEffect(() => {
    const rainPositions = rainPositionsRef.current;
    const rainSpeeds = rainSpeedsRef.current;
    for (let i = 0; i < MAX_RAIN; i++) {
        rainPositions[i * 3]     = (Math.random() - 0.5) * 80; // X
        rainPositions[i * 3 + 1] = Math.random() * 40;         // Y
        rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 80; // Z
        rainSpeeds[i] = 15 + Math.random() * 15;
    }
  }, []);

  // Initialize Weather Audio
  useEffect(() => {
    const initAudio = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
        return;
      }
      if (audioCtxRef.current) return;
      
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      // 1. WIND SYNTHESIS (White Noise -> Low/Bandpass)
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;
      noiseSrc.loop = true;

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 100; // Will be scaled by wind speed
      windFilter.Q.value = 1.2;

      const windGain = ctx.createGain();
      windGain.gain.value = 0;

      const windPanner = ctx.createPanner();
      windPanner.panningModel = 'HRTF';
      windPanner.distanceModel = 'linear'; // Fix relative distance
      windPanner.refDistance = 1000;
      windPanner.maxDistance = 10000;

      noiseSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(windPanner);
      windPanner.connect(ctx.destination);
      noiseSrc.start();

      windFilterRef.current = windFilter;
      windGainRef.current = windGain;
      windPannerRef.current = windPanner;

      // 2. THUNDER RUMBLE SYNTHESIS (Using noise instead of square wave to avoid 'drum' sound)
      const thunderSrc = ctx.createBufferSource();
      thunderSrc.buffer = noiseBuffer;
      thunderSrc.loop = true;

      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.value = 100;
      rumbleFilter.Q.value = 2.0; // Adds resonance for the "boom"

      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0;

      thunderSrc.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(ctx.destination);
      thunderSrc.start();

      thunderFilterRef.current = rumbleFilter;
      rumbleGainRef.current = rumbleGain;
    };

    window.addEventListener('pointerdown', initAudio);
    window.addEventListener('keydown', initAudio);
    return () => {
      window.removeEventListener('pointerdown', initAudio);
      window.removeEventListener('keydown', initAudio);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const { windSpeed, windDir } = useSimStore.getState();
    const stormIntensity = MathUtils.clamp((windSpeed - 15) / 35.0, 0.0, 1.0);
    const rainPositions = rainPositionsRef.current;
    const rainSpeeds = rainSpeedsRef.current;

    // --- 1. RAIN PARTICLES ---
    if (rainRef.current) {
        // Tie rain density to storm intensity (max 5000)
        // If stormIntensity is 0, count is 0 (no rain).
        const activeRainCount = Math.floor(MAX_RAIN * Math.pow(stormIntensity, 1.5));
        rainRef.current.count = activeRainCount;

        if (activeRainCount > 0) {
            // Rain falls down, but pushed sideways by wind
            const windRad = (windDir * Math.PI) / 180;
            // Increased wind force effect on rain angle
            const windX = Math.cos(windRad) * windSpeed * 0.4;
            const windZ = Math.sin(windRad) * windSpeed * 0.4;
            // Rain falls faster in heavier storms
            const speedMultiplier = 1.0 + stormIntensity * 1.5;

            for (let i = 0; i < activeRainCount; i++) {
                // Apply velocities
                const currentSpeed = rainSpeeds[i] * speedMultiplier;
                rainPositions[i * 3 + 1] -= currentSpeed * dt; // Fall down
                rainPositions[i * 3] += windX * dt;             // Blow X
                rainPositions[i * 3 + 2] += windZ * dt;         // Blow Z

                // Reset logic: tie it to the camera's general position so rain is always near us
                const camPos = state.camera.position;
                
                if (rainPositions[i * 3 + 1] < -2 || 
                    Math.abs(rainPositions[i * 3] - camPos.x) > 40 || 
                    Math.abs(rainPositions[i * 3 + 2] - camPos.z) > 40) {
                    
                    // Spawn above and slightly upwind so it falls into view
                    rainPositions[i * 3] = camPos.x + (Math.random() - 0.5) * 80 - (windX * 0.5);
                    rainPositions[i * 3 + 1] = camPos.y + 20 + Math.random() * 20;
                    rainPositions[i * 3 + 2] = camPos.z + (Math.random() - 0.5) * 80 - (windZ * 0.5);
                }

                // Tilt the rain correctly based on wind relative vector
                dummy.position.set(rainPositions[i * 3], rainPositions[i * 3 + 1], rainPositions[i * 3 + 2]);
                
                // Align cylinder to fall direction vector
                const fallDir = new Vector3(windX, -currentSpeed, windZ).normalize();
                const up = new Vector3(0, 1, 0);
                dummy.quaternion.setFromUnitVectors(up, fallDir);
                
                // Scale dynamically based on intensity so drops look larger and blurrier in intense storms
                const rScale = MathUtils.lerp(0.5, 3.0, stormIntensity); // Much larger drops in storms
                dummy.scale.set(rScale * 0.8, rScale * 0.8, rScale * 2.5); // Make them stretch dramatically
                
                dummy.updateMatrix();
                rainRef.current.setMatrixAt(i, dummy.matrix);
            }
            rainRef.current.instanceMatrix.needsUpdate = true;
        }
    }

    // --- 2. ATMOSPHERICS & LIGHTNING ---
    if (!state.scene.fog) {
        state.scene.fog = new FogExp2('#406080', 0.002);
    }
    const fog = state.scene.fog as FogExp2;
    
    let baseSceneIntensity = MathUtils.lerp(1.5, 0.1, Math.pow(stormIntensity, 0.8)); // Steeper darkening curve
    let flashIntensity = 0;

    // Trigger Lightning randomly during heavy storms
    // At maximum hurricane intensity, lightning strikes relentlessly
    const lightningThreshold = MathUtils.lerp(0.005, 0.05, stormIntensity); 
    if (stormIntensity > 0.1 && Math.random() < lightningThreshold * stormIntensity && lightningFlashRef.current <= 0) {
        lightningFlashRef.current = 1.0; // Flash hits max
        
        // Trigger Thunder audio delayed
        if (audioCtxRef.current && rumbleGainRef.current && thunderFilterRef.current) {
            const now = audioCtxRef.current.currentTime;
            rumbleGainRef.current.gain.cancelScheduledValues(now);
            rumbleGainRef.current.gain.setValueAtTime(0, now);
            rumbleGainRef.current.gain.linearRampToValueAtTime(1.5, now + 0.1);
            rumbleGainRef.current.gain.exponentialRampToValueAtTime(0.01, now + 5.0);

            thunderFilterRef.current.frequency.cancelScheduledValues(now);
            thunderFilterRef.current.frequency.setValueAtTime(800, now); // Sharp crack
            thunderFilterRef.current.frequency.exponentialRampToValueAtTime(40, now + 4.0); // Deep decay
        }
    }

    // Decay flash
    if (lightningFlashRef.current > 0) {
        lightningFlashRef.current = Math.max(0, lightningFlashRef.current - dt * 3);
        flashIntensity = lightningFlashRef.current * 3.0;
        baseSceneIntensity += flashIntensity;
    }
    
    sharedPhysics.lightningFlash = lightningFlashRef.current;

    const calmFogColor = new Color('#a0c0d0');
    const stormFogColor = new Color('#1a2632');
    const flashColor = new Color('#ffffff');
    
    // Normal fog lerp + Lightning flash override
    const currentFog = calmFogColor.lerp(stormFogColor, stormIntensity);
    fog.color.copy(currentFog).lerp(flashColor, lightningFlashRef.current * 0.5);
    
    fog.density = MathUtils.lerp(0.002, 0.025, Math.pow(stormIntensity, 1.5));

    state.scene.traverse((obj) => {
      if (obj.type === 'AmbientLight') {
          (obj as any).intensity = MathUtils.lerp(0.3, 0.05, stormIntensity) + flashIntensity * 0.2;
      } else if (obj.type === 'DirectionalLight') {
          // If it's the main sun, during lightning it acts as the strike source
          (obj as any).intensity = baseSceneIntensity;
          
          const calmSunColor = new Color('#fff5e6');
          const stormSunColor = new Color('#4a5a6a');
          
          if (lightningFlashRef.current > 0.5) {
              (obj as any).color.setHex(0xffffff);
          } else {
              (obj as any).color.lerpColors(calmSunColor, stormSunColor, stormIntensity);
          }
      }
    });

    // --- 3. WIND AUDIO DYNAMICS ---
    if (audioCtxRef.current && audioCtxRef.current.state === 'running' && windGainRef.current && windFilterRef.current && windPannerRef.current) {
        const now = audioCtxRef.current.currentTime;
        
        // At 0 wind, silent. Peak at storm intensity
        const targetWindGain = MathUtils.clamp(stormIntensity * 0.7, 0, 0.7);
        windGainRef.current.gain.setTargetAtTime(targetWindGain, now, 0.5);
        
        // Pitch mapping from windspeed (Howls higher at high speed)
        const targetWindFreq = 100 + (windSpeed * 12);
        windFilterRef.current.frequency.setTargetAtTime(targetWindFreq, now, 0.2);

        // Update Listener Position & Orientation to match Camera
        const listener = audioCtxRef.current.listener;
        const cPos = state.camera.position;
        if (listener.positionX) {
            listener.positionX.setTargetAtTime(cPos.x, now, 0.1);
            listener.positionY.setTargetAtTime(cPos.y, now, 0.1);
            listener.positionZ.setTargetAtTime(cPos.z, now, 0.1);
            
            const camDir = new Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion);
            const camUp = new Vector3(0, 1, 0).applyQuaternion(state.camera.quaternion);
            listener.forwardX.setTargetAtTime(camDir.x, now, 0.1);
            listener.forwardY.setTargetAtTime(camDir.y, now, 0.1);
            listener.forwardZ.setTargetAtTime(camDir.z, now, 0.1);
            listener.upX.setTargetAtTime(camUp.x, now, 0.1);
            listener.upY.setTargetAtTime(camUp.y, now, 0.1);
            listener.upZ.setTargetAtTime(camUp.z, now, 0.1);
        }

        // Position wind panner far away in the direction the wind is coming FROM
        const windRad = (windDir * Math.PI) / 180;
        // Direction wind is blowing TOWARDS
        const blowX = Math.cos(windRad);
        const blowZ = Math.sin(windRad);
        
        // We put the source 50 meters away in the opposite direction (from where wind comes)
        const windPannerDist = 50;
        windPannerRef.current.positionX.setTargetAtTime(cPos.x - blowX * windPannerDist, now, 0.1);
        windPannerRef.current.positionY.setTargetAtTime(cPos.y, now, 0.1); // Keep on horizon level
        windPannerRef.current.positionZ.setTargetAtTime(cPos.z - blowZ * windPannerDist, now, 0.1);
    }
  });

  return (
    <instancedMesh ref={rainRef} args={[undefined, undefined, MAX_RAIN]}>
      <cylinderGeometry args={[0.015, 0.015, 0.6, 4]} />
      <meshBasicMaterial color="#ffffff" opacity={0.6} transparent depthWrite={false} />
    </instancedMesh>
  );
}
