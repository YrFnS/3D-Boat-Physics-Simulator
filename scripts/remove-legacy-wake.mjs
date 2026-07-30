import fs from 'node:fs';

const filePath = 'components/Boat.tsx';
let source = fs.readFileSync(filePath, 'utf8');

const legacyTokens = [
  'lastWakeDropOdo',
  'wakeNodes',
  'wakeDirs',
  'absoluteOdometer',
];

if (!legacyTokens.some((token) => source.includes(token))) {
  console.log('Legacy wake history was already removed from Boat.tsx.');
  process.exit(0);
}

const wakeRefPattern = /^\s*const lastWakeDropOdo = useRef\(0\);\r?\n/m;
if (!wakeRefPattern.test(source)) {
  throw new Error('Legacy wake odometer declaration was not found.');
}
source = source.replace(wakeRefPattern, '');

const wakeBlockPattern = /\r?\n\s*\/\/ Dynamic Wake Line tracking[\s\S]*?\r?\n\s*\/\/ 2\. PITCH \(Rotation around X\)/;
if (!wakeBlockPattern.test(source)) {
  throw new Error('Legacy wake-history update block was not found.');
}
source = source.replace(
  wakeBlockPattern,
  '\n\n    // 2. PITCH (Rotation around X)',
);

const remainingTokens = legacyTokens.filter((token) => source.includes(token));
if (remainingTokens.length > 0) {
  throw new Error(
    `Legacy wake references remain in Boat.tsx: ${remainingTokens.join(', ')}`,
  );
}

fs.writeFileSync(filePath, source);
console.log('Removed legacy wake history from Boat.tsx.');
