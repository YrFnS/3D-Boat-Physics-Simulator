const FULL_CIRCLE_DEGREES = 360;
const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const DIRECTION_EPSILON = 1e-12;

export interface WorldDirectionXZ {
  x: number;
  z: number;
}

/**
 * Authoritative horizontal-world convention for the simulator.
 *
 * - 0 degrees points north along world -Z.
 * - 90 degrees points east along world +X.
 * - Headings increase clockwise when viewed from above.
 * - Wind and current headings describe the direction the medium travels toward.
 */
export function normalizeHeadingDegrees(headingDegrees: number) {
  const finiteHeading = Number.isFinite(headingDegrees)
    ? headingDegrees
    : 0;
  return (
    ((finiteHeading % FULL_CIRCLE_DEGREES) + FULL_CIRCLE_DEGREES) %
    FULL_CIRCLE_DEGREES
  );
}

export function normalizeSignedHeadingDeltaDegrees(
  headingDeltaDegrees: number,
) {
  const normalized = normalizeHeadingDegrees(headingDeltaDegrees);
  return normalized >= 180 ? normalized - FULL_CIRCLE_DEGREES : normalized;
}

export function headingDegreesToWorldDirection(
  headingDegrees: number,
  magnitude = 1,
): WorldDirectionXZ {
  const radians =
    normalizeHeadingDegrees(headingDegrees) * DEGREES_TO_RADIANS;
  const safeMagnitude = Number.isFinite(magnitude) ? magnitude : 0;

  return {
    x: Math.sin(radians) * safeMagnitude,
    z: -Math.cos(radians) * safeMagnitude,
  };
}

export function setWorldVectorFromHeading<
  Target extends { set(x: number, y: number, z: number): Target },
>(
  target: Target,
  headingDegrees: number,
  magnitude = 1,
) {
  const direction = headingDegreesToWorldDirection(
    headingDegrees,
    magnitude,
  );
  return target.set(direction.x, 0, direction.z);
}

/** Vector2.y represents world Z for horizontal shader and audio inputs. */
export function setWorldXZFromHeading<
  Target extends { set(x: number, z: number): Target },
>(
  target: Target,
  headingDegrees: number,
  magnitude = 1,
) {
  const direction = headingDegreesToWorldDirection(
    headingDegrees,
    magnitude,
  );
  return target.set(direction.x, direction.z);
}

export function worldDirectionToHeadingDegrees(
  worldX: number,
  worldZ: number,
  fallbackHeadingDegrees = 0,
) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
    return normalizeHeadingDegrees(fallbackHeadingDegrees);
  }

  if (worldX * worldX + worldZ * worldZ <= DIRECTION_EPSILON) {
    return normalizeHeadingDegrees(fallbackHeadingDegrees);
  }

  return normalizeHeadingDegrees(
    Math.atan2(worldX, -worldZ) * RADIANS_TO_DEGREES,
  );
}

export function headingDegreesToYawRadians(headingDegrees: number) {
  return -normalizeHeadingDegrees(headingDegrees) * DEGREES_TO_RADIANS;
}

export function rotateWorldDirection(
  worldX: number,
  worldZ: number,
  clockwiseDegrees: number,
): WorldDirectionXZ {
  const safeX = Number.isFinite(worldX) ? worldX : 0;
  const safeZ = Number.isFinite(worldZ) ? worldZ : 0;
  const radians =
    normalizeHeadingDegrees(clockwiseDegrees) * DEGREES_TO_RADIANS;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: safeX * cosine - safeZ * sine,
    z: safeX * sine + safeZ * cosine,
  };
}
