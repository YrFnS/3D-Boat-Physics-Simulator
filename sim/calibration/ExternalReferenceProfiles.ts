import type {
  PhysicalMetricTarget,
  VesselPhysicalReferenceProfile,
} from './PhysicalCalibration';

const ITTC_METHOD_SOURCE = 'ittc-recommended-procedures-external';
const TOMBOY_26_SOURCE = 'de-wit-tomboy-26-official';
const AXOPAR_22_SOURCE = 'axopar-22-spyder-official';

const KNOT_TO_MPS = 0.514444;

function target(
  value: Omit<PhysicalMetricTarget, 'releaseBlocking'> & {
    releaseBlocking?: boolean;
  },
): PhysicalMetricTarget {
  return {
    ...value,
    releaseBlocking: value.releaseBlocking ?? value.role !== 'informational',
  };
}

const METHOD_SOURCE = {
  id: ITTC_METHOD_SOURCE,
  title: 'ITTC Recommended Procedures and Guidelines archive',
  publisher: 'International Towing Tank Conference',
  evidenceClass: 'standard' as const,
  confidence: 'high' as const,
  url: 'https://ittc.info/downloads/archive-of-recommended-procedures/',
  accessedDate: '2026-08-01',
  notes:
    'Used for test design, uncertainty, repeatability, and reporting. It is not vessel-specific evidence.',
};

export const EXTERNAL_REFERENCE_PROFILES:
  readonly VesselPhysicalReferenceProfile[] = [
  {
    schemaVersion: 1,
    id: 'trawler-tomboy-26-provisional',
    vessel: 'trawler',
    label: 'De Wit Tomboy 26 provisional workboat reference',
    status: 'provisional',
    description:
      'Official manufacturer dimensions, lightship weight, draft, standard power, speed, and bollard-pull data for a slow displacement workboat. The profile exposes the scale and power mismatch in the current abstract trawler; it is not a completed sea-trial calibration.',
    passScore: 85,
    minimumMeasurementCoverageRatio: 0.75,
    minimumEvidenceCoverageRatio: 1,
    sources: [
      {
        id: TOMBOY_26_SOURCE,
        title: 'Tomboy 26 official specifications',
        publisher: 'De Wit Workboats',
        evidenceClass: 'manufacturer',
        confidence: 'medium',
        url: 'https://dewitworkboats.com/tomboy-26/',
        accessedDate: '2026-08-01',
        notes:
          'The page reports 7.96 m length, 2.39 m beam, 1.22 m draft, 5,670 kg lightship weight, a standard 90 kW engine, 7.5 kn speed, and 1,200 kg bollard pull. Loading and trial conditions are not stated.',
      },
      METHOD_SOURCE,
    ],
    targets: [
      target({
        id: 'tomboy-26-length',
        scenario: 'configuration',
        metric: 'configuredLengthOverallM',
        unit: 'm',
        nominal: 7.96,
        minimum: 7.92,
        maximum: 8,
        weight: 2,
        role: 'calibration',
        sourceIds: [TOMBOY_26_SOURCE],
        uncertaintyNotes:
          'Small documentation tolerance around the manufacturer overall length.',
      }),
      target({
        id: 'tomboy-26-beam',
        scenario: 'configuration',
        metric: 'configuredBeamOverallM',
        unit: 'm',
        nominal: 2.39,
        minimum: 2.37,
        maximum: 2.41,
        weight: 1.5,
        role: 'calibration',
        sourceIds: [TOMBOY_26_SOURCE],
      }),
      target({
        id: 'tomboy-26-lightship-mass',
        scenario: 'configuration',
        metric: 'configuredMassKg',
        unit: 'kg',
        nominal: 5_670,
        minimum: 5_500,
        maximum: 5_840,
        weight: 2,
        role: 'calibration',
        sourceIds: [TOMBOY_26_SOURCE],
        uncertaintyNotes:
          'The simulator configured mass is compared with manufacturer lightship weight. A later loading-condition model must align consumables and payload explicitly.',
      }),
      target({
        id: 'tomboy-26-draft',
        scenario: 'configuration',
        metric: 'configuredDraftM',
        unit: 'm',
        nominal: 1.22,
        minimum: 1.16,
        maximum: 1.28,
        weight: 1.5,
        role: 'calibration',
        sourceIds: [TOMBOY_26_SOURCE],
        uncertaintyNotes:
          'Loading condition is not published, so the first comparison uses a five-percent draft envelope.',
      }),
      target({
        id: 'tomboy-26-standard-power',
        scenario: 'configuration',
        metric: 'configuredRatedPowerW',
        unit: 'W',
        nominal: 90_000,
        minimum: 85_000,
        maximum: 95_000,
        weight: 2,
        role: 'calibration',
        sourceIds: [TOMBOY_26_SOURCE],
        uncertaintyNotes:
          'The manufacturer describes 90 kW as the standard engine while also offering other power options.',
      }),
      target({
        id: 'tomboy-26-speed',
        scenario: 'speed',
        metric: 'steadySpeedMps',
        unit: 'm/s',
        nominal: 7.5 * KNOT_TO_MPS,
        minimum: 7.125 * KNOT_TO_MPS,
        maximum: 7.875 * KNOT_TO_MPS,
        weight: 2.5,
        role: 'holdout',
        sourceIds: [TOMBOY_26_SOURCE, ITTC_METHOD_SOURCE],
        uncertaintyNotes:
          'The manufacturer gives one speed without loading, water, wind, or measurement conditions. A five-percent provisional envelope is used until trial evidence is available.',
      }),
      target({
        id: 'tomboy-26-bollard-pull',
        scenario: 'bollard-pull',
        metric: 'bollardPullKg',
        unit: 'kgf',
        nominal: 1_200,
        minimum: 1_080,
        maximum: 1_320,
        weight: 1,
        role: 'holdout',
        sourceIds: [TOMBOY_26_SOURCE, ITTC_METHOD_SOURCE],
        releaseBlocking: false,
        uncertaintyNotes:
          'The simulator has no bollard-pull trial yet. This target remains intentionally unmeasured.',
      }),
    ],
  },
  {
    schemaVersion: 1,
    id: 'speedboat-axopar-22-spyder-provisional',
    vessel: 'speedboat',
    label: 'Axopar 22 Spyder provisional planing reference',
    status: 'provisional',
    description:
      'Official manufacturer geometry, weight, engine range, hull type, top-speed ceiling, and cruise example for a stepped planing boat. It provides a traceable first comparison while acceleration, turning, stopping, loading, and sea-state trials remain outstanding.',
    passScore: 85,
    minimumMeasurementCoverageRatio: 0.75,
    minimumEvidenceCoverageRatio: 1,
    sources: [
      {
        id: AXOPAR_22_SOURCE,
        title: 'Axopar 22 Spyder technical specifications',
        publisher: 'Axopar Boats',
        evidenceClass: 'manufacturer',
        confidence: 'medium',
        url: 'https://www.axopar.com/boat-models/axopar-22/axopar-22-spyder/',
        accessedDate: '2026-08-01',
        notes:
          'The current product page reports a 7.2 m by 2.23 m twin-stepped 20-degree-V hull, 1,200 kg weight excluding engine, 0.8 m draft to propellers, 115–250 hp engine range, up to 45 kn, and a 27 kn cruise-consumption example with a 200 hp Mercury.',
      },
      METHOD_SOURCE,
    ],
    targets: [
      target({
        id: 'axopar-22-length',
        scenario: 'configuration',
        metric: 'configuredLengthOverallM',
        unit: 'm',
        nominal: 7.2,
        minimum: 7.15,
        maximum: 7.25,
        weight: 2,
        role: 'calibration',
        sourceIds: [AXOPAR_22_SOURCE],
      }),
      target({
        id: 'axopar-22-beam',
        scenario: 'configuration',
        metric: 'configuredBeamOverallM',
        unit: 'm',
        nominal: 2.23,
        minimum: 2.2,
        maximum: 2.26,
        weight: 1.5,
        role: 'calibration',
        sourceIds: [AXOPAR_22_SOURCE],
      }),
      target({
        id: 'axopar-22-lightship-mass',
        scenario: 'configuration',
        metric: 'configuredMassKg',
        unit: 'kg',
        nominal: 1_200,
        minimum: 1_140,
        maximum: 1_260,
        weight: 2,
        role: 'calibration',
        sourceIds: [AXOPAR_22_SOURCE],
        uncertaintyNotes:
          'Manufacturer weight excludes the engine and options. The provisional envelope does not yet align fuel, people, or equipment.',
      }),
      target({
        id: 'axopar-22-draft',
        scenario: 'configuration',
        metric: 'configuredDraftM',
        unit: 'm',
        nominal: 0.8,
        minimum: 0.72,
        maximum: 0.88,
        weight: 1.5,
        role: 'calibration',
        sourceIds: [AXOPAR_22_SOURCE],
        uncertaintyNotes:
          'The source describes draft to propellers without a published loading condition.',
      }),
      target({
        id: 'axopar-22-power-range',
        scenario: 'configuration',
        metric: 'configuredRatedPowerW',
        unit: 'W',
        nominal: 149_140,
        minimum: 85_755,
        maximum: 186_425,
        weight: 2,
        role: 'calibration',
        sourceIds: [AXOPAR_22_SOURCE],
        uncertaintyNotes:
          '115–250 hp manufacturer engine range; the nominal value is the 200 hp engine used in the published cruise example.',
      }),
      target({
        id: 'axopar-22-planing-hull',
        scenario: 'configuration',
        metric: 'configuredPlaningCapableFlag',
        unit: '0-or-1',
        nominal: 1,
        minimum: 1,
        maximum: 1,
        weight: 1,
        role: 'calibration',
        sourceIds: [AXOPAR_22_SOURCE],
        releaseBlocking: false,
        uncertaintyNotes:
          'The official specification identifies a twin-stepped 20-degree-V hull.',
      }),
      target({
        id: 'axopar-22-top-speed-ceiling',
        scenario: 'speed',
        metric: 'steadySpeedMps',
        unit: 'm/s',
        nominal: 45 * KNOT_TO_MPS,
        minimum: 0,
        maximum: 45 * KNOT_TO_MPS,
        weight: 1.5,
        role: 'informational',
        sourceIds: [AXOPAR_22_SOURCE, ITTC_METHOD_SOURCE],
        releaseBlocking: false,
        uncertaintyNotes:
          'The source says “up to 45 knots,” so this is modeled only as a ceiling and not as a guaranteed lower-bound trial result.',
      }),
      target({
        id: 'axopar-22-cruise-example',
        scenario: 'cruise',
        metric: 'cruiseSpeedMps',
        unit: 'm/s',
        nominal: 27 * KNOT_TO_MPS,
        minimum: 25.65 * KNOT_TO_MPS,
        maximum: 28.35 * KNOT_TO_MPS,
        weight: 1,
        role: 'holdout',
        sourceIds: [AXOPAR_22_SOURCE, ITTC_METHOD_SOURCE],
        releaseBlocking: false,
        uncertaintyNotes:
          'Published as a 200 hp cruise fuel-consumption example. The simulator does not yet run a matched cruise-condition trial.',
      }),
    ],
  },
];
