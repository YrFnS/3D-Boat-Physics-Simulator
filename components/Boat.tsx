'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Vector2, Group, MathUtils, InstancedMesh, Object3D, Color } from 'three';
import { MeshDistortMaterial } from '@react-three/drei';
import { useSimStore, sharedPhysics } from '@/store/useSimStore';
import { getWaveHeight } from './Ocean';
import { getTerrainHeight } from '@/lib/terrain';

const MAX_WAKE_PARTICLES = 600;
const _color = new Color();

export default function Boat() {
  const boatRef = useRef<Group>(null);
  const velocity = useRef(new Vector3(0, 0, 0));
  const angularVelocity = useRef(0);
  const lastWakeDropOdo = useRef(0);
  const engineRPM = useRef(1000); // Base idle RPM
  const rudderAngle = useRef(0);
  const trawlerEngineRef = useRef<Group>(null);
  const speedboatEngineLRef = useRef<Group>(null);
  const speedboatEngineRRef = useRef<Group>(null);
  
  // Phase 1: Health tracking refs
  const hullHealth = useRef(100);
  const engineHealth = useRef(100);
  const engineTemperature = useRef(20);
  const rudderHealth = useRef(100);
  
  // Phase 4: Slam calculation state
  const prevVelocityY = useRef(0);
  const prevSubmergedRatio = useRef(1.0);

  // Read active boat reactively to trigger re-renders
  const activeBoat = useSimStore((state) => state.activeBoat);
  const instantRepairTrigger = useSimStore((state) => state.instantRepairTrigger);

  // Instant Repair Reset Catch
  useEffect(() => {
    if (instantRepairTrigger > 0) {
      hullHealth.current = 100;
      engineHealth.current = 100;
      rudderHealth.current = 100;
      engineTemperature.current = 20;
    }
  }, [instantRepairTrigger]);

  // Apparent wind flag rotation
  const flagRef = useRef<Group>(null);

  // --- AUDIO SYSTEM REFS ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pannerRef = useRef<PannerNode | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const waveGainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    const initAudio = () => {
      if (audioCtxRef.current) {
        if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }
        return;
      }
      
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      // Master Panner to create Spatial 3D effect relative to Camera Listener
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2;
      panner.maxDistance = 1000;
      panner.rolloffFactor = 1;
      pannerRef.current = panner;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.6;
      
      panner.connect(masterGain);
      masterGain.connect(ctx.destination);

      // --- ENGINE SYNTHESIS ---
      const engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 40; // Low rumble idle
      
      // Engine LFO for a pulsating "chugging" effect
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 15;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 12;
      lfo.connect(lfoGain);
      lfoGain.connect(engineOsc.frequency);
      lfo.start();

      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 150;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0.4;

      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(panner);
      engineOsc.start();
      
      engineOscRef.current = engineOsc;
      filterRef.current = engineFilter;

      // --- WAVE/WHITE NOISE SYNTHESIS ---
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      // Generate White Noise
      for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;
      noiseSrc.loop = true;

      const waveFilter = ctx.createBiquadFilter();
      waveFilter.type = 'bandpass';
      waveFilter.frequency.value = 450; // Swooshing water frequency band
      waveFilter.Q.value = 0.6;

      const waveGain = ctx.createGain();
      waveGain.gain.value = 0; // Silent at 0 speed

      noiseSrc.connect(waveFilter);
      waveFilter.connect(waveGain);
      waveGain.connect(panner);
      noiseSrc.start();

      waveGainRef.current = waveGain;
    };

    // Auto-init on first user click/touch/keyboard interaction (browser auto-play policy)
    window.addEventListener('pointerdown', initAudio);
    window.addEventListener('keydown', initAudio);
    return () => {
      window.removeEventListener('pointerdown', initAudio);
      window.removeEventListener('keydown', initAudio);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  useFrame((state, delta) => {
    // Clamp delta to prevent physics explosion after tab inactivity
    const dt = Math.min(delta, 0.1);
    if (!boatRef.current) return;

    const {
      keys,
      windSpeed,
      windDir,
      currentSpeed,
      currentDir,
      engineThrust,
      activeBoat,
      setTelemetry,
    } = useSimStore.getState();

    const isSpeedboat = activeBoat === 'speedboat';

    const thrustRaw = Math.max(0, engineThrust) + (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
    const steerRaw = (keys.a || keys.arrowleft ? 1 : 0) - (keys.d || keys.arrowright ? 1 : 0);

    // --- Physical Constants ---
    const mass = isSpeedboat ? 800 : 1500; // kg
    const engineForceMax = isSpeedboat ? 25000 : 12000; // N
    const dragCoeff = isSpeedboat ? 180 : 250;
    const keelDragMultiplier = isSpeedboat ? 3 : 6; // Resists lateral (sideways) movement
    const windCoeff = isSpeedboat ? 5 : 15; // Sail/Profile area multiplier
    const turnForceMax = isSpeedboat ? 3.5 : 1.5;
    const angularDragCoeff = isSpeedboat ? 3 : 4;

    // --- Heading & Forward Vectors ---
    const heading = boatRef.current.rotation.y;
    const forwardDir = new Vector3(-Math.sin(heading), 0, -Math.cos(heading)).normalize();
    const rightDir = new Vector3(forwardDir.z, 0, -forwardDir.x).normalize();

    // --- Sample Gerstner Wave for Multi-Point Buoyancy & Physics ---
    const time = state.clock.elapsedTime;
    const pos = boatRef.current.position;
    
    // Dimensions for the 4 sampling points (roughly matching the hull size)
    const halfL = isSpeedboat ? 1.6 : 2.0; // Distance to bow/stern
    const halfW = isSpeedboat ? 0.6 : 1.0; // Distance to port/starboard

    // Calculate vectors identifying the 4 corners of the boat based on its heading
    const fwdVec = forwardDir.clone().multiplyScalar(halfL);
    const rgtVec = rightDir.clone().multiplyScalar(halfW);

    const cornerFR = fwdVec.clone().add(rgtVec);
    const cornerFL = fwdVec.clone().sub(rgtVec);
    const cornerBR = fwdVec.clone().negate().add(rgtVec);
    const cornerBL = fwdVec.clone().negate().sub(rgtVec);

    // Sample the ocean shader's wave height at these 4 distinct world positions
    const pFR = getWaveHeight(pos.x + cornerFR.x, pos.z + cornerFR.z, time);
    const pFL = getWaveHeight(pos.x + cornerFL.x, pos.z + cornerFL.z, time);
    const pBR = getWaveHeight(pos.x + cornerBR.x, pos.z + cornerBR.z, time);
    const pBL = getWaveHeight(pos.x + cornerBL.x, pos.z + cornerBL.z, time);

    // Calculate Average Surface Y under the boat
    const avgY = (pFR.y + pFL.y + pBR.y + pBL.y) / 4.0;
    
    // --- Ice & Winter Intercept (Phase 3 & 4) ---
    // Mathematically recreate the localized ice noise field from the Ocean shader
    const isWinter = Math.max(0, Math.min(1.0, 1.0 - Math.abs(sharedPhysics.season - 0.75) * 4.0));
    const iceNoise = Math.sin(pos.x * 0.01) * Math.cos(pos.z * 0.01) + Math.sin(pos.x * 0.05 + pos.z * 0.04) * 0.5;
    const currentIceFactor = Math.max(0, Math.min(1.0, (iceNoise * 0.3 + isWinter * 1.5 - 1.0) * 2.0));
    
    // Calculate submerged depth and ratio
    
    // --- PHASE 2/4: HULL DAMAGE BUOYANCY LOSS ---
    // If the hull is breached (under 50 health), water comes in, lowering the resting drag depth
    let hullDamageSinkOffset = hullHealth.current < 50 ? ((50 - hullHealth.current) / 50) * 0.6 : 0;
    
    // Fully swamp the boat if health is 0
    if (hullHealth.current <= 0) {
        hullDamageSinkOffset += 1.5; 
    }
    
    // Phase 3: Winter adds significant draft to the boat due to icing and water density
    const winterDraftPenalty = isWinter * 0.15;
    
    // Negative offset effectively pushes the target higher up above avgY.
    // We counteract the 0.28m natural gravity squat by using extreme negative offsets.
    const baseDraft = isSpeedboat ? -0.4 : -0.8;
    const draftOffset = baseDraft - hullDamageSinkOffset - winterDraftPenalty; 
    const depth = (avgY - draftOffset) - pos.y; // Positive means underwater, negative means airborne
    const submergedRatio = MathUtils.clamp(depth * 1.5 + 0.5, 0.0, 1.0); // 0 = fully in air, 1 = fully submerged

    // --- Dynamic Vertical Physics (Crash & Slam) ---
    // Instead of sticking to the water, we simulate gravity and buoyancy
    let accelY = -9.81; // Base Gravity

    if (depth > -0.8) { 
      // Boat is touching or in water, apply upward buoyant force
      // Ice/slush slightly reduces the clean buoyancy stiffness of fluid
      const buoyancyStiffness = (isSpeedboat ? 40.0 : 35.0) * (1.0 - isWinter * 0.1); 
      const waterVerticalDamping = isSpeedboat ? 6.0 : 8.0; // Slows down vertical movement
      
      accelY += Math.max(0, depth) * buoyancyStiffness; 
      accelY -= velocity.current.y * waterVerticalDamping * submergedRatio;
    }

    velocity.current.y += accelY * dt;
    
    // --- PHASE 4: REFINED SLAM DAMAGE ---
    // A sudden transition from air to water with high downward velocity
    const isSlam = prevSubmergedRatio.current < 0.3 && submergedRatio > 0.4 && prevVelocityY.current < -2.0;
    
    if (isSlam && time > 2.0) {
        const slamSeverity = Math.abs(prevVelocityY.current) - 2.0; 
        
        // Damage scaling based on severity
        if (slamSeverity > 0.5) {
           hullHealth.current = Math.max(0, hullHealth.current - (slamSeverity * 3.0));
           
           // Extreme slams also rattle the engine and rudder
           if (slamSeverity > 2.0) {
               engineHealth.current = Math.max(0, engineHealth.current - (slamSeverity * 1.5));
               rudderHealth.current = Math.max(0, rudderHealth.current - (slamSeverity * 1.0));
           }
        }

        if (waveGainRef.current && audioCtxRef.current) {
          // Temporarily peak the wave crashing noise to simulate a hull slam
          waveGainRef.current.gain.setTargetAtTime(Math.min(3.0, 1.0 + slamSeverity * 0.4), audioCtxRef.current.currentTime, 0.02);
          waveGainRef.current.gain.setTargetAtTime(0.0, audioCtxRef.current.currentTime + 0.6, 0.5);
        }
    }
    
    // Store for next frame
    prevVelocityY.current = velocity.current.y;
    prevSubmergedRatio.current = submergedRatio;

    // --- Environmental Velocities ---
    const windRad = MathUtils.degToRad(windDir);
    const windVelocity = new Vector3(Math.sin(windRad), 0, Math.cos(windRad)).multiplyScalar(windSpeed);
    
    const currentRad = MathUtils.degToRad(currentDir);
    const waterVelocity = new Vector3(Math.sin(currentRad), 0, Math.cos(currentRad)).multiplyScalar(currentSpeed);

    // --- True Velocity Relative to Water ---
    const waterRelativeVelocity = velocity.current.clone().sub(waterVelocity);
    const vRelForward = waterRelativeVelocity.dot(forwardDir);
    const vRelRight = waterRelativeVelocity.dot(rightDir);

    // --- Applied Horizontal Forces ---
    
    // PLANING HYDRODYNAMICS
    // Calculate how 'on plane' the hull is based on forward speed. 
    // Speedboats ride up on top of the water, massively reducing drag and lifting the bow.
    const speedRatio = Math.min(new Vector2(velocity.current.x, velocity.current.z).length() / 15.0, 1.0); 
    const planingLift = speedRatio * 0.18 * submergedRatio; // Also used for pitch visual later
    
    // Decrease forward drag up to 65% for the speedboat when planing. Displacement hulls (Trawler) don't plane well.
    const planingDragReduction = isSpeedboat ? MathUtils.lerp(1.0, 0.35, Math.pow(speedRatio, 2)) : 1.0;
    const dynamicDragCoeff = dragCoeff * planingDragReduction;

    // --- ENGINE STRESS & RPM MODULATION ---
    let targetRPM = 1000 + (Math.abs(thrustRaw) * (isSpeedboat ? 6000 : 3500));
    
    // Determine engine load. 
    // High load = moving slow but demanding full thrust (takes longer to spool up).
    // Low load = jumping in the air (spools instantly, redlines).
    let rpmLerpRate = 2.0; // Default spool rate
    
    if (submergedRatio <= 0.05) {
        // Airborne: No resistance, instantly over-revs
        rpmLerpRate = 12.0; 
        targetRPM *= 1.5; // Redline spike
        targetRPM += Math.sin(time * 30.0) * 1000.0; // Stick-slip rev limiter sound physically vibrating the engine
    } else if (Math.abs(thrustRaw) > 0.5 && Math.abs(vRelForward) < 2.0) {
        // High load: Pushing hard but moving slow (water resistance) -> slow spool
        rpmLerpRate = 0.8;
    } else {
        // Normal spooling based on speed matching
        rpmLerpRate = 2.0 + (speedRatio * 2.0);
    }
    
    engineRPM.current = MathUtils.lerp(engineRPM.current, targetRPM, rpmLerpRate * dt);
    
    // Calculate final effective thrust from physical RPM, not just throttle position
    const effectiveThrustRatio = (engineRPM.current - 1000) / (isSpeedboat ? 6000 : 3500); 
    
    // --- PHASE 2: Engine Efficiency & Misfires ---
    let engineHealthEfficiency = Math.max(0.1, engineHealth.current / 100);
    // Overheat causes temporary massive efficiency drop. At 100C, efficiency drops sharply.
    const overheatPenalty = engineTemperature.current > 90 ? Math.max(0.2, 1.0 - ((engineTemperature.current - 90) / 20)) : 1.0;
    
    let thrustMultiplier = MathUtils.clamp(submergedRatio * 1.5, 0, 1) * engineHealthEfficiency * overheatPenalty;
    
    // If engine is severely damaged, simulate sputtering/stalling
    if (engineHealth.current < 40) {
      if (Math.random() > engineHealth.current / 50) {
        thrustMultiplier *= Math.random() * 0.2; // Sputter
        engineRPM.current *= MathUtils.lerp(1.0, 0.4, dt * 10); // RPM drops during misfire
      }
    }

    const thrustDirection = thrustRaw < 0 ? -1 : 1;
    const thrustForce = forwardDir.clone().multiplyScalar(Math.abs(effectiveThrustRatio) * thrustDirection * engineForceMax * thrustMultiplier);
    
    // 2. Hydrodynamic Drag (Water Resistance - Drops to zero if boat jumps)
    // --- PHASE 2: Hull Damage Penalty ---
    // A ruined hull creates tremendous parasitic drag, lowering top speed by up to 40%
    const hullDragPenalty = 1.0 + ((100 - hullHealth.current) / 100) * 0.8; 
    
    const dragForceForward = forwardDir.clone().multiplyScalar(-vRelForward * Math.abs(vRelForward) * dynamicDragCoeff * hullDragPenalty * 0.2 - vRelForward * dynamicDragCoeff * hullDragPenalty).multiplyScalar(submergedRatio);
    const dragForceRight = rightDir.clone().multiplyScalar(-vRelRight * Math.abs(vRelRight) * dragCoeff * keelDragMultiplier).multiplyScalar(submergedRatio);

    // DIRECTIONAL WIND CATCHING
    // Wind force is proportional to the silhouette area exposed to the wind.
    const apparentWind = windVelocity.clone().sub(velocity.current);
    const apparentWindDir = apparentWind.lengthSq() > 0 ? apparentWind.clone().normalize() : new Vector3(1,0,0);
    
    // Dot products give us the alignment. 1 = parallel, 0 = perpendicular
    const windDotForward = apparentWindDir.dot(forwardDir);
    const windDotRight = apparentWindDir.dot(rightDir);
    
    // Broadside profile is much larger than nose-in profile. 
    // Trawler has a massive sideways cabin profile (multiplier ~4.5x), Speedboat is sleeker (multiplier ~2.0x).
    const sideAreaMultiplier = isSpeedboat ? 2.0 : 4.5;
    const exposedProfileArea = (Math.abs(windDotForward) * 1.0) + (Math.abs(windDotRight) * sideAreaMultiplier);

    // 3. Aerodynamic Force (Wind always hits, even in mid-air!)
    const trueWindCoeff = windCoeff * exposedProfileArea;
    const windForce = apparentWind.clone().multiplyScalar(apparentWind.length() * trueWindCoeff);

    // Sum Forces -> Acceleration -> Velocity
    const totalForce = thrustForce.add(dragForceForward).add(dragForceRight).add(windForce);
    
    // We only apply this to the X/Z velocity horizontally
    const acceleration = totalForce.divideScalar(mass);
    velocity.current.x += acceleration.x * dt;
    velocity.current.z += acceleration.z * dt;
    
    // --- PHASE 4.5: ICE FLOE FRICTION & DAMAGE ---
    // Instead of instantiating hundreds of meshes, we treat the procedural ice field as an actual physical entity
    if (currentIceFactor > 0.3 && submergedRatio > 0.1) {
        // The boat is crashing through the ice pack!
        // Ice induces extreme drag, capping momentum
        velocity.current.multiplyScalar(1.0 - (currentIceFactor * 0.1 * dt * 60)); // Framerate independent drag
        
        const currentSpeed = velocity.current.length();
        if (currentSpeed > 2.0 && Math.abs(thrustRaw) > 0.1) {
            // Apply continuous grinding damage based on speed and ice density
            hullHealth.current = Math.max(0, hullHealth.current - currentSpeed * currentIceFactor * 0.2 * dt);
            
            // Random chaotic bumps representing ice chunk impacts
            velocity.current.y += (Math.random() - 0.2) * currentIceFactor * currentSpeed * 0.1;
            angularVelocity.current += (Math.random() - 0.5) * currentIceFactor * currentSpeed * 0.2;
            
            // Play grinding hit sound sparingly
            if (audioCtxRef.current && pannerRef.current) {
                // Ensure audio context is respected without massive spam
            }
        }
    }

    // --- ADVANCED RUDDER & PROP WASH SYSTEM ---
    // Rudder takes time to turn to target angle
    let targetRudder = steerRaw * (isSpeedboat ? 0.7 : 0.8); // Max rudder angle (radians)
    
    // --- PHASE 2: Rudder Damage Penalty ---
    // If rudder health is low, max turning angle drops significantly
    const rudderAuth = Math.max(0.1, rudderHealth.current / 100);
    targetRudder *= rudderAuth;

    // At extreme damage, rudder wiggles and jitters from broken linkages
    if (rudderHealth.current < 40) {
      targetRudder += (Math.random() - 0.5) * 0.15;
    }
    
    rudderAngle.current = MathUtils.lerp(rudderAngle.current, targetRudder, 4.0 * dt);
    
    // The rudder gets bite (turning power) from two sources:
    // 1. Water flowing past it due to the boat's speed (vRelForward)
    // 2. Prop wash - water being blasted directly over the rudder by the propeller (effectiveThrustRatio)
    // This prop wash allows doing sharp full-throttle turns from a standstill.
    
    const propWashBite = Math.abs(effectiveThrustRatio) * 3.5;
    const speedBite = Math.abs(vRelForward) * 0.5;
    
    // You cannot steer if the prop/rudder is out of the water!
    const steeringBite = Math.max(0.1, Math.min(speedBite + propWashBite, 6.0)) * submergedRatio;
    
    const turnTorque = rudderAngle.current * steeringBite * turnForceMax;
    const angularAcc = turnTorque - angularVelocity.current * angularDragCoeff;
    angularVelocity.current += angularAcc * dt;

    // --- PHASE 4: OBSTACLE COLLISION DETECTION ---
    const currentBoatPos = boatRef.current.position;
    for (let i = 0; i < 250; i++) { // MAX_OBSTACLES
        const ox = sharedPhysics.obstacles[i*4 + 0];
        const oz = sharedPhysics.obstacles[i*4 + 2];
        if (ox === 0 && oz === 0) continue; // Uninitialized
        
        const orad = sharedPhysics.obstacles[i*4 + 3];
        
        // Simple 2D Cylinder collision (ignoring Y for debris/trees)
        const dx = currentBoatPos.x - ox;
        const dz = currentBoatPos.z - oz;
        const distSq = dx*dx + dz*dz;
        const boatRad = halfW * 0.8; // Approximate hit radius 
        const totalRad = boatRad + orad;
        
        if (distSq < totalRad * totalRad) {
            // COLLISION!
            const dist = Math.sqrt(distSq);
            const nx = dx / (dist || 1);
            const nz = dz / (dist || 1);
            
            // Resolve overlap rigidly
            const overlap = totalRad - dist;
            currentBoatPos.x += nx * overlap;
            currentBoatPos.z += nz * overlap;
            
            // Calculate impact severity based on relative velocity towards object
            const dotVelocity = -(velocity.current.x * nx + velocity.current.z * nz);
            
            if (dotVelocity > 0.5) { // Lowered impact threshold so buoys consistently bonk
                // Apply impulse response bounce (restitution = 0.5)
                velocity.current.x += nx * dotVelocity * 1.5;
                velocity.current.z += nz * dotVelocity * 1.5;
                
                // Add chaotic spin
                angularVelocity.current += (Math.random() - 0.5) * dotVelocity * 1.0;

                // Damage Hull! (Reduced damage from buoys)
                hullHealth.current = Math.max(0, hullHealth.current - dotVelocity * 1.5);

                // Play Hit Sound
                if (audioCtxRef.current && pannerRef.current) {
                    const ctx = audioCtxRef.current;
                    const osc = ctx.createOscillator();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(80, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.3);
                    
                    const gain = ctx.createGain();
                    gain.gain.setValueAtTime(Math.min(dotVelocity * 0.5, 2.0), ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                    
                    osc.connect(gain);
                    gain.connect(pannerRef.current);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.3);
                }
            }
        }
    }

    // Extreme physics safety clamp to prevent space launches (Flying Boat Bug fix)
    velocity.current.x = MathUtils.clamp(velocity.current.x, -80, 80);
    velocity.current.y = MathUtils.clamp(velocity.current.y, -40, 40);
    velocity.current.z = MathUtils.clamp(velocity.current.z, -80, 80);

    // --- Apply Transforms ---
    boatRef.current.position.add(velocity.current.clone().multiplyScalar(dt));
    boatRef.current.rotation.y += angularVelocity.current * dt;
    
    // Update Shared Physics for Shaders (Ocean Wake)
    sharedPhysics.boatPos.copy(boatRef.current.position);
    sharedPhysics.boatDir.copy(forwardDir);
    const speed2D = new Vector2(velocity.current.x, velocity.current.z).length();
    sharedPhysics.boatSpeed = Math.min(speed2D, 35.0);

    // --- PHASE 3: TERRAIN COLLISION & BEACHING ---
    let terrainY = getTerrainHeight(boatRef.current.position.x, boatRef.current.position.z);
    
    // Dynamic Seabed Cratering: If the whirlpool is here, the water pushes the effective seabed down
    // This fixes the bug where the boat floats flat in mid-air over the vortex because the physical terrain was catching the hull.
    const distToW = Math.sqrt((boatRef.current.position.x - sharedPhysics.whirlpoolPos.x)**2 + (boatRef.current.position.z - sharedPhysics.whirlpoolPos.z)**2);
    if (distToW < 160) {
        const vFactor = 1.0 - MathUtils.smoothstep(distToW, 0.0, 160.0);
        let dampening = 1.0;
        if (terrainY > -10.0) {
            dampening = Math.max(0, Math.min(1.0, -terrainY / 10.0));
        }
        
        // Match the shader: A perfectly smooth rankine depression
        const vortexSink = Math.pow(vFactor, 3.0) * 80.0 * dampening;
        terrainY -= vortexSink; // Plunge the terrain
    }
    
    // The boat's origin is roughly at the waterline, but the hull extends down.
    // Trawler is deeper than the speedboat
    const deepestDraft = isSpeedboat ? 0.3 : 0.6;
    
    // Check if the bottom of the hull is touching the procedural terrain
    if (boatRef.current.position.y - deepestDraft < terrainY) {
        // We hit the ground!
        
        // 1. Calculate how hard we hit it vertically
        const penetrationY = terrainY - (boatRef.current.position.y - deepestDraft);
        
        // 2. Resolve vertical penetration (prevent falling through the world)
        boatRef.current.position.y = terrainY + deepestDraft;
        
        // Calculate terrain normal
        const d = 1.0;
        const ty1 = getTerrainHeight(boatRef.current.position.x + d, boatRef.current.position.z);
        const ty2 = getTerrainHeight(boatRef.current.position.x - d, boatRef.current.position.z);
        const ty3 = getTerrainHeight(boatRef.current.position.x, boatRef.current.position.z + d);
        const ty4 = getTerrainHeight(boatRef.current.position.x, boatRef.current.position.z - d);
        
        const normalX = ty2 - ty1;
        const normalZ = ty4 - ty3;
        const normalVector = new Vector3(normalX, 2*d, normalZ).normalize();
        
        // 3. Rigid Lateral Correction (Fixes clipping/sliding over steep cliffs)
        if (normalVector.y < 0.9) { 
           // Push the boat OUT horizontally away from the cliff
           const pushOut = penetrationY * (1.0 - normalVector.y) * 2.0;
           boatRef.current.position.x += normalVector.x * pushOut;
           boatRef.current.position.z += normalVector.z * pushOut;
        }

        // Dot product to see if we slammed into a wall
        const dotVelocity = velocity.current.x * normalVector.x + velocity.current.y * normalVector.y + velocity.current.z * normalVector.z;
        const speedIntoWall = -dotVelocity;
        
        // 4. Velocity Projection (Stop forward momentum from completely burrowing into the wall)
        if (dotVelocity < 0) {
           velocity.current.x -= normalVector.x * dotVelocity;
           // If we hit a steep wall, cancel the horizontal energy entirely. 
           // Do NOT convert horizontal momentum into vertical climbing momentum!
           velocity.current.y = Math.min(velocity.current.y, 0); 
           velocity.current.z -= normalVector.z * dotVelocity;
        }

        // 5. Apply severe ground friction (beaching)
        const groundFriction = 3.0; 
        velocity.current.x -= velocity.current.x * groundFriction * dt;
        velocity.current.z -= velocity.current.z * groundFriction * dt;
        
        // Ensure bouncing upwards is stopped if we are pinned, stop downward velocity if falling
        if (velocity.current.y > 0 && normalVector.y >= 0.9) {
            velocity.current.y *= 0.5; // Dampen upward bouncing intelligently
        } else if (velocity.current.y < 0) {
            velocity.current.y = 0; // Prevent infinite gravity accumulation
        }

        // 6. Crash Damage
        if (speedIntoWall > 2.0 && penetrationY > 0.1) {
             // CRASH!
             const severity = speedIntoWall;
             
             // Massive damage for hitting solid rock/sand at speed
             hullHealth.current = Math.max(0, hullHealth.current - severity * 5);
             if (severity > 5) {
                 engineHealth.current = Math.max(0, engineHealth.current - severity * 2);
                 rudderHealth.current = Math.max(0, rudderHealth.current - severity * 3);
             }
             
             // Bounce off terrain (no upward geometry launch from lateral impacts)
             velocity.current.x += normalVector.x * speedIntoWall * 0.8;
             velocity.current.y += (normalVector.y > 0.9 ? normalVector.y * speedIntoWall * 0.5 : 0); 
             velocity.current.z += normalVector.z * speedIntoWall * 0.8;
             
             // Add chaotic spin
             angularVelocity.current += (Math.random() - 0.5) * speedIntoWall * 1.0;
             
             // Play crash sound
             if (audioCtxRef.current && pannerRef.current) {
                 const ctx = audioCtxRef.current;
                 const osc = ctx.createOscillator();
                 osc.type = 'square';
                 osc.frequency.setValueAtTime(40, ctx.currentTime);
                 osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.5);
                 
                 const gain = ctx.createGain();
                 gain.gain.setValueAtTime(Math.min(severity * 0.6, 2.0), ctx.currentTime);
                 gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                 
                 osc.connect(gain);
                 gain.connect(pannerRef.current);
                 osc.start();
                 osc.stop(ctx.currentTime + 0.5);
             }
        }
    }

    // --- PHASE 5: TORNADO / WATERSPOUT PHYSICS ---
    // Tornado and Whirlpool are now independent hazards wandering the sea.
    
    // 1. TORNADO (Atmospheric Pull)
    {
        const tx = sharedPhysics.tornadoPos.x;
        const tz = sharedPhysics.tornadoPos.z;
        const dx = tx - boatRef.current.position.x;
        const dz = tz - boatRef.current.position.z;
        const distSq = dx*dx + dz*dz;
        
        if (distSq < 14400) { // 120m range for Tornado
            const dist = Math.sqrt(distSq);
            const pullFactor = Math.pow(1.0 - (dist / 120.0), 2.0) * 12.0; 
            const nx = dx / dist;
            const nz = dz / dist;
            
            velocity.current.x += nx * pullFactor * dt;
            velocity.current.z += nz * pullFactor * dt;
            
            if (dist < 40) {
                angularVelocity.current += (Math.random() - 0.5) * 5.0 * dt;
                velocity.current.y += Math.random() * 6.0 * dt; 
                hullHealth.current = Math.max(0, hullHealth.current - 10.0 * dt);
            }
        }
    }

    // 2. WHIRLPOOL (Oceanic Sucking Vortex)
    {
        const wx = sharedPhysics.whirlpoolPos.x;
        const wz = sharedPhysics.whirlpoolPos.z;
        const dx = wx - boatRef.current.position.x;
        const dz = wz - boatRef.current.position.z;
        const distSq = dx*dx + dz*dz;
        
        if (distSq < 25600) { // 160m total influence range match visual shader
            const dist = Math.sqrt(distSq);
            const radius = 160.0;
            const eyeWallRadius = 25.0; 
            
            // normalized distance factor (1.0 at center, 0.0 at edge) match smoothstep from shader
            const f = 1.0 - MathUtils.smoothstep(dist, 0, radius);
            const nx = dx / dist;
            const nz = dz / dist;
            
            // --- Pure Suction & Swirl (Mathematical Rankine Vortex) ---
            // Real whirlpools suck perfectly inwards and spiral
            const radialPull = Math.pow(f, 2.0) * 45.0; // Smooth curve pulling in
            velocity.current.x += nx * radialPull * dt;
            velocity.current.z += nz * radialPull * dt;
            
            // --- Tangential Swirl ---
            // Much faster spin, peaking right at the eye wall (Rankine model)
            let swirlIntensity = 0;
            if (dist > eyeWallRadius) {
                // Irrotational flow: decays as 1/r
                swirlIntensity = (eyeWallRadius / dist) * 120.0; 
            } else {
                // Solid body rotation inside the eye
                swirlIntensity = (dist / eyeWallRadius) * 120.0;
            }
            
            const fSwirlTotal = swirlIntensity;
            
            // Tangential vector is (-nz, nx) to match clockwise shader visual
            velocity.current.x += -nz * fSwirlTotal * dt;
            velocity.current.z += nx * fSwirlTotal * dt;
            
            // --- Roll/Coriolis Effect ---
            // Tries to spin the boat to align perfectly with the swirl
            angularVelocity.current += (fSwirlTotal * 0.05) * dt;

            // --- The Eye Impact (Deep Plunge) ---
            if (dist < 40) {
                 const damageFactor = Math.pow(1.0 - dist/40.0, 2.0);
                 hullHealth.current = Math.max(0, hullHealth.current - 15.0 * dt * damageFactor);
                 engineHealth.current -= 5.0 * dt * damageFactor;
                 
                 // Structural shuddering near the terrifying eye
                 velocity.current.x += (Math.random() - 0.5) * 10.0 * damageFactor;
                 velocity.current.z += (Math.random() - 0.5) * 10.0 * damageFactor;
                 angularVelocity.current += (Math.random() - 0.5) * 5.0 * damageFactor;
                 
                 if (dist < 18) {
                    // Sucked directly down into the abyss
                    hullHealth.current = Math.max(0, hullHealth.current - 50.0 * dt);
                    velocity.current.y -= 45.0 * dt; // Violent plunge into the void
                    
                    // Rip to exact center
                    velocity.current.x += nx * 40.0 * dt;
                    velocity.current.z += nz * 40.0 * dt;
                 }
            }
        }
    }

    // Dynamic Wake Line tracking
    sharedPhysics.absoluteOdometer += speed2D * dt;
    if (sharedPhysics.absoluteOdometer - lastWakeDropOdo.current > 2.0) {
        lastWakeDropOdo.current = sharedPhysics.absoluteOdometer;
        const wn = sharedPhysics.wakeNodes;
        const wd = sharedPhysics.wakeDirs;
        const MAX = wn.length / 4;
        
        // Shift trail history back
        for(let i = MAX - 1; i > 0; i--) {
            wn[i*4 + 0] = wn[(i-1)*4 + 0];
            wn[i*4 + 1] = wn[(i-1)*4 + 1];
            wn[i*4 + 2] = wn[(i-1)*4 + 2];
            wn[i*4 + 3] = wn[(i-1)*4 + 3];

            wd[i*4 + 0] = wd[(i-1)*4 + 0];
            wd[i*4 + 1] = wd[(i-1)*4 + 1];
            wd[i*4 + 2] = wd[(i-1)*4 + 2];
            wd[i*4 + 3] = wd[(i-1)*4 + 3];
        }

        // Insert new current boat node
        wn[0] = boatRef.current.position.x;
        wn[1] = boatRef.current.position.y;
        wn[2] = boatRef.current.position.z;
        wn[3] = sharedPhysics.absoluteOdometer;
        
        wd[0] = forwardDir.x;
        wd[1] = forwardDir.z;
        wd[2] = sharedPhysics.boatSpeed;
        wd[3] = 0;
    }

    // 2. PITCH (Rotation around X)
    const heightFront = (pFR.y + pFL.y) / 2.0;
    const heightBack = (pBR.y + pBL.y) / 2.0;
    const pitchDelta = (heightFront - heightBack) / (halfL * 2.0); 

    // Whirlpool proximity check
    const wDistSq = (currentBoatPos.x - sharedPhysics.whirlpoolPos.x)**2 + (currentBoatPos.z - sharedPhysics.whirlpoolPos.z)**2;

    // --- Whirlpool Pitch Bias (Nose Dip) ---
    let whirlpoolPitchBias = 0;
    if (wDistSq < 25600) { // 160m
        const wDist = Math.sqrt(wDistSq);
        const toWhirlpoolX = (sharedPhysics.whirlpoolPos.x - currentBoatPos.x) / wDist;
        const toWhirlpoolZ = (sharedPhysics.whirlpoolPos.z - currentBoatPos.z) / wDist;
        
        const boatForward = new Vector3(0, 0, -1).applyQuaternion(boatRef.current.quaternion);
        const alignment = boatForward.x * toWhirlpoolX + boatForward.z * toWhirlpoolZ; // 1 if facing the center
        
        // Massive steepness down the 110m drop
        const slopeStrength = Math.pow(1.0 - Math.min(1.0, wDist / 160.0), 3.0) * 1.5;
        whirlpoolPitchBias = alignment * slopeStrength;
    }

    // targetPitch uses the planingLift defined above
    // Visual mesh points to -Z. A positive X rotation points the -Z nose UP.
    // If the front is higher (pitchDelta > 0), we want the nose to point UP (positive X rotation).
    // planingLift lifts the nose UP (positive).
    const targetPitch = MathUtils.clamp(Math.atan(pitchDelta) + planingLift + whirlpoolPitchBias, -1.2, 1.2);
    
    // 3. ROLL (Rotation around Z)
    const heightRight = (pFR.y + pBR.y) / 2.0;
    const heightLeft = (pFL.y + pBL.y) / 2.0;
    const rollDelta = (heightRight - heightLeft) / (halfW * 2.0);
    
    // Whirlpool Roll Bias: The water slope is steep. We calculate the tangent of the boat relative to the vortex center.
    let whirlpoolRollBias = 0;
    if (wDistSq < 25600) {
        const wDist = Math.sqrt(wDistSq);
        const toWhirlpoolX = (sharedPhysics.whirlpoolPos.x - currentBoatPos.x) / wDist;
        const toWhirlpoolZ = (sharedPhysics.whirlpoolPos.z - currentBoatPos.z) / wDist;
        
        // Find boat's right vector
        const boatRight = new Vector3(1, 0, 0).applyQuaternion(boatRef.current.quaternion);
        const alignment = boatRight.x * toWhirlpoolX + boatRight.z * toWhirlpoolZ; // 1 if center is to the right
        
        // Tilt radically toward the eye wall as it gets steeper
        const slopeStrength = Math.pow(1.0 - Math.min(1.0, wDist / 160.0), 3.0) * 1.5;
        whirlpoolRollBias = alignment * slopeStrength;
    }
    
    const safeBank = MathUtils.clamp(-angularVelocity.current * speedRatio * 0.6, -0.35, 0.35) * submergedRatio; 
    const targetRoll = MathUtils.clamp(Math.atan(rollDelta) + safeBank + whirlpoolRollBias, -1.2, 1.2);

    // Apply rotation. If jumping (airborne), we smoothly hold the angle rather than instantly snapping to the water far below
    const rotSpeed = submergedRatio > 0.1 ? (isSpeedboat ? 5.0 : 3.0) : 1.0;
    boatRef.current.rotation.x = MathUtils.lerp(boatRef.current.rotation.x, targetPitch, rotSpeed * dt);
    boatRef.current.rotation.z = MathUtils.lerp(boatRef.current.rotation.z, targetRoll, rotSpeed * dt);


    // --- Update Telemetry UI & Health Degradation ---
    // 1 knot = 0.514444 m/s
    const speedKnots = velocity.current.length() / 0.514444;
    let headingDeg = MathUtils.radToDeg(boatRef.current.rotation.y) % 360;
    if (headingDeg < 0) headingDeg += 360;
    
    // --- Phase 1: Health Math ---
    
    // Engine Temperature: Coils up based on RPM over 2800, cools down otherwise
    // Realistic marine engines have constant sea-water cooling, meaning they stabilize safely near 70-80C at max RPM
    let targetTemp = 20 + (Math.max(0, engineRPM.current - 2800) / 4200) * 65; 
    
    // Cooling is much more efficient than heating at low RPMs (raw water intake is consistent)
    let tempLerpRate = engineRPM.current > 3500 ? 0.012 : 0.025; // Faster cooling at low revs (was 0.008)
    
    // Water cooling if severely sinking
    if (submergedRatio > 0.95) {
       tempLerpRate = 0.5; // Rapid cooling when submerged
    } else if (submergedRatio <= 0.01 && targetRPM > 3000) {
       // Starved of cooling water AND revving high (Prop completely jumped out of water into open air)
       targetTemp = 105; // Tightened cap (was 110)
       tempLerpRate = 0.03; // Further reduced from 0.035
    }

    // Hard cap for target temperature to prevent physics-driven runaway heating
    targetTemp = Math.min(105, targetTemp);
    
    engineTemperature.current = MathUtils.lerp(engineTemperature.current, targetTemp, tempLerpRate * dt);
    
    // Engine Health: Degrades slightly if temperature is over 90C
    if (engineTemperature.current > 90) {
       const overheatDamage = (engineTemperature.current - 90) * 0.05;
       engineHealth.current = Math.max(0, engineHealth.current - overheatDamage * dt);
    }

    // Engine Flooding (Phase 4): Drown the engine if fully submerged AND the boat is heavily damaged/sinking
    // Real marine engines can handle spray and momentary wave submersion as long as intakes are above deck
    if (submergedRatio > 0.95 && hullHealth.current < 40 && time > 2.0) {
       engineHealth.current = Math.max(0, engineHealth.current - 15.0 * dt); // Engine slowly drowns
    }
    
    // Hull Health: Degrades very slowly from sustained planing (previously Phase 1)
    if (speedRatio > 0.8) {
       hullHealth.current = Math.max(0, hullHealth.current - (speedRatio * 0.1) * dt);
    }

    // Rudder Health: Degrades when turning sharply at high speeds
    if (Math.abs(turnTorque) > 0.5 && speedRatio > 0.5) {
       rudderHealth.current = Math.max(0, rudderHealth.current - (Math.abs(turnTorque) * 0.2) * dt);
    }
    
    // Continuous slow automatic bilge-pump / foam flotation saves the boat over time
    // Ensures a user isn't stuck with a permanently swamped boat
    if (hullHealth.current < 60) {
       hullHealth.current = Math.min(60, hullHealth.current + 1.0 * dt);
    }
    
    // --- Phase 5: Active Repair / Bilge Mechanics ---
    if (keys.r && Math.abs(speedKnots) < 2.0 && Math.abs(thrustRaw) < 0.1) {
        hullHealth.current = Math.min(100, hullHealth.current + 8.0 * dt);
        engineHealth.current = Math.min(100, engineHealth.current + 12.0 * dt);
        rudderHealth.current = Math.min(100, rudderHealth.current + 15.0 * dt);
        
        // Pumping water out (indirectly raises buoyancy through hullHealth)
        // Also helps cool the engine down slightly faster when stopped and repairing
        engineTemperature.current = Math.max(20, engineTemperature.current - 5.0 * dt);
    }

    // throttle updates to UI ~10 times a sec
    if (Math.random() < 0.2) {
      setTelemetry(
        speedKnots, 
        headingDeg, 
        hullHealth.current, 
        engineHealth.current, 
        engineTemperature.current, 
        rudderHealth.current
      );
    }

    // --- Update Flag (Apparent Wind) ---
    if (flagRef.current) {
      if (apparentWind.lengthSq() > 0.1) {
        // Flag points away from apparent wind
        const targetAngle = Math.atan2(apparentWind.x, apparentWind.z);
        // Local rotation needs to account for boat heading
        flagRef.current.rotation.y = targetAngle - boatRef.current.rotation.y;
      }
    }
    
    // --- Update Visual Rudders/Engines ---
    if (trawlerEngineRef.current) trawlerEngineRef.current.rotation.y = rudderAngle.current;
    if (speedboatEngineLRef.current) speedboatEngineLRef.current.rotation.y = rudderAngle.current;
    if (speedboatEngineRRef.current) speedboatEngineRRef.current.rotation.y = rudderAngle.current;

    // --- Update Dynamic Damage Visuals ---
    if (boatRef.current) {
        boatRef.current.traverse((child: any) => {
           if (child.isMesh && child.name === 'engineSmoke') {
               const health = engineHealth.current;
               if (health <= 0) {
                   // Engine Dead - Large black/orange smoke
                   child.scale.setScalar(1.2 + Math.random() * 0.8);
                   (child.material as any).color.set(Math.random() > 0.8 ? "#9a3412" : "#0f172a"); // Occasionally flashes orange like fire
                   (child.material as any).opacity = 0.8;
               } else if (health < 50) {
                   // Engine Damaged - Grey sputtering smoke
                   child.scale.setScalar(0.6 + Math.random() * 0.4);
                   (child.material as any).color.set("#333333");
                   (child.material as any).opacity = 0.4;
               } else {
                   // Healthy
                   child.scale.setScalar(0.001);
               }
           }
           if (child.isMaterial && child.name && child.name.endsWith('Mat')) {
               if (child.name === 'trawlerHullLowerMat') {
                   child.color.set(hullHealth.current < 40 ? "#064e3b" : "#0f766e");
                   child.roughness = 0.8 + (100 - hullHealth.current) / 200.0;
                   child.distort = hullHealth.current < 50 ? 0.3 : 0;
               } else if (child.name === 'trawlerHullUpperMat') {
                   child.color.set(hullHealth.current < 40 ? "#0a4a45" : "#0b5c56");
                   child.distort = hullHealth.current < 50 ? 0.2 : 0;
               } else if (child.name === 'speedboatHullLowerMat') {
                   child.color.set(hullHealth.current < 40 ? "#4c0519" : "#881337");
                   child.roughness = 0.3 + (100 - hullHealth.current) / 200.0;
                   child.distort = hullHealth.current < 50 ? 0.3 : 0;
               } else if (child.name.startsWith('speedboatHullUpperMat')) {
                   const defaultColor = child.name.includes("Bow") ? "#be123c" : "#e11d48";
                   child.color.set(hullHealth.current < 40 ? "#881337" : defaultColor);
                   child.distort = hullHealth.current < 50 ? 0.2 : 0;
               }
           }
        });
    }

    // Wake Particle system has been removed in favor of the shader-based Analytical Kelvin Wake
    
    // --- Camera Tracking (Orbit Controls) ---
    const boatPos = boatRef.current.position.clone();
    
    if (state.controls) {
      const controls = state.controls as any;
      const targetPos = boatPos.clone().add(new Vector3(0, 2, 0));
      
      // Calculate how much the boat moved since last frame
      const deltaPos = targetPos.clone().sub(controls.target);
      
      // Move both the controls target and the camera position by the same delta
      // This pans the entire rig smoothly without breaking the user's orbit perspective
      controls.target.copy(targetPos);
      state.camera.position.add(deltaPos);
      controls.update();
    } else {
      // Fallback if controls aren't mounted yet
      const cameraOffset = forwardDir.clone().multiplyScalar(-15).add(new Vector3(0, 8, 0));
      const desiredCameraPos = boatPos.clone().add(cameraOffset);
      
      state.camera.position.lerp(desiredCameraPos, 0.1);
      state.camera.lookAt(boatPos.clone().add(new Vector3(0, 2, 0)));
    }

    // --- 3D AUDIO POSITIONAL UPDATES ---
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      const now = audioCtxRef.current.currentTime;
      const panner = pannerRef.current!;
      const listener = audioCtxRef.current.listener;

      const cPos = state.camera.position;
      
      // Update Panner Position (Sound emanating from Boat Motor Location)
      // We offset the sound slightly to the rear
      const motorPos = pos.clone().add(forwardDir.clone().multiplyScalar(-2.0));
      if (panner.positionX) {
        panner.positionX.setTargetAtTime(motorPos.x, now, 0.1);
        panner.positionY.setTargetAtTime(motorPos.y, now, 0.1);
        panner.positionZ.setTargetAtTime(motorPos.z, now, 0.1);
      }

      // Update Listener Position & Orientation (Camera POV)
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

      // Audio Logic Modulation based on physical speed
      const currentSpd = velocity.current.length();
      
      // Dynamic Engine Audio (Linked to Physical Engine RPM)
      if (engineOscRef.current && filterRef.current) {
        // Now using actual physics RPM instead of faking it from velocity!
        const targetFreq = Math.max(35, engineRPM.current * (isSpeedboat ? 0.05 : 0.04));

        engineOscRef.current.frequency.setTargetAtTime(targetFreq, now, 0.1);

        // Filter follows pitch to brighten the sound when revving high
        filterRef.current.frequency.setTargetAtTime(targetFreq * 3.5, now, 0.2);
      }
      
      // Dynamic Wave Wash & Splash Audio
      if (waveGainRef.current) {
         // The faster you go, the louder the water slashing against the hull is.
         // Slower decay (0.8) so it doesn't instantly snap down if we were mid "slam" audio override from earlier
         const baseWaveVolume = MathUtils.clamp(currentSpd / 30.0, 0, 0.6) * submergedRatio;
         waveGainRef.current.gain.setTargetAtTime(baseWaveVolume, now, 0.8);
      }
    }
  });

  return (
    <>
    <group ref={boatRef} position={[0, 0, 0]}>
      {/* V-Hull Group to lift the boat correctly relative to the water line */}
      <group position={[0, 0.2, 0]}>

        {/* --- TRAWLER MESH --- */}
        {activeBoat === 'trawler' && (
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
        )}

        {/* --- SPEEDBOAT MESH --- */}
        {activeBoat === 'speedboat' && (
        <group>
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

        </group>
        )}

      </group>
    </group>
    </>
  );
}
