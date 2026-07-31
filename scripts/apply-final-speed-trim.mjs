import fs from 'node:fs/promises';

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Unable to find ${label}.`);
  }
  return source.replace(search, replacement);
}

async function updateFile(path, transform) {
  const source = await fs.readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`No changes produced for ${path}.`);
  await fs.writeFile(path, next, 'utf8');
}

await updateFile('sim/vessels/VesselConfig.ts', (source) =>
  replaceOnce(
    source,
    '    engineForceMaxN: 25_000,\n',
    '    engineForceMaxN: 22_000,\n',
    'speedboat engine-force calibration',
  ),
);

await updateFile('sim/calibration/VesselCalibration.ts', (source) =>
  replaceOnce(
    source,
    "        this.request.vessel === 'speedboat' ? 0.18 : 0.82;\n",
    "        this.request.vessel === 'speedboat' ? 0.24 : 0.82;\n",
    'speedboat controlled-turn throttle',
  ),
);

console.log('Applied the final speedboat cruise and turn-entry calibration.');
