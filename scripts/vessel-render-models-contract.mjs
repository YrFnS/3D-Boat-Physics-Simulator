import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const boatSource = await fs.readFile(
  new URL('../components/Boat.tsx', import.meta.url),
  'utf8',
);
const wrapperSource = await fs.readFile(
  new URL('../components/boat/VesselModels.tsx', import.meta.url),
  'utf8',
);
const trawlerSource = await fs.readFile(
  new URL('../components/boat/TrawlerModel.tsx', import.meta.url),
  'utf8',
);
const speedboatModelSource = await fs.readFile(
  new URL('../components/boat/SpeedboatModel.tsx', import.meta.url),
  'utf8',
);
const speedboatHullSource = await fs.readFile(
  new URL('../components/boat/SpeedboatHull.tsx', import.meta.url),
  'utf8',
);
const speedboatInteriorSource = await fs.readFile(
  new URL('../components/boat/SpeedboatInterior.tsx', import.meta.url),
  'utf8',
);
const speedboatEnginesSource = await fs.readFile(
  new URL('../components/boat/SpeedboatEngines.tsx', import.meta.url),
  'utf8',
);
const modelSources = [
  wrapperSource,
  trawlerSource,
  speedboatModelSource,
  speedboatHullSource,
  speedboatInteriorSource,
  speedboatEnginesSource,
].join('\n');

assert.match(boatSource, /import VesselModels from '\.\/boat\/VesselModels';/);
assert.match(boatSource, /<VesselModels/);
assert.doesNotMatch(boatSource, /MeshDistortMaterial/);
assert.doesNotMatch(boatSource, /trawlerHullLowerMat/);
assert.doesNotMatch(boatSource, /speedboatHullLowerMat/);
assert.doesNotMatch(boatSource, /<boxGeometry/);

assert.match(wrapperSource, /<TrawlerModel/);
assert.match(wrapperSource, /<SpeedboatModel/);
assert.match(speedboatModelSource, /<SpeedboatHull/);
assert.match(speedboatModelSource, /<SpeedboatInterior/);
assert.match(speedboatModelSource, /<SpeedboatEngines/);
for (const materialName of [
  'trawlerHullLowerMat',
  'trawlerHullUpperMat',
  'speedboatHullLowerMat',
  'speedboatHullUpperMatBody',
  'speedboatHullUpperMatBow',
]) {
  assert.match(
    modelSources,
    new RegExp(materialName),
    `${materialName} must remain available to cached damage visuals.`,
  );
}
assert.match(modelSources, /name="engineSmoke"/);
assert.match(trawlerSource, /ref=\{flagRef\}/);
assert.match(trawlerSource, /ref=\{trawlerEngineRef\}/);
assert.match(
  speedboatEnginesSource,
  /ref=\{i === 0 \? speedboatEngineLRef : speedboatEngineRRef\}/,
);
for (const simulationAuthority of [
  /useFrame\(/,
  /useSimStore\(/,
  /sharedPhysics/,
  /SixDofBody/,
  /VesselDynamicsRuntime/,
]) {
  assert.doesNotMatch(
    modelSources,
    simulationAuthority,
    'Render components must remain free of simulation authority.',
  );
}

console.log('Vessel render models contract passed.');
