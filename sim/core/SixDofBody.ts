import { Object3D, Quaternion, Vector3 } from 'three';

const EPSILON = 1e-8;
const MAX_ANGULAR_SPEED_RAD_PER_SECOND = Math.PI * 4;

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
    Number.isFinite(value.w)
  );
}

/**
 * Lightweight six-degree-of-freedom body used by the marine force model.
 *
 * Linear velocity is the world-space velocity of the center of mass. Angular
 * velocity is stored in world space for point-velocity queries, while inertia
 * and damping are evaluated in the vessel's principal body axes.
 *
 * Collision solving will move to Rapier in a later slice; keeping marine
 * forces behind this interface makes that replacement mechanical.
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
  private readonly worldAngularVelocity = new Vector3();
  private readonly inverseRotation = new Quaternion();
  private readonly deltaRotation = new Quaternion();
  private readonly rotationAxis = new Vector3();
  private readonly pointOffset = new Vector3();

  private inverseMass = 1;

  setMassProperties(
    massKg: number,
    principalInertiaKgM2: readonly [number, number, number],
    angularDampingPerSecond: readonly [number, number, number],
    centerOfMassLocal: readonly [number, number, number] = [0, 0, 0],
  ) {
    const safeMassKg = Math.max(EPSILON, massKg);
    this.inverseMass = 1 / safeMassKg;

    this.principalInertia.set(
      Math.max(EPSILON, principalInertiaKgM2[0]),
      Math.max(EPSILON, principalInertiaKgM2[1]),
      Math.max(EPSILON, principalInertiaKgM2[2]),
    );
    this.inversePrincipalInertia.set(
      1 / this.principalInertia.x,
      1 / this.principalInertia.y,
      1 / this.principalInertia.z,
    );
    this.angularDamping.fromArray(angularDampingPerSecond);
    this.centerOfMassLocal.fromArray(centerOfMassLocal);
  }

  beginStep() {
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

  integrate(deltaSeconds: number) {
    const dt = Math.max(0, deltaSeconds);
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

    // A single invalid force must not permanently poison subsequent steps.
    if (!vectorIsFinite(this.linearVelocity)) {
      this.linearVelocity.set(0, 0, 0);
    }
    if (!vectorIsFinite(this.angularVelocity)) {
      this.angularVelocity.set(0, 0, 0);
    }
    if (!vectorIsFinite(this.position)) {
      this.position.set(0, 0, 0);
    }
    if (!quaternionIsFinite(this.quaternion)) {
      this.quaternion.identity();
    }
  }
}
