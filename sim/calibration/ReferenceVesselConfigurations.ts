import type { VesselType } from '../vessels/VesselConfig';

export const REFERENCE_VESSEL_CONFIGURATION_SCHEMA_VERSION = 1 as const;

export interface ReferenceQuantity {
  value: number | null;
  unit: string;
  sourceIds: readonly string[];
  notes?: string;
}

export interface ReferenceTextValue {
  value: string | null;
  sourceIds: readonly string[];
  notes?: string;
}

export interface ReferenceBooleanValue {
  value: boolean | null;
  sourceIds: readonly string[];
  notes?: string;
}

export interface ReferenceVesselConfiguration {
  schemaVersion: typeof REFERENCE_VESSEL_CONFIGURATION_SCHEMA_VERSION;
  id: string;
  profileId: string;
  vessel: VesselType;
  label: string;
  status: 'provisional' | 'trial-ready';
  geometry: {
    lengthOverallM: ReferenceQuantity;
    beamOverallM: ReferenceQuantity;
    draftM: ReferenceQuantity;
    deadriseDeg: ReferenceQuantity;
    hullDescription: ReferenceTextValue;
  };
  loading: {
    publishedMassKg: ReferenceQuantity;
    massBasis: ReferenceTextValue;
    engineIncluded: ReferenceBooleanValue;
    testDisplacementKg: ReferenceQuantity;
    fuelMassKg: ReferenceQuantity;
    payloadMassKg: ReferenceQuantity;
    waterDensityKgM3: ReferenceQuantity;
    longitudinalCenterOfGravityM: ReferenceQuantity;
    verticalCenterOfGravityM: ReferenceQuantity;
    staticTrimDeg: ReferenceQuantity;
  };
  propulsion: {
    minimumRatedPowerW: ReferenceQuantity;
    referenceRatedPowerW: ReferenceQuantity;
    maximumRatedPowerW: ReferenceQuantity;
    gearRatioAhead: ReferenceQuantity;
    gearRatioAstern: ReferenceQuantity;
    propellerDiameterM: ReferenceQuantity;
    propellerPitchRatio: ReferenceQuantity;
    shaftAngleRad: ReferenceQuantity;
  };
  steering: {
    description: ReferenceTextValue;
    effectiveAreaM2: ReferenceQuantity;
    aspectRatio: ReferenceQuantity;
    maximumAngleRad: ReferenceQuantity;
  };
  performance: {
    publishedSpeedMps: ReferenceQuantity;
    publishedCruiseSpeedMps: ReferenceQuantity;
    publishedBollardPullKgf: ReferenceQuantity;
  };
  requiredTrialFields: readonly string[];
}

export interface ReferenceConfigurationEvaluation {
  configurationId: string;
  profileId: string;
  vessel: VesselType;
  validationErrors: readonly string[];
  knownFieldCount: number;
  totalFieldCount: number;
  publishedCoverageRatio: number;
  knownTrialFieldCount: number;
  requiredTrialFieldCount: number;
  trialReadinessRatio: number;
  missingTrialFields: readonly string[];
  trialReady: boolean;
}

const TOMBOY_SOURCE = 'de-wit-tomboy-26-official';
const AXOPAR_SOURCE = 'axopar-22-spyder-official';
const KNOT_TO_MPS = 0.514444;

function quantity(
  value: number | null,
  unit: string,
  sourceIds: readonly string[],
  notes?: string,
): ReferenceQuantity {
  return { value, unit, sourceIds, notes };
}

function unknownQuantity(unit: string, notes: string): ReferenceQuantity {
  return quantity(null, unit, [], notes);
}

function textValue(
  value: string | null,
  sourceIds: readonly string[],
  notes?: string,
): ReferenceTextValue {
  return { value, sourceIds, notes };
}

function booleanValue(
  value: boolean | null,
  sourceIds: readonly string[],
  notes?: string,
): ReferenceBooleanValue {
  return { value, sourceIds, notes };
}

const TRIAL_FIELDS = [
  'geometry.lengthOverallM',
  'geometry.beamOverallM',
  'geometry.draftM',
  'loading.testDisplacementKg',
  'loading.waterDensityKgM3',
  'loading.longitudinalCenterOfGravityM',
  'loading.verticalCenterOfGravityM',
  'loading.staticTrimDeg',
  'propulsion.referenceRatedPowerW',
  'propulsion.gearRatioAhead',
  'propulsion.propellerDiameterM',
  'propulsion.propellerPitchRatio',
  'propulsion.shaftAngleRad',
  'steering.effectiveAreaM2',
  'steering.maximumAngleRad',
] as const;

export const REFERENCE_VESSEL_CONFIGURATIONS:
  readonly ReferenceVesselConfiguration[] = [
  {
    schemaVersion: 1,
    id: 'tomboy-26-reference-configuration',
    profileId: 'trawler-tomboy-26-provisional',
    vessel: 'trawler',
    label: 'De Wit Tomboy 26 reference configuration',
    status: 'provisional',
    geometry: {
      lengthOverallM: quantity(7.96, 'm', [TOMBOY_SOURCE]),
      beamOverallM: quantity(2.39, 'm', [TOMBOY_SOURCE]),
      draftM: quantity(1.22, 'm', [TOMBOY_SOURCE]),
      deadriseDeg: unknownQuantity(
        'deg',
        'Hull-section geometry is not stated on the selected manufacturer page.',
      ),
      hullDescription: textValue('Tomboy 26 workboat', [TOMBOY_SOURCE]),
    },
    loading: {
      publishedMassKg: quantity(5_670, 'kg', [TOMBOY_SOURCE]),
      massBasis: textValue('lightship weight', [TOMBOY_SOURCE]),
      engineIncluded: booleanValue(
        null,
        [],
        'The selected source does not define the lightship inventory in sufficient detail.',
      ),
      testDisplacementKg: unknownQuantity(
        'kg',
        'A matched trial displacement, consumables, payload, and crew inventory are required.',
      ),
      fuelMassKg: unknownQuantity('kg', 'Fuel state is not published.'),
      payloadMassKg: unknownQuantity('kg', 'Trial payload is not published.'),
      waterDensityKgM3: unknownQuantity(
        'kg/m3',
        'Trial water density is not published.',
      ),
      longitudinalCenterOfGravityM: unknownQuantity(
        'm',
        'Longitudinal center of gravity is not published.',
      ),
      verticalCenterOfGravityM: unknownQuantity(
        'm',
        'Vertical center of gravity is not published.',
      ),
      staticTrimDeg: unknownQuantity('deg', 'Static trial trim is not published.'),
    },
    propulsion: {
      minimumRatedPowerW: unknownQuantity(
        'W',
        'The selected checkpoint uses only the published standard engine power.',
      ),
      referenceRatedPowerW: quantity(90_000, 'W', [TOMBOY_SOURCE]),
      maximumRatedPowerW: unknownQuantity(
        'W',
        'The selected checkpoint does not normalize optional engine packages.',
      ),
      gearRatioAhead: unknownQuantity('ratio', 'Gearbox ratio is not published.'),
      gearRatioAstern: unknownQuantity(
        'ratio',
        'Astern gearbox ratio is not published.',
      ),
      propellerDiameterM: unknownQuantity(
        'm',
        'Propeller diameter is not published.',
      ),
      propellerPitchRatio: unknownQuantity(
        'ratio',
        'Propeller pitch ratio is not published.',
      ),
      shaftAngleRad: unknownQuantity('rad', 'Shaft angle is not published.'),
    },
    steering: {
      description: textValue(
        null,
        [],
        'The selected source does not provide a normalized steering-system definition.',
      ),
      effectiveAreaM2: unknownQuantity(
        'm2',
        'Effective rudder area is not published.',
      ),
      aspectRatio: unknownQuantity(
        'ratio',
        'Rudder aspect ratio is not published.',
      ),
      maximumAngleRad: unknownQuantity(
        'rad',
        'Maximum rudder angle is not published.',
      ),
    },
    performance: {
      publishedSpeedMps: quantity(7.5 * KNOT_TO_MPS, 'm/s', [TOMBOY_SOURCE]),
      publishedCruiseSpeedMps: unknownQuantity(
        'm/s',
        'A separate cruise condition is not published.',
      ),
      publishedBollardPullKgf: quantity(1_200, 'kgf', [TOMBOY_SOURCE]),
    },
    requiredTrialFields: TRIAL_FIELDS,
  },
  {
    schemaVersion: 1,
    id: 'axopar-22-spyder-reference-configuration',
    profileId: 'speedboat-axopar-22-spyder-provisional',
    vessel: 'speedboat',
    label: 'Axopar 22 Spyder reference configuration',
    status: 'provisional',
    geometry: {
      lengthOverallM: quantity(7.2, 'm', [AXOPAR_SOURCE]),
      beamOverallM: quantity(2.23, 'm', [AXOPAR_SOURCE]),
      draftM: quantity(0.8, 'm', [AXOPAR_SOURCE]),
      deadriseDeg: quantity(20, 'deg', [AXOPAR_SOURCE]),
      hullDescription: textValue('twin-stepped 20-degree V hull', [AXOPAR_SOURCE]),
    },
    loading: {
      publishedMassKg: quantity(1_200, 'kg', [AXOPAR_SOURCE]),
      massBasis: textValue('weight excluding engine', [AXOPAR_SOURCE]),
      engineIncluded: booleanValue(false, [AXOPAR_SOURCE]),
      testDisplacementKg: unknownQuantity(
        'kg',
        'A matched engine, fuel, payload, crew, and equipment inventory is required.',
      ),
      fuelMassKg: unknownQuantity('kg', 'Fuel state is not published for the speed claim.'),
      payloadMassKg: unknownQuantity(
        'kg',
        'Payload and passenger state are not published for the speed claim.',
      ),
      waterDensityKgM3: unknownQuantity(
        'kg/m3',
        'Trial water density is not published.',
      ),
      longitudinalCenterOfGravityM: unknownQuantity(
        'm',
        'Longitudinal center of gravity is not published.',
      ),
      verticalCenterOfGravityM: unknownQuantity(
        'm',
        'Vertical center of gravity is not published.',
      ),
      staticTrimDeg: unknownQuantity('deg', 'Static trial trim is not published.'),
    },
    propulsion: {
      minimumRatedPowerW: quantity(85_755, 'W', [AXOPAR_SOURCE]),
      referenceRatedPowerW: quantity(
        149_140,
        'W',
        [AXOPAR_SOURCE],
        'The manufacturer cruise example uses a 200 hp Mercury.',
      ),
      maximumRatedPowerW: quantity(186_425, 'W', [AXOPAR_SOURCE]),
      gearRatioAhead: unknownQuantity(
        'ratio',
        'Outboard gear ratio for the tested engine and propeller is not published.',
      ),
      gearRatioAstern: unknownQuantity(
        'ratio',
        'Astern gear ratio is not published.',
      ),
      propellerDiameterM: unknownQuantity(
        'm',
        'Matched propeller diameter is not published.',
      ),
      propellerPitchRatio: unknownQuantity(
        'ratio',
        'Matched propeller pitch is not published.',
      ),
      shaftAngleRad: unknownQuantity(
        'rad',
        'Matched outboard trim and shaft angle are not published.',
      ),
    },
    steering: {
      description: textValue(
        null,
        [],
        'The exact steering geometry and outboard angle schedule are not published.',
      ),
      effectiveAreaM2: unknownQuantity(
        'm2',
        'An equivalent steering-area model has not been derived.',
      ),
      aspectRatio: unknownQuantity(
        'ratio',
        'An equivalent steering aspect ratio has not been derived.',
      ),
      maximumAngleRad: unknownQuantity(
        'rad',
        'Maximum outboard steering angle is not published.',
      ),
    },
    performance: {
      publishedSpeedMps: quantity(
        45 * KNOT_TO_MPS,
        'm/s',
        [AXOPAR_SOURCE],
        'Published as an “up to” ceiling, not a guaranteed matched-condition result.',
      ),
      publishedCruiseSpeedMps: quantity(
        27 * KNOT_TO_MPS,
        'm/s',
        [AXOPAR_SOURCE],
        'Published as a cruise fuel-consumption example with a 200 hp Mercury.',
      ),
      publishedBollardPullKgf: unknownQuantity(
        'kgf',
        'Bollard pull is not a published target for this planing craft.',
      ),
    },
    requiredTrialFields: TRIAL_FIELDS,
  },
];

function isReferenceField(value: unknown): value is {
  value: unknown;
  sourceIds: readonly string[];
  notes?: string;
} {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'value' in value &&
      'sourceIds' in value,
  );
}

function flattenFields(
  value: unknown,
  prefix = '',
  target = new Map<string, { value: unknown; sourceIds: readonly string[]; notes?: string }>(),
) {
  if (isReferenceField(value)) {
    target.set(prefix, value);
    return target;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return target;

  for (const [key, child] of Object.entries(value)) {
    if (key === 'requiredTrialFields') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    flattenFields(child, path, target);
  }
  return target;
}

export function validateReferenceVesselConfiguration(
  configuration: ReferenceVesselConfiguration,
) {
  const errors: string[] = [];
  if (
    configuration.schemaVersion !==
    REFERENCE_VESSEL_CONFIGURATION_SCHEMA_VERSION
  ) {
    errors.push(`${configuration.id} uses an unsupported schema version.`);
  }
  if (!configuration.id.trim() || !configuration.profileId.trim()) {
    errors.push('Configuration id and profile id are required.');
  }

  const fields = flattenFields(configuration);
  for (const [path, field] of fields) {
    if (field.value === null) {
      if (!field.notes?.trim()) {
        errors.push(`${configuration.id} missing field ${path} requires notes.`);
      }
      continue;
    }
    if (field.sourceIds.length === 0) {
      errors.push(`${configuration.id} known field ${path} requires a source.`);
    }
    if (typeof field.value === 'number' && !Number.isFinite(field.value)) {
      errors.push(`${configuration.id} field ${path} must be finite.`);
    }
  }

  const missingRequired = configuration.requiredTrialFields.filter(
    (path) => fields.get(path)?.value === null || !fields.has(path),
  );
  if (configuration.status === 'trial-ready' && missingRequired.length > 0) {
    errors.push(
      `${configuration.id} cannot be trial-ready with missing fields: ${missingRequired.join(', ')}.`,
    );
  }
  return errors;
}

export function evaluateReferenceVesselConfiguration(
  configuration: ReferenceVesselConfiguration,
): ReferenceConfigurationEvaluation {
  const validationErrors = validateReferenceVesselConfiguration(configuration);
  const fields = flattenFields(configuration);
  const knownFieldCount = [...fields.values()].filter(
    (field) => field.value !== null,
  ).length;
  const totalFieldCount = fields.size;
  const missingTrialFields = configuration.requiredTrialFields.filter(
    (path) => fields.get(path)?.value === null || !fields.has(path),
  );
  const requiredTrialFieldCount = configuration.requiredTrialFields.length;
  const knownTrialFieldCount = requiredTrialFieldCount - missingTrialFields.length;

  return {
    configurationId: configuration.id,
    profileId: configuration.profileId,
    vessel: configuration.vessel,
    validationErrors,
    knownFieldCount,
    totalFieldCount,
    publishedCoverageRatio:
      totalFieldCount > 0 ? knownFieldCount / totalFieldCount : 0,
    knownTrialFieldCount,
    requiredTrialFieldCount,
    trialReadinessRatio:
      requiredTrialFieldCount > 0
        ? knownTrialFieldCount / requiredTrialFieldCount
        : 0,
    missingTrialFields,
    trialReady:
      configuration.status === 'trial-ready' &&
      validationErrors.length === 0 &&
      missingTrialFields.length === 0,
  };
}

export function evaluateReferenceVesselConfigurations(
  configurations: readonly ReferenceVesselConfiguration[],
) {
  const evaluations = configurations.map(evaluateReferenceVesselConfiguration);
  return {
    schemaVersion: REFERENCE_VESSEL_CONFIGURATION_SCHEMA_VERSION,
    configurations: evaluations,
    summary: {
      totalConfigurations: evaluations.length,
      trialReadyConfigurations: evaluations.filter(
        (evaluation) => evaluation.trialReady,
      ).length,
    },
  };
}
