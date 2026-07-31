import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const sourcePath = 'scripts/apply-phase2-contact-scenarios.mjs';
let source = await fs.readFile(sourcePath, 'utf8');

const previousImport = `import type {
  CollisionFixtureKind,
  RapierContactSummary,
} from '@/sim/collision/RapierCollisionWorld';`;
const nextImport = `import type {
  CollisionFixtureKind,
} from '@/sim/collision/RapierCollisionWorld';`;

if (!source.includes(previousImport)) {
  throw new Error('Unable to locate the generated collision type import.');
}

source = source.replace(previousImport, nextImport);
const temporaryPath = '/tmp/apply-phase2-contact-scenarios-patched.mjs';
await fs.writeFile(temporaryPath, source, 'utf8');
await import(pathToFileURL(temporaryPath).href);
