import fs from 'node:fs';

const filePath = 'components/Boat.tsx';
let source = fs.readFileSync(filePath, 'utf8');

function replaceLiteralOnce(needle, replacement, label) {
  const matches = source.split(needle).length - 1;
  if (matches !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${matches}`);
  }
  source = source.replace(needle, replacement);
}

function replaceRegexOnce(pattern, replacement, label) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags)) ?? [];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${matches.length}`);
  }
  source = source.replace(pattern, replacement);
}

replaceLiteralOnce(
  '  const lastWakeDropOdo = useRef(0);\n',
  '',
  'remove wake odometer ref',
);

replaceRegexOnce(
  /\n    \/\/ Dynamic Wake Line tracking[\s\S]*?\n    \/\/ 2\. PITCH \(Rotation around X\)/g,
  '\n    // 2. PITCH (Rotation around X)',
  'remove legacy wake history loop',
);

if (
  source.includes('lastWakeDropOdo') ||
  source.includes('wakeNodes') ||
  source.includes('wakeDirs') ||
  source.includes('absoluteOdometer')
) {
  throw new Error('Legacy wake history references remain in Boat.tsx');
}

fs.writeFileSync(filePath, source);
console.log('Removed legacy wake history from Boat.tsx.');
