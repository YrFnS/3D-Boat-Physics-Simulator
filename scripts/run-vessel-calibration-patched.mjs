import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const bootstrap = await fs.readFile(
  'scripts/apply-vessel-calibration.mjs',
  'utf8',
);
const payloadMatch = bootstrap.match(/const payload = '([^']+)';/);
if (!payloadMatch) {
  throw new Error('Unable to read the calibration bootstrap payload.');
}

let expanded = gunzipSync(
  Buffer.from(payloadMatch[1], 'base64'),
).toString('utf8');

const oldMarker =
  "    `    if (headingDeg < 0) headingDeg += 360;\n\n    // --- Phase 1: Health Math ---\n`,";
const correctedMarker =
  "    `    if (headingDeg < 0) headingDeg += 360;\n    \n    // --- Phase 1: Health Math ---\n`,";

if (!expanded.includes(oldMarker)) {
  throw new Error('Unable to locate the calibration result guard marker.');
}
expanded = expanded.replace(oldMarker, correctedMarker);

const temporaryPath = '/tmp/apply-vessel-calibration-expanded-patched.mjs';
await fs.writeFile(temporaryPath, expanded, 'utf8');
await import(pathToFileURL(temporaryPath).href);
