import fs from 'node:fs';

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: source text not found`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${label}: source text matched more than once`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}

const path = 'components/Boat.tsx';
let source = fs.readFileSync(path, 'utf8');

source = replaceOnce(
  source,
  "import { Vector3, Group, MathUtils, Object3D, Quaternion } from 'three';",
  "import { Vector3, Group, MathUtils, Quaternion } from 'three';",
  'remove Object3D import',
);
source = replaceOnce(
  source,
  "import { FixedStepRunner } from '@/sim/core/FixedStepRunner';\n",
  "import { FixedStepRunner } from '@/sim/core/FixedStepRunner';\nimport { SixDofBody } from '@/sim/core/SixDofBody';\n",
  'import six degree body',
);
source = replaceOnce(
  source,
  `interface OrbitControlsLike {\n  target: Vector3;\n  update: () => void;\n}\n\n`,
  `interface OrbitControlsLike {\n  target: Vector3;\n  update: () => void;\n}\n\nfunction applyBuoyancyAtPoint(\n  body: SixDofBody,\n  pointWorld: Vector3,\n  depth: number,\n  submergedRatio: number,\n  massShareKg: number,\n  stiffness: number,\n  damping: number,\n  pointVelocity: Vector3,\n  force: Vector3,\n) {\n  if (depth <= -0.8) return;\n\n  body.velocityAtPoint(pointWorld, pointVelocity);\n  const acceleration =\n    Math.max(0, depth) * stiffness -\n    pointVelocity.y * damping * submergedRatio;\n\n  body.addForceAtPoint(\n    force.set(0, acceleration * massShareKg, 0),\n    pointWorld,\n  );\n}\n\n`,
  'insert buoyancy helper',
);
source = replaceOnce(
  source,
  '  const physicsBody = useRef(new Object3D());\n',
  '  const physicsBody = useRef(new SixDofBody());\n',
  'use six degree body',
);
source = replaceOnce(
  source,
  `  const lastSubmergedRatio = useRef(1);\n  const velocity = useRef(new Vector3(0, 0, 0));\n  const angularVelocity = useRef(0);\n`,
  `  const lastSubmergedRatio = useRef(1);\n  const velocity = useRef(physicsBody.current.linearVelocity);\n  const angularVelocity = useRef(physicsBody.current.angularVelocity);\n`,
  'bind velocity state to body',
);
source = replaceOnce(
  source,
  `      totalForce: new Vector3(),\n      terrainNormal: new Vector3(),\n`,
  `      totalForce: new Vector3(),\n      gravityForce: new Vector3(),\n      buoyancyForce: new Vector3(),\n      pointVelocity: new Vector3(),\n      pointFR: new Vector3(),\n      pointFL: new Vector3(),\n      pointBR: new Vector3(),\n      pointBL: new Vector3(),\n      localPropeller: new Vector3(),\n      localRudder: new Vector3(),\n      localWind: new Vector3(),\n      localPlaning: new Vector3(),\n      worldPropeller: new Vector3(),\n      worldRudder: new Vector3(),\n      worldWind: new Vector3(),\n      worldPlaning: new Vector3(),\n      planingForce: new Vector3(),\n      rudderForce: new Vector3(),\n      terrainNormal: new Vector3(),\n`,
  'add six degree scratch vectors',
);
source = replaceOnce(
  source,
  `    const vessel = getVesselConfig(activeBoat);\n\n`,
  `    const vessel = getVesselConfig(activeBoat);\n    body.setMassProperties(\n      vessel.massKg,\n      vessel.principalInertiaKgM2,\n      vessel.angularDampingPerSecond,\n      vessel.centerOfMassLocal,\n    );\n    body.beginStep();\n    body.addForce(\n      scratch.gravityForce.set(0, -vessel.massKg * 9.81, 0),\n    );\n\n`,
  'configure body mass and gravity',
);
source = replaceOnce(
  source,
  '    const angularDragCoeff = vessel.angularDragCoefficient;\n',
  '',
  'remove scalar angular drag local',
);
source = replaceOnce(
  source,
  `    // --- Heading & Forward Vectors ---\n    const heading = body.rotation.y;\n    const forwardDir = scratch.forwardDir.set(\n      -Math.sin(heading),\n      0,\n      -Math.cos(heading),\n    );\n    const rightDir = scratch.rightDir.set(\n      forwardDir.z,\n      0,\n      -forwardDir.x,\n    );\n`,
  `    // --- Heading & Horizontal Vessel Axes ---\n    const forwardDir = scratch.forwardDir\n      .set(0, 0, -1)\n      .applyQuaternion(body.quaternion);\n    forwardDir.y = 0;\n    if (forwardDir.lengthSq() > 1e-8) forwardDir.normalize();\n    else forwardDir.set(0, 0, -1);\n\n    const rightDir = scratch.rightDir\n      .set(-1, 0, 0)\n      .applyQuaternion(body.quaternion);\n    rightDir.y = 0;\n    if (rightDir.lengthSq() > 1e-8) rightDir.normalize();\n    else rightDir.set(-1, 0, 0);\n`,
  'derive axes from full orientation',
);
source = replaceOnce(
  source,
  `    // Calculate vectors identifying the 4 corners of the boat based on its heading\n    const fwdVec = scratch.fwdVec.copy(forwardDir).multiplyScalar(halfL);\n    const rgtVec = scratch.rgtVec.copy(rightDir).multiplyScalar(halfW);\n\n    const cornerFR = scratch.cornerFR.copy(fwdVec).add(rgtVec);\n    const cornerFL = scratch.cornerFL.copy(fwdVec).sub(rgtVec);\n    const cornerBR = scratch.cornerBR.copy(fwdVec).multiplyScalar(-1).add(rgtVec);\n    const cornerBL = scratch.cornerBL.copy(fwdVec).multiplyScalar(-1).sub(rgtVec);\n`,
  `    // Four hull points are transformed by the full quaternion, so their\n    // different immersion depths generate real pitch and roll torques.\n    const cornerFR = scratch.cornerFR.set(-halfW, 0, -halfL);\n    const cornerFL = scratch.cornerFL.set(halfW, 0, -halfL);\n    const cornerBR = scratch.cornerBR.set(-halfW, 0, halfL);\n    const cornerBL = scratch.cornerBL.set(halfW, 0, halfL);\n    const pointFR = body.localPointToWorld(cornerFR, scratch.pointFR);\n    const pointFL = body.localPointToWorld(cornerFL, scratch.pointFL);\n    const pointBR = body.localPointToWorld(cornerBR, scratch.pointBR);\n    const pointBL = body.localPointToWorld(cornerBL, scratch.pointBL);\n`,
  'transform distributed buoyancy points',
);
source = source
  .replace('      pos.x + cornerFR.x,\n      pos.z + cornerFR.z,', '      pointFR.x,\n      pointFR.z,')
  .replace('      pos.x + cornerFL.x,\n      pos.z + cornerFL.z,', '      pointFL.x,\n      pointFL.z,')
  .replace('      pos.x + cornerBR.x,\n      pos.z + cornerBR.z,', '      pointBR.x,\n      pointBR.z,')
  .replace('      pos.x + cornerBL.x,\n      pos.z + cornerBL.z,', '      pointBL.x,\n      pointBL.z,');
source = replaceOnce(
  source,
  `    // Calculate Average Surface Y under the boat\n    const avgY = (pFR.y + pFL.y + pBR.y + pBL.y) / 4.0;\n    \n`,
  '',
  'remove averaged-only water height',
);
source = replaceOnce(
  source,
  `    const depth = (avgY - draftOffset) - pos.y; // Positive means underwater, negative means airborne\n    const submergedRatio = MathUtils.clamp(depth * 1.5 + 0.5, 0.0, 1.0); // 0 = fully in air, 1 = fully submerged\n\n    // --- Dynamic Vertical Physics (Crash & Slam) ---\n    // Instead of sticking to the water, we simulate gravity and buoyancy\n    let accelY = -9.81; // Base Gravity\n\n    if (depth > -0.8) { \n      // Boat is touching or in water, apply upward buoyant force\n      // Ice/slush slightly reduces the clean buoyancy stiffness of fluid\n      const buoyancyStiffness = vessel.buoyancyStiffness * (1.0 - isWinter * 0.1);\n      const waterVerticalDamping = vessel.verticalDamping;\n      \n      accelY += Math.max(0, depth) * buoyancyStiffness; \n      accelY -= velocity.current.y * waterVerticalDamping * submergedRatio;\n    }\n\n    velocity.current.y += accelY * dt;\n`,
  `    const depthFR = (pFR.y - draftOffset) - pointFR.y;\n    const depthFL = (pFL.y - draftOffset) - pointFL.y;\n    const depthBR = (pBR.y - draftOffset) - pointBR.y;\n    const depthBL = (pBL.y - draftOffset) - pointBL.y;\n    const depth = (depthFR + depthFL + depthBR + depthBL) / 4;\n\n    const submergedFR = MathUtils.clamp(depthFR * 1.5 + 0.5, 0, 1);\n    const submergedFL = MathUtils.clamp(depthFL * 1.5 + 0.5, 0, 1);\n    const submergedBR = MathUtils.clamp(depthBR * 1.5 + 0.5, 0, 1);\n    const submergedBL = MathUtils.clamp(depthBL * 1.5 + 0.5, 0, 1);\n    const submergedRatio =\n      (submergedFR + submergedFL + submergedBR + submergedBL) / 4;\n\n    const buoyancyStiffness =\n      vessel.buoyancyStiffness * (1 - isWinter * 0.1);\n    const massShareKg = mass * 0.25;\n    applyBuoyancyAtPoint(\n      body, pointFR, depthFR, submergedFR, massShareKg,\n      buoyancyStiffness, vessel.verticalDamping,\n      scratch.pointVelocity, scratch.buoyancyForce,\n    );\n    applyBuoyancyAtPoint(\n      body, pointFL, depthFL, submergedFL, massShareKg,\n      buoyancyStiffness, vessel.verticalDamping,\n      scratch.pointVelocity, scratch.buoyancyForce,\n    );\n    applyBuoyancyAtPoint(\n      body, pointBR, depthBR, submergedBR, massShareKg,\n      buoyancyStiffness, vessel.verticalDamping,\n      scratch.pointVelocity, scratch.buoyancyForce,\n    );\n    applyBuoyancyAtPoint(\n      body, pointBL, depthBL, submergedBL, massShareKg,\n      buoyancyStiffness, vessel.verticalDamping,\n      scratch.pointVelocity, scratch.buoyancyForce,\n    );\n`,
  'replace averaged buoyancy with point forces',
);
source = replaceOnce(
  source,
  '    const planingLift = speedRatio * 0.18 * submergedRatio; // Also used for pitch visual later\n',
  '    const planingFactor = speedRatio * speedRatio * submergedRatio;\n',
  'replace visual planing angle',
);
source = replaceOnce(
  source,
  `    const totalForce = scratch.totalForce\n      .copy(thrustForce)\n      .add(dragForceForward)\n      .add(dragForceRight)\n      .add(windForce);\n    velocity.current.x += (totalForce.x / mass) * dt;\n    velocity.current.z += (totalForce.z / mass) * dt;\n`,
  `    body.addForce(\n      scratch.totalForce.copy(dragForceForward).add(dragForceRight),\n    );\n    body.localPointToWorld(\n      scratch.localPropeller.fromArray(vessel.propellerPointLocal),\n      scratch.worldPropeller,\n    );\n    body.addForceAtPoint(thrustForce, scratch.worldPropeller);\n    body.localPointToWorld(\n      scratch.localWind.fromArray(vessel.windPointLocal),\n      scratch.worldWind,\n    );\n    body.addForceAtPoint(windForce, scratch.worldWind);\n\n    if (vessel.planingCapable && planingFactor > 0) {\n      body.localPointToWorld(\n        scratch.localPlaning.set(0, 0, -halfL * 0.75),\n        scratch.worldPlaning,\n      );\n      body.addForceAtPoint(\n        scratch.planingForce.set(\n          0,\n          mass * 9.81 * planingFactor * 0.35,\n          0,\n        ),\n        scratch.worldPlaning,\n      );\n    }\n`,
  'apply propulsion and wind at physical points',
);
source = replaceOnce(
  source,
  `            angularVelocity.current += (simulationRandom.current.next() - 0.5) * currentIceFactor * iceImpactSpeed * 0.2;\n`,
  `            angularVelocity.current.x +=\n              (simulationRandom.current.next() - 0.5) *\n              currentIceFactor * iceImpactSpeed * 0.12;\n            angularVelocity.current.z +=\n              (simulationRandom.current.next() - 0.5) *\n              currentIceFactor * iceImpactSpeed * 0.2;\n`,
  'make ice impact three-axis',
);
source = replaceOnce(
  source,
  `    const turnTorque = rudderAngle.current * steeringBite * turnForceMax;\n    const angularAcc = turnTorque - angularVelocity.current * angularDragCoeff;\n    angularVelocity.current += angularAcc * dt;\n`,
  `    const turnTorque = rudderAngle.current * steeringBite * turnForceMax;\n    const rudderForceMagnitude = turnTorque * mass * 0.7;\n    body.localPointToWorld(\n      scratch.localRudder.fromArray(vessel.rudderPointLocal),\n      scratch.worldRudder,\n    );\n    body.addForceAtPoint(\n      scratch.rudderForce\n        .copy(rightDir)\n        .multiplyScalar(-rudderForceMagnitude),\n      scratch.worldRudder,\n    );\n`,
  'replace scalar yaw acceleration with stern force',
);
source = source.replaceAll('angularVelocity.current +=', 'angularVelocity.current.y +=');
source = replaceOnce(
  source,
  `    // --- Apply Transforms ---\n    body.position.x += velocity.current.x * dt;\n    body.position.y += velocity.current.y * dt;\n    body.position.z += velocity.current.z * dt;\n    body.rotation.y += angularVelocity.current * dt;\n    \n    // Update Shared Physics for Shaders (Ocean Wake)\n`,
  `    // --- Integrate the accumulated six-degree-of-freedom forces ---\n    body.integrate(dt);\n\n    forwardDir.set(0, 0, -1).applyQuaternion(body.quaternion);\n    forwardDir.y = 0;\n    if (forwardDir.lengthSq() > 1e-8) forwardDir.normalize();\n    else forwardDir.set(0, 0, -1);\n\n    // Update Shared Physics for Shaders (Ocean Wake)\n`,
  'integrate six degree body',
);

const pitchStart = source.indexOf('    // 2. PITCH (Rotation around X)\n');
const telemetryStart = source.indexOf('    // --- Update Telemetry UI & Health Degradation ---\n', pitchStart);
if (pitchStart < 0 || telemetryStart < 0) {
  throw new Error('Unable to locate legacy visual pitch/roll block.');
}
source = `${source.slice(0, pitchStart)}${source.slice(telemetryStart)}`;

fs.writeFileSync(path, source);
console.log('Applied distributed buoyancy and six-degree-of-freedom integration.');
