import type { PhysicalCalibrationMeasurement } from './PhysicalCalibration';
import {
  getVesselConfig,
  type VesselConfig,
  type VesselType,
} from '../vessels/VesselConfig';

/**
 * Convert the current simulator configuration into a deterministic measurement
 * row. These values are not evidence by themselves; they are the model inputs
 * that external reference profiles compare against.
 */
export function createVesselConfigurationMeasurement(
  vessel: VesselConfig,
): PhysicalCalibrationMeasurement {
  return {
    vessel: vessel.type,
    scenario: 'configuration',
    metrics: {
      configuredLengthOverallM: vessel.halfLengthM * 2,
      configuredBeamOverallM: vessel.halfWidthM * 2,
      configuredMassKg: vessel.massKg,
      configuredDraftM: vessel.deepestDraftM,
      configuredRatedPowerW: vessel.engine.ratedPowerW,
      configuredPropellerDiameterM: vessel.propeller.diameterM,
      configuredPlaningCapableFlag: vessel.planingCapable ? 1 : 0,
      configuredWaterDensityKgM3: vessel.waterDensityKgM3,
    },
  };
}

const VESSEL_TYPES: readonly VesselType[] = ['trawler', 'speedboat'];

export const VESSEL_CONFIGURATION_MEASUREMENTS:
  readonly PhysicalCalibrationMeasurement[] = VESSEL_TYPES.map((type) =>
    createVesselConfigurationMeasurement(getVesselConfig(type)),
  );
