import assert from 'node:assert/strict';
import {
  evaluatePhysicalCalibrationReport,
  evaluatePhysicalReferenceProfile,
  validatePhysicalReferenceProfile,
} from '../sim/calibration/PhysicalCalibration.ts';
import { PHYSICAL_REFERENCE_PROFILES } from '../sim/calibration/ReferenceProfiles.ts';

function measurementsAtNominal(profile) {
  const byScenario = new Map();
  for (const target of profile.targets) {
    let measurement = byScenario.get(target.scenario);
    if (!measurement) {
      measurement = {
        vessel: profile.vessel,
        scenario: target.scenario,
        metrics: {},
      };
      byScenario.set(target.scenario, measurement);
    }
    measurement.metrics[target.metric] = target.nominal;
  }
  return [...byScenario.values()];
}

function cloneMeasurement(measurement) {
  return {
    ...measurement,
    metrics: { ...measurement.metrics },
  };
}

for (const profile of PHYSICAL_REFERENCE_PROFILES) {
  assert.deepEqual(
    validatePhysicalReferenceProfile(profile),
    [],
    `${profile.id} must satisfy the permanent profile contract`,
  );

  const nominalMeasurements = measurementsAtNominal(profile);
  const nominalEvaluation = evaluatePhysicalReferenceProfile(
    profile,
    nominalMeasurements,
  );
  assert.equal(nominalEvaluation.validationErrors.length, 0);
  assert.equal(nominalEvaluation.measurementCoverageRatio, 1);
  assert.equal(nominalEvaluation.evidenceCoverageRatio, 0);
  assert.equal(nominalEvaluation.score, 100);
  assert.equal(nominalEvaluation.comparisonPassed, true);
  assert.equal(nominalEvaluation.certificationEligible, false);
  assert.equal(nominalEvaluation.certified, false);

  const firstTarget = profile.targets[0];
  const perturbedMeasurements = nominalMeasurements.map(cloneMeasurement);
  const perturbedScenario = perturbedMeasurements.find(
    (measurement) => measurement.scenario === firstTarget.scenario,
  );
  assert.ok(perturbedScenario);
  perturbedScenario.metrics[firstTarget.metric] =
    firstTarget.maximum +
    Math.max(
      firstTarget.maximum - firstTarget.nominal,
      Math.abs(firstTarget.nominal) * 0.05,
      1,
    );
  const perturbedEvaluation = evaluatePhysicalReferenceProfile(
    profile,
    perturbedMeasurements,
  );
  assert.equal(perturbedEvaluation.comparisonPassed, false);
  assert.ok(perturbedEvaluation.score < 100);

  const incompleteMeasurements = nominalMeasurements
    .map(cloneMeasurement)
    .filter((measurement) => measurement.scenario !== firstTarget.scenario);
  const incompleteEvaluation = evaluatePhysicalReferenceProfile(
    profile,
    incompleteMeasurements,
  );
  assert.ok(incompleteEvaluation.measurementCoverageRatio < 1);
  assert.equal(incompleteEvaluation.comparisonPassed, false);
}

const evidenceBackedProfile = {
  schemaVersion: 1,
  id: 'evidence-backed-contract-fixture',
  vessel: 'trawler',
  label: 'Evidence-backed contract fixture',
  status: 'evidence-backed',
  description: 'Synthetic fixture used only to verify certification semantics.',
  passScore: 100,
  minimumMeasurementCoverageRatio: 1,
  minimumEvidenceCoverageRatio: 1,
  sources: [
    {
      id: 'synthetic-sea-trial',
      title: 'Synthetic sea-trial fixture',
      publisher: 'Phase 5E contract test',
      evidenceClass: 'sea-trial',
      confidence: 'high',
    },
  ],
  targets: [
    {
      id: 'synthetic-speed',
      scenario: 'speed',
      metric: 'steadySpeedMps',
      unit: 'm/s',
      nominal: 8,
      minimum: 7.5,
      maximum: 8.5,
      weight: 1,
      role: 'holdout',
      sourceIds: ['synthetic-sea-trial'],
      releaseBlocking: true,
    },
  ],
};

const evidenceEvaluation = evaluatePhysicalReferenceProfile(
  evidenceBackedProfile,
  [
    {
      vessel: 'trawler',
      scenario: 'speed',
      metrics: { steadySpeedMps: 8 },
    },
  ],
);
assert.deepEqual(evidenceEvaluation.validationErrors, []);
assert.equal(evidenceEvaluation.evidenceCoverageRatio, 1);
assert.equal(evidenceEvaluation.certificationEligible, true);
assert.equal(evidenceEvaluation.certified, true);

const invalidProfile = {
  ...evidenceBackedProfile,
  id: 'invalid-source-reference-fixture',
  targets: [
    {
      ...evidenceBackedProfile.targets[0],
      sourceIds: ['missing-source'],
    },
  ],
};
assert.ok(
  validatePhysicalReferenceProfile(invalidProfile).some((error) =>
    error.includes('unknown source missing-source'),
  ),
);

const report = evaluatePhysicalCalibrationReport(
  [
    {
      vessel: 'trawler',
      scenario: 'speed',
      calibration: {
        result: {
          vessel: 'trawler',
          scenario: 'speed',
          metrics: { steadySpeedMps: 8, ignored: 'not-a-number' },
        },
      },
    },
  ],
  [evidenceBackedProfile],
);
assert.equal(report.summary.totalProfiles, 1);
assert.equal(report.summary.evidenceBackedProfiles, 1);
assert.equal(report.summary.certificationEligibleProfiles, 1);
assert.equal(report.summary.certifiedProfiles, 1);
assert.equal(report.profiles[0].certified, true);

console.log('Physical calibration contract tests passed.');
