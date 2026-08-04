import type { VesselType } from '../vessels/VesselConfig';

export const PHYSICAL_CALIBRATION_SCHEMA_VERSION = 1 as const;

export type PhysicalEvidenceClass =
  | 'sea-trial'
  | 'model-test'
  | 'manufacturer'
  | 'classification'
  | 'standard'
  | 'derived'
  | 'simulator-baseline';

export type PhysicalEvidenceConfidence = 'low' | 'medium' | 'high';

export type PhysicalProfileStatus =
  | 'simulator-baseline'
  | 'provisional'
  | 'evidence-backed';

export type PhysicalTargetRole =
  | 'calibration'
  | 'holdout'
  | 'informational';

export interface PhysicalCalibrationSource {
  id: string;
  title: string;
  publisher: string;
  evidenceClass: PhysicalEvidenceClass;
  confidence: PhysicalEvidenceConfidence;
  url?: string;
  publicationDate?: string;
  accessedDate?: string;
  notes?: string;
}

export interface PhysicalOperatingCondition {
  loadingCondition: string;
  waterDensityKgM3?: number;
  waterDepthM?: number;
  windSpeedMps?: number;
  significantWaveHeightM?: number;
  wavePeriodSeconds?: number;
  notes?: string;
}

export interface PhysicalMetricTarget {
  id: string;
  scenario: string;
  metric: string;
  unit: string;
  nominal: number;
  minimum: number;
  maximum: number;
  weight: number;
  role: PhysicalTargetRole;
  sourceIds: readonly string[];
  releaseBlocking?: boolean;
  condition?: PhysicalOperatingCondition;
  uncertaintyNotes?: string;
}

export interface VesselPhysicalReferenceProfile {
  schemaVersion: typeof PHYSICAL_CALIBRATION_SCHEMA_VERSION;
  id: string;
  vessel: VesselType;
  label: string;
  status: PhysicalProfileStatus;
  description: string;
  passScore: number;
  minimumMeasurementCoverageRatio: number;
  minimumEvidenceCoverageRatio: number;
  sources: readonly PhysicalCalibrationSource[];
  targets: readonly PhysicalMetricTarget[];
}

export interface PhysicalCalibrationMeasurement {
  vessel: VesselType;
  scenario: string;
  metrics: Readonly<Record<string, number>>;
}

export interface PhysicalMetricEvaluation {
  targetId: string;
  scenario: string;
  metric: string;
  unit: string;
  role: PhysicalTargetRole;
  releaseBlocking: boolean;
  measured: boolean;
  value: number | null;
  nominal: number;
  minimum: number;
  maximum: number;
  withinEnvelope: boolean;
  normalizedEnvelopeError: number | null;
  nominalErrorRatio: number | null;
  score: number;
  weight: number;
  evidenceEligible: boolean;
  sourceIds: readonly string[];
}

export interface PhysicalProfileEvaluation {
  profileId: string;
  vessel: VesselType;
  label: string;
  status: PhysicalProfileStatus;
  validationErrors: readonly string[];
  metrics: readonly PhysicalMetricEvaluation[];
  score: number;
  measurementCoverageRatio: number;
  evidenceCoverageRatio: number;
  blockingTargetsPassed: boolean;
  comparisonPassed: boolean;
  certificationEligible: boolean;
  certified: boolean;
}

export interface PhysicalCalibrationReport {
  schemaVersion: typeof PHYSICAL_CALIBRATION_SCHEMA_VERSION;
  profiles: readonly PhysicalProfileEvaluation[];
  summary: {
    totalProfiles: number;
    evidenceBackedProfiles: number;
    certificationEligibleProfiles: number;
    certifiedProfiles: number;
  };
}

export interface CalibrationReportScenarioLike {
  vessel?: unknown;
  scenario?: unknown;
  calibration?: {
    result?: {
      vessel?: unknown;
      scenario?: unknown;
      metrics?: unknown;
    } | null;
  } | null;
}

const EPSILON = 1e-9;
const CERTIFYING_EVIDENCE = new Set<PhysicalEvidenceClass>([
  'sea-trial',
  'model-test',
  'manufacturer',
  'classification',
  'derived',
]);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function targetEvidenceEligible(
  target: PhysicalMetricTarget,
  sourceById: ReadonlyMap<string, PhysicalCalibrationSource>,
) {
  return target.sourceIds.some((sourceId) => {
    const source = sourceById.get(sourceId);
    return source ? CERTIFYING_EVIDENCE.has(source.evidenceClass) : false;
  });
}

export function validatePhysicalReferenceProfile(
  profile: VesselPhysicalReferenceProfile,
) {
  const errors: string[] = [];

  if (profile.schemaVersion !== PHYSICAL_CALIBRATION_SCHEMA_VERSION) {
    errors.push(
      `Profile ${profile.id || '<unknown>'} uses unsupported schema version ${profile.schemaVersion}.`,
    );
  }
  if (!nonEmpty(profile.id)) errors.push('Profile id is required.');
  if (!nonEmpty(profile.label)) errors.push('Profile label is required.');
  if (!nonEmpty(profile.description)) {
    errors.push(`Profile ${profile.id} description is required.`);
  }
  if (!finiteNumber(profile.passScore) || profile.passScore < 0 || profile.passScore > 100) {
    errors.push(`Profile ${profile.id} passScore must be between 0 and 100.`);
  }
  if (
    !finiteNumber(profile.minimumMeasurementCoverageRatio) ||
    profile.minimumMeasurementCoverageRatio < 0 ||
    profile.minimumMeasurementCoverageRatio > 1
  ) {
    errors.push(
      `Profile ${profile.id} minimumMeasurementCoverageRatio must be between 0 and 1.`,
    );
  }
  if (
    !finiteNumber(profile.minimumEvidenceCoverageRatio) ||
    profile.minimumEvidenceCoverageRatio < 0 ||
    profile.minimumEvidenceCoverageRatio > 1
  ) {
    errors.push(
      `Profile ${profile.id} minimumEvidenceCoverageRatio must be between 0 and 1.`,
    );
  }

  const sourceIds = new Set<string>();
  for (const source of profile.sources) {
    if (!nonEmpty(source.id)) {
      errors.push(`Profile ${profile.id} contains a source without an id.`);
      continue;
    }
    if (sourceIds.has(source.id)) {
      errors.push(`Profile ${profile.id} repeats source id ${source.id}.`);
    }
    sourceIds.add(source.id);
    if (!nonEmpty(source.title) || !nonEmpty(source.publisher)) {
      errors.push(
        `Source ${source.id} in profile ${profile.id} requires title and publisher.`,
      );
    }
  }

  const targetIds = new Set<string>();
  for (const target of profile.targets) {
    if (!nonEmpty(target.id)) {
      errors.push(`Profile ${profile.id} contains a target without an id.`);
      continue;
    }
    if (targetIds.has(target.id)) {
      errors.push(`Profile ${profile.id} repeats target id ${target.id}.`);
    }
    targetIds.add(target.id);
    if (!nonEmpty(target.scenario) || !nonEmpty(target.metric) || !nonEmpty(target.unit)) {
      errors.push(
        `Target ${target.id} in profile ${profile.id} requires scenario, metric, and unit.`,
      );
    }
    if (
      !finiteNumber(target.minimum) ||
      !finiteNumber(target.nominal) ||
      !finiteNumber(target.maximum)
    ) {
      errors.push(`Target ${target.id} contains a non-finite envelope.`);
    } else if (
      target.minimum > target.nominal ||
      target.nominal > target.maximum
    ) {
      errors.push(
        `Target ${target.id} must satisfy minimum <= nominal <= maximum.`,
      );
    }
    if (!finiteNumber(target.weight) || target.weight <= 0) {
      errors.push(`Target ${target.id} weight must be greater than zero.`);
    }
    if (target.sourceIds.length === 0) {
      errors.push(`Target ${target.id} must cite at least one source.`);
    }
    for (const sourceId of target.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        errors.push(
          `Target ${target.id} references unknown source ${sourceId}.`,
        );
      }
    }
  }

  if (profile.targets.length === 0) {
    errors.push(`Profile ${profile.id} must contain at least one target.`);
  }

  return errors;
}

export function evaluatePhysicalMetric(
  target: PhysicalMetricTarget,
  value: number | undefined,
  sourceById: ReadonlyMap<string, PhysicalCalibrationSource>,
): PhysicalMetricEvaluation {
  const evidenceEligible = targetEvidenceEligible(target, sourceById);
  const measured = finiteNumber(value);
  const releaseBlocking = target.releaseBlocking ?? target.role !== 'informational';

  if (!measured) {
    return {
      targetId: target.id,
      scenario: target.scenario,
      metric: target.metric,
      unit: target.unit,
      role: target.role,
      releaseBlocking,
      measured: false,
      value: null,
      nominal: target.nominal,
      minimum: target.minimum,
      maximum: target.maximum,
      withinEnvelope: false,
      normalizedEnvelopeError: null,
      nominalErrorRatio: null,
      score: 0,
      weight: target.weight,
      evidenceEligible,
      sourceIds: target.sourceIds,
    };
  }

  const belowSpan = Math.max(
    target.nominal - target.minimum,
    Math.abs(target.nominal) * 0.05,
    EPSILON,
  );
  const aboveSpan = Math.max(
    target.maximum - target.nominal,
    Math.abs(target.nominal) * 0.05,
    EPSILON,
  );
  const normalizedEnvelopeError =
    value < target.minimum
      ? (target.minimum - value) / belowSpan
      : value > target.maximum
        ? (value - target.maximum) / aboveSpan
        : 0;
  const nominalScale = Math.max(
    Math.abs(target.nominal),
    Math.abs(target.maximum - target.minimum),
    EPSILON,
  );
  const nominalErrorRatio = Math.abs(value - target.nominal) / nominalScale;
  const withinEnvelope = normalizedEnvelopeError === 0;
  const score = 100 * clamp(1 - normalizedEnvelopeError, 0, 1);

  return {
    targetId: target.id,
    scenario: target.scenario,
    metric: target.metric,
    unit: target.unit,
    role: target.role,
    releaseBlocking,
    measured: true,
    value,
    nominal: target.nominal,
    minimum: target.minimum,
    maximum: target.maximum,
    withinEnvelope,
    normalizedEnvelopeError,
    nominalErrorRatio,
    score,
    weight: target.weight,
    evidenceEligible,
    sourceIds: target.sourceIds,
  };
}

export function evaluatePhysicalReferenceProfile(
  profile: VesselPhysicalReferenceProfile,
  measurements: readonly PhysicalCalibrationMeasurement[],
): PhysicalProfileEvaluation {
  const validationErrors = validatePhysicalReferenceProfile(profile);
  const sourceById = new Map(
    profile.sources.map((source) => [source.id, source] as const),
  );
  const measurementByScenario = new Map(
    measurements
      .filter((measurement) => measurement.vessel === profile.vessel)
      .map((measurement) => [measurement.scenario, measurement] as const),
  );

  const metrics = profile.targets.map((target) => {
    const measurement = measurementByScenario.get(target.scenario);
    return evaluatePhysicalMetric(
      target,
      measurement?.metrics[target.metric],
      sourceById,
    );
  });

  const totalWeight = metrics.reduce((sum, metric) => sum + metric.weight, 0);
  const measuredWeight = metrics.reduce(
    (sum, metric) => sum + (metric.measured ? metric.weight : 0),
    0,
  );
  const evidenceWeight = metrics.reduce(
    (sum, metric) => sum + (metric.evidenceEligible ? metric.weight : 0),
    0,
  );
  const scoredWeight = metrics.reduce(
    (sum, metric) => sum + (metric.measured ? metric.weight * metric.score : 0),
    0,
  );
  const score = measuredWeight > 0 ? scoredWeight / measuredWeight : 0;
  const measurementCoverageRatio =
    totalWeight > 0 ? measuredWeight / totalWeight : 0;
  const evidenceCoverageRatio =
    totalWeight > 0 ? evidenceWeight / totalWeight : 0;
  const blockingTargets = metrics.filter((metric) => metric.releaseBlocking);
  const blockingTargetsPassed = blockingTargets.every(
    (metric) => metric.measured && metric.withinEnvelope,
  );
  const comparisonPassed =
    validationErrors.length === 0 &&
    measurementCoverageRatio >= profile.minimumMeasurementCoverageRatio &&
    score >= profile.passScore &&
    blockingTargetsPassed;
  const certificationEligible =
    profile.status === 'evidence-backed' &&
    validationErrors.length === 0 &&
    measurementCoverageRatio >= profile.minimumMeasurementCoverageRatio &&
    evidenceCoverageRatio >= profile.minimumEvidenceCoverageRatio;

  return {
    profileId: profile.id,
    vessel: profile.vessel,
    label: profile.label,
    status: profile.status,
    validationErrors,
    metrics,
    score,
    measurementCoverageRatio,
    evidenceCoverageRatio,
    blockingTargetsPassed,
    comparisonPassed,
    certificationEligible,
    certified: certificationEligible && comparisonPassed,
  };
}

export function measurementsFromCalibrationScenarios(
  scenarios: readonly CalibrationReportScenarioLike[],
) {
  const measurements: PhysicalCalibrationMeasurement[] = [];

  for (const entry of scenarios) {
    const result = entry.calibration?.result;
    const vessel = result?.vessel ?? entry.vessel;
    const scenario = result?.scenario ?? entry.scenario;
    const rawMetrics = result?.metrics;
    if (
      (vessel !== 'trawler' && vessel !== 'speedboat') ||
      !nonEmpty(scenario) ||
      !rawMetrics ||
      typeof rawMetrics !== 'object' ||
      Array.isArray(rawMetrics)
    ) {
      continue;
    }

    const metrics: Record<string, number> = {};
    for (const [name, value] of Object.entries(rawMetrics)) {
      if (finiteNumber(value)) metrics[name] = value;
    }
    measurements.push({ vessel, scenario, metrics });
  }

  return measurements;
}

export function evaluatePhysicalCalibrationReport(
  scenarios: readonly CalibrationReportScenarioLike[],
  profiles: readonly VesselPhysicalReferenceProfile[],
): PhysicalCalibrationReport {
  const measurements = measurementsFromCalibrationScenarios(scenarios);
  const evaluations = profiles.map((profile) =>
    evaluatePhysicalReferenceProfile(profile, measurements),
  );

  return {
    schemaVersion: PHYSICAL_CALIBRATION_SCHEMA_VERSION,
    profiles: evaluations,
    summary: {
      totalProfiles: evaluations.length,
      evidenceBackedProfiles: evaluations.filter(
        (evaluation) => evaluation.status === 'evidence-backed',
      ).length,
      certificationEligibleProfiles: evaluations.filter(
        (evaluation) => evaluation.certificationEligible,
      ).length,
      certifiedProfiles: evaluations.filter((evaluation) => evaluation.certified)
        .length,
    },
  };
}
