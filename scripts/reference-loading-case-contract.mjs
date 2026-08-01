import assert from 'node:assert/strict';
import {
  evaluateReferenceLoadingCase,
  evaluateReferenceLoadingCases,
  REFERENCE_LOADING_CASES,
  validateReferenceLoadingCase,
} from '../sim/calibration/ReferenceLoadingCases.ts';
import { REFERENCE_VESSEL_CONFIGURATIONS } from '../sim/calibration/ReferenceVesselConfigurations.ts';

assert.equal(REFERENCE_LOADING_CASES.length, 2);

const configurationIds = new Set(
  REFERENCE_VESSEL_CONFIGURATIONS.map((configuration) => configuration.id),
);

for (const loadingCase of REFERENCE_LOADING_CASES) {
  assert.ok(
    configurationIds.has(loadingCase.configurationId),
    `${loadingCase.id} must link to a selected reference configuration`,
  );
  assert.deepEqual(
    validateReferenceLoadingCase(loadingCase),
    [],
    `${loadingCase.id} must satisfy the loading-case contract`,
  );

  const evaluation = evaluateReferenceLoadingCase(loadingCase);
  assert.equal(evaluation.validationErrors.length, 0);
  assert.equal(evaluation.trialReady, false);
  assert.ok(evaluation.publishedCoverageRatio > 0);
  assert.ok(evaluation.publishedCoverageRatio < 1);
  assert.ok(evaluation.readinessRatio > 0);
  assert.ok(evaluation.readinessRatio < 1);
  assert.ok(evaluation.missingRequiredFields.includes('waterDensityKgM3'));
  assert.ok(
    evaluation.missingRequiredFields.includes(
      'longitudinalCenterOfGravityM',
    ),
  );
  assert.ok(
    evaluation.missingRequiredFields.includes('verticalCenterOfGravityM'),
  );
  assert.ok(evaluation.missingRequiredFields.includes('staticTrimDeg'));
}

const tomboy = REFERENCE_LOADING_CASES.find((loadingCase) =>
  loadingCase.id.includes('tomboy-26'),
);
assert.ok(tomboy);
assert.equal(tomboy.quantities.hullOrLightshipMassKg.value, 5_670);
assert.equal(tomboy.quantities.maximumRecommendedLoadKg.value, 1_200);
assert.equal(tomboy.quantities.payloadMassKg.value, 1_500);
assert.equal(tomboy.quantities.fuelVolumeL.value, 220);
assert.equal(tomboy.quantities.testDisplacementKg.value, null);

const axopar = REFERENCE_LOADING_CASES.find((loadingCase) =>
  loadingCase.id.includes('axopar-22-2021-2023'),
);
assert.ok(axopar);
assert.equal(axopar.quantities.hullOrLightshipMassKg.value, 1_100);
assert.equal(axopar.quantities.engineMassKg.value, 261);
assert.equal(axopar.quantities.testDisplacementKg.value, 2_620);
assert.equal(axopar.quantities.maximumRecommendedLoadKg.value, 823);
assert.equal(axopar.quantities.personsMassKg.value, 525);
assert.equal(axopar.quantities.consumableLiquidsMassKg.value, 203);
assert.equal(axopar.quantities.draftM.value, 0.95);

const invalidTrialReady = {
  ...axopar,
  id: 'invalid-loading-case-trial-ready',
  status: 'trial-ready',
};
assert.ok(
  validateReferenceLoadingCase(invalidTrialReady).some((error) =>
    error.includes('cannot be trial-ready with missing fields'),
  ),
);

const report = evaluateReferenceLoadingCases(REFERENCE_LOADING_CASES);
assert.equal(report.summary.totalLoadingCases, 2);
assert.equal(report.summary.trialReadyLoadingCases, 0);

console.log('Reference loading-case contract tests passed.');
