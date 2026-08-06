import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  headingDegreesToWorldDirection,
  headingDegreesToYawRadians,
  normalizeHeadingDegrees,
  normalizeSignedHeadingDeltaDegrees,
  rotateWorldDirection,
  worldDirectionToHeadingDegrees,
} from '../sim/world/WorldDirection.ts';

const EPSILON = 1e-6;

function approximatelyEqual(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

const cardinals = [
  { heading: 0, x: 0, z: -1, label: 'north' },
  { heading: 90, x: 1, z: 0, label: 'east' },
  { heading: 180, x: 0, z: 1, label: 'south' },
  { heading: 270, x: -1, z: 0, label: 'west' },
];

for (const cardinal of cardinals) {
  const direction = headingDegreesToWorldDirection(cardinal.heading);
  approximatelyEqual(direction.x, cardinal.x, `${cardinal.label} world X`);
  approximatelyEqual(direction.z, cardinal.z, `${cardinal.label} world Z`);
  approximatelyEqual(
    worldDirectionToHeadingDegrees(direction.x, direction.z),
    cardinal.heading,
    `${cardinal.label} heading round trip`,
  );
}

for (const heading of [-720, -45, 0, 15, 90, 225, 359, 720]) {
  const direction = headingDegreesToWorldDirection(heading, 7.5);
  approximatelyEqual(
    Math.hypot(direction.x, direction.z),
    7.5,
    `${heading} degree magnitude`,
  );
  approximatelyEqual(
    worldDirectionToHeadingDegrees(direction.x, direction.z),
    normalizeHeadingDegrees(heading),
    `${heading} degree round trip`,
  );
}

assert.equal(normalizeSignedHeadingDeltaDegrees(181), -179);
assert.equal(normalizeSignedHeadingDeltaDegrees(-181), 179);
assert.equal(normalizeSignedHeadingDeltaDegrees(90), 90);

const east = rotateWorldDirection(0, -1, 90);
approximatelyEqual(east.x, 1, 'clockwise north-to-east rotation X');
approximatelyEqual(east.z, 0, 'clockwise north-to-east rotation Z');
approximatelyEqual(
  headingDegreesToYawRadians(90),
  -Math.PI / 2,
  'east heading yaw',
);

const sourceFiles = {
  boat: await fs.readFile(
    new URL('../components/Boat.tsx', import.meta.url),
    'utf8',
  ),
  dynamics: await fs.readFile(
    new URL(
      '../sim/vessels/VesselDynamicsRuntime.ts',
      import.meta.url,
    ),
    'utf8',
  ),
  telemetry: await fs.readFile(
    new URL(
      '../sim/vessels/VesselTelemetryRuntime.ts',
      import.meta.url,
    ),
    'utf8',
  ),
  presentation: await fs.readFile(
    new URL(
      '../sim/vessels/VesselPresentationRuntime.ts',
      import.meta.url,
    ),
    'utf8',
  ),
  weather: await fs.readFile(
    new URL('../components/WeatherEffects.tsx', import.meta.url),
    'utf8',
  ),
  ocean: await fs.readFile(
    new URL('../components/Ocean.tsx', import.meta.url),
    'utf8',
  ),
  scenarioDirector: await fs.readFile(
    new URL('../components/ScenarioDirector.tsx', import.meta.url),
    'utf8',
  ),
  scenarioRoute: await fs.readFile(
    new URL('../sim/scenarios/ScenarioRoute.ts', import.meta.url),
    'utf8',
  ),
  body: await fs.readFile(
    new URL('../sim/core/SixDofBody.ts', import.meta.url),
    'utf8',
  ),
  hud: await fs.readFile(
    new URL('../components/HUD.tsx', import.meta.url),
    'utf8',
  ),
};

assert.match(
  sourceFiles.dynamics,
  /setWorldVectorFromHeading\(\s*this\.windVelocity,\s*input\.windHeadingDegrees,\s*input\.windSpeedMps/,
  'Vessel wind force must use the authoritative heading conversion.',
);
assert.match(
  sourceFiles.dynamics,
  /setWorldVectorFromHeading\(\s*this\.baseCurrentVelocity,\s*input\.currentHeadingDegrees,\s*input\.currentSpeedMps/,
  'Water current must use the authoritative heading conversion.',
);
assert.match(
  sourceFiles.telemetry,
  /worldDirectionToHeadingDegrees\(\s*forwardDirection\.x,\s*forwardDirection\.z/,
  'Vessel telemetry must publish the same compass convention.',
);
assert.match(
  sourceFiles.presentation,
  /setWorldVectorFromHeading\(\s*this\.windVelocity,\s*input\.windHeadingDegrees,\s*input\.windSpeedMps/,
  'Apparent-wind presentation must use the shared heading conversion.',
);
assert.doesNotMatch(
  `${sourceFiles.boat}\n${sourceFiles.dynamics}\n${sourceFiles.telemetry}\n${sourceFiles.presentation}`,
  /const windRad = MathUtils\.degToRad\(windDir\)/,
  'Vessel physics must not keep a private wind-axis mapping.',
);

assert.match(
  sourceFiles.weather,
  /setWorldXZFromHeading\(/,
  'Precipitation and wind audio must use the shared heading conversion.',
);
assert.match(
  sourceFiles.weather,
  /uSnowBlend/,
  'Winter precipitation must share the authoritative wind drift.',
);
assert.doesNotMatch(
  sourceFiles.weather,
  /Math\.(?:sin|cos)\(windRadians\)/,
  'Weather effects must not keep a conflicting axis mapping.',
);

assert.match(
  sourceFiles.ocean,
  /cachedWindDir/,
  'Wave caching must invalidate when wind heading changes.',
);
assert.match(
  sourceFiles.ocean,
  /rotateWorldDirection/,
  'Gerstner wave directions must rotate with wind heading.',
);
assert.match(
  sourceFiles.scenarioDirector,
  /worldDirectionToHeadingDegrees\(deltaX, deltaZ\)/,
  'Mission bearings must use the shared compass convention.',
);
assert.match(
  sourceFiles.scenarioRoute,
  /worldDirectionToHeadingDegrees/,
  'Recovery checkpoint headings must use the shared compass convention.',
);
assert.match(
  sourceFiles.body,
  /headingDegreesToYawRadians\(spawn\.headingDeg\)/,
  'Vessel spawn orientation must use the shared compass convention.',
);
assert.match(
  sourceFiles.hud,
  /Wind heading \(toward\)/,
  'The HUD must disclose that wind headings describe travel toward.',
);
assert.match(
  sourceFiles.hud,
  /Current heading \(toward\)/,
  'The HUD must disclose that current headings describe travel toward.',
);

console.log('World direction contract passed.');
