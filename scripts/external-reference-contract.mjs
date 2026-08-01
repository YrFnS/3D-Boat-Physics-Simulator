import assert from 'node:assert/strict';
import {
  evaluatePhysicalReferenceProfile,
  validatePhysicalReferenceProfile,
} from '../sim/calibration/PhysicalCalibration.ts';
import { EXTERNAL_REFERENCE_PROFILES } from '../sim/calibration/ExternalReferenceProfiles.ts';
import { VESSEL_CONFIGURATION_MEASUREMENTS } from '../sim/calibration/VesselConfigurationMeasurements.ts';

const V1_SPEED_MEASUREMENTS = [
  {
    vessel: 'trawler',
    scenario: 'speed',
    metrics: { steadySpeedMps: 9.58263 },
  },
  {
    vessel: 'speedboat',
    scenario: 'speed',
    metrics: { steadySpeedMps: 22.01584 },
  },
];

const measurements = [
  ...VESSEL_CONFIGURATION_MEASUREMENTS,
  ...V1_SPEED_MEASUREMENTS,
];

assert.equal(EXTERNAL_REFERENCE_PROFILES.length, 2);

for (const profile of EXTERNAL_REFERENCE_PROFILES) {
  assert.deepEqual(
    validatePhysicalReferenceProfile(profile),
    [],
    `${profile.id} must satisfy the physical-reference contract`,
  );
  assert.equal(profile.status, 'provisional');

  const evaluation = evaluatePhysicalReferenceProfile(profile, measurements);
  assert.equal(evaluation.validationErrors.length, 0);
  assert.equal(evaluation.evidenceCoverageRatio, 1);
  assert.ok(
    evaluation.measurementCoverageRatio >=
      profile.minimumMeasurementCoverageRatio,
    `${profile.id} must measure enough of the selected manufacturer profile`,
  );
  assert.equal(
    evaluation.certificationEligible,
    false,
    'Manufacturer-backed provisional selection must not become certified before matched trials exist.',
  );
  assert.equal(evaluation.certified, false);
  assert.equal(
    evaluation.comparisonPassed,
    false,
    'The current abstract v1 vessel must expose its mismatch instead of passing a newly selected real-vessel profile.',
  );
}

const tomboy = evaluatePhysicalReferenceProfile(
  EXTERNAL_REFERENCE_PROFILES.find((profile) =>
    profile.id.includes('tomboy-26'),
  ),
  measurements,
);
assert.ok(
  tomboy.metrics.find((metric) => metric.metric === 'configuredLengthOverallM')
    ?.withinEnvelope === false,
);
assert.ok(
  tomboy.metrics.find((metric) => metric.metric === 'configuredRatedPowerW')
    ?.withinEnvelope === false,
);
assert.ok(
  tomboy.metrics.find((metric) => metric.metric === 'steadySpeedMps')
    ?.withinEnvelope === false,
);
assert.equal(
  tomboy.metrics.find((metric) => metric.metric === 'bollardPullKg')
    ?.measured,
  false,
);

const axopar = evaluatePhysicalReferenceProfile(
  EXTERNAL_REFERENCE_PROFILES.find((profile) =>
    profile.id.includes('axopar-22-spyder'),
  ),
  measurements,
);
assert.ok(
  axopar.metrics.find((metric) => metric.metric === 'configuredLengthOverallM')
    ?.withinEnvelope === false,
);
assert.ok(
  axopar.metrics.find((metric) => metric.metric === 'configuredRatedPowerW')
    ?.withinEnvelope === false,
);
assert.equal(
  axopar.metrics.find((metric) => metric.metric === 'configuredPlaningCapableFlag')
    ?.withinEnvelope,
  true,
);
assert.equal(
  axopar.metrics.find((metric) => metric.metric === 'steadySpeedMps')
    ?.withinEnvelope,
  true,
  'The current speedboat remains below the official 45-knot manufacturer ceiling.',
);
assert.equal(
  axopar.metrics.find((metric) => metric.metric === 'cruiseSpeedMps')
    ?.measured,
  false,
);

console.log('External vessel reference contract tests passed.');
