import type {
  PhysicalMetricTarget,
  VesselPhysicalReferenceProfile,
} from './PhysicalCalibration';

const V1_CALIBRATION_SOURCE = 'sim-v1.0.0-calibration';
const IMO_MANOEUVRING_METHOD_SOURCE = 'imo-msc-137-76';
const ITTC_METHOD_SOURCE = 'ittc-recommended-procedures';

interface BaselineTargetInput {
  id: string;
  scenario: string;
  metric: string;
  unit: string;
  nominal: number;
  toleranceFraction: number;
  weight?: number;
  methodSourceId?: string;
}

function baselineTarget({
  id,
  scenario,
  metric,
  unit,
  nominal,
  toleranceFraction,
  weight = 1,
  methodSourceId,
}: BaselineTargetInput): PhysicalMetricTarget {
  const margin = Math.max(Math.abs(nominal) * toleranceFraction, 1e-6);
  return {
    id,
    scenario,
    metric,
    unit,
    nominal,
    minimum: nominal - margin,
    maximum: nominal + margin,
    weight,
    role: 'calibration',
    sourceIds: methodSourceId
      ? [V1_CALIBRATION_SOURCE, methodSourceId]
      : [V1_CALIBRATION_SOURCE],
    releaseBlocking: false,
    uncertaintyNotes:
      'Regression-only tolerance around the exact v1.0.0 simulator result. This is not external physical uncertainty.',
  };
}

const COMMON_SOURCES = [
  {
    id: V1_CALIBRATION_SOURCE,
    title: '3D Boat Physics Simulator v1.0.0 exact-head calibration report',
    publisher: '3D Boat Physics Simulator',
    evidenceClass: 'simulator-baseline' as const,
    confidence: 'high' as const,
    publicationDate: '2026-08-01',
    notes:
      'Generated from commit a9ef7acb6365ddc229761e403c32c8fa249ee5a7. It proves regression continuity only and cannot certify physical agreement.',
  },
  {
    id: IMO_MANOEUVRING_METHOD_SOURCE,
    title: 'MSC.137(76), Standards for Ship Manoeuvrability',
    publisher: 'International Maritime Organization',
    evidenceClass: 'standard' as const,
    confidence: 'high' as const,
    url: 'https://www.imo.org/en/knowledgecentre/indexofimoresolutions/pages/msc-2000-03.aspx',
    accessedDate: '2026-08-01',
    notes:
      'Methodology reference only. Ship-level acceptance limits are not automatically applicable to these small simulator craft.',
  },
  {
    id: ITTC_METHOD_SOURCE,
    title: 'ITTC Recommended Procedures and Guidelines archive',
    publisher: 'International Towing Tank Conference',
    evidenceClass: 'standard' as const,
    confidence: 'high' as const,
    url: 'https://ittc.info/downloads/archive-of-recommended-procedures/',
    accessedDate: '2026-08-01',
    notes:
      'Method, uncertainty, trial, resistance, propulsion, manoeuvring, and seakeeping reference. It is not vessel-specific evidence.',
  },
] as const;

const TRAWLER_TARGETS: readonly PhysicalMetricTarget[] = [
  baselineTarget({
    id: 'trawler-mass',
    scenario: 'rest',
    metric: 'physicalMassKg',
    unit: 'kg',
    nominal: 1_500,
    toleranceFraction: 0.001,
    weight: 1.5,
  }),
  baselineTarget({
    id: 'trawler-displaced-volume',
    scenario: 'rest',
    metric: 'displacedVolumeM3',
    unit: 'm3',
    nominal: 1.46341,
    toleranceFraction: 0.01,
    weight: 1.5,
  }),
  baselineTarget({
    id: 'trawler-roll-recovery',
    scenario: 'stability',
    metric: 'recoveryTimeSeconds',
    unit: 's',
    nominal: 0.86667,
    toleranceFraction: 0.08,
    methodSourceId: ITTC_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'trawler-steady-ahead-speed',
    scenario: 'speed',
    metric: 'steadySpeedMps',
    unit: 'm/s',
    nominal: 9.58263,
    toleranceFraction: 0.04,
    weight: 2,
    methodSourceId: ITTC_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'trawler-ahead-acceleration',
    scenario: 'speed',
    metric: 'timeToMinimumCruiseSeconds',
    unit: 's',
    nominal: 3.21667,
    toleranceFraction: 0.08,
    methodSourceId: ITTC_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'trawler-steady-astern-speed',
    scenario: 'reverse-speed',
    metric: 'steadyAsternSpeedMps',
    unit: 'm/s',
    nominal: 5.83685,
    toleranceFraction: 0.05,
    methodSourceId: ITTC_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'trawler-stopping-distance',
    scenario: 'stop',
    metric: 'stoppingDistanceM',
    unit: 'm',
    nominal: 31.29862,
    toleranceFraction: 0.05,
    weight: 2,
    methodSourceId: IMO_MANOEUVRING_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'trawler-stopping-time',
    scenario: 'stop',
    metric: 'stoppingTimeSeconds',
    unit: 's',
    nominal: 14.15,
    toleranceFraction: 0.05,
    methodSourceId: IMO_MANOEUVRING_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'trawler-turn-radius',
    scenario: 'turn',
    metric: 'turnRadiusM',
    unit: 'm',
    nominal: 6.30528,
    toleranceFraction: 0.05,
    weight: 2,
    methodSourceId: IMO_MANOEUVRING_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'trawler-reverse-turn-radius',
    scenario: 'reverse-turn',
    metric: 'turnRadiusM',
    unit: 'm',
    nominal: 7.4107,
    toleranceFraction: 0.05,
    methodSourceId: IMO_MANOEUVRING_METHOD_SOURCE,
  }),
];

const SPEEDBOAT_TARGETS: readonly PhysicalMetricTarget[] = [
  baselineTarget({
    id: 'speedboat-mass',
    scenario: 'rest',
    metric: 'physicalMassKg',
    unit: 'kg',
    nominal: 800,
    toleranceFraction: 0.001,
    weight: 1.5,
  }),
  baselineTarget({
    id: 'speedboat-displaced-volume',
    scenario: 'rest',
    metric: 'displacedVolumeM3',
    unit: 'm3',
    nominal: 0.78049,
    toleranceFraction: 0.01,
    weight: 1.5,
  }),
  baselineTarget({
    id: 'speedboat-roll-recovery',
    scenario: 'stability',
    metric: 'recoveryTimeSeconds',
    unit: 's',
    nominal: 2.18333,
    toleranceFraction: 0.08,
    methodSourceId: ITTC_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'speedboat-steady-ahead-speed',
    scenario: 'speed',
    metric: 'steadySpeedMps',
    unit: 'm/s',
    nominal: 22.01584,
    toleranceFraction: 0.04,
    weight: 2,
    methodSourceId: ITTC_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'speedboat-ahead-acceleration',
    scenario: 'speed',
    metric: 'timeToMinimumCruiseSeconds',
    unit: 's',
    nominal: 1.98333,
    toleranceFraction: 0.08,
    methodSourceId: ITTC_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'speedboat-steady-astern-speed',
    scenario: 'reverse-speed',
    metric: 'steadyAsternSpeedMps',
    unit: 'm/s',
    nominal: 7.03294,
    toleranceFraction: 0.05,
    methodSourceId: ITTC_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'speedboat-stopping-distance',
    scenario: 'stop',
    metric: 'stoppingDistanceM',
    unit: 'm',
    nominal: 52.54029,
    toleranceFraction: 0.05,
    weight: 2,
    methodSourceId: IMO_MANOEUVRING_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'speedboat-stopping-time',
    scenario: 'stop',
    metric: 'stoppingTimeSeconds',
    unit: 's',
    nominal: 13.16667,
    toleranceFraction: 0.05,
    methodSourceId: IMO_MANOEUVRING_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'speedboat-turn-radius',
    scenario: 'turn',
    metric: 'turnRadiusM',
    unit: 'm',
    nominal: 31.04722,
    toleranceFraction: 0.05,
    weight: 2,
    methodSourceId: IMO_MANOEUVRING_METHOD_SOURCE,
  }),
  baselineTarget({
    id: 'speedboat-reverse-turn-radius',
    scenario: 'reverse-turn',
    metric: 'turnRadiusM',
    unit: 'm',
    nominal: 4.01243,
    toleranceFraction: 0.05,
    methodSourceId: IMO_MANOEUVRING_METHOD_SOURCE,
  }),
];

export const PHYSICAL_REFERENCE_PROFILES: readonly VesselPhysicalReferenceProfile[] = [
  {
    schemaVersion: 1,
    id: 'trawler-v1-simulator-baseline',
    vessel: 'trawler',
    label: 'Trawler v1.0 simulator baseline',
    status: 'simulator-baseline',
    description:
      'A non-certifying regression profile derived from the exact v1.0.0 calibration artifact. Replace its target sources with traceable vessel evidence before making physical-agreement claims.',
    passScore: 100,
    minimumMeasurementCoverageRatio: 1,
    minimumEvidenceCoverageRatio: 1,
    sources: COMMON_SOURCES,
    targets: TRAWLER_TARGETS,
  },
  {
    schemaVersion: 1,
    id: 'speedboat-v1-simulator-baseline',
    vessel: 'speedboat',
    label: 'Speedboat v1.0 simulator baseline',
    status: 'simulator-baseline',
    description:
      'A non-certifying regression profile derived from the exact v1.0.0 calibration artifact. Replace its target sources with traceable vessel evidence before making physical-agreement claims.',
    passScore: 100,
    minimumMeasurementCoverageRatio: 1,
    minimumEvidenceCoverageRatio: 1,
    sources: COMMON_SOURCES,
    targets: SPEEDBOAT_TARGETS,
  },
];
