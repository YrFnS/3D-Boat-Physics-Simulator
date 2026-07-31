import fs from 'node:fs';

const path = 'components/Boat.tsx';
let source = fs.readFileSync(path, 'utf8');

const aliases =
  '  const velocity = useRef(physicsBody.current.linearVelocity);\n' +
  '  const angularVelocity = useRef(physicsBody.current.angularVelocity);\n';
if (!source.includes(aliases)) {
  throw new Error('Expected six-degree velocity aliases were not found.');
}
source = source.replace(aliases, '');

const stepStart = source.indexOf('  const stepSimulation = ');
const renderStart = source.indexOf('  useFrame((state, delta) => {', stepStart);
if (stepStart < 0 || renderStart < 0) {
  throw new Error('Unable to locate Boat simulation/render boundaries.');
}

let simulation = source.slice(stepStart, renderStart);
simulation = simulation
  .replaceAll('velocity.current', 'body.linearVelocity')
  .replaceAll('angularVelocity.current', 'body.angularVelocity');

let rendering = source.slice(renderStart);
rendering = rendering.replaceAll(
  'velocity.current',
  'physicsBody.current.linearVelocity',
);

source = `${source.slice(0, stepStart)}${simulation}${rendering}`;
source = source.replace(
  '    const depth = (depthFR + depthFL + depthBR + depthBL) / 4;\n\n',
  '',
);

fs.writeFileSync(path, source);
console.log('Removed render-time ref aliases and stale averaged depth.');
