import assert from 'node:assert/strict';
import {
  evaluatePhysicalReferenceProfile,
  validatePhysicalReferenceProfile,
} from '../sim/calibration/PhysicalCalibration.ts';
import { EXTERNAL_REFERENCE_PROFILES } from '../sim/calibration/ExternalReferenceProfiles.ts';
import { createVesselConfigurationMeasurements } from '../sim/calibration/VesselConfigurationMeasurements.ts';
import { getVesselConfig } from '../sim/vessels/VesselConfig.ts';

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
  ...createVesselConfigurationMeasurements([
    getVesselConfig('trawler'),
    getVesselConfig('speedboat'),
  ]),
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

const tomboyProfile = EXTERNAL_REFERENCE_PROFILES.find((profile) =>
  profile.id.includes('tomboy-26'),
);
assert.ok(tomboyProfile);
const tomboy = evaluatePhysicalReferenceProfile(tomboyProfile, measurements);
assert.equal(
  tomboy.metrics.find((metric) => metric.metric === 'configuredLengthOverallM')
    ?.withinEnvelope,
  false,
);
assert.equal(
  tomboy.metrics.find((metric) => metric.metric === 'configuredRatedPowerW')
    ?.withinEnvelope,
  false,
);
assert.equal(
  tomboy.metrics.find((metric) => metric.metric === 'steadySpeedMps')
    ?.withinEnvelope,
  false,
);
assert.equal(
  tomboy.metrics.find((metric) => metric.metric === 'bollardPullKg')
    ?.measured,
  false,
);

const axoparProfile = EXTERNAL_REFERENCE_PROFILES.find((profile) =>
  profile.id.includes('axopar-22-spyder'),
);
assert.ok(axoparProfile);
const axopar = evaluatePhysicalReferenceProfile(axoparProfile, measurements);
assert.equal(
  axopar.metrics.find((metric) => metric.metric === 'configuredLengthOverallM')
    ?.withinEnvelope,
  false,
);
assert.equal(
  axopar.metrics.find((metric) => metric.metric === 'configuredRatedPowerW')
    ?.withinEnvelope,
  false,
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
