import fs from 'node:fs';

const boatPath = 'components/Boat.tsx';
const oceanPath = 'components/Ocean.tsx';

let boat = fs.readFileSync(boatPath, 'utf8');
let ocean = fs.readFileSync(oceanPath, 'utf8');

function countLiteral(source, needle) {
  return source.split(needle).length - 1;
}

function replaceLiteralOnce(source, needle, replacement, label) {
  const count = countLiteral(source, needle);
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  return source.replace(needle, replacement);
}

function replaceLiteralCount(source, needle, replacement, expected, label) {
  const count = countLiteral(source, needle);
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  }
  return source.split(needle).join(replacement);
}

function replaceRegexOnce(source, expression, replacement, label) {
  const match = source.match(expression);
  if (!match) {
    throw new Error(`${label}: pattern not found`);
  }
  return source.replace(expression, replacement);
}

boat = replaceLiteralOnce(
  boat,
  "import { Vector3, Vector2, Group, MathUtils, InstancedMesh, Object3D, Color } from 'three';",
  "import { Vector3, Group, MathUtils } from 'three';",
  'trim Three.js imports',
);

boat = replaceLiteralOnce(
  boat,
  "import { getTerrainHeight } from '@/lib/terrain';",
  "import { getTerrainHeight } from '@/lib/terrain';\nimport { useBoatAudio } from './boat/useBoatAudio';\nimport { useBoatVisualDamage } from './boat/useBoatVisualDamage';",
  'add boat subsystem imports',
);

boat = replaceLiteralOnce(
  boat,
  "\nconst MAX_WAKE_PARTICLES = 600;\nconst _color = new Color();\n",
  '\n',
  'remove obsolete constants',
);

boat = replaceLiteralOnce(
  boat,
  "  const speedboatEngineRRef = useRef<Group>(null);\n  \n  // Phase 1: Health tracking refs",
  `  const speedboatEngineRRef = useRef<Group>(null);\n  const telemetryAccumulator = useRef(0);\n\n  const scratch = useMemo(\n    () => ({\n      forwardDir: new Vector3(),\n      rightDir: new Vector3(),\n      fwdVec: new Vector3(),\n      rgtVec: new Vector3(),\n      cornerFR: new Vector3(),\n      cornerFL: new Vector3(),\n      cornerBR: new Vector3(),\n      cornerBL: new Vector3(),\n      windVelocity: new Vector3(),\n      waterVelocity: new Vector3(),\n      waterRelativeVelocity: new Vector3(),\n      thrustForce: new Vector3(),\n      dragForceForward: new Vector3(),\n      dragForceRight: new Vector3(),\n      apparentWind: new Vector3(),\n      apparentWindDir: new Vector3(),\n      windForce: new Vector3(),\n      totalForce: new Vector3(),\n      terrainNormal: new Vector3(),\n      boatForward: new Vector3(),\n      boatRight: new Vector3(),\n      boatPosition: new Vector3(),\n      cameraTarget: new Vector3(),\n      cameraDelta: new Vector3(),\n      cameraOffset: new Vector3(),\n      cameraDesired: new Vector3(),\n      cameraLookAt: new Vector3(),\n      pFR: { x: 0, y: 0, z: 0 },\n      pFL: { x: 0, y: 0, z: 0 },\n      pBR: { x: 0, y: 0, z: 0 },\n      pBL: { x: 0, y: 0, z: 0 },\n    }),\n    [],\n  );\n  \n  // Phase 1: Health tracking refs`,
  'add frame scratch state',
);

boat = replaceLiteralOnce(
  boat,
  "  const instantRepairTrigger = useSimStore((state) => state.instantRepairTrigger);",
  "  const instantRepairTrigger = useSimStore((state) => state.instantRepairTrigger);\n  const audio = useBoatAudio();\n  const updateVisualDamage = useBoatVisualDamage(boatRef, activeBoat);",
  'initialize boat subsystems',
);

boat = replaceRegexOnce(
  boat,
  /\n  \/\/ --- AUDIO SYSTEM REFS ---[\s\S]*?\n  \}, \[\]\);\n\n  useFrame/,
  '\n\n  useFrame',
  'remove inline audio runtime',
);

boat = replaceLiteralOnce(
  boat,
  "    const thrustRaw = Math.max(0, engineThrust) + (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);",
  `    const keyboardThrottle =\n      (keys.w || keys.arrowup ? 1 : 0) -\n      (keys.s || keys.arrowdown ? 1 : 0);\n    const thrustRaw =\n      keyboardThrottle !== 0\n        ? keyboardThrottle\n        : MathUtils.clamp(engineThrust, -1, 1);`,
  'clamp throttle input',
);

boat = replaceLiteralOnce(
  boat,
  `    const heading = boatRef.current.rotation.y;\n    const forwardDir = new Vector3(-Math.sin(heading), 0, -Math.cos(heading)).normalize();\n    const rightDir = new Vector3(forwardDir.z, 0, -forwardDir.x).normalize();`,
  `    const heading = boatRef.current.rotation.y;\n    const forwardDir = scratch.forwardDir.set(\n      -Math.sin(heading),\n      0,\n      -Math.cos(heading),\n    );\n    const rightDir = scratch.rightDir.set(\n      forwardDir.z,\n      0,\n      -forwardDir.x,\n    );`,
  'reuse heading vectors',
);

boat = replaceLiteralOnce(
  boat,
  `    const fwdVec = forwardDir.clone().multiplyScalar(halfL);\n    const rgtVec = rightDir.clone().multiplyScalar(halfW);\n\n    const cornerFR = fwdVec.clone().add(rgtVec);\n    const cornerFL = fwdVec.clone().sub(rgtVec);\n    const cornerBR = fwdVec.clone().negate().add(rgtVec);\n    const cornerBL = fwdVec.clone().negate().sub(rgtVec);`,
  `    const fwdVec = scratch.fwdVec.copy(forwardDir).multiplyScalar(halfL);\n    const rgtVec = scratch.rgtVec.copy(rightDir).multiplyScalar(halfW);\n\n    const cornerFR = scratch.cornerFR.copy(fwdVec).add(rgtVec);\n    const cornerFL = scratch.cornerFL.copy(fwdVec).sub(rgtVec);\n    const cornerBR = scratch.cornerBR.copy(fwdVec).multiplyScalar(-1).add(rgtVec);\n    const cornerBL = scratch.cornerBL.copy(fwdVec).multiplyScalar(-1).sub(rgtVec);`,
  'reuse buoyancy corner vectors',
);

boat = replaceLiteralOnce(
  boat,
  `    const pFR = getWaveHeight(pos.x + cornerFR.x, pos.z + cornerFR.z, time);\n    const pFL = getWaveHeight(pos.x + cornerFL.x, pos.z + cornerFL.z, time);\n    const pBR = getWaveHeight(pos.x + cornerBR.x, pos.z + cornerBR.z, time);\n    const pBL = getWaveHeight(pos.x + cornerBL.x, pos.z + cornerBL.z, time);`,
  `    const pFR = getWaveHeight(\n      pos.x + cornerFR.x,\n      pos.z + cornerFR.z,\n      time,\n      scratch.pFR,\n    );\n    const pFL = getWaveHeight(\n      pos.x + cornerFL.x,\n      pos.z + cornerFL.z,\n      time,\n      scratch.pFL,\n    );\n    const pBR = getWaveHeight(\n      pos.x + cornerBR.x,\n      pos.z + cornerBR.z,\n      time,\n      scratch.pBR,\n    );\n    const pBL = getWaveHeight(\n      pos.x + cornerBL.x,\n      pos.z + cornerBL.z,\n      time,\n      scratch.pBL,\n    );`,
  'reuse wave sample objects',
);

boat = replaceLiteralOnce(
  boat,
  `        if (waveGainRef.current && audioCtxRef.current) {\n          // Temporarily peak the wave crashing noise to simulate a hull slam\n          waveGainRef.current.gain.setTargetAtTime(Math.min(3.0, 1.0 + slamSeverity * 0.4), audioCtxRef.current.currentTime, 0.02);\n          waveGainRef.current.gain.setTargetAtTime(0.0, audioCtxRef.current.currentTime + 0.6, 0.5);\n        }`,
  `        audio.playSlam(slamSeverity);`,
  'delegate slam audio',
);

boat = replaceLiteralOnce(
  boat,
  `    const windRad = MathUtils.degToRad(windDir);\n    const windVelocity = new Vector3(Math.sin(windRad), 0, Math.cos(windRad)).multiplyScalar(windSpeed);\n    \n    const currentRad = MathUtils.degToRad(currentDir);\n    const waterVelocity = new Vector3(Math.sin(currentRad), 0, Math.cos(currentRad)).multiplyScalar(currentSpeed);\n\n    // --- True Velocity Relative to Water ---\n    const waterRelativeVelocity = velocity.current.clone().sub(waterVelocity);`,
  `    const windRad = MathUtils.degToRad(windDir);\n    const windVelocity = scratch.windVelocity\n      .set(Math.sin(windRad), 0, Math.cos(windRad))\n      .multiplyScalar(windSpeed);\n    \n    const currentRad = MathUtils.degToRad(currentDir);\n    const waterVelocity = scratch.waterVelocity\n      .set(Math.sin(currentRad), 0, Math.cos(currentRad))\n      .multiplyScalar(currentSpeed);\n\n    // --- True Velocity Relative to Water ---\n    const waterRelativeVelocity = scratch.waterRelativeVelocity\n      .copy(velocity.current)\n      .sub(waterVelocity);`,
  'reuse environmental vectors',
);

boat = replaceLiteralOnce(
  boat,
  "    const speedRatio = Math.min(new Vector2(velocity.current.x, velocity.current.z).length() / 15.0, 1.0); ",
  "    const speedRatio = Math.min(Math.hypot(velocity.current.x, velocity.current.z) / 15.0, 1.0); ",
  'remove planing Vector2 allocation',
);

boat = replaceLiteralOnce(
  boat,
  '    let engineHealthEfficiency = Math.max(0.1, engineHealth.current / 100);',
  '    const engineHealthEfficiency = MathUtils.clamp(engineHealth.current / 100, 0, 1);',
  'stop dead-engine thrust',
);

boat = replaceRegexOnce(
  boat,
  /    \/\/ If engine is severely damaged, simulate sputtering\/stalling\n    if \(engineHealth\.current < 40\) \{[\s\S]*?\n    \}\n\n    const thrustDirection/,
  `    // If the engine is severely damaged, use a time-based failure rate so\n    // behavior is independent of render frame rate.\n    if (engineHealth.current > 0 && engineHealth.current < 40) {\n      const damageRatio = (40 - engineHealth.current) / 40;\n      const misfireProbability = 1 - Math.exp(-damageRatio * 8 * dt);\n      if (Math.random() < misfireProbability) {\n        thrustMultiplier *= Math.random() * 0.2;\n        engineRPM.current *= MathUtils.lerp(1, 0.4, dt * 10);\n      }\n    }\n\n    const thrustDirection`,
  'make misfires frame-rate independent',
);

boat = replaceRegexOnce(
  boat,
  /    const thrustForce = forwardDir\.clone\(\)\.multiplyScalar\([\s\S]*?    velocity\.current\.z \+= acceleration\.z \* dt;/,
  `    const thrustForce = scratch.thrustForce.copy(forwardDir).multiplyScalar(\n      Math.abs(effectiveThrustRatio) *\n        thrustDirection *\n        engineForceMax *\n        thrustMultiplier,\n    );\n    \n    // 2. Hydrodynamic Drag (Water Resistance - Drops to zero if boat jumps)\n    // --- PHASE 2: Hull Damage Penalty ---\n    // A ruined hull creates tremendous parasitic drag, lowering top speed by up to 40%\n    const hullDragPenalty = 1.0 + ((100 - hullHealth.current) / 100) * 0.8; \n    \n    const dragForceForward = scratch.dragForceForward\n      .copy(forwardDir)\n      .multiplyScalar(\n        -vRelForward *\n          Math.abs(vRelForward) *\n          dynamicDragCoeff *\n          hullDragPenalty *\n          0.2 -\n          vRelForward * dynamicDragCoeff * hullDragPenalty,\n      )\n      .multiplyScalar(submergedRatio);\n    const dragForceRight = scratch.dragForceRight\n      .copy(rightDir)\n      .multiplyScalar(\n        -vRelRight * Math.abs(vRelRight) * dragCoeff * keelDragMultiplier,\n      )\n      .multiplyScalar(submergedRatio);\n\n    // DIRECTIONAL WIND CATCHING\n    const apparentWind = scratch.apparentWind\n      .copy(windVelocity)\n      .sub(velocity.current);\n    const apparentWindLengthSq = apparentWind.lengthSq();\n    const apparentWindDir = scratch.apparentWindDir;\n    if (apparentWindLengthSq > 1e-8) {\n      apparentWindDir.copy(apparentWind).multiplyScalar(\n        1 / Math.sqrt(apparentWindLengthSq),\n      );\n    } else {\n      apparentWindDir.set(1, 0, 0);\n    }\n    \n    const windDotForward = apparentWindDir.dot(forwardDir);\n    const windDotRight = apparentWindDir.dot(rightDir);\n    const sideAreaMultiplier = isSpeedboat ? 2.0 : 4.5;\n    const exposedProfileArea =\n      Math.abs(windDotForward) +\n      Math.abs(windDotRight) * sideAreaMultiplier;\n    const trueWindCoeff = windCoeff * exposedProfileArea;\n    const windForce = scratch.windForce.copy(apparentWind).multiplyScalar(\n      Math.sqrt(apparentWindLengthSq) * trueWindCoeff,\n    );\n\n    const totalForce = scratch.totalForce\n      .copy(thrustForce)\n      .add(dragForceForward)\n      .add(dragForceRight)\n      .add(windForce);\n    velocity.current.x += (totalForce.x / mass) * dt;\n    velocity.current.z += (totalForce.z / mass) * dt;`,
  'reuse force vectors',
);

boat = replaceLiteralOnce(
  boat,
  '        const currentSpeed = velocity.current.length();\n        if (currentSpeed > 2.0 && Math.abs(thrustRaw) > 0.1) {',
  '        const iceImpactSpeed = Math.hypot(velocity.current.x, velocity.current.z);\n        if (iceImpactSpeed > 2.0 && Math.abs(thrustRaw) > 0.1) {',
  'use horizontal ice impact speed',
);

boat = replaceLiteralOnce(
  boat,
  'currentSpeed * currentIceFactor',
  'iceImpactSpeed * currentIceFactor',
  'rename ice damage speed use',
);

boat = replaceLiteralCount(
  boat,
  'currentIceFactor * currentSpeed',
  'currentIceFactor * iceImpactSpeed',
  2,
  'rename ice impulse speed uses',
);

boat = replaceRegexOnce(
  boat,
  /\n            \/\/ Play grinding hit sound sparingly\n            if \(audioCtxRef\.current && pannerRef\.current\) \{\n                \/\/ Ensure audio context is respected without massive spam\n            \}/,
  '',
  'remove empty ice audio block',
);

boat = replaceLiteralOnce(
  boat,
  '    const rudderAuth = Math.max(0.1, rudderHealth.current / 100);',
  '    const rudderAuth = MathUtils.clamp(rudderHealth.current / 100, 0, 1);',
  'respect destroyed rudder',
);

boat = replaceRegexOnce(
  boat,
  /                \/\/ Play Hit Sound\n                if \(audioCtxRef\.current && pannerRef\.current\) \{[\s\S]*?\n                \}/,
  `                audio.playImpact(dotVelocity, 'obstacle');`,
  'delegate obstacle audio',
);

boat = replaceLiteralOnce(
  boat,
  '    boatRef.current.position.add(velocity.current.clone().multiplyScalar(dt));',
  `    boatRef.current.position.x += velocity.current.x * dt;\n    boatRef.current.position.y += velocity.current.y * dt;\n    boatRef.current.position.z += velocity.current.z * dt;`,
  'apply velocity without allocation',
);

boat = replaceLiteralOnce(
  boat,
  '    const speed2D = new Vector2(velocity.current.x, velocity.current.z).length();',
  '    const speed2D = Math.hypot(velocity.current.x, velocity.current.z);',
  'remove telemetry Vector2 allocation',
);

boat = replaceLiteralOnce(
  boat,
  '        const normalVector = new Vector3(normalX, 2*d, normalZ).normalize();',
  '        const normalVector = scratch.terrainNormal.set(normalX, 2 * d, normalZ).normalize();',
  'reuse terrain normal',
);

boat = replaceRegexOnce(
  boat,
  /              \/\/ Play crash sound\n              if \(audioCtxRef\.current && pannerRef\.current\) \{[\s\S]*?\n              \}/,
  `              audio.playImpact(severity, 'terrain');`,
  'delegate terrain audio',
);

boat = replaceLiteralCount(
  boat,
  'const dist = Math.sqrt(distSq);',
  'const dist = Math.max(Math.sqrt(distSq), 1e-4);',
  3,
  'guard normalized hazard and collision directions',
);

boat = replaceLiteralOnce(
  boat,
  '                 engineHealth.current -= 5.0 * dt * damageFactor;',
  '                 engineHealth.current = Math.max(0, engineHealth.current - 5.0 * dt * damageFactor);',
  'clamp whirlpool engine damage',
);

boat = replaceLiteralCount(
  boat,
  'const wDist = Math.sqrt(wDistSq);',
  'const wDist = Math.max(Math.sqrt(wDistSq), 1e-4);',
  2,
  'guard whirlpool orientation normalization',
);

boat = replaceLiteralOnce(
  boat,
  '        const boatForward = new Vector3(0, 0, -1).applyQuaternion(boatRef.current.quaternion);',
  '        const boatForward = scratch.boatForward.set(0, 0, -1).applyQuaternion(boatRef.current.quaternion);',
  'reuse whirlpool forward vector',
);

boat = replaceLiteralOnce(
  boat,
  '        const boatRight = new Vector3(1, 0, 0).applyQuaternion(boatRef.current.quaternion);',
  '        const boatRight = scratch.boatRight.set(1, 0, 0).applyQuaternion(boatRef.current.quaternion);',
  'reuse whirlpool right vector',
);

boat = replaceLiteralOnce(
  boat,
  '    const speedKnots = velocity.current.length() / 0.514444;',
  '    const speedKnots = speed2D / 0.514444;',
  'report horizontal speed over ground',
);

boat = replaceRegexOnce(
  boat,
  /    \/\/ throttle updates to UI ~10 times a sec\n    if \(Math\.random\(\) < 0\.2\) \{[\s\S]*?\n    \}/,
  `    // Publish telemetry at a deterministic 10 Hz, independent of render FPS.\n    telemetryAccumulator.current += dt;\n    if (telemetryAccumulator.current >= 0.1) {\n      telemetryAccumulator.current %= 0.1;\n      setTelemetry(\n        speedKnots,\n        headingDeg,\n        hullHealth.current,\n        engineHealth.current,\n        engineTemperature.current,\n        rudderHealth.current,\n      );\n    }`,
  'make telemetry deterministic',
);

boat = replaceRegexOnce(
  boat,
  /    \/\/ --- Update Dynamic Damage Visuals ---[\s\S]*?\n    \/\/ Wake Particle system has been removed/,
  `    // Damage visuals are cached and updated at a controlled rate.\n    updateVisualDamage(hullHealth.current, engineHealth.current, dt);\n\n    // Wake Particle system has been removed`,
  'delegate visual damage updates',
);

boat = replaceRegexOnce(
  boat,
  /    \/\/ --- Camera Tracking \(Orbit Controls\) ---[\s\S]*?\n    \/\/ --- 3D AUDIO POSITIONAL UPDATES ---[\s\S]*?\n    \}/,
  `    // --- Camera Tracking (Orbit Controls) ---\n    const boatPos = scratch.boatPosition.copy(boatRef.current.position);\n    \n    if (state.controls) {\n      const controls = state.controls as any;\n      const targetPos = scratch.cameraTarget.copy(boatPos);\n      targetPos.y += 2;\n      const deltaPos = scratch.cameraDelta\n        .copy(targetPos)\n        .sub(controls.target);\n      controls.target.copy(targetPos);\n      state.camera.position.add(deltaPos);\n      controls.update();\n    } else {\n      const cameraOffset = scratch.cameraOffset\n        .copy(forwardDir)\n        .multiplyScalar(-15);\n      cameraOffset.y += 8;\n      const desiredCameraPos = scratch.cameraDesired\n        .copy(boatPos)\n        .add(cameraOffset);\n      state.camera.position.lerp(desiredCameraPos, 0.1);\n      const lookAt = scratch.cameraLookAt.copy(boatPos);\n      lookAt.y += 2;\n      state.camera.lookAt(lookAt);\n    }\n\n    audio.updateFrame(\n      pos,\n      forwardDir,\n      state.camera.position,\n      state.camera.quaternion,\n      engineRPM.current,\n      isSpeedboat,\n      speed2D,\n      submergedRatio,\n    );`,
  'reuse camera vectors and delegate audio updates',
);

// Allow callers in hot loops to provide a reusable wave sample object.
ocean = replaceLiteralOnce(
  ocean,
  'export const getWaveHeight = (x: number, z: number, time: number) => {',
  `export interface WaveHeightSample {\n  x: number;\n  y: number;\n  z: number;\n}\n\nexport const getWaveHeight = (\n  x: number,\n  z: number,\n  time: number,\n  target?: WaveHeightSample,\n): WaveHeightSample => {`,
  'add reusable wave sample target',
);

ocean = replaceLiteralOnce(
  ocean,
  '  return { x, y: finalHeight + OCEAN_HEIGHT, z };',
  `  const sample = target ?? { x: 0, y: 0, z: 0 };\n  sample.x = x;\n  sample.y = finalHeight + OCEAN_HEIGHT;\n  sample.z = z;\n  return sample;`,
  'reuse wave sample result',
);

fs.writeFileSync(boatPath, boat);
fs.writeFileSync(oceanPath, ocean);
console.log('Applied Phase 1 boat frame-loop and subsystem refactor.');
