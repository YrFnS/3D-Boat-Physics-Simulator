import { Object3D, Quaternion, Vector3 } from 'three';

const EPSILON = 1e-8;
const MAX_ANGULAR_SPEED_RAD_PER_SECOND = Math.PI * 4;
const WORLD_UP = new Vector3(0, 1, 0);

export interface SixDofBodySpawn {
  x: number;
  y: number;
  z: number;
  headingDeg: number;
}

export interface SixDofMotionLimits {
  maxHorizontalSpeedMps: number;
  maxVerticalSpeedMps: number;
  maxAngularSpeedRadPerSecond: number;
}

let queuedBodySpawn: SixDofBodySpawn | null = null;

export function queueNextSixDofBodySpawn(spawn: SixDofBodySpawn) {
  if (
    !Number.isFinite(spawn.x) ||
    !Number.isFinite(spawn.y) ||
    !Number.isFinite(spawn.z) ||
    !Number.isFinite(spawn.headingDeg)
  ) {
    queuedBodySpawn = null;
    return;
  }

  queuedBodySpawn = { ...spawn };
}

function consumeQueuedBodySpawn() {
  const spawn = queuedBodySpawn;
  queuedBodySpawn = null;
  return spawn;
}

function vectorIsFinite(value: Vector3) {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function quaternionIsFinite(value: Quaternion) {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w) &&
    value.lengthSq() > EPSILON
  );
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > EPSILON ? value : fallback;
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteLimit(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : Number.POSITIVE_INFINITY;
}

/**
 * Lightweight six-degree-of-freedom body used by the marine force model.
 *
 * Linear velocity is the world-space velocity of the center of mass. Angular
 * velocity is stored in world space for point-velocity queries, while inertia
 * and damping are evaluated in the vessel's principal body axes.
 *
 * Rapier supplies contact manifolds, but this body remains authoritative for
 * marine forces, momentum, orientation, and contact impulses.
 */
export class SixDofBody extends Object3D {
  readonly linearVelocity = new Vector3();
  readonly angularVelocity = new Vector3();

  private readonly accumulatedForce = new Vector3();
  private readonly accumulatedTorque = new Vector3();
  private readonly principalInertia = new Vector3(1, 1, 1);
  private readonly inversePrincipalInertia = new Vector3(1, 1, 1);
  private readonly angularDamping = new Vector3();
  private readonly centerOfMassLocal = new Vector3();

  private readonly worldCenterOfMass = new Vector3();
  private readonly centerOfMassOffsetWorld = new Vector3();
  private readonly leverArm = new Vector3();
  private readonly localTorque = new Vector3();
  private readonly localAngularVelocity = new Vector3();
  private readonly localAngularMomentum = new Vector3();
  private readonly gyroscopicTorque = new Vector3();
  private readonly localAngularAcceleration = new Vector3();
  private readonly localAngularImpulse = new Vector3();
  private readonly deltaAngularVelocity = new Vector3();
  private readonly worldAngularVelocity = new Vector3();
  private readonly inverseRotation = new Quaternion();
  private readonly deltaRotation = new Quaternion();
  private readonly rotationAxis = new Vector3();
  private readonly pointOffset = new Vector3();

  private readonly lastValidPosition = new Vector3();
  private readonly lastValidQuaternion = new Quaternion();
  private readonly lastValidLinearVelocity = new Vector3();
  private readonly lastValidAngularVelocity = new Vector3();
  private hasLastValidState = false;

  private inverseMass = 1;

  constructor() {
    super();
    const spawn = consumeQueuedBodySpawn();
    if (spawn) {
      this.position.set(spawn.x, spawn.y, spawn.z);
      this.quaternion.setFromAxisAngle(
        WORLD_UP,
        (-spawn.headingDeg * Math.PI) / 180,
      );
    }
    this.captureValidState();
  }

  setMassProperties(
    massKg: number,
    principalInertiaKgM2: readonly [number, number, number],
    angularDampingPerSecond: readonly [number, number, number],
    centerOfMassLocal: readonly [number, number, number] = [0, 0, 0],
  ) {
    const safeMassKg = finitePositive(massKg, 1);
    this.inverseMass = 1 / safeMassKg;

    this.principalInertia.set(
      finitePositive(principalInertiaKgM2[0], 1),
      finitePositive(principalInertiaKgM2[1], 1),
      finitePositive(principalInertiaKgM2[2], 1),
    );
    this.inversePrincipalInertia.set(
      1 / this.principalInertia.x,
      1 / this.principalInertia.y,
      1 / this.principalInertia.z,
    );
    this.angularDamping.set(
      finiteNonNegative(angularDampingPerSecond[0]),
      finiteNonNegative(angularDampingPerSecond[1]),
      finiteNonNegative(angularDampingPerSecond[2]),
    );
    this.centerOfMassLocal.set(
      Number.isFinite(centerOfMassLocal[0]) ? centerOfMassLocal[0] : 0,
      Number.isFinite(centerOfMassLocal[1]) ? centerOfMassLocal[1] : 0,
      Number.isFinite(centerOfMassLocal[2]) ? centerOfMassLocal[2] : 0,
    );
  }

  beginStep() {
    if (this.hasFiniteState()) {
      this.captureValidState();
    } else {
      this.restoreLastValidState();
    }
    this.accumulatedForce.set(0, 0, 0);
    this.accumulatedTorque.set(0, 0, 0);
  }

  addForce(forceWorld: Vector3) {
    this.accumulatedForce.add(forceWorld);
  }

  addTorque(torqueWorld: Vector3) {
    this.accumulatedTorque.add(torqueWorld);
  }

  addForceAtPoint(forceWorld: Vector3, pointWorld: Vector3) {
    this.accumulatedForce.add(forceWorld);
    this.getWorldCenterOfMass(this.worldCenterOfMass);
    this.leverArm.copy(pointWorld).sub(this.worldCenterOfMass);
    this.accumulatedTorque.add(this.leverArm.cross(forceWorld));
  }

  applyImpulseAtPoint(impulseWorld: Vector3, pointWorld: Vector3) {
    if (!vectorIsFinite(impulseWorld) || !vectorIsFinite(pointWorld)) return;

    this.linearVelocity.addScaledVector(impulseWorld, this.inverseMass);

    this.getWorldCenterOfMass(this.worldCenterOfMass);
    this.leverArm.copy(pointWorld).sub(this.worldCenterOfMass);
    this.localAngularImpulse
      .copy(this.leverArm)
      .cross(impulseWorld)
      .applyQuaternion(this.inverseRotation.copy(this.quaternion).invert());
    this.deltaAngularVelocity
      .set(
        this.localAngularImpulse.x * this.inversePrincipalInertia.x,
        this.localAngularImpulse.y * this.inversePrincipalInertia.y,
        this.localAngularImpulse.z * this.inversePrincipalInertia.z,
      )
      .applyQuaternion(this.quaternion);
    this.angularVelocity.add(this.deltaAngularVelocity);

    const angularSpeed = this.angularVelocity.length();
    if (angularSpeed > MAX_ANGULAR_SPEED_RAD_PER_SECOND) {
      this.angularVelocity.multiplyScalar(
        MAX_ANGULAR_SPEED_RAD_PER_SECOND / angularSpeed,
      );
    }
  }

  applyPositionCorrection(correctionWorld: Vector3) {
    if (!vectorIsFinite(correctionWorld)) return;
    this.position.add(correctionWorld);
  }

  getWorldCenterOfMass(target: Vector3) {
    return target
      .copy(this.centerOfMassLocal)
      .applyQuaternion(this.quaternion)
      .add(this.position);
  }

  localPointToWorld(localPoint: Vector3, target: Vector3) {
    return target
      .copy(localPoint)
      .applyQuaternion(this.quaternion)
      .add(this.position);
  }

  velocityAtPoint(pointWorld: Vector3, target: Vector3) {
    this.getWorldCenterOfMass(this.worldCenterOfMass);
    this.pointOffset.copy(pointWorld).sub(this.worldCenterOfMass);
    return target
      .copy(this.angularVelocity)
      .cross(this.pointOffset)
      .add(this.linearVelocity);
  }

  hasFiniteState() {
    return (
      vectorIsFinite(this.position) &&
      quaternionIsFinite(this.quaternion) &&
      vectorIsFinite(this.linearVelocity) &&
      vectorIsFinite(this.angularVelocity)
    );
  }

  enforceMotionLimits(limits: SixDofMotionLimits) {
    if (!this.hasFiniteState()) {
      this.restoreLastValidState();
      return false;
    }

    const maxHorizontalSpeedMps = finiteLimit(
      limits.maxHorizontalSpeedMps,
    );
    const horizontalSpeedMps = Math.hypot(
      this.linearVelocity.x,
      this.linearVelocity.z,
    );
    if (
      horizontalSpeedMps > maxHorizontalSpeedMps &&
      horizontalSpeedMps > EPSILON
    ) {
      const scale = maxHorizontalSpeedMps / horizontalSpeedMps;
      this.linearVelocity.x *= scale;
      this.linearVelocity.z *= scale;
    }

    const maxVerticalSpeedMps = finiteLimit(limits.maxVerticalSpeedMps);
    this.linearVelocity.y = Math.max(
      -maxVerticalSpeedMps,
      Math.min(maxVerticalSpeedMps, this.linearVelocity.y),
    );

    const maxAngularSpeedRadPerSecond = finiteLimit(
      limits.maxAngularSpeedRadPerSecond,
    );
    const angularSpeedRadPerSecond = this.angularVelocity.length();
    if (
      angularSpeedRadPerSecond > maxAngularSpeedRadPerSecond &&
      angularSpeedRadPerSecond > EPSILON
    ) {
      this.angularVelocity.multiplyScalar(
        maxAngularSpeedRadPerSecond / angularSpeedRadPerSecond,
      );
    }

    this.captureValidState();
    return true;
  }

  integrate(deltaSeconds: number) {
    const dt = Number.isFinite(deltaSeconds)
      ? Math.max(0, deltaSeconds)
      : 0;
    if (dt <= 0) return;

    // Integrate the center of mass, then reconstruct the model origin after
    // rotation. This prevents an offset center of mass from orbiting around
    // the visual origin when the vessel pitches or rolls.
    this.getWorldCenterOfMass(this.worldCenterOfMass);
    this.linearVelocity.addScaledVector(
      this.accumulatedForce,
      this.inverseMass * dt,
    );
    this.worldCenterOfMass.addScaledVector(this.linearVelocity, dt);

    // Euler's rigid-body equation in principal axes:
    // I * angularAcceleration = torque - angularVelocity x (I * angularVelocity)
    // The gyroscopic term matters once pitch, roll, and yaw are all active.
    this.inverseRotation.copy(this.quaternion).invert();
    this.localTorque
      .copy(this.accumulatedTorque)
      .applyQuaternion(this.inverseRotation);
    this.localAngularVelocity
      .copy(this.angularVelocity)
      .applyQuaternion(this.inverseRotation);
    this.localAngularMomentum.set(
      this.localAngularVelocity.x * this.principalInertia.x,
      this.localAngularVelocity.y * this.principalInertia.y,
      this.localAngularVelocity.z * this.principalInertia.z,
    );
    this.gyroscopicTorque
      .copy(this.localAngularVelocity)
      .cross(this.localAngularMomentum);
    this.localTorque.sub(this.gyroscopicTorque);
    this.localAngularAcceleration.set(
      this.localTorque.x * this.inversePrincipalInertia.x,
      this.localTorque.y * this.inversePrincipalInertia.y,
      this.localTorque.z * this.inversePrincipalInertia.z,
    );
    this.localAngularVelocity.addScaledVector(
      this.localAngularAcceleration,
      dt,
    );
    this.localAngularVelocity.set(
      this.localAngularVelocity.x * Math.exp(-this.angularDamping.x * dt),
      this.localAngularVelocity.y * Math.exp(-this.angularDamping.y * dt),
      this.localAngularVelocity.z * Math.exp(-this.angularDamping.z * dt),
    );

    let localAngularSpeed = this.localAngularVelocity.length();
    if (localAngularSpeed > MAX_ANGULAR_SPEED_RAD_PER_SECOND) {
      this.localAngularVelocity.multiplyScalar(
        MAX_ANGULAR_SPEED_RAD_PER_SECOND / localAngularSpeed,
      );
      localAngularSpeed = MAX_ANGULAR_SPEED_RAD_PER_SECOND;
    }

    this.worldAngularVelocity
      .copy(this.localAngularVelocity)
      .applyQuaternion(this.quaternion);
    if (localAngularSpeed > EPSILON) {
      this.rotationAxis
        .copy(this.worldAngularVelocity)
        .multiplyScalar(1 / localAngularSpeed);
      this.deltaRotation.setFromAxisAngle(
        this.rotationAxis,
        localAngularSpeed * dt,
      );
      this.quaternion.premultiply(this.deltaRotation).normalize();
    }

    this.angularVelocity
      .copy(this.localAngularVelocity)
      .applyQuaternion(this.quaternion);
    this.centerOfMassOffsetWorld
      .copy(this.centerOfMassLocal)
      .applyQuaternion(this.quaternion);
    this.position
      .copy(this.worldCenterOfMass)
      .sub(this.centerOfMassOffsetWorld);

    // A single invalid force restores the complete previous state instead of
    // independently zeroing values or teleporting the vessel to the origin.
    if (!this.hasFiniteState()) {
      this.restoreLastValidState();
      return;
    }
    this.captureValidState();
  }

  private captureValidState() {
    if (!this.hasFiniteState()) return false;
    this.quaternion.normalize();
    this.lastValidPosition.copy(this.position);
    this.lastValidQuaternion.copy(this.quaternion);
    this.lastValidLinearVelocity.copy(this.linearVelocity);
    this.lastValidAngularVelocity.copy(this.angularVelocity);
    this.hasLastValidState = true;
    return true;
  }

  private restoreLastValidState() {
    if (!this.hasLastValidState) {
      this.position.set(0, 0, 0);
      this.quaternion.identity();
      this.linearVelocity.set(0, 0, 0);
      this.angularVelocity.set(0, 0, 0);
      this.captureValidState();
    } else {
      this.position.copy(this.lastValidPosition);
      this.quaternion.copy(this.lastValidQuaternion);
      this.linearVelocity.copy(this.lastValidLinearVelocity);
      this.angularVelocity.copy(this.lastValidAngularVelocity);
    }
    this.accumulatedForce.set(0, 0, 0);
    this.accumulatedTorque.set(0, 0, 0);
  }
}
