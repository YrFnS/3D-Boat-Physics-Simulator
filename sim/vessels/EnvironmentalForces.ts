import { MathUtils, Vector3 } from 'three';
import type { SixDofBody } from '@/sim/core/SixDofBody';
import type { SeededRandom } from '@/sim/core/SeededRandom';
import type { VesselConfig } from '@/sim/vessels/VesselConfig';
import { referenceForceForAcceleration } from '@/sim/vessels/PhysicsCorrectness';

const EPSILON = 1e-8;
const REFERENCE_YAW_INERTIA_KG_M2 = 2_000;

export interface EnvironmentalForceResult {
  hullDamage: number;
  engineDamage: number;
  iceContactSpeedMps: number;
}

export interface ApplyEnvironmentalForcesOptions {
  body: SixDofBody;
  vessel: VesselConfig;
  deltaSeconds: number;
  waterVelocity: Vector3;
  iceFactor: number;
  submergedRatio: number;
  throttle: number;
  tornadoPosition: Vector3;
  whirlpoolPosition: Vector3;
  random: SeededRandom;
}

/**
 * Applies environmental hazards through the rigid-body force/impulse API.
 * The old implementation edited velocity directly, which bypassed configured
 * mass, inertia, force application points, and fixed-step scaling.
 */
export class EnvironmentalForces {
  private readonly force = new Vector3();
  private readonly torque = new Vector3();
  private readonly waterRelativeVelocity = new Vector3();
  private readonly localApplicationPoint = new Vector3();
  private readonly worldApplicationPoint = new Vector3();
  private readonly impulse = new Vector3();
  private readonly result: EnvironmentalForceResult = {
    hullDamage: 0,
    engineDamage: 0,
    iceContactSpeedMps: 0,
  };

  apply({
    body,
    vessel,
    deltaSeconds,
    waterVelocity,
    iceFactor,
    submergedRatio,
    throttle,
    tornadoPosition,
    whirlpoolPosition,
    random,
  }: ApplyEnvironmentalForcesOptions) {
    const dt = Number.isFinite(deltaSeconds)
      ? Math.max(0, deltaSeconds)
      : 0;
    this.result.hullDamage = 0;
    this.result.engineDamage = 0;
    this.result.iceContactSpeedMps = 0;
    if (dt <= 0) return this.result;

    this.applyIceForces(
      body,
      vessel,
      dt,
      waterVelocity,
      MathUtils.clamp(iceFactor, 0, 1),
      MathUtils.clamp(submergedRatio, 0, 1),
      throttle,
      random,
    );
    this.applyTornadoForces(
      body,
      vessel,
      dt,
      tornadoPosition,
      random,
    );
    this.applyWhirlpoolForces(
      body,
      dt,
      whirlpoolPosition,
      random,
    );
    return this.result;
  }

  private applyIceForces(
    body: SixDofBody,
    vessel: VesselConfig,
    dt: number,
    waterVelocity: Vector3,
    iceFactor: number,
    submergedRatio: number,
    throttle: number,
    random: SeededRandom,
  ) {
    if (iceFactor <= 0.3 || submergedRatio <= 0.1) return;

    this.waterRelativeVelocity
      .copy(body.linearVelocity)
      .sub(waterVelocity);
    const contactSpeedMps = Math.hypot(
      this.waterRelativeVelocity.x,
      this.waterRelativeVelocity.z,
    );
    this.result.iceContactSpeedMps = contactSpeedMps;

    // Convert the legacy exponential velocity damping into a force. The
    // reference-mass force means the heavier trawler now loses less speed than
    // the lighter speedboat under an otherwise identical ice encounter.
    const dampingRatePerSecond = iceFactor * 6;
    const exactVelocityLossRate =
      (1 - Math.exp(-dampingRatePerSecond * dt)) / dt;
    const forcePerMps = referenceForceForAcceleration(
      exactVelocityLossRate,
    );
    body.addForce(
      this.force.set(
        -this.waterRelativeVelocity.x * forcePerMps,
        0,
        -this.waterRelativeVelocity.z * forcePerMps,
      ),
    );

    if (contactSpeedMps <= 2 || Math.abs(throttle) <= 0.1) return;

    this.result.hullDamage +=
      contactSpeedMps * iceFactor * 0.2 * dt;

    // Individual floe strikes are timestep-independent events. Their impulse
    // is applied near the bow so roll and pitch emerge from the configured
    // mass properties instead of direct angular-velocity edits.
    const impactRatePerSecond = 1.5 + iceFactor * 3.5;
    if (!random.chancePerSecond(impactRatePerSecond, dt)) return;

    body.localPointToWorld(
      this.localApplicationPoint.set(
        random.signed() * vessel.halfWidthM * 0.75,
        0.05,
        -vessel.halfLengthM * 0.78,
      ),
      this.worldApplicationPoint,
    );
    const impulseNs = 35 * contactSpeedMps * iceFactor;
    this.impulse
      .set(
        random.signed() * 0.18,
        0.35 + random.next() * 0.25,
        random.signed() * 0.08,
      )
      .normalize()
      .applyQuaternion(body.quaternion)
      .multiplyScalar(impulseNs);
    body.applyImpulseAtPoint(this.impulse, this.worldApplicationPoint);
  }

  private applyTornadoForces(
    body: SixDofBody,
    vessel: VesselConfig,
    dt: number,
    tornadoPosition: Vector3,
    random: SeededRandom,
  ) {
    const dx = tornadoPosition.x - body.position.x;
    const dz = tornadoPosition.z - body.position.z;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared >= 120 * 120) return;

    const distanceM = Math.max(Math.sqrt(distanceSquared), 1e-4);
    const nx = dx / distanceM;
    const nz = dz / distanceM;
    const pullAccelerationMps2 =
      Math.pow(1 - distanceM / 120, 2) * 12;

    body.localPointToWorld(
      this.localApplicationPoint.fromArray(vessel.windPointLocal),
      this.worldApplicationPoint,
    );
    const pullForceN = referenceForceForAcceleration(
      pullAccelerationMps2,
    );
    this.force.set(nx * pullForceN, 0, nz * pullForceN);

    if (distanceM < 40) {
      const innerFactor = Math.pow(1 - distanceM / 40, 2);
      this.force.y += referenceForceForAcceleration(
        random.next() * 6 * innerFactor,
      );
      body.addTorque(
        this.torque.set(
          0,
          random.signed() *
            5 *
            innerFactor *
            REFERENCE_YAW_INERTIA_KG_M2,
          0,
        ),
      );
      this.result.hullDamage += 10 * dt * innerFactor;
    }

    body.addForceAtPoint(this.force, this.worldApplicationPoint);
  }

  private applyWhirlpoolForces(
    body: SixDofBody,
    dt: number,
    whirlpoolPosition: Vector3,
    random: SeededRandom,
  ) {
    const dx = whirlpoolPosition.x - body.position.x;
    const dz = whirlpoolPosition.z - body.position.z;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared >= 160 * 160) return;

    const distanceM = Math.max(Math.sqrt(distanceSquared), 1e-4);
    const radiusM = 160;
    const eyeWallRadiusM = 25;
    const influence = 1 - MathUtils.smoothstep(distanceM, 0, radiusM);
    const nx = dx / distanceM;
    const nz = dz / distanceM;

    const radialAccelerationMps2 = Math.pow(influence, 2) * 45;
    const swirlAccelerationMps2 =
      distanceM > eyeWallRadiusM
        ? (eyeWallRadiusM / distanceM) * 120
        : (distanceM / eyeWallRadiusM) * 120;

    const radialForceN = referenceForceForAcceleration(
      radialAccelerationMps2,
    );
    const swirlForceN = referenceForceForAcceleration(
      swirlAccelerationMps2,
    );
    this.force.set(
      nx * radialForceN - nz * swirlForceN,
      0,
      nz * radialForceN + nx * swirlForceN,
    );
    body.addForce(this.force);
    body.addTorque(
      this.torque.set(
        0,
        swirlAccelerationMps2 *
          0.05 *
          REFERENCE_YAW_INERTIA_KG_M2,
        0,
      ),
    );

    if (distanceM >= 40) return;

    const damageFactor = Math.pow(1 - distanceM / 40, 2);
    this.result.hullDamage += 15 * dt * damageFactor;
    this.result.engineDamage += 5 * dt * damageFactor;

    // Shuddering is now a force/torque integrated by dt, rather than an
    // unscaled velocity kick every fixed step.
    body.addForce(
      this.force.set(
        referenceForceForAcceleration(
          random.signed() * 10 * damageFactor,
        ),
        0,
        referenceForceForAcceleration(
          random.signed() * 10 * damageFactor,
        ),
      ),
    );
    body.addTorque(
      this.torque.set(
        0,
        random.signed() *
          5 *
          damageFactor *
          REFERENCE_YAW_INERTIA_KG_M2,
        0,
      ),
    );

    if (distanceM >= 18) return;

    this.result.hullDamage += 50 * dt;
    this.force.set(
      referenceForceForAcceleration(nx * 40),
      referenceForceForAcceleration(-45),
      referenceForceForAcceleration(nz * 40),
    );
    if (this.force.lengthSq() > EPSILON) {
      body.addForce(this.force);
    }
  }
}
