import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getVesselConfig } from '../sim/vessels/VesselConfig.ts';
import {
  compareProxyWithReference,
  froudeNumber,
  knotsToMps,
  mechanicalHorsepowerToW,
  PHYSICAL_REFERENCE_PROFILES,
  rangeContains,
  speedForFroudeNumber,
  VALIDATED_V1_BASELINE,
} from '../sim/vessels/PhysicalReference.ts';

const outputDirectory = path.resolve('artifacts/physical-reference');
await fs.mkdir(outputDirectory, { recursive: true });

function approximatelyEqual(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

approximatelyEqual(knotsToMps(1), 1852 / 3600);
approximatelyEqual(mechanicalHorsepowerToW(1), 745.6998715822702);
approximatelyEqual(
  speedForFroudeNumber(froudeNumber(8, 12), 12),
  8,
  1e-12,
);

const comparisons = [];

for (const vesselType of ['trawler', 'speedboat']) {
  const profile = PHYSICAL_REFERENCE_PROFILES[vesselType];
  const vessel = getVesselConfig(vesselType);
  const baseline = VALIDATED_V1_BASELINE[vesselType];

  assert.equal(profile.vesselType, vesselType);
  assert.equal(vessel.type, vesselType);
  assert.ok(profile.evidence.length >= 2);
  assert.ok(
    profile.evidence.every(
      (source) =>
        source.url.startsWith('https://') &&
        source.accessedOn === '2026-08-01' &&
        source.notes.length > 20,
    ),
    `${vesselType} reference evidence must be complete`,
  );
  assert.ok(
    profile.dimensions.lengthOverallM > 0 &&
      profile.dimensions.characteristicLengthM > 0 &&
      profile.dimensions.beamM > 0 &&
      profile.dimensions.draftM > 0,
  );
  assert.ok(
    profile.mass.displacementKg.min > 0 &&
      profile.mass.displacementKg.max >=
        profile.mass.displacementKg.min,
  );
  assert.ok(
    profile.propulsion.ratedPowerW.min > 0 &&
      profile.propulsion.ratedPowerW.max >=
        profile.propulsion.ratedPowerW.min,
  );
  assert.ok(
    profile.propulsion.maximumSpeedMps.min >=
      profile.propulsion.cruiseSpeedMps.min,
  );

  const comparison = compareProxyWithReference(
    vessel,
    baseline,
    profile,
  );

  for (const value of [
    comparison.proxyLengthM,
    comparison.proxyBeamM,
    comparison.proxyDraftM,
    comparison.proxyMassKg,
    comparison.proxyRatedPowerW,
    comparison.proxySteadyFroude,
    comparison.proxyMaximumFroude,
    comparison.referenceBeamLengthRatio,
    comparison.proxyBeamLengthRatio,
    comparison.referenceDraftLengthRatio,
    comparison.proxyDraftLengthRatio,
    comparison.proxyPowerMassWPerKg,
    comparison.aheadToAsternSpeedRatio,
    comparison.stoppingDistanceLengthRatio,
    comparison.turnRadiusLengthRatio,
    comparison.reverseTurnRadiusLengthRatio,
  ]) {
    assert.ok(Number.isFinite(value), `${vesselType} comparison must be finite`);
  }

  assert.ok(
    rangeContains(
      profile.engineeringEnvelope.aheadToAsternSpeedRatio,
      comparison.aheadToAsternSpeedRatio,
    ),
    `${vesselType} v1 astern ratio unexpectedly left the review envelope`,
  );

  // Phase 5E.1 is an observational baseline. It must detect, rather than hide,
  // the two principal v1 calibration gaps that Phase 5E.2 will retune.
  assert.equal(comparison.withinReferenceSpeedRegime, false);
  assert.equal(
    comparison.withinReferenceSpecificPower,
    true,
    `${vesselType} reference-driven rated power must remain inside the official power-to-mass range`,
  );
  assert.ok(comparison.gaps.includes('maximum-froude-number'));
  assert.ok(!comparison.gaps.includes('specific-power'));

  comparisons.push({
    profile,
    baseline,
    comparison,
  });
}

const report = {
  version: 1,
  phase: '5E.1-reference-baseline',
  generatedAt: new Date().toISOString(),
  releaseCandidateCommit:
    'a9ef7acb6365ddc229761e403c32c8fa249ee5a7',
  status: 'retuning-required',
  comparisons,
  summary: {
    references: comparisons.length,
    sourceRecords: comparisons.reduce(
      (total, entry) => total + entry.profile.evidence.length,
      0,
    ),
    proxiesWithinReferenceSpeedRegime: comparisons.filter(
      (entry) => entry.comparison.withinReferenceSpeedRegime,
    ).length,
    proxiesWithinReferenceSpecificPower: comparisons.filter(
      (entry) => entry.comparison.withinReferenceSpecificPower,
    ).length,
    detectedGaps: comparisons.reduce(
      (total, entry) => total + entry.comparison.gaps.length,
      0,
    ),
  },
};

await fs.writeFile(
  path.join(outputDirectory, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(report, null, 2));
console.log('Physical reference baseline validation passed.');
