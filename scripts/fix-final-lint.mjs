import fs from 'node:fs';

const boatPath = 'components/Boat.tsx';
let boat = fs.readFileSync(boatPath, 'utf8');

if (!boat.includes('interface OrbitControlsLike')) {
  const importMarker =
    "import { useBoatVisualDamage } from './boat/useBoatVisualDamage';\n\n";
  if (!boat.includes(importMarker)) {
    throw new Error('Boat import marker was not found.');
  }

  boat = boat.replace(
    importMarker,
    `${importMarker}interface OrbitControlsLike {\n  target: Vector3;\n  update: () => void;\n}\n\n`,
  );
}

if (!boat.includes('const controls = state.controls as any;')) {
  throw new Error('Untyped orbit controls cast was not found.');
}
boat = boat.replace(
  'const controls = state.controls as any;',
  'const controls = state.controls as unknown as OrbitControlsLike;',
);
fs.writeFileSync(boatPath, boat);

const terrainPath = 'lib/terrain.ts';
let terrain = fs.readFileSync(terrainPath, 'utf8');
terrain = terrain.replace(
  "import { MathUtils, Vector3 } from 'three';",
  "import { MathUtils } from 'three';",
);
fs.writeFileSync(terrainPath, terrain);

console.log('Applied final lint cleanup.');
