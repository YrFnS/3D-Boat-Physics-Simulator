import assert from 'node:assert/strict';
import { EXTERNAL_REFERENCE_PROFILES } from '../sim/calibration/ExternalReferenceProfiles.ts';
import {
  evaluateReferenceVesselConfiguration,
  evaluateReferenceVesselConfigurations,
  REFERENCE_VESSEL_CONFIGURATIONS,
  validateReferenceVesselConfiguration,
} from '../sim/calibration/ReferenceVesselConfigurations.ts';

assert.equal(REFERENCE_VESSEL_CONFIGURATIONS.length, 2);

const profileIds = new Set(
  EXTERNAL_REFERENCE_PROFILES.map((profile) => profile.id),
);

for (const configuration of REFERENCE_VESSEL_CONFIGURATIONS) {
  assert.ok(
    profileIds.has(configuration.profileId),
    `${configuration.id} must link to an external physical-reference profile`,
  );
  assert.deepEqual(
    validateReferenceVesselConfiguration(configuration),
    [],
    `${configuration.id} must satisfy the configuration contract`,
  );

  const evaluation = evaluateReferenceVesselConfiguration(configuration);
  assert.equal(evaluation.validationErrors.length, 0);
  assert.equal(evaluation.trialReady, false);
  assert.ok(evaluation.publishedCoverageRatio > 0);
  assert.ok(evaluation.publishedCoverageRatio < 1);
  assert.ok(evaluation.trialReadinessRatio > 0);
  assert.ok(evaluation.trialReadinessRatio < 1);
  assert.ok(
    evaluation.missingTrialFields.includes(
      'loading.longitudinalCenterOfGravityM',
    ),
  );
  assert.ok(
    evaluation.missingTrialFields.includes(
      'loading.verticalCenterOfGravityM',
    ),
  );
  assert.ok(
    evaluation.missingTrialFields.includes('propulsion.gearRatioAhead'),
  );
  assert.ok(
    evaluation.missingTrialFields.includes('propulsion.propellerDiameterM'),
  );
  assert.ok(
    evaluation.missingTrialFields.includes('steering.effectiveAreaM2'),
  );
}

const tomboy = REFERENCE_VESSEL_CONFIGURATIONS.find((configuration) =>
  configuration.id.includes('tomboy-26'),
);
assert.ok(tomboy);
assert.equal(tomboy.loading.publishedMassKg.value, 5_670);
assert.equal(tomboy.loading.massBasis.value, 'lightship weight');
assert.equal(tomboy.loading.testDisplacementKg.value, null);
assert.equal(tomboy.propulsion.referenceRatedPowerW.value, 90_000);
assert.equal(tomboy.performance.publishedBollardPullKgf.value, 1_200);

const axopar = REFERENCE_VESSEL_CONFIGURATIONS.find((configuration) =>
  configuration.id.includes('axopar-22-spyder'),
);
assert.ok(axopar);
assert.equal(axopar.loading.publishedMassKg.value, 1_200);
assert.equal(axopar.loading.engineIncluded.value, false);
assert.equal(axopar.geometry.deadriseDeg.value, 20);
assert.equal(axopar.propulsion.minimumRatedPowerW.value, 85_755);
assert.equal(axopar.propulsion.referenceRatedPowerW.value, 149_140);
assert.equal(axopar.propulsion.maximumRatedPowerW.value, 186_425);

const invalidTrialReady = {
  ...tomboy,
  id: 'invalid-trial-ready-reference',
  status: 'trial-ready',
};
assert.ok(
  validateReferenceVesselConfiguration(invalidTrialReady).some((error) =>
    error.includes('cannot be trial-ready with missing fields'),
  ),
);

const report = evaluateReferenceVesselConfigurations(
  REFERENCE_VESSEL_CONFIGURATIONS,
);
assert.equal(report.summary.totalConfigurations, 2);
assert.equal(report.summary.trialReadyConfigurations, 0);

console.log('Reference vessel configuration contract tests passed.');
