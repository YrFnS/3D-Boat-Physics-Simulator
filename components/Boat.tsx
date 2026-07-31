'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group, MathUtils, Quaternion } from 'three';
import { MeshDistortMaterial } from '@react-three/drei';
import { useSimStore, sharedPhysics } from '@/store/useSimStore';
import { getWaveHeight } from './Ocean';
import { getTerrainHeight } from '@/lib/terrain';
import { useBoatAudio } from './boat/useBoatAudio';
import { useBoatVisualDamage } from './boat/useBoatVisualDamage';
import { FixedStepRunner } from '@/sim/core/FixedStepRunner';
import { SixDofBody } from '@/sim/core/SixDofBody';
import { SeededRandom } from '@/sim/core/SeededRandom';
import { getVesselConfig } from '@/sim/vessels/VesselConfig';

interface OrbitControlsLike {
  target: Vector3;
  update: () => void;
}

function applyBuoyancyAtPoint(
  body: SixDofBody,
  pointWorld: Vector3,
  depth: number,
  submergedRatio: number,
  massShareKg: number,
  stiffness: number,
  damping: number,
  pointVelocity: Vector3,
  force: Vector3,
) {
  if (depth <= -0.8) return;

  body.velocityAtPoint(pointWorld, pointVelocity);
  const acceleration =
    Math.max(0, depth) * stiffness -
    pointVelocity.y * damping * submergedRatio;

  body.addForceAtPoint(
    force.set(0, acceleration * massShareKg, 0),
    pointWorld,
  );
}

export default function Boat() {
  const boatRef = useRef<Group>(null);
  const physicsBody = useRef(new SixDofBody());
  const fixedStepRunner = useRef(new FixedStepRunner());
  const simulationRandom = useRef(new SeededRandom(0xb0475eed));
  const previousPosition = useRef(new Vector3());
  const currentPosition = useRef(new Vector3());
  const previousQuaternion = useRef(new Quaternion());
  const currentQuaternion = useRef(new Quaternion());
  const lastSubmergedRatio = useRef(1);
  const engineRPM = useRef(1000); // Base idle RPM
  const rudderAngle = useRef(0);
  const trawlerEngineRef = useRef<Group>(null);
  const speedboatEngineLRef = useRef<Group>(null);
  const speedboatEngineRRef = useRef<Group>(null);
  const telemetryAccumulator = useRef(0);

  const scratch = useMemo(
    () => ({
      forwardDir: new Vector3(),
      rightDir: new Vector3(),
      fwdVec: new Vector3(),
      rgtVec: new Vector3(),
      cornerFR: new Vector3(),
      cornerFL: new Vector3(),
      cornerBR: new Vector3(),
      cornerBL: new Vector3(),
      windVelocity: new Vector3(),
      waterVelocity: new Vector3(),
      waterRelativeVelocity: new Vector3(),
      thrustForce: new Vector3(),
      dragForceForward: new Vector3(),
      dragForceRight: new Vector3(),
      apparentWind: new Vector3(),
      apparentWindDir: new Vector3(),
      windForce: new Vector3(),
      totalForce: new Vector3(),
      gravityForce: new Vector3(),
      buoyancyForce: new Vector3(),
      pointVelocity: new Vector3(),
      pointFR: new Vector3(),
      pointFL: new Vector3(),
      pointBR: new Vector3(),
      pointBL: new Vector3(),
      localPropeller: new Vector3(),
      localRudder: new Vector3(),
      localWind: new Vector3(),
      localPlaning: new Vector3(),
      worldPropeller: new Vector3(),
      worldRudder: new Vector3(),
      worldWind: new Vector3(),
      worldPlaning: new Vector3(),
      planingForce: new Vector3(),
      rudderForce: new Vector3(),
      terrainNormal: new Vector3(),
      boatForward: new Vector3(),
      boatRight: new Vector3(),
      boatPosition: new Vector3(),
      cameraTarget: new Vector3(),
      cameraDelta: new Vector3(),
      cameraOffset: new Vector3(),
      cameraDesired: new Vector3(),
      cameraLookAt: new Vector3(),
      pFR: { x: 0, y: 0, z: 0 },
      pFL: { x: 0, y: 0, z: 0 },
      pBR: { x: 0, y: 0, z: 0 },
      pBL: { x: 0, y: 0, z: 0 },
    }),
    [],
  );
  
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
  const audio = useBoatAudio();
  const updateVisualDamage = useBoatVisualDamage(boatRef, activeBoat);

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


  const stepSimulation = (dt: number, time: number) => {
    const body = physicsBody.current;
    previousPosition.current.copy(currentPosition.current);
    previousQuaternion.current.copy(currentQuaternion.current);
    sharedPhysics.simulationTime = time;

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

    const vessel = getVesselConfig(activeBoat);
    body.setMassProperties(
      vessel.massKg,
      vessel.principalInertiaKgM2,
      vessel.angularDampingPerSecond,
      vessel.centerOfMassLocal,
    );
    body.beginStep();
    body.addForce(
      scratch.gravityForce.set(0, -vessel.massKg * 9.81, 0),
    );

    const keyboardThrottle =
      (keys.w || keys.arrowup ? 1 : 0) -
      (keys.s || keys.arrowdown ? 1 : 0);
    const thrustRaw =
      keyboardThrottle !== 0
        ? keyboardThrottle
        : MathUtils.clamp(engineThrust, -1, 1);
    const steerRaw = (keys.a || keys.arrowleft ? 1 : 0) - (keys.d || keys.arrowright ? 1 : 0);

    // --- Vessel Dynamics Configuration ---
    const mass = vessel.massKg;
    const engineForceMax = vessel.engineForceMaxN;
    const dragCoeff = vessel.forwardDragCoefficient;
    const keelDragMultiplier = vessel.keelDragMultiplier;
    const windCoeff = vessel.windAreaCoefficient;
    const turnForceMax = vessel.turnForceMax;

    // --- Heading & Horizontal Vessel Axes ---
    const forwardDir = scratch.forwardDir
      .set(0, 0, -1)
      .applyQuaternion(body.quaternion);
    forwardDir.y = 0;
    if (forwardDir.lengthSq() > 1e-8) forwardDir.normalize();
    else forwardDir.set(0, 0, -1);

    const rightDir = scratch.rightDir
      .set(-1, 0, 0)
      .applyQuaternion(body.quaternion);
    rightDir.y = 0;
    if (rightDir.lengthSq() > 1e-8) rightDir.normalize();
    else rightDir.set(-1, 0, 0);

    // --- Sample Gerstner Wave for Multi-Point Buoyancy & Physics ---
    const pos = body.position;
    
    // Dimensions for the 4 sampling points (roughly matching the hull size)
    const halfL = vessel.halfLengthM;
    const halfW = vessel.halfWidthM;

    // Four hull points are transformed by the full quaternion, so their
    // different immersion depths generate real pitch and roll torques.
    const cornerFR = scratch.cornerFR.set(-halfW, 0, -halfL);
    const cornerFL = scratch.cornerFL.set(halfW, 0, -halfL);
    const cornerBR = scratch.cornerBR.set(-halfW, 0, halfL);
    const cornerBL = scratch.cornerBL.set(halfW, 0, halfL);
    const pointFR = body.localPointToWorld(cornerFR, scratch.pointFR);
    const pointFL = body.localPointToWorld(cornerFL, scratch.pointFL);
    const pointBR = body.localPointToWorld(cornerBR, scratch.pointBR);
    const pointBL = body.localPointToWorld(cornerBL, scratch.pointBL);

    // Sample the ocean shader's wave height at these 4 distinct world positions
    const pFR = getWaveHeight(
      pointFR.x,
      pointFR.z,
      time,
      scratch.pFR,
    );
    const pFL = getWaveHeight(
      pointFL.x,
      pointFL.z,
      time,
      scratch.pFL,
    );
    const pBR = getWaveHeight(
      pointBR.x,
      pointBR.z,
      time,
      scratch.pBR,
    );
    const pBL = getWaveHeight(
      pointBL.x,
      pointBL.z,
      time,
      scratch.pBL,
    );

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
    const baseDraft = vessel.baseDraftM;
    const draftOffset = baseDraft - hullDamageSinkOffset - winterDraftPenalty; 
    const depthFR = (pFR.y - draftOffset) - pointFR.y;
    const depthFL = (pFL.y - draftOffset) - pointFL.y;
    const depthBR = (pBR.y - draftOffset) - pointBR.y;
    const depthBL = (pBL.y - draftOffset) - pointBL.y;
    const submergedFR = MathUtils.clamp(depthFR * 1.5 + 0.5, 0, 1);
    const submergedFL = MathUtils.clamp(depthFL * 1.5 + 0.5, 0, 1);
    const submergedBR = MathUtils.clamp(depthBR * 1.5 + 0.5, 0, 1);
    const submergedBL = MathUtils.clamp(depthBL * 1.5 + 0.5, 0, 1);
    const submergedRatio =
      (submergedFR + submergedFL + submergedBR + submergedBL) / 4;

    const buoyancyStiffness =
      vessel.buoyancyStiffness * (1 - isWinter * 0.1);
    const massShareKg = mass * 0.25;
    applyBuoyancyAtPoint(
      body, pointFR, depthFR, submergedFR, massShareKg,
      buoyancyStiffness, vessel.verticalDamping,
      scratch.pointVelocity, scratch.buoyancyForce,
    );
    applyBuoyancyAtPoint(
      body, pointFL, depthFL, submergedFL, massShareKg,
      buoyancyStiffness, vessel.verticalDamping,
      scratch.pointVelocity, scratch.buoyancyForce,
    );
    applyBuoyancyAtPoint(
      body, pointBR, depthBR, submergedBR, massShareKg,
      buoyancyStiffness, vessel.verticalDamping,
      scratch.pointVelocity, scratch.buoyancyForce,
    );
    applyBuoyancyAtPoint(
      body, pointBL, depthBL, submergedBL, massShareKg,
      buoyancyStiffness, vessel.verticalDamping,
      scratch.pointVelocity, scratch.buoyancyForce,
    );
    
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

        audio.playSlam(slamSeverity);
    }
    
    // Store for next frame
    prevVelocityY.current = body.linearVelocity.y;
    prevSubmergedRatio.current = submergedRatio;

    // --- Environmental Velocities ---
    const windRad = MathUtils.degToRad(windDir);
    const windVelocity = scratch.windVelocity
      .set(Math.sin(windRad), 0, Math.cos(windRad))
      .multiplyScalar(windSpeed);
    
    const currentRad = MathUtils.degToRad(currentDir);
    const waterVelocity = scratch.waterVelocity
      .set(Math.sin(currentRad), 0, Math.cos(currentRad))
      .multiplyScalar(currentSpeed);

    // --- True Velocity Relative to Water ---
    const waterRelativeVelocity = scratch.waterRelativeVelocity
      .copy(body.linearVelocity)
      .sub(waterVelocity);
    const vRelForward = waterRelativeVelocity.dot(forwardDir);
    const vRelRight = waterRelativeVelocity.dot(rightDir);

    // --- Applied Horizontal Forces ---
    
    // PLANING HYDRODYNAMICS
    // Calculate how 'on plane' the hull is based on forward speed. 
    // Speedboats ride up on top of the water, massively reducing drag and lifting the bow.
    const speedRatio = Math.min(
      Math.hypot(body.linearVelocity.x, body.linearVelocity.z) /
        vessel.planingReferenceSpeedMps,
      1.0,
    );
    const planingFactor = speedRatio * speedRatio * submergedRatio;
    
    // Decrease forward drag up to 65% for the speedboat when planing. Displacement hulls (Trawler) don't plane well.
    const planingDragReduction = vessel.planingCapable
      ? MathUtils.lerp(1.0, 0.35, Math.pow(speedRatio, 2))
      : 1.0;
    const dynamicDragCoeff = dragCoeff * planingDragReduction;

    // --- ENGINE STRESS & RPM MODULATION ---
    let targetRPM =
      engineHealth.current <= 0
        ? 0
        : vessel.idleRpm + Math.abs(thrustRaw) * vessel.maxRpmDelta;
    
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
    const effectiveThrustRatio =
      engineHealth.current <= 0
        ? 0
        : (engineRPM.current - vessel.idleRpm) / vessel.maxRpmDelta;
    
    // --- PHASE 2: Engine Efficiency & Misfires ---
    const engineHealthEfficiency = MathUtils.clamp(engineHealth.current / 100, 0, 1);
    // Overheat causes temporary massive efficiency drop. At 100C, efficiency drops sharply.
    const overheatPenalty = engineTemperature.current > 90 ? Math.max(0.2, 1.0 - ((engineTemperature.current - 90) / 20)) : 1.0;
    
    let thrustMultiplier = MathUtils.clamp(submergedRatio * 1.5, 0, 1) * engineHealthEfficiency * overheatPenalty;
    
    // If the engine is severely damaged, use a time-based failure rate so
    // behavior is independent of render frame rate.
    if (engineHealth.current > 0 && engineHealth.current < 40) {
      const damageRatio = (40 - engineHealth.current) / 40;
      const misfireProbability = 1 - Math.exp(-damageRatio * 8 * dt);
      if (simulationRandom.current.next() < misfireProbability) {
        thrustMultiplier *= simulationRandom.current.next() * 0.2;
        engineRPM.current *= MathUtils.lerp(1, 0.4, dt * 10);
      }
    }

    const thrustDirection = thrustRaw < 0 ? -1 : 1;
    const thrustForce = scratch.thrustForce.copy(forwardDir).multiplyScalar(
      Math.abs(effectiveThrustRatio) *
        thrustDirection *
        engineForceMax *
        thrustMultiplier,
    );
    
    // 2. Hydrodynamic Drag (Water Resistance - Drops to zero if boat jumps)
    // --- PHASE 2: Hull Damage Penalty ---
    // A ruined hull creates tremendous parasitic drag, lowering top speed by up to 40%
    const hullDragPenalty = 1.0 + ((100 - hullHealth.current) / 100) * 0.8; 
    
    const dragForceForward = scratch.dragForceForward
      .copy(forwardDir)
      .multiplyScalar(
        -vRelForward *
          Math.abs(vRelForward) *
          dynamicDragCoeff *
          hullDragPenalty *
          0.2 -
          vRelForward * dynamicDragCoeff * hullDragPenalty,
      )
      .multiplyScalar(submergedRatio);
    const dragForceRight = scratch.dragForceRight
      .copy(rightDir)
      .multiplyScalar(
        -vRelRight * Math.abs(vRelRight) * dragCoeff * keelDragMultiplier,
      )
      .multiplyScalar(submergedRatio);

    // DIRECTIONAL WIND CATCHING
    const apparentWind = scratch.apparentWind
      .copy(windVelocity)
      .sub(body.linearVelocity);
    const apparentWindLengthSq = apparentWind.lengthSq();
    const apparentWindDir = scratch.apparentWindDir;
    if (apparentWindLengthSq > 1e-8) {
      apparentWindDir.copy(apparentWind).multiplyScalar(
        1 / Math.sqrt(apparentWindLengthSq),
      );
    } else {
      apparentWindDir.set(1, 0, 0);
    }
    
    const windDotForward = apparentWindDir.dot(forwardDir);
    const windDotRight = apparentWindDir.dot(rightDir);
    const sideAreaMultiplier = vessel.sideAreaMultiplier;
    const exposedProfileArea =
      Math.abs(windDotForward) +
      Math.abs(windDotRight) * sideAreaMultiplier;
    const trueWindCoeff = windCoeff * exposedProfileArea;
    const windForce = scratch.windForce.copy(apparentWind).multiplyScalar(
      Math.sqrt(apparentWindLengthSq) * trueWindCoeff,
    );

    body.addForce(
      scratch.totalForce.copy(dragForceForward).add(dragForceRight),
    );
    body.localPointToWorld(
      scratch.localPropeller.fromArray(vessel.propellerPointLocal),
      scratch.worldPropeller,
    );
    body.addForceAtPoint(thrustForce, scratch.worldPropeller);
    body.localPointToWorld(
      scratch.localWind.fromArray(vessel.windPointLocal),
      scratch.worldWind,
    );
    body.addForceAtPoint(windForce, scratch.worldWind);

    if (vessel.planingCapable && planingFactor > 0) {
      body.localPointToWorld(
        scratch.localPlaning.set(0, 0, -halfL * 0.75),
        scratch.worldPlaning,
      );
      body.addForceAtPoint(
        scratch.planingForce.set(
          0,
          mass * 9.81 * planingFactor * 0.35,
          0,
        ),
        scratch.worldPlaning,
      );
    }
    
    // --- PHASE 4.5: ICE FLOE FRICTION & DAMAGE ---
    // Instead of instantiating hundreds of meshes, we treat the procedural ice field as an actual physical entity
    if (currentIceFactor > 0.3 && submergedRatio > 0.1) {
        // The boat is crashing through the ice pack!
        // Ice induces extreme drag, capping momentum
        body.linearVelocity.multiplyScalar(Math.exp(-currentIceFactor * 6 * dt));
        
        const iceImpactSpeed = Math.hypot(body.linearVelocity.x, body.linearVelocity.z);
        if (iceImpactSpeed > 2.0 && Math.abs(thrustRaw) > 0.1) {
            // Apply continuous grinding damage based on speed and ice density
            hullHealth.current = Math.max(0, hullHealth.current - iceImpactSpeed * currentIceFactor * 0.2 * dt);
            
            // Random chaotic bumps representing ice chunk impacts
            body.linearVelocity.y += (simulationRandom.current.next() - 0.2) * currentIceFactor * iceImpactSpeed * 0.1;
            body.angularVelocity.x +=
              (simulationRandom.current.next() - 0.5) *
              currentIceFactor * iceImpactSpeed * 0.12;
            body.angularVelocity.z +=
              (simulationRandom.current.next() - 0.5) *
              currentIceFactor * iceImpactSpeed * 0.2;
            
        }
    }

    // --- ADVANCED RUDDER & PROP WASH SYSTEM ---
    // Rudder takes time to turn to target angle
    let targetRudder = steerRaw * vessel.maxRudderAngleRad;
    
    // --- PHASE 2: Rudder Damage Penalty ---
    // If rudder health is low, max turning angle drops significantly
    const rudderAuth = MathUtils.clamp(rudderHealth.current / 100, 0, 1);
    targetRudder *= rudderAuth;

    // At extreme damage, rudder wiggles and jitters from broken linkages
    if (rudderHealth.current > 0 && rudderHealth.current < 40) {
      targetRudder += (simulationRandom.current.next() - 0.5) * 0.15;
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
    const rudderForceMagnitude = turnTorque * mass * 0.7;
    body.localPointToWorld(
      scratch.localRudder.fromArray(vessel.rudderPointLocal),
      scratch.worldRudder,
    );
    body.addForceAtPoint(
      scratch.rudderForce
        .copy(rightDir)
        .multiplyScalar(-rudderForceMagnitude),
      scratch.worldRudder,
    );

    // --- PHASE 4: OBSTACLE COLLISION DETECTION ---
    const currentBoatPos = body.position;
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
            const dist = Math.max(Math.sqrt(distSq), 1e-4);
            const nx = dx / (dist || 1);
            const nz = dz / (dist || 1);
            
            // Resolve overlap rigidly
            const overlap = totalRad - dist;
            currentBoatPos.x += nx * overlap;
            currentBoatPos.z += nz * overlap;
            
            // Calculate impact severity based on relative velocity towards object
            const dotVelocity = -(body.linearVelocity.x * nx + body.linearVelocity.z * nz);
            
            if (dotVelocity > 0.5) { // Lowered impact threshold so buoys consistently bonk
                // Apply impulse response bounce (restitution = 0.5)
                body.linearVelocity.x += nx * dotVelocity * 1.5;
                body.linearVelocity.z += nz * dotVelocity * 1.5;
                
                // Add chaotic spin
                body.angularVelocity.y += (simulationRandom.current.next() - 0.5) * dotVelocity * 1.0;

                // Damage Hull! (Reduced damage from buoys)
                hullHealth.current = Math.max(0, hullHealth.current - dotVelocity * 1.5);

                audio.playImpact(dotVelocity, 'obstacle');
            }
        }
    }

    // Extreme physics safety clamp to prevent space launches (Flying Boat Bug fix)
    body.linearVelocity.x = MathUtils.clamp(body.linearVelocity.x, -80, 80);
    body.linearVelocity.y = MathUtils.clamp(body.linearVelocity.y, -40, 40);
    body.linearVelocity.z = MathUtils.clamp(body.linearVelocity.z, -80, 80);

    // --- Integrate the accumulated six-degree-of-freedom forces ---
    body.integrate(dt);

    forwardDir.set(0, 0, -1).applyQuaternion(body.quaternion);
    forwardDir.y = 0;
    if (forwardDir.lengthSq() > 1e-8) forwardDir.normalize();
    else forwardDir.set(0, 0, -1);

    // Update Shared Physics for Shaders (Ocean Wake)
    sharedPhysics.boatPos.copy(body.position);
    sharedPhysics.boatDir.copy(forwardDir);
    const speed2D = Math.hypot(body.linearVelocity.x, body.linearVelocity.z);
    sharedPhysics.boatSpeed = Math.min(speed2D, 35.0);

    // --- PHASE 3: TERRAIN COLLISION & BEACHING ---
    let terrainY = getTerrainHeight(body.position.x, body.position.z);
    
    // Dynamic Seabed Cratering: If the whirlpool is here, the water pushes the effective seabed down
    // This fixes the bug where the boat floats flat in mid-air over the vortex because the physical terrain was catching the hull.
    const distToW = Math.sqrt((body.position.x - sharedPhysics.whirlpoolPos.x)**2 + (body.position.z - sharedPhysics.whirlpoolPos.z)**2);
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
    const deepestDraft = vessel.deepestDraftM;
    
    // Check if the bottom of the hull is touching the procedural terrain
    if (body.position.y - deepestDraft < terrainY) {
        // We hit the ground!
        
        // 1. Calculate how hard we hit it vertically
        const penetrationY = terrainY - (body.position.y - deepestDraft);
        
        // 2. Resolve vertical penetration (prevent falling through the world)
        body.position.y = terrainY + deepestDraft;
        
        // Calculate terrain normal
        const d = 1.0;
        const ty1 = getTerrainHeight(body.position.x + d, body.position.z);
        const ty2 = getTerrainHeight(body.position.x - d, body.position.z);
        const ty3 = getTerrainHeight(body.position.x, body.position.z + d);
        const ty4 = getTerrainHeight(body.position.x, body.position.z - d);
        
        const normalX = ty2 - ty1;
        const normalZ = ty4 - ty3;
        const normalVector = scratch.terrainNormal.set(normalX, 2 * d, normalZ).normalize();
        
        // 3. Rigid Lateral Correction (Fixes clipping/sliding over steep cliffs)
        if (normalVector.y < 0.9) { 
           // Push the boat OUT horizontally away from the cliff
           const pushOut = penetrationY * (1.0 - normalVector.y) * 2.0;
           body.position.x += normalVector.x * pushOut;
           body.position.z += normalVector.z * pushOut;
        }

        // Dot product to see if we slammed into a wall
        const dotVelocity = body.linearVelocity.x * normalVector.x + body.linearVelocity.y * normalVector.y + body.linearVelocity.z * normalVector.z;
        const speedIntoWall = -dotVelocity;
        
        // 4. Velocity Projection (Stop forward momentum from completely burrowing into the wall)
        if (dotVelocity < 0) {
           body.linearVelocity.x -= normalVector.x * dotVelocity;
           // If we hit a steep wall, cancel the horizontal energy entirely. 
           // Do NOT convert horizontal momentum into vertical climbing momentum!
           body.linearVelocity.y = Math.min(body.linearVelocity.y, 0); 
           body.linearVelocity.z -= normalVector.z * dotVelocity;
        }

        // 5. Apply severe ground friction (beaching)
        const groundFriction = 3.0; 
        body.linearVelocity.x -= body.linearVelocity.x * groundFriction * dt;
        body.linearVelocity.z -= body.linearVelocity.z * groundFriction * dt;
        
        // Ensure bouncing upwards is stopped if we are pinned, stop downward velocity if falling
        if (body.linearVelocity.y > 0 && normalVector.y >= 0.9) {
            body.linearVelocity.y *= 0.5; // Dampen upward bouncing intelligently
        } else if (body.linearVelocity.y < 0) {
            body.linearVelocity.y = 0; // Prevent infinite gravity accumulation
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
             body.linearVelocity.x += normalVector.x * speedIntoWall * 0.8;
             body.linearVelocity.y += (normalVector.y > 0.9 ? normalVector.y * speedIntoWall * 0.5 : 0); 
             body.linearVelocity.z += normalVector.z * speedIntoWall * 0.8;
             
             // Add chaotic spin
              body.angularVelocity.y +=
                (simulationRandom.current.next() - 0.5) * speedIntoWall;
              audio.playImpact(severity, 'terrain');
        }
    }

    // --- PHASE 5: TORNADO / WATERSPOUT PHYSICS ---
    // Tornado and Whirlpool are now independent hazards wandering the sea.
    
    // 1. TORNADO (Atmospheric Pull)
    {
        const tx = sharedPhysics.tornadoPos.x;
        const tz = sharedPhysics.tornadoPos.z;
        const dx = tx - body.position.x;
        const dz = tz - body.position.z;
        const distSq = dx*dx + dz*dz;
        
        if (distSq < 14400) { // 120m range for Tornado
            const dist = Math.max(Math.sqrt(distSq), 1e-4);
            const pullFactor = Math.pow(1.0 - (dist / 120.0), 2.0) * 12.0; 
            const nx = dx / dist;
            const nz = dz / dist;
            
            body.linearVelocity.x += nx * pullFactor * dt;
            body.linearVelocity.z += nz * pullFactor * dt;
            
            if (dist < 40) {
                body.angularVelocity.y += (simulationRandom.current.next() - 0.5) * 5.0 * dt;
                body.linearVelocity.y += simulationRandom.current.next() * 6.0 * dt; 
                hullHealth.current = Math.max(0, hullHealth.current - 10.0 * dt);
            }
        }
    }

    // 2. WHIRLPOOL (Oceanic Sucking Vortex)
    {
        const wx = sharedPhysics.whirlpoolPos.x;
        const wz = sharedPhysics.whirlpoolPos.z;
        const dx = wx - body.position.x;
        const dz = wz - body.position.z;
        const distSq = dx*dx + dz*dz;
        
        if (distSq < 25600) { // 160m total influence range match visual shader
            const dist = Math.max(Math.sqrt(distSq), 1e-4);
            const radius = 160.0;
            const eyeWallRadius = 25.0; 
            
            // normalized distance factor (1.0 at center, 0.0 at edge) match smoothstep from shader
            const f = 1.0 - MathUtils.smoothstep(dist, 0, radius);
            const nx = dx / dist;
            const nz = dz / dist;
            
            // --- Pure Suction & Swirl (Mathematical Rankine Vortex) ---
            // Real whirlpools suck perfectly inwards and spiral
            const radialPull = Math.pow(f, 2.0) * 45.0; // Smooth curve pulling in
            body.linearVelocity.x += nx * radialPull * dt;
            body.linearVelocity.z += nz * radialPull * dt;
            
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
            body.linearVelocity.x += -nz * fSwirlTotal * dt;
            body.linearVelocity.z += nx * fSwirlTotal * dt;
            
            // --- Roll/Coriolis Effect ---
            // Tries to spin the boat to align perfectly with the swirl
            body.angularVelocity.y += (fSwirlTotal * 0.05) * dt;

            // --- The Eye Impact (Deep Plunge) ---
            if (dist < 40) {
                 const damageFactor = Math.pow(1.0 - dist/40.0, 2.0);
                 hullHealth.current = Math.max(0, hullHealth.current - 15.0 * dt * damageFactor);
                 engineHealth.current = Math.max(0, engineHealth.current - 5.0 * dt * damageFactor);
                 
                 // Structural shuddering near the terrifying eye
                 body.linearVelocity.x += (simulationRandom.current.next() - 0.5) * 10.0 * damageFactor;
                 body.linearVelocity.z += (simulationRandom.current.next() - 0.5) * 10.0 * damageFactor;
                 body.angularVelocity.y += (simulationRandom.current.next() - 0.5) * 5.0 * damageFactor;
                 
                 if (dist < 18) {
                    // Sucked directly down into the abyss
                    hullHealth.current = Math.max(0, hullHealth.current - 50.0 * dt);
                    body.linearVelocity.y -= 45.0 * dt; // Violent plunge into the void
                    
                    // Rip to exact center
                    body.linearVelocity.x += nx * 40.0 * dt;
                    body.linearVelocity.z += nz * 40.0 * dt;
                 }
            }
        }
    }

    // --- Update Telemetry UI & Health Degradation ---
    // 1 knot = 0.514444 m/s
    const speedKnots = speed2D / 0.514444;
    let headingDeg = MathUtils.radToDeg(body.rotation.y) % 360;
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

    // Publish telemetry at a deterministic 10 Hz, independent of render FPS.
    telemetryAccumulator.current += dt;
    if (telemetryAccumulator.current >= 0.1) {
      telemetryAccumulator.current %= 0.1;
      setTelemetry(
        speedKnots,
        headingDeg,
        hullHealth.current,
        engineHealth.current,
        engineTemperature.current,
        rudderHealth.current,
      );
    }

    sharedPhysics.boatPos.copy(body.position);
    sharedPhysics.boatQuaternion.copy(body.quaternion);
    sharedPhysics.boatLinearVelocity.copy(body.linearVelocity);
    sharedPhysics.boatAngularVelocity.copy(body.angularVelocity);
    sharedPhysics.boatSpeed = Math.min(
      Math.hypot(body.linearVelocity.x, body.linearVelocity.z),
      35,
    );
    sharedPhysics.submergedRatio = submergedRatio;

    lastSubmergedRatio.current = submergedRatio;
    currentPosition.current.copy(body.position);
    currentQuaternion.current.copy(body.quaternion);
  };

  useFrame((state, delta) => {
    const boat = boatRef.current;
    if (!boat) return;

    const stepResult = fixedStepRunner.current.advance(
      delta,
      (stepSeconds, simulationTimeSeconds) => {
        stepSimulation(stepSeconds, simulationTimeSeconds);
      },
    );

    sharedPhysics.renderTime =
      stepResult.simulationTimeSeconds +
      stepResult.alpha * fixedStepRunner.current.stepSeconds;
    sharedPhysics.fixedStepAlpha = stepResult.alpha;
    sharedPhysics.fixedStepCount = stepResult.steps;
    sharedPhysics.droppedSimulationTime = stepResult.droppedTimeSeconds;

    boat.position.lerpVectors(
      previousPosition.current,
      currentPosition.current,
      stepResult.alpha,
    );
    boat.quaternion.slerpQuaternions(
      previousQuaternion.current,
      currentQuaternion.current,
      stepResult.alpha,
    );

    const renderDelta = Math.min(delta, 0.1);
    const { windSpeed, windDir, activeBoat } = useSimStore.getState();
    const isSpeedboat = activeBoat === 'speedboat';
    const forwardDir = scratch.forwardDir
      .set(0, 0, -1)
      .applyQuaternion(boat.quaternion);
    forwardDir.y = 0;
    if (forwardDir.lengthSq() > 1e-8) {
      forwardDir.normalize();
    } else {
      forwardDir.set(0, 0, -1);
    }

    const renderWindRadians = MathUtils.degToRad(windDir);
    const apparentWind = scratch.apparentWind
      .set(
        Math.sin(renderWindRadians),
        0,
        Math.cos(renderWindRadians),
      )
      .multiplyScalar(windSpeed)
      .sub(physicsBody.current.linearVelocity);
    const speed2D = Math.hypot(physicsBody.current.linearVelocity.x, physicsBody.current.linearVelocity.z);
    const submergedRatio = lastSubmergedRatio.current;
    const pos = boat.position;

    // --- Update Flag (Apparent Wind) ---
    if (flagRef.current) {
      if (apparentWind.lengthSq() > 0.1) {
        // Flag points away from apparent wind
        const targetAngle = Math.atan2(apparentWind.x, apparentWind.z);
        // Local rotation needs to account for boat heading
        flagRef.current.rotation.y = targetAngle - boat.rotation.y;
      }
    }
    
    // --- Update Visual Rudders/Engines ---
    if (trawlerEngineRef.current) trawlerEngineRef.current.rotation.y = rudderAngle.current;
    if (speedboatEngineLRef.current) speedboatEngineLRef.current.rotation.y = rudderAngle.current;
    if (speedboatEngineRRef.current) speedboatEngineRRef.current.rotation.y = rudderAngle.current;

    // Damage visuals are cached and updated at a controlled rate.
    updateVisualDamage(
      hullHealth.current,
      engineHealth.current,
      renderDelta,
    );

    // Wake Particle system has been removed in favor of the shader-based Analytical Kelvin Wake
    
    // --- Camera Tracking (Orbit Controls) ---
    const boatPos = scratch.boatPosition.copy(boat.position);
    
    if (state.controls) {
      const controls = state.controls as unknown as OrbitControlsLike;
      const targetPos = scratch.cameraTarget.copy(boatPos);
      targetPos.y += 2;
      const deltaPos = scratch.cameraDelta
        .copy(targetPos)
        .sub(controls.target);
      controls.target.copy(targetPos);
      state.camera.position.add(deltaPos);
      controls.update();
    } else {
      const cameraOffset = scratch.cameraOffset
        .copy(forwardDir)
        .multiplyScalar(-15);
      cameraOffset.y += 8;
      const desiredCameraPos = scratch.cameraDesired
        .copy(boatPos)
        .add(cameraOffset);
      state.camera.position.lerp(desiredCameraPos, 0.1);
      const lookAt = scratch.cameraLookAt.copy(boatPos);
      lookAt.y += 2;
      state.camera.lookAt(lookAt);
    }

    audio.updateFrame(
      pos,
      forwardDir,
      state.camera.position,
      state.camera.quaternion,
      engineRPM.current,
      isSpeedboat,
      speed2D,
      submergedRatio,
    );
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
