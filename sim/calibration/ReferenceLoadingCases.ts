export const REFERENCE_LOADING_CASE_SCHEMA_VERSION = 1 as const;

export interface LoadingCaseQuantity {
  value: number | null;
  unit: string;
  sourceIds: readonly string[];
  notes?: string;
}

export interface ReferenceLoadingCase {
  schemaVersion: typeof REFERENCE_LOADING_CASE_SCHEMA_VERSION;
  id: string;
  configurationId: string;
  label: string;
  status: 'published-partial' | 'trial-ready';
  purpose: 'static-equilibrium' | 'performance';
  sourceIds: readonly string[];
  quantities: {
    hullOrLightshipMassKg: LoadingCaseQuantity;
    engineMassKg: LoadingCaseQuantity;
    testDisplacementKg: LoadingCaseQuantity;
    maximumRecommendedLoadKg: LoadingCaseQuantity;
    personsMassKg: LoadingCaseQuantity;
    payloadMassKg: LoadingCaseQuantity;
    consumableLiquidsMassKg: LoadingCaseQuantity;
    fuelVolumeL: LoadingCaseQuantity;
    fuelMassKg: LoadingCaseQuantity;
    waterDensityKgM3: LoadingCaseQuantity;
    draftM: LoadingCaseQuantity;
    longitudinalCenterOfGravityM: LoadingCaseQuantity;
    verticalCenterOfGravityM: LoadingCaseQuantity;
    staticTrimDeg: LoadingCaseQuantity;
  };
  requiredFields: readonly string[];
  notes: string;
}

export interface LoadingCaseEvaluation {
  loadingCaseId: string;
  configurationId: string;
  validationErrors: readonly string[];
  knownFieldCount: number;
  totalFieldCount: number;
  publishedCoverageRatio: number;
  knownRequiredFieldCount: number;
  requiredFieldCount: number;
  readinessRatio: number;
  missingRequiredFields: readonly string[];
  trialReady: boolean;
}

const TOMBOY_SOURCE = 'de-wit-tomboy-26-official';
const AXOPAR_PRODUCT_SOURCE = 'axopar-22-spyder-official';
const AXOPAR_MANUAL_SOURCE = 'axopar-22-owner-manual-2021-2023';

function quantity(
  value: number | null,
  unit: string,
  sourceIds: readonly string[],
  notes?: string,
): LoadingCaseQuantity {
  return { value, unit, sourceIds, notes };
}

function unknown(unit: string, notes: string): LoadingCaseQuantity {
  return quantity(null, unit, [], notes);
}

const STATIC_EQUILIBRIUM_FIELDS = [
  'testDisplacementKg',
  'waterDensityKgM3',
  'draftM',
  'longitudinalCenterOfGravityM',
  'verticalCenterOfGravityM',
  'staticTrimDeg',
] as const;

export const REFERENCE_LOADING_CASES: readonly ReferenceLoadingCase[] = [
  {
    schemaVersion: 1,
    id: 'tomboy-26-published-capacity-case',
    configurationId: 'tomboy-26-reference-configuration',
    label: 'Tomboy 26 published capacity data',
    status: 'published-partial',
    purpose: 'static-equilibrium',
    sourceIds: [TOMBOY_SOURCE],
    quantities: {
      hullOrLightshipMassKg: quantity(5_670, 'kg', [TOMBOY_SOURCE]),
      engineMassKg: unknown(
        'kg',
        'The selected page does not publish installed engine mass.',
      ),
      testDisplacementKg: unknown(
        'kg',
        'Lightship weight, 1,500 kg deadweight, and 1,200 kg maximum load are published, but a matched trial displacement and inventory are not defined.',
      ),
      maximumRecommendedLoadKg: quantity(
        1_200,
        'kg',
        [TOMBOY_SOURCE],
        'The source labels this quantity “Maximum load.”',
      ),
      personsMassKg: unknown('kg', 'Trial crew mass is not published.'),
      payloadMassKg: quantity(
        1_500,
        'kg',
        [TOMBOY_SOURCE],
        'The source separately publishes 1,500 kg deadweight; it is not treated as the trial payload without an inventory definition.',
      ),
      consumableLiquidsMassKg: unknown(
        'kg',
        'Consumable liquid state and density are not published.',
      ),
      fuelVolumeL: quantity(
        220,
        'L',
        [TOMBOY_SOURCE],
        'Two integral 110 L fuel tanks are published.',
      ),
      fuelMassKg: unknown(
        'kg',
        'Fuel type, fill fraction, temperature, and density are not published.',
      ),
      waterDensityKgM3: unknown(
        'kg/m3',
        'Trial water density is not published.',
      ),
      draftM: quantity(1.22, 'm', [TOMBOY_SOURCE]),
      longitudinalCenterOfGravityM: unknown(
        'm',
        'Longitudinal center of gravity is not published.',
      ),
      verticalCenterOfGravityM: unknown(
        'm',
        'Vertical center of gravity is not published.',
      ),
      staticTrimDeg: unknown('deg', 'Static trim is not published.'),
    },
    requiredFields: STATIC_EQUILIBRIUM_FIELDS,
    notes:
      'The manufacturer data is useful for capacity planning, but it does not define one internally consistent static-trial load case.',
  },
  {
    schemaVersion: 1,
    id: 'axopar-22-2021-2023-maximum-load-case',
    configurationId: 'axopar-22-spyder-reference-configuration',
    label: 'Axopar 22 model-year 2021–2023 maximum-load case',
    status: 'published-partial',
    purpose: 'static-equilibrium',
    sourceIds: [AXOPAR_PRODUCT_SOURCE, AXOPAR_MANUAL_SOURCE],
    quantities: {
      hullOrLightshipMassKg: quantity(
        1_100,
        'kg',
        [AXOPAR_MANUAL_SOURCE],
        'Owner manual hull weight excluding engine.',
      ),
      engineMassKg: quantity(
        261,
        'kg',
        [AXOPAR_MANUAL_SOURCE],
        'Maximum recommended engine weight.',
      ),
      testDisplacementKg: quantity(
        2_620,
        'kg',
        [AXOPAR_MANUAL_SOURCE],
        'Owner manual boat weight at maximum load.',
      ),
      maximumRecommendedLoadKg: quantity(
        823,
        'kg',
        [AXOPAR_MANUAL_SOURCE],
      ),
      personsMassKg: quantity(
        525,
        'kg',
        [AXOPAR_MANUAL_SOURCE],
        'Seven persons using the manual’s default 75 kg adult mass.',
      ),
      payloadMassKg: unknown(
        'kg',
        'The manual itemizes several load categories but does not provide the exact inventory used by the published speed statements.',
      ),
      consumableLiquidsMassKg: quantity(
        203,
        'kg',
        [AXOPAR_MANUAL_SOURCE],
        'Consumable liquids in permanently installed tanks at maximum load.',
      ),
      fuelVolumeL: quantity(
        230,
        'L',
        [AXOPAR_MANUAL_SOURCE, AXOPAR_PRODUCT_SOURCE],
      ),
      fuelMassKg: unknown(
        'kg',
        'Fuel fill fraction and the allocation inside the 203 kg consumable-liquids figure are not separated.',
      ),
      waterDensityKgM3: unknown(
        'kg/m3',
        'The owner manual does not state test water density.',
      ),
      draftM: quantity(
        0.95,
        'm',
        [AXOPAR_MANUAL_SOURCE],
        'Owner manual draught at maximum load.',
      ),
      longitudinalCenterOfGravityM: unknown(
        'm',
        'Longitudinal center of gravity is not published.',
      ),
      verticalCenterOfGravityM: unknown(
        'm',
        'Vertical center of gravity is not published.',
      ),
      staticTrimDeg: unknown('deg', 'Static trim is not published.'),
    },
    requiredFields: STATIC_EQUILIBRIUM_FIELDS,
    notes:
      'The owner manual supplies a coherent maximum-load mass and draft pair, but CG, trim, water density, and a speed-trial inventory remain missing.',
  },
];

export const REFERENCE_LOADING_CASE_SOURCES = [
  {
    id: AXOPAR_MANUAL_SOURCE,
    title: 'Axopar 22 Spyder & T-Top owner manual, model year 2021–2023',
    publisher: 'Axopar Boats',
    evidenceClass: 'manufacturer',
    url: 'https://manuals.axopar.com/content/p19len/1.7.1.0/en/index.html',
    accessedDate: '2026-08-01',
  },
] as const;

export function validateReferenceLoadingCase(loadingCase: ReferenceLoadingCase) {
  const errors: string[] = [];
  if (loadingCase.schemaVersion !== REFERENCE_LOADING_CASE_SCHEMA_VERSION) {
    errors.push(`${loadingCase.id} uses an unsupported schema version.`);
  }
  if (!loadingCase.id.trim() || !loadingCase.configurationId.trim()) {
    errors.push('Loading-case id and configuration id are required.');
  }

  for (const [field, quantityValue] of Object.entries(loadingCase.quantities)) {
    if (quantityValue.value === null) {
      if (!quantityValue.notes?.trim()) {
        errors.push(`${loadingCase.id} missing field ${field} requires notes.`);
      }
      continue;
    }
    if (!Number.isFinite(quantityValue.value)) {
      errors.push(`${loadingCase.id} field ${field} must be finite.`);
    }
    if (quantityValue.sourceIds.length === 0) {
      errors.push(`${loadingCase.id} known field ${field} requires a source.`);
    }
  }

  const missingRequiredFields = loadingCase.requiredFields.filter(
    (field) =>
    (loadingCase.quantities as Readonly<Record<string, LoadingCaseQuantity>>)[
      field
    ]?.value === null,
  );
  if (loadingCase.status === 'trial-ready' && missingRequiredFields.length > 0) {
    errors.push(
      `${loadingCase.id} cannot be trial-ready with missing fields: ${missingRequiredFields.join(', ')}.`,
    );
  }
  return errors;
}

export function evaluateReferenceLoadingCase(
  loadingCase: ReferenceLoadingCase,
): LoadingCaseEvaluation {
  const validationErrors = validateReferenceLoadingCase(loadingCase);
  const quantities = Object.values(loadingCase.quantities);
  const knownFieldCount = quantities.filter(
    (quantityValue) => quantityValue.value !== null,
  ).length;
  const totalFieldCount = quantities.length;
  const missingRequiredFields = loadingCase.requiredFields.filter(
    (field) =>
    (loadingCase.quantities as Readonly<Record<string, LoadingCaseQuantity>>)[
      field
    ]?.value === null,
  );
  const requiredFieldCount = loadingCase.requiredFields.length;
  const knownRequiredFieldCount = requiredFieldCount - missingRequiredFields.length;

  return {
    loadingCaseId: loadingCase.id,
    configurationId: loadingCase.configurationId,
    validationErrors,
    knownFieldCount,
    totalFieldCount,
    publishedCoverageRatio:
      totalFieldCount > 0 ? knownFieldCount / totalFieldCount : 0,
    knownRequiredFieldCount,
    requiredFieldCount,
    readinessRatio:
      requiredFieldCount > 0 ? knownRequiredFieldCount / requiredFieldCount : 0,
    missingRequiredFields,
    trialReady:
      loadingCase.status === 'trial-ready' &&
      validationErrors.length === 0 &&
      missingRequiredFields.length === 0,
  };
}

export function evaluateReferenceLoadingCases(
  loadingCases: readonly ReferenceLoadingCase[],
) {
  const evaluations = loadingCases.map(evaluateReferenceLoadingCase);
  return {
    schemaVersion: REFERENCE_LOADING_CASE_SCHEMA_VERSION,
    loadingCases: evaluations,
    summary: {
      totalLoadingCases: evaluations.length,
      trialReadyLoadingCases: evaluations.filter(
        (evaluation) => evaluation.trialReady,
      ).length,
    },
  };
}
