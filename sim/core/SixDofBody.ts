import { Object3D, Quaternion, Vector3 } from 'three';
import { headingDegreesToYawRadians } from '@/sim/world/WorldDirection';

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

export interface SixDofExternalState {
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  linearVelocity: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };
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
 * This body remains authoritative for marine-force evaluation and the
 * anisotropic velocity update. A dynamic external rigid-body solver may own
 * pose advancement and contact response, then import its solved state here.
 */
export class SixDofBody extends Object3D {
  readonly linearVelocity = new Vector3();
  readonly angularVelocity = new Vector3();

  private readonly accumulatedForce = new Vector3();
  private readonly accumulatedTorque = new Vector3();
  private readonly principalMass = new Vector3(1, 1, 1);
  private readonly inversePrincipalMass = new Vector3(1, 1, 1);
  private readonly principalInertia = new Vector3(1, 1, 1);
  private readonly inversePrincipalInertia = new Vector3(1, 1, 1);
  private readonly angularDamping = new Vector3();
  private readonly centerOfMassLocal = new Vector3();

  private readonly worldCenterOfMass = new Vector3();
  private readonly centerOfMassOffsetWorld = new Vector3();
  private readonly leverArm = new Vector3();
  private readonly localForce = new Vector3();
  private readonly localLinearAcceleration = new Vector3();
  private readonly worldLinearAcceleration = new Vector3();
  private readonly localLinearImpulse = new Vector3();
  private readonly deltaLinearVelocity = new Vector3();
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


  constructor() {
    super();
    const spawn = consumeQueuedBodySpawn();
    if (spawn) {
      this.position.set(spawn.x, spawn.y, spawn.z);
      this.quaternion.setFromAxisAngle(
        WORLD_UP,
        headingDegreesToYawRadians(spawn.headingDeg),
      );
    }
    this.captureValidState();
  }

  setMassProperties(
    massKg: number,
    principalInertiaKgM2: readonly [number, number, number],
    angularDampingPerSecond: readonly [number, number, number],
    centerOfMassLocal: readonly [number, number, number] = [0, 0, 0],
    principalAddedMassKg: readonly [number, number, number] = [0, 0, 0],
    principalAddedInertiaKgM2: readonly [number, number, number] = [0, 0, 0],
  ) {
    const safeMassKg = finitePositive(massKg, 1);
    this.principalMass.set(
      safeMassKg + finiteNonNegative(principalAddedMassKg[0]),
      safeMassKg + finiteNonNegative(principalAddedMassKg[1]),
      safeMassKg + finiteNonNegative(principalAddedMassKg[2]),
    );
    this.inversePrincipalMass.set(
      1 / this.principalMass.x,
      1 / this.principalMass.y,
      1 / this.principalMass.z,
    );

    this.principalInertia.set(
      finitePositive(principalInertiaKgM2[0], 1) +
        finiteNonNegative(principalAddedInertiaKgM2[0]),
      finitePositive(principalInertiaKgM2[1], 1) +
        finiteNonNegative(principalAddedInertiaKgM2[1]),
      finitePositive(principalInertiaKgM2[2], 1) +
        finiteNonNegative(principalAddedInertiaKgM2[2]),
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

    this.inverseRotation.copy(this.quaternion).invert();
    this.localLinearImpulse
      .copy(impulseWorld)
      .applyQuaternion(this.inverseRotation);
    this.deltaLinearVelocity
      .set(
        this.localLinearImpulse.x * this.inversePrincipalMass.x,
        this.localLinearImpulse.y * this.inversePrincipalMass.y,
        this.localLinearImpulse.z * this.inversePrincipalMass.z,
      )
      .applyQuaternion(this.quaternion);
    this.linearVelocity.add(this.deltaLinearVelocity);

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

  getWorldCenterOfMass(target: Vector3) {
    return target
      .copy(this.centerOfMassLocal)
      .applyQuaternion(this.quaternion)
      .add(this.position);
  }

  getCenterOfMassLocal(target: Vector3) {
    return target.copy(this.centerOfMassLocal);
  }

  getPrincipalInertia(target: Vector3) {
    return target.copy(this.principalInertia);
  }

  importExternalSolverState(state: SixDofExternalState) {
    this.position.set(
      state.position.x,
      state.position.y,
      state.position.z,
    );
    this.quaternion.set(
      state.quaternion.x,
      state.quaternion.y,
      state.quaternion.z,
      state.quaternion.w,
    );
    this.linearVelocity.set(
      state.linearVelocity.x,
      state.linearVelocity.y,
      state.linearVelocity.z,
    );
    this.angularVelocity.set(
      state.angularVelocity.x,
      state.angularVelocity.y,
      state.angularVelocity.z,
    );

    if (!this.hasFiniteState()) {
      this.restoreLastValidState();
      return false;
    }

    this.quaternion.normalize();
    this.captureValidState();
    return true;
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

  integrateVelocities(deltaSeconds: number) {
    const dt = Number.isFinite(deltaSeconds)
      ? Math.max(0, deltaSeconds)
      : 0;
    if (dt <= 0) return true;

    this.inverseRotation.copy(this.quaternion).invert();
    this.localForce
      .copy(this.accumulatedForce)
      .applyQuaternion(this.inverseRotation);
    this.localLinearAcceleration.set(
      this.localForce.x * this.inversePrincipalMass.x,
      this.localForce.y * this.inversePrincipalMass.y,
      this.localForce.z * this.inversePrincipalMass.z,
    );
    this.worldLinearAcceleration
      .copy(this.localLinearAcceleration)
      .applyQuaternion(this.quaternion);
    this.linearVelocity.addScaledVector(
      this.worldLinearAcceleration,
      dt,
    );

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

    const localAngularSpeed = this.localAngularVelocity.length();
    if (localAngularSpeed > MAX_ANGULAR_SPEED_RAD_PER_SECOND) {
      this.localAngularVelocity.multiplyScalar(
        MAX_ANGULAR_SPEED_RAD_PER_SECOND / localAngularSpeed,
      );
    }
    this.angularVelocity
      .copy(this.localAngularVelocity)
      .applyQuaternion(this.quaternion);

    if (!this.hasFiniteState()) {
      this.restoreLastValidState();
      return false;
    }
    return true;
  }

  integratePose(deltaSeconds: number) {
    const dt = Number.isFinite(deltaSeconds)
      ? Math.max(0, deltaSeconds)
      : 0;
    if (dt <= 0) return true;

    // Advance the center of mass exactly once, then reconstruct the model
    // origin after rotation. This phase can be replaced by an external rigid-
    // body solver without changing the marine force and added-mass equations.
    this.getWorldCenterOfMass(this.worldCenterOfMass);
    this.worldCenterOfMass.addScaledVector(this.linearVelocity, dt);

    this.inverseRotation.copy(this.quaternion).invert();
    this.localAngularVelocity
      .copy(this.angularVelocity)
      .applyQuaternion(this.inverseRotation);
    const localAngularSpeed = this.localAngularVelocity.length();
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

    if (!this.hasFiniteState()) {
      this.restoreLastValidState();
      return false;
    }
    this.captureValidState();
    return true;
  }

  integrate(deltaSeconds: number) {
    if (!this.integrateVelocities(deltaSeconds)) return;
    this.integratePose(deltaSeconds);
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
