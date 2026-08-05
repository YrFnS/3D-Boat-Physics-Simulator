export type VesselDamageSource =
  | 'slamming'
  | 'environmental-impact'
  | 'terrain-impact'
  | 'obstacle-impact'
  | 'engine-overheat'
  | 'machinery-flooding';

export interface VesselHealthState {
  hullHealth: number;
  engineHealth: number;
  rudderHealth: number;
}

export interface VesselDamageEvent {
  source: VesselDamageSource;
  hullDamage?: number;
  engineDamage?: number;
  rudderDamage?: number;
}

export const VESSEL_DAMAGE_SOURCE_LABELS: Readonly<
  Record<VesselDamageSource, string>
> = Object.freeze({
  slamming: 'Hull slamming',
  'environmental-impact': 'Environmental impact',
  'terrain-impact': 'Grounding or terrain impact',
  'obstacle-impact': 'Obstacle impact',
  'engine-overheat': 'Engine overheating',
  'machinery-flooding': 'Machinery-space flooding',
});

/**
 * Normal operation is not a structural damage event. A vessel may
 * plane at its designed speed or carry ordinary rudder load without
 * silently losing health merely because time passed.
 */
export const NORMAL_OPERATION_DAMAGE_POLICY = Object.freeze({
  sustainedPlaningHullDamagePerSecond: 0,
  hydrodynamicRudderWearPerSecond: 0,
});

function finiteNonNegative(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function clampHealth(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function applyVesselDamage(
  health: VesselHealthState,
  event: VesselDamageEvent,
): VesselHealthState {
  return {
    hullHealth: clampHealth(
      health.hullHealth - finiteNonNegative(event.hullDamage),
    ),
    engineHealth: clampHealth(
      health.engineHealth - finiteNonNegative(event.engineDamage),
    ),
    rudderHealth: clampHealth(
      health.rudderHealth - finiteNonNegative(event.rudderDamage),
    ),
  };
}
