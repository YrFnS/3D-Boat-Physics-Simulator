const EPSILON = 1e-8;
const DEFAULT_REFERENCE_MASS_KG = 1_000;

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function finiteNonNegative(value: number) {
  return Math.max(0, finiteOrZero(value));
}

export function projectOntoAxis(
  vector: Vector3Like,
  axis: Vector3Like,
) {
  const axisLength = Math.hypot(axis.x, axis.y, axis.z);
  if (!Number.isFinite(axisLength) || axisLength <= EPSILON) return 0;

  const projection =
    finiteOrZero(vector.x) * finiteOrZero(axis.x) +
    finiteOrZero(vector.y) * finiteOrZero(axis.y) +
    finiteOrZero(vector.z) * finiteOrZero(axis.z);
  return projection / axisLength;
}

export function waterRelativeSurgeSpeed(
  bodyVelocity: Vector3Like,
  waterVelocity: Vector3Like,
  bodyForwardAxis: Vector3Like,
) {
  const axisLength = Math.hypot(
    bodyForwardAxis.x,
    bodyForwardAxis.y,
    bodyForwardAxis.z,
  );
  if (!Number.isFinite(axisLength) || axisLength <= EPSILON) return 0;

  const relativeX =
    finiteOrZero(bodyVelocity.x) - finiteOrZero(waterVelocity.x);
  const relativeY =
    finiteOrZero(bodyVelocity.y) - finiteOrZero(waterVelocity.y);
  const relativeZ =
    finiteOrZero(bodyVelocity.z) - finiteOrZero(waterVelocity.z);
  return (
    relativeX * finiteOrZero(bodyForwardAxis.x) +
    relativeY * finiteOrZero(bodyForwardAxis.y) +
    relativeZ * finiteOrZero(bodyForwardAxis.z)
  ) / axisLength;
}

export function normalizedSurgeSpeed(
  signedSurgeSpeedMps: number,
  referenceSpeedMps: number,
) {
  const safeReferenceSpeed = finiteNonNegative(referenceSpeedMps);
  if (safeReferenceSpeed <= EPSILON) return 0;
  return Math.min(
    1,
    Math.abs(finiteOrZero(signedSurgeSpeedMps)) / safeReferenceSpeed,
  );
}

/**
 * Planing requires positive forward flow relative to the surrounding water.
 * Ground speed, reverse motion, and a following current cannot create lift.
 */
export function planingSpeedRatio(
  signedSurgeSpeedMps: number,
  referenceSpeedMps: number,
) {
  const safeReferenceSpeed = finiteNonNegative(referenceSpeedMps);
  if (safeReferenceSpeed <= EPSILON) return 0;
  return Math.min(
    1,
    Math.max(0, finiteOrZero(signedSurgeSpeedMps)) /
      safeReferenceSpeed,
  );
}

/**
 * Converts a legacy acceleration-shaped effect into a force referenced to a
 * representative vessel mass. Applying the force to the real body makes the
 * resulting acceleration depend on the configured vessel mass.
 */
export function referenceForceForAcceleration(
  accelerationMps2: number,
  referenceMassKg = DEFAULT_REFERENCE_MASS_KG,
) {
  return (
    finiteOrZero(accelerationMps2) *
    Math.max(EPSILON, finiteNonNegative(referenceMassKg))
  );
}
