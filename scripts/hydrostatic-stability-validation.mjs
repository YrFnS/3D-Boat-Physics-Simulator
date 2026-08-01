import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  evaluateHydrostaticStability,
  roundHydrostaticStabilityReport,
} from '../sim/calibration/HydrostaticStability.ts';
import { getVesselConfig } from '../sim/vessels/VesselConfig.ts';

const outputDirectory = path.resolve('artifacts/physics-calibration');
await fs.mkdir(outputDirectory, { recursive: true });

const reports = ['trawler', 'speedboat'].map((vesselType) =>
  roundHydrostaticStabilityReport(
    evaluateHydrostaticStability(getVesselConfig(vesselType)),
  ),
);

for (const report of reports) {
  assert.equal(report.evidenceClass, 'engineering-derived');
  assert.equal(report.checks.finite, true, `${report.vessel} must stay finite`);
  assert.equal(
    report.checks.displacementBalanced,
    true,
    `${report.vessel} must solve heave equilibrium`,
  );
  assert.equal(report.roll.passed, true, `${report.vessel} roll must restore`);
  assert.equal(report.pitch.passed, true, `${report.vessel} pitch must restore`);
  assert.equal(
    report.passed,
    true,
    `${report.vessel} static stability must pass`,
  );
}

const result = {
  version: 1,
  phase: '5E.3-hydrostatic-stability-foundation',
  generatedAt: new Date().toISOString(),
  evidenceClass: 'engineering-derived',
  vessels: reports,
  summary: {
    total: reports.length,
    passed: reports.filter((report) => report.passed).length,
    failed: reports.filter((report) => !report.passed).length,
  },
};

await fs.writeFile(
  path.join(outputDirectory, 'hydrostatic-stability.json'),
  `${JSON.stringify(result, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(result, null, 2));
console.log('Hydrostatic stability validation passed.');
