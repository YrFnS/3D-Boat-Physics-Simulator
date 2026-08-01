import type { VesselType, VesselConfig } from './VesselConfig';

export const STANDARD_GRAVITY_MPS2 = 9.80665;
export const KNOT_TO_MPS = 1852 / 3600;
export const MECHANICAL_HP_TO_W = 745.6998715822702;

export interface NumericRange {
  min: number;
  max: number;
}

export type ReferenceEvidenceKind =
  | 'manufacturer-specification'
  | 'manufacturer-owner-manual'
  | 'manufacturer-sea-trial'
  | 'manufacturer-brokerage-specification'
  | 'engineering-envelope';

export interface ReferenceEvidence {
  id: string;
  title: string;
  url: string;
  kind: ReferenceEvidenceKind;
  accessedOn: string;
  notes: string;
}

export interface ReferenceDimensions {
  lengthOverallM: number;
  characteristicLengthM: number;
  beamM: number;
  draftM: number;
}

export interface ReferenceMass {
  displacementKg: NumericRange;
  basis: string;
}

export interface ReferencePropulsion {
  ratedPowerW: NumericRange;
  cruiseSpeedMps: NumericRange;
  maximumSpeedMps: NumericRange;
  basis: string;
}

export interface EngineeringCalibrationEnvelope {
  aheadToAsternSpeedRatio: NumericRange;
  stoppingDistanceLengthRatio: NumericRange;
  turnRadiusLengthRatio: NumericRange;
  notes: string;
}

export interface PhysicalReferenceProfile {
  id: string;
  vesselType: VesselType;
  label: string;
  regime: 'displacement' | 'planing';
  dimensions: ReferenceDimensions;
  mass: ReferenceMass;
  propulsion: ReferencePropulsion;
  engineeringEnvelope: EngineeringCalibrationEnvelope;
  evidence: readonly ReferenceEvidence[];
}

export interface ValidatedV1Baseline {
  commitSha: string;
  artifactLabel: string;
  steadyAheadSpeedMps: number;
  maximumAheadSpeedMps: number;
  steadyAsternSpeedMps: number;
  stoppingDistanceM: number;
  stoppingTimeSeconds: number;
  turnRadiusM: number;
  reverseTurnRadiusM: number;
  stabilityRecoveryTimeSeconds: number;
}

export interface ProxyReferenceComparison {
  vesselType: VesselType;
  referenceId: string;
  proxyLengthM: number;
  proxyBeamM: number;
  proxyDraftM: number;
  proxyMassKg: number;
  proxyRatedPowerW: number;
  referenceCruiseFroudeRange: NumericRange;
  referenceMaximumFroudeRange: NumericRange;
  proxySteadyFroude: number;
  proxyMaximumFroude: number;
  referenceBeamLengthRatio: number;
  proxyBeamLengthRatio: number;
  referenceDraftLengthRatio: number;
  proxyDraftLengthRatio: number;
  referencePowerMassWPerKg: NumericRange;
  proxyPowerMassWPerKg: number;
  referenceEquivalentCruiseSpeedMps: NumericRange;
  referenceEquivalentMaximumSpeedMps: NumericRange;
  aheadToAsternSpeedRatio: number;
  stoppingDistanceLengthRatio: number;
  turnRadiusLengthRatio: number;
  reverseTurnRadiusLengthRatio: number;
  gaps: readonly string[];
  withinReferenceSpeedRegime: boolean;
  withinReferenceSpecificPower: boolean;
}

export function knotsToMps(knots: number) {
  return knots * KNOT_TO_MPS;
}

export function mechanicalHorsepowerToW(horsepower: number) {
  return horsepower * MECHANICAL_HP_TO_W;
}

export function froudeNumber(
  speedMps: number,
  characteristicLengthM: number,
  gravityMps2 = STANDARD_GRAVITY_MPS2,
) {
  if (
    !Number.isFinite(speedMps) ||
    !Number.isFinite(characteristicLengthM) ||
    !Number.isFinite(gravityMps2) ||
    characteristicLengthM <= 0 ||
    gravityMps2 <= 0
  ) {
    return Number.NaN;
  }
  return speedMps / Math.sqrt(gravityMps2 * characteristicLengthM);
}

export function speedForFroudeNumber(
  froude: number,
  characteristicLengthM: number,
  gravityMps2 = STANDARD_GRAVITY_MPS2,
) {
  if (
    !Number.isFinite(froude) ||
    !Number.isFinite(characteristicLengthM) ||
    !Number.isFinite(gravityMps2) ||
    characteristicLengthM <= 0 ||
    gravityMps2 <= 0
  ) {
    return Number.NaN;
  }
  return froude * Math.sqrt(gravityMps2 * characteristicLengthM);
}

export function mapRange(
  range: NumericRange,
  transform: (value: number) => number,
): NumericRange {
  const first = transform(range.min);
  const second = transform(range.max);
  return {
    min: Math.min(first, second),
    max: Math.max(first, second),
  };
}

export function rangeContains(range: NumericRange, value: number) {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

const ACCESSED_ON = '2026-08-01';

export const PHYSICAL_REFERENCE_PROFILES: Readonly<
  Record<VesselType, PhysicalReferenceProfile>
> = {
  trawler: {
    id: 'nordhavn-41',
    vesselType: 'trawler',
    label: 'Nordhavn 41 displacement passagemaker',
    regime: 'displacement',
    dimensions: {
      lengthOverallM: 12.6,
      characteristicLengthM: 12.19,
      beamM: 4.24,
      draftM: 1.42,
    },
    mass: {
      displacementKg: { min: 19_000, max: 19_700 },
      basis:
        'Official Nordhavn quick specifications list approximately 19.33 metric tonnes; the range preserves published rounding differences.',
    },
    propulsion: {
      ratedPowerW: {
        min: mechanicalHorsepowerToW(150),
        max: mechanicalHorsepowerToW(170),
      },
      cruiseSpeedMps: {
        min: knotsToMps(7),
        max: knotsToMps(8),
      },
      maximumSpeedMps: {
        min: knotsToMps(9),
        max: knotsToMps(10),
      },
      basis:
        'Official current examples use twin 75 hp or 85 hp Beta diesels. Nordhavn sea-trial and brokerage material reports approximately 7-8 knot cruise and up to 10 knots.',
    },
    engineeringEnvelope: {
      aheadToAsternSpeedRatio: { min: 0.3, max: 0.65 },
      stoppingDistanceLengthRatio: { min: 2, max: 10 },
      turnRadiusLengthRatio: { min: 1, max: 4.5 },
      notes:
        'Public manufacturer data does not provide standardized astern, crash-stop, or turning-circle trials. These deliberately broad engineering envelopes are secondary diagnostics, not manufacturer claims.',
    },
    evidence: [
      {
        id: 'nordhavn-41-model-specification',
        title: 'Nordhavn 41 model quick specifications',
        url: 'https://nordhavn.com/nordhavn-yacht-models/n41/',
        kind: 'manufacturer-specification',
        accessedOn: ACCESSED_ON,
        notes:
          'Provides LOA, LWL, beam, draft, and displacement for the reference class.',
      },
      {
        id: 'nordhavn-41-sea-trial',
        title: 'Sea trials of Nordhavn 41 reveal efficient passagemaker',
        url: 'https://nordhavn.com/seatrials-of-nordhavn-41-reveal-efficient-passagemaker/',
        kind: 'manufacturer-sea-trial',
        accessedOn: ACCESSED_ON,
        notes: 'Reports local cruising speed at approximately 8 knots.',
      },
      {
        id: 'nordhavn-41-sea-escape',
        title: 'Nordhavn 41 Sea Escape official brokerage specification',
        url: 'https://nordhavn.com/brokerage/nordhavn-trawlers-for-sale/nordhavn-41sea-escape/',
        kind: 'manufacturer-brokerage-specification',
        accessedOn: ACCESSED_ON,
        notes:
          'Provides 7 knot cruise, 10 knot maximum speed, displacement, and twin 85 hp engine data for a completed vessel.',
      },
    ],
  },
  speedboat: {
    id: 'axopar-22-spyder',
    vesselType: 'speedboat',
    label: 'Axopar 22 Spyder planing craft',
    regime: 'planing',
    dimensions: {
      lengthOverallM: 7.2,
      characteristicLengthM: 7.2,
      beamM: 2.23,
      draftM: 0.95,
    },
    mass: {
      displacementKg: { min: 1_361, max: 2_620 },
      basis:
        'The owner manual lists 1,100 kg hull mass excluding engine, a maximum engine mass of 261 kg, and a maximum loaded boat mass of 2,620 kg.',
    },
    propulsion: {
      ratedPowerW: {
        min: 149_000,
        max: mechanicalHorsepowerToW(250),
      },
      cruiseSpeedMps: {
        min: knotsToMps(25),
        max: knotsToMps(29),
      },
      maximumSpeedMps: {
        min: knotsToMps(40),
        max: knotsToMps(45),
      },
      basis:
        'The owner manual lists 149 kW / 200 hp as its maximum recommended engine power for the referenced manual. Current manufacturer material lists 115-250 hp, a 27 knot 200 hp cruise example, and maximum speed up to 45 knots.',
    },
    engineeringEnvelope: {
      aheadToAsternSpeedRatio: { min: 0.2, max: 0.55 },
      stoppingDistanceLengthRatio: { min: 3, max: 14 },
      turnRadiusLengthRatio: { min: 1.5, max: 7 },
      notes:
        'Public manufacturer material does not publish standardized astern, crash-stop, or turning-circle trials. These broad bounds are engineering review ranges only.',
    },
    evidence: [
      {
        id: 'axopar-22-owner-manual',
        title: 'Axopar 22 owner manual — dimensions, weight, and power',
        url: 'https://manuals.axopar.com/content/p19len/1.8.1.0/en/350.html',
        kind: 'manufacturer-owner-manual',
        accessedOn: ACCESSED_ON,
        notes:
          'Provides hull length, beam, draft, hull weight, engine power, engine weight, and maximum loaded mass.',
      },
      {
        id: 'axopar-22-spyder-product',
        title: 'Axopar 22 Spyder technical specifications',
        url: 'https://www.axopar.com/boat-models/axopar-22/axopar-22-spyder/',
        kind: 'manufacturer-specification',
        accessedOn: ACCESSED_ON,
        notes:
          'Provides current engine range, 27 knot cruise example, and maximum speed up to 45 knots.',
      },
    ],
  },
};

export const VALIDATED_V1_BASELINE: Readonly<
  Record<VesselType, ValidatedV1Baseline>
> = {
  trawler: {
    commitSha: 'a9ef7acb6365ddc229761e403c32c8fa249ee5a7',
    artifactLabel: 'v1.0.0 exact-head physics calibration',
    steadyAheadSpeedMps: 9.58263,
    maximumAheadSpeedMps: 9.58264,
    steadyAsternSpeedMps: 5.83685,
    stoppingDistanceM: 31.29862,
    stoppingTimeSeconds: 14.15,
    turnRadiusM: 6.30528,
    reverseTurnRadiusM: 7.4107,
    stabilityRecoveryTimeSeconds: 0.86667,
  },
  speedboat: {
    commitSha: 'a9ef7acb6365ddc229761e403c32c8fa249ee5a7',
    artifactLabel: 'v1.0.0 exact-head physics calibration',
    steadyAheadSpeedMps: 22.01584,
    maximumAheadSpeedMps: 22.0764,
    steadyAsternSpeedMps: 7.03294,
    stoppingDistanceM: 52.54029,
    stoppingTimeSeconds: 13.16667,
    turnRadiusM: 31.04722,
    reverseTurnRadiusM: 4.01243,
    stabilityRecoveryTimeSeconds: 2.18333,
  },
};

function specificPowerRange(profile: PhysicalReferenceProfile): NumericRange {
  return {
    min: profile.propulsion.ratedPowerW.min / profile.mass.displacementKg.max,
    max: profile.propulsion.ratedPowerW.max / profile.mass.displacementKg.min,
  };
}

function equivalentProxySpeedRange(
  profile: PhysicalReferenceProfile,
  proxyLengthM: number,
  sourceSpeedRange: NumericRange,
) {
  const referenceFroudeRange = mapRange(sourceSpeedRange, (speedMps) =>
    froudeNumber(speedMps, profile.dimensions.characteristicLengthM),
  );
  return mapRange(referenceFroudeRange, (froude) =>
    speedForFroudeNumber(froude, proxyLengthM),
  );
}

export function compareProxyWithReference(
  vessel: VesselConfig,
  baseline: ValidatedV1Baseline,
  profile: PhysicalReferenceProfile,
): ProxyReferenceComparison {
  const proxyLengthM = vessel.halfLengthM * 2;
  const proxyBeamM = vessel.halfWidthM * 2;
  const proxyDraftM = vessel.deepestDraftM;
  const referenceCruiseFroudeRange = mapRange(
    profile.propulsion.cruiseSpeedMps,
    (speedMps) =>
      froudeNumber(speedMps, profile.dimensions.characteristicLengthM),
  );
  const referenceMaximumFroudeRange = mapRange(
    profile.propulsion.maximumSpeedMps,
    (speedMps) =>
      froudeNumber(speedMps, profile.dimensions.characteristicLengthM),
  );
  const referencePowerMassWPerKg = specificPowerRange(profile);
  const proxyPowerMassWPerKg = vessel.engine.ratedPowerW / vessel.massKg;
  const proxySteadyFroude = froudeNumber(
    baseline.steadyAheadSpeedMps,
    proxyLengthM,
  );
  const proxyMaximumFroude = froudeNumber(
    baseline.maximumAheadSpeedMps,
    proxyLengthM,
  );
  const aheadToAsternSpeedRatio =
    baseline.steadyAsternSpeedMps / baseline.steadyAheadSpeedMps;
  const stoppingDistanceLengthRatio =
    baseline.stoppingDistanceM / proxyLengthM;
  const turnRadiusLengthRatio = baseline.turnRadiusM / proxyLengthM;
  const reverseTurnRadiusLengthRatio =
    baseline.reverseTurnRadiusM / proxyLengthM;
  const gaps: string[] = [];

  const withinReferenceSpeedRegime = rangeContains(
    referenceMaximumFroudeRange,
    proxyMaximumFroude,
  );
  const withinReferenceSpecificPower = rangeContains(
    referencePowerMassWPerKg,
    proxyPowerMassWPerKg,
  );

  if (!withinReferenceSpeedRegime) {
    gaps.push('maximum-froude-number');
  }
  if (!withinReferenceSpecificPower) {
    gaps.push('specific-power');
  }
  if (
    !rangeContains(
      profile.engineeringEnvelope.aheadToAsternSpeedRatio,
      aheadToAsternSpeedRatio,
    )
  ) {
    gaps.push('ahead-to-astern-speed-ratio');
  }
  if (
    !rangeContains(
      profile.engineeringEnvelope.stoppingDistanceLengthRatio,
      stoppingDistanceLengthRatio,
    )
  ) {
    gaps.push('stopping-distance-length-ratio');
  }
  if (
    !rangeContains(
      profile.engineeringEnvelope.turnRadiusLengthRatio,
      turnRadiusLengthRatio,
    )
  ) {
    gaps.push('turn-radius-length-ratio');
  }

  return {
    vesselType: vessel.type,
    referenceId: profile.id,
    proxyLengthM,
    proxyBeamM,
    proxyDraftM,
    proxyMassKg: vessel.massKg,
    proxyRatedPowerW: vessel.engine.ratedPowerW,
    referenceCruiseFroudeRange,
    referenceMaximumFroudeRange,
    proxySteadyFroude,
    proxyMaximumFroude,
    referenceBeamLengthRatio:
      profile.dimensions.beamM / profile.dimensions.lengthOverallM,
    proxyBeamLengthRatio: proxyBeamM / proxyLengthM,
    referenceDraftLengthRatio:
      profile.dimensions.draftM / profile.dimensions.lengthOverallM,
    proxyDraftLengthRatio: proxyDraftM / proxyLengthM,
    referencePowerMassWPerKg,
    proxyPowerMassWPerKg,
    referenceEquivalentCruiseSpeedMps: equivalentProxySpeedRange(
      profile,
      proxyLengthM,
      profile.propulsion.cruiseSpeedMps,
    ),
    referenceEquivalentMaximumSpeedMps: equivalentProxySpeedRange(
      profile,
      proxyLengthM,
      profile.propulsion.maximumSpeedMps,
    ),
    aheadToAsternSpeedRatio,
    stoppingDistanceLengthRatio,
    turnRadiusLengthRatio,
    reverseTurnRadiusLengthRatio,
    gaps,
    withinReferenceSpeedRegime,
    withinReferenceSpecificPower,
  };
}
