import fs from 'node:fs';

const filePath = 'components/Boat.tsx';
let source = fs.readFileSync(filePath, 'utf8');

function replaceOnce(needle, replacement, label) {
  const matches = source.split(needle).length - 1;
  if (matches !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${matches}`);
  }
  source = source.replace(needle, replacement);
}

function replaceRegexOnce(expression, replacement, label) {
  const matches = source.match(new RegExp(expression.source, `${expression.flags}g`));
  if (matches?.length !== 1) {
    throw new Error(
      `${label}: expected exactly one match, found ${matches?.length ?? 0}`,
    );
  }
  source = source.replace(expression, replacement);
}

replaceOnce(
  "import { useBoatVisualDamage } from './boat/useBoatVisualDamage';\n\n\nexport default function Boat()",
  "import { useBoatVisualDamage } from './boat/useBoatVisualDamage';\n\nexport default function Boat()",
  'normalize imports spacing',
);

replaceOnce(
  '    let targetRPM = 1000 + (Math.abs(thrustRaw) * (isSpeedboat ? 6000 : 3500));',
  `    let targetRPM =\n      engineHealth.current <= 0\n        ? 0\n        : 1000 + Math.abs(thrustRaw) * (isSpeedboat ? 6000 : 3500);`,
  'stop dead engine RPM',
);

replaceOnce(
  '    const effectiveThrustRatio = (engineRPM.current - 1000) / (isSpeedboat ? 6000 : 3500); ',
  `    const effectiveThrustRatio =\n      engineHealth.current <= 0\n        ? 0\n        : (engineRPM.current - 1000) / (isSpeedboat ? 6000 : 3500); `,
  'stop dead engine effective thrust',
);

replaceOnce(
  '    if (rudderHealth.current < 40) {',
  '    if (rudderHealth.current > 0 && rudderHealth.current < 40) {',
  'disable destroyed rudder jitter',
);

replaceRegexOnce(
  /\s*angularVelocity\.current \+= \(Math\.random\(\) - 0\.5\) \* speedIntoWall \* 1\.0;\s*audio\.playImpact\(severity, 'terrain'\);/,
  `\n              angularVelocity.current +=\n                (Math.random() - 0.5) * speedIntoWall;\n              audio.playImpact(severity, 'terrain');`,
  'separate terrain impact statements',
);

fs.writeFileSync(filePath, source);
console.log('Applied final Phase 1 boat cleanup.');
