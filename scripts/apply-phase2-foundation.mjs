import fs from 'node:fs';

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) {
    throw new Error(`${label}: source text not found`);
  }
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${label}: source text matched more than once`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}

function assertIncludes(source, search, label) {
  if (!source.includes(search)) {
    throw new Error(`${label}: expected text not found`);
  }
}

const boatPath = 'components/Boat.tsx';
let boat = fs.readFileSync(boatPath, 'utf8');

boat = replaceOnce(
  boat,
  "import { Vector3, Group, MathUtils } from 'three';",
  "import { Vector3, Group, MathUtils, Object3D, Quaternion } from 'three';",
  'extend Three.js imports',
);
boat = replaceOnce(
  boat,
  "import { useBoatVisualDamage } from './boat/useBoatVisualDamage';\n",
  "import { useBoatVisualDamage } from './boat/useBoatVisualDamage';\nimport { FixedStepRunner } from '@/sim/core/FixedStepRunner';\nimport { SeededRandom } from '@/sim/core/SeededRandom';\nimport { getVesselConfig } from '@/sim/vessels/VesselConfig';\n",
  'add simulation foundation imports',
);
boat = replaceOnce(
  boat,
  "  const boatRef = useRef<Group>(null);\n",
  "  const boatRef = useRef<Group>(null);\n  const physicsBody = useRef(new Object3D());\n  const fixedStepRunner = useRef(new FixedStepRunner());\n  const simulationRandom = useRef(new SeededRandom(0xb0475eed));\n  const previousPosition = useRef(new Vector3());\n  const currentPosition = useRef(new Vector3());\n  const previousQuaternion = useRef(new Quaternion());\n  const currentQuaternion = useRef(new Quaternion());\n  const lastSubmergedRatio = useRef(1);\n",
  'add fixed-step state',
);

const frameStart = `  useFrame((state, delta) => {\n    // Clamp delta to prevent physics explosion after tab inactivity\n    const dt = Math.min(delta, 0.1);\n    if (!boatRef.current) return;\n\n`;
const renderMarker = '    // --- Update Flag (Apparent Wind) ---\n';
const frameEnd = '  });\n\n  return (';

const frameStartIndex = boat.indexOf(frameStart);
const renderMarkerIndex = boat.indexOf(renderMarker, frameStartIndex);
const frameEndIndex = boat.indexOf(frameEnd, renderMarkerIndex);
if (frameStartIndex < 0 || renderMarkerIndex < 0 || frameEndIndex < 0) {
  throw new Error('Unable to split Boat useFrame into simulation and rendering sections.');
}

const prefix = boat.slice(0, frameStartIndex);
let physics = boat.slice(frameStartIndex + frameStart.length, renderMarkerIndex);
let rendering = boat.slice(renderMarkerIndex, frameEndIndex);
const suffix = boat.slice(frameEndIndex + frameEnd.length);

physics = replaceOnce(
  physics,
  "    const isSpeedboat = activeBoat === 'speedboat';\n",
  "    const vessel = getVesselConfig(activeBoat);\n    const isSpeedboat = vessel.type === 'speedboat';\n",
  'select vessel config',
);
physics = replaceOnce(
  physics,
  `    // --- Physical Constants ---\n    const mass = isSpeedboat ? 800 : 1500; // kg\n    const engineForceMax = isSpeedboat ? 25000 : 12000; // N\n    const dragCoeff = isSpeedboat ? 180 : 250;\n    const keelDragMultiplier = isSpeedboat ? 3 : 6; // Resists lateral (sideways) movement\n    const windCoeff = isSpeedboat ? 5 : 15; // Sail/Profile area multiplier\n    const turnForceMax = isSpeedboat ? 3.5 : 1.5;\n    const angularDragCoeff = isSpeedboat ? 3 : 4;\n`,
  `    // --- Vessel Dynamics Configuration ---\n    const mass = vessel.massKg;\n    const engineForceMax = vessel.engineForceMaxN;\n    const dragCoeff = vessel.forwardDragCoefficient;\n    const keelDragMultiplier = vessel.keelDragMultiplier;\n    const windCoeff = vessel.windAreaCoefficient;\n    const turnForceMax = vessel.turnForceMax;\n    const angularDragCoeff = vessel.angularDragCoefficient;\n`,
  'replace inline vessel constants',
);
physics = replaceOnce(
  physics,
  `    const halfL = isSpeedboat ? 1.6 : 2.0; // Distance to bow/stern\n    const halfW = isSpeedboat ? 0.6 : 1.0; // Distance to port/starboard\n`,
  `    const halfL = vessel.halfLengthM;\n    const halfW = vessel.halfWidthM;\n`,
  'replace hull sample dimensions',
);
physics = replaceOnce(
  physics,
  '    const time = state.clock.elapsedTime;\n',
  '',
  'remove render-clock physics time',
);
physics = replaceOnce(
  physics,
  '    const baseDraft = isSpeedboat ? -0.4 : -0.8;\n',
  '    const baseDraft = vessel.baseDraftM;\n',
  'replace base draft',
);
physics = replaceOnce(
  physics,
  '      const buoyancyStiffness = (isSpeedboat ? 40.0 : 35.0) * (1.0 - isWinter * 0.1); \n      const waterVerticalDamping = isSpeedboat ? 6.0 : 8.0; // Slows down vertical movement\n',
  '      const buoyancyStiffness = vessel.buoyancyStiffness * (1.0 - isWinter * 0.1);\n      const waterVerticalDamping = vessel.verticalDamping;\n',
  'replace buoyancy response constants',
);
physics = replaceOnce(
  physics,
  '    const speedRatio = Math.min(Math.hypot(velocity.current.x, velocity.current.z) / 15.0, 1.0); \n',
  '    const speedRatio = Math.min(\n      Math.hypot(velocity.current.x, velocity.current.z) /\n        vessel.planingReferenceSpeedMps,\n      1.0,\n    );\n',
  'replace planing reference speed',
);
physics = replaceOnce(
  physics,
  '    const planingDragReduction = isSpeedboat ? MathUtils.lerp(1.0, 0.35, Math.pow(speedRatio, 2)) : 1.0;\n',
  '    const planingDragReduction = vessel.planingCapable\n      ? MathUtils.lerp(1.0, 0.35, Math.pow(speedRatio, 2))\n      : 1.0;\n',
  'replace planing capability branch',
);
physics = replaceOnce(
  physics,
  `    let targetRPM =\n      engineHealth.current <= 0\n        ? 0\n        : 1000 + Math.abs(thrustRaw) * (isSpeedboat ? 6000 : 3500);\n`,
  `    let targetRPM =\n      engineHealth.current <= 0\n        ? 0\n        : vessel.idleRpm + Math.abs(thrustRaw) * vessel.maxRpmDelta;\n`,
  'replace target RPM constants',
);
physics = replaceOnce(
  physics,
  `    const effectiveThrustRatio =\n      engineHealth.current <= 0\n        ? 0\n        : (engineRPM.current - 1000) / (isSpeedboat ? 6000 : 3500); \n`,
  `    const effectiveThrustRatio =\n      engineHealth.current <= 0\n        ? 0\n        : (engineRPM.current - vessel.idleRpm) / vessel.maxRpmDelta;\n`,
  'replace effective RPM constants',
);
physics = replaceOnce(
  physics,
  '    const sideAreaMultiplier = isSpeedboat ? 2.0 : 4.5;\n',
  '    const sideAreaMultiplier = vessel.sideAreaMultiplier;\n',
  'replace side profile coefficient',
);
physics = replaceOnce(
  physics,
  '    let targetRudder = steerRaw * (isSpeedboat ? 0.7 : 0.8); // Max rudder angle (radians)\n',
  '    let targetRudder = steerRaw * vessel.maxRudderAngleRad;\n',
  'replace rudder angle config',
);
physics = replaceOnce(
  physics,
  '    const deepestDraft = isSpeedboat ? 0.3 : 0.6;\n',
  '    const deepestDraft = vessel.deepestDraftM;\n',
  'replace deepest draft',
);
physics = replaceOnce(
  physics,
  '    const rotSpeed = submergedRatio > 0.1 ? (isSpeedboat ? 5.0 : 3.0) : 1.0;\n',
  '    const rotSpeed = submergedRatio > 0.1 ? vessel.rotationResponse : 1.0;\n',
  'replace rotation response',
);
physics = replaceOnce(
  physics,
  '        velocity.current.multiplyScalar(1.0 - (currentIceFactor * 0.1 * dt * 60)); // Framerate independent drag\n',
  '        velocity.current.multiplyScalar(Math.exp(-currentIceFactor * 6 * dt));\n',
  'make ice drag numerically stable',
);

physics = physics.replaceAll('boatRef.current', 'body');
physics = physics.replaceAll('Math.random()', 'simulationRandom.current.next()');

assertIncludes(physics, 'setTelemetry(', 'telemetry remains in fixed simulation');
physics = `${physics}    lastSubmergedRatio.current = submergedRatio;\n    currentPosition.current.copy(body.position);\n    currentQuaternion.current.copy(body.quaternion);\n`;

rendering = rendering.replaceAll('boatRef.current', 'boat');
rendering = rendering.replace(
  'updateVisualDamage(hullHealth.current, engineHealth.current, dt);',
  'updateVisualDamage(\n      hullHealth.current,\n      engineHealth.current,\n      renderDelta,\n    );',
);

const fixedFrame = `  const stepSimulation = (dt: number, time: number) => {\n    const body = physicsBody.current;\n    previousPosition.current.copy(currentPosition.current);\n    previousQuaternion.current.copy(currentQuaternion.current);\n    sharedPhysics.simulationTime = time;\n\n${physics}  };\n\n  useFrame((state, delta) => {\n    const boat = boatRef.current;\n    if (!boat) return;\n\n    const stepResult = fixedStepRunner.current.advance(\n      delta,\n      (stepSeconds, simulationTimeSeconds) => {\n        stepSimulation(stepSeconds, simulationTimeSeconds);\n      },\n    );\n\n    sharedPhysics.renderTime =\n      stepResult.simulationTimeSeconds +\n      stepResult.alpha * fixedStepRunner.current.stepSeconds;\n    sharedPhysics.fixedStepAlpha = stepResult.alpha;\n    sharedPhysics.fixedStepCount = stepResult.steps;\n    sharedPhysics.droppedSimulationTime = stepResult.droppedTimeSeconds;\n\n    boat.position.lerpVectors(\n      previousPosition.current,\n      currentPosition.current,\n      stepResult.alpha,\n    );\n    boat.quaternion.slerpQuaternions(\n      previousQuaternion.current,\n      currentQuaternion.current,\n      stepResult.alpha,\n    );\n\n    const renderDelta = Math.min(delta, 0.1);\n    const { windSpeed, windDir, activeBoat } = useSimStore.getState();\n    const isSpeedboat = activeBoat === 'speedboat';\n    const forwardDir = scratch.forwardDir\n      .set(0, 0, -1)\n      .applyQuaternion(boat.quaternion);\n    forwardDir.y = 0;\n    if (forwardDir.lengthSq() > 1e-8) {\n      forwardDir.normalize();\n    } else {\n      forwardDir.set(0, 0, -1);\n    }\n\n    const renderWindRadians = MathUtils.degToRad(windDir);\n    const apparentWind = scratch.apparentWind\n      .set(\n        Math.sin(renderWindRadians),\n        0,\n        Math.cos(renderWindRadians),\n      )\n      .multiplyScalar(windSpeed)\n      .sub(velocity.current);\n    const speed2D = Math.hypot(velocity.current.x, velocity.current.z);\n    const submergedRatio = lastSubmergedRatio.current;\n    const pos = boat.position;\n\n${rendering}  });\n\n  return (`;

boat = `${prefix}${fixedFrame}${suffix}`;
fs.writeFileSync(boatPath, boat);

const storePath = 'store/useSimStore.ts';
let store = fs.readFileSync(storePath, 'utf8');
store = replaceOnce(
  store,
  '  boatSpeed: 0,\n  lightningFlash: 0,\n',
  '  boatSpeed: 0,\n  simulationTime: 0,\n  renderTime: 0,\n  fixedStepAlpha: 0,\n  fixedStepCount: 0,\n  droppedSimulationTime: 0,\n  lightningFlash: 0,\n',
  'add shared fixed-step telemetry',
);
fs.writeFileSync(storePath, store);

const oceanPath = 'components/Ocean.tsx';
let ocean = fs.readFileSync(oceanPath, 'utf8');
ocean = replaceOnce(
  ocean,
  '    uniforms.uTime.value = state.clock.elapsedTime;\n',
  '    uniforms.uTime.value = sharedPhysics.renderTime;\n',
  'sync ocean render time',
);
fs.writeFileSync(oceanPath, ocean);

const buoysPath = 'components/Buoys.tsx';
let buoys = fs.readFileSync(buoysPath, 'utf8');
buoys = replaceOnce(
  buoys,
  '    const elapsed = state.clock.elapsedTime;\n',
  '    const elapsed = sharedPhysics.renderTime || state.clock.elapsedTime;\n',
  'sync buoy render time',
);
fs.writeFileSync(buoysPath, buoys);

console.log('Applied Phase 2 fixed-timestep simulation foundation.');
