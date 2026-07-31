import fs from 'node:fs';

const path = 'components/Boat.tsx';
let source = fs.readFileSync(path, 'utf8');
const marker = `    lastSubmergedRatio.current = submergedRatio;\n    currentPosition.current.copy(body.position);\n    currentQuaternion.current.copy(body.quaternion);\n`;

if (!source.includes(marker)) {
  throw new Error('Boat fixed-step finalization marker was not found.');
}

source = source.replace(
  marker,
  `    sharedPhysics.boatPos.copy(body.position);\n    sharedPhysics.boatQuaternion.copy(body.quaternion);\n    sharedPhysics.boatLinearVelocity.copy(body.linearVelocity);\n    sharedPhysics.boatAngularVelocity.copy(body.angularVelocity);\n    sharedPhysics.boatSpeed = Math.min(\n      Math.hypot(body.linearVelocity.x, body.linearVelocity.z),\n      35,\n    );\n    sharedPhysics.submergedRatio = submergedRatio;\n\n    lastSubmergedRatio.current = submergedRatio;\n    currentPosition.current.copy(body.position);\n    currentQuaternion.current.copy(body.quaternion);\n`,
);

fs.writeFileSync(path, source);
console.log('Published authoritative vessel state for debug diagnostics.');
