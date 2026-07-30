import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = 'scripts/apply-phase1-boat-pass.mjs';
const runtimePath = 'scripts/.apply-phase1-boat-pass.runtime.mjs';
let source = fs.readFileSync(sourcePath, 'utf8');

const oldPattern = String.raw`  /              \/\/ Play crash sound\n              if \(audioCtxRef\.current && pannerRef\.current\) \{[\s\S]*?\n              \}/,`;
const newPattern = String.raw`  /\s*\/\/ Play crash sound\n\s*if \(audioCtxRef\.current && pannerRef\.current\) \{[\s\S]*?\n\s*\}/,`;

if (!source.includes(oldPattern)) {
  throw new Error('Terrain-audio codemod pattern was not found.');
}

source = source.replace(oldPattern, newPattern);
fs.writeFileSync(runtimePath, source);

try {
  await import(pathToFileURL(path.resolve(runtimePath)).href);
} finally {
  fs.rmSync(runtimePath, { force: true });
}
