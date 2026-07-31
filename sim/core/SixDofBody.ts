import { Object3D, Quaternion, Vector3 } from 'three';

const EPSILON = 1e-8;

/**
 * Lightweight six-degree-of-freedom body used by the marine force model.
 *
 * The body keeps linear/angular velocity in world space, accumulates forces
 * and torques for one fixed simulation step, then integrates its transform.
 * Collision solving will move to Rapier in the following slice; keeping the
 * force model behind this small interface makes that replacement mechanical.
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
  private readonly leverArm = new Vector3();
  private readonly localTorque = new Vector3();
  private readonly localAngularAcceleration = new Vector3();
  private readonly worldAngularAcceleration = new Vector3();
  private readonly inverseRotation = new Quaternion();
  private readonly deltaRotation = new Quaternion();
  private readonly rotationAxis = new Vector3();
  private readonly pointOffset = new Vector3();

  private massKg = 1;
  private inverseMass = 1;

  setMassProperties(
    massKg: number,
    principalInertiaKgM2: readonly [number, number, number],
    angularDampingPerSecond: readonly [number, number, number],
    centerOfMassLocal: readonly [number, number, number] = [0, 0, 0],
  ) {
    this.massKg = Math.max(EPSILON, massKg);
    this.inverseMass = 1 / this.massKg;

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
    this.accumulatedTorque.add(
      this.leverArm.cross(forceWorld),
    );
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

    this.linearVelocity.addScaledVector(
      this.accumulatedForce,
      this.inverseMass * dt,
    );
    this.position.addScaledVector(this.linearVelocity, dt);

    // Principal inertia is stored in body-local axes. Convert the accumulated
    // world torque into that frame, apply inverse inertia, then transform the
    // resulting angular acceleration back to world space.
    this.inverseRotation.copy(this.quaternion).invert();
    this.localTorque
      .copy(this.accumulatedTorque)
      .applyQuaternion(this.inverseRotation);
    this.localAngularAcceleration.set(
      this.localTorque.x * this.inversePrincipalInertia.x,
      this.localTorque.y * this.inversePrincipalInertia.y,
      this.localTorque.z * this.inversePrincipalInertia.z,
    );
    this.worldAngularAcceleration
      .copy(this.localAngularAcceleration)
      .applyQuaternion(this.quaternion);
    this.angularVelocity.addScaledVector(
      this.worldAngularAcceleration,
      dt,
    );

    this.angularVelocity.set(
      this.angularVelocity.x * Math.exp(-this.angularDamping.x * dt),
      this.angularVelocity.y * Math.exp(-this.angularDamping.y * dt),
      this.angularVelocity.z * Math.exp(-this.angularDamping.z * dt),
    );

    const angularSpeed = this.angularVelocity.length();
    if (angularSpeed > EPSILON) {
      this.rotationAxis
        .copy(this.angularVelocity)
        .multiplyScalar(1 / angularSpeed);
      this.deltaRotation.setFromAxisAngle(
        this.rotationAxis,
        angularSpeed * dt,
      );
      // Angular velocity is world-space, so the incremental rotation is
      // premultiplied.
      this.quaternion.premultiply(this.deltaRotation).normalize();
    }
  }
}
