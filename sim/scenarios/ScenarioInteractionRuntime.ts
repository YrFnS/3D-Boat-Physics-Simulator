export type ScenarioInteractionEntityType =
  | 'navigation-gate'
  | 'cargo-pickup'
  | 'cargo-delivery'
  | 'rescue-pickup'
  | 'rescue-delivery'
  | 'storm-beacon';

export interface ScenarioInteractionDefinition {
  holdSeconds?: number;
  maxSpeedKnots?: number;
  gateHalfWidthM?: number;
  gateApproachDistanceM?: number;
}

export interface ScenarioInteractionEntity {
  id: string;
  label: string;
  type: ScenarioInteractionEntityType;
  x: number;
  z: number;
  radiusM: number;
  headingDeg: number;
  interaction?: ScenarioInteractionDefinition;
}

export type ScenarioInteractionStatus =
  | 'idle'
  | 'blocked'
  | 'approach'
  | 'holding'
  | 'too-fast'
  | 'completed';

export interface ScenarioInteractionTelemetry {
  entityId: string | null;
  status: ScenarioInteractionStatus;
  progress: number;
  message: string;
  holdSeconds: number;
  requiredHoldSeconds: number;
}

export interface ScenarioInteractionSample {
  runId: number;
  vesselGeneration: number;
  boatX: number;
  boatZ: number;
  speedKnots: number;
  deltaSeconds: number;
  prerequisiteMet: boolean;
  alreadyCompleted: boolean;
}

export interface ScenarioInteractionEvaluation
  extends ScenarioInteractionTelemetry {
  completed: boolean;
}

interface InteractionState {
  previousBoatX: number;
  previousBoatZ: number;
  hasPreviousPosition: boolean;
  gateArmed: boolean;
  holdSeconds: number;
}

interface HoldProfile {
  holdSeconds: number;
  maxSpeedKnots: number;
  zoneLabel: string;
}

const DEGREES_TO_RADIANS = Math.PI / 180;
const FORWARD_CROSSING_EPSILON_M = 0.05;
const GATE_LATERAL_MARGIN_M = 0.75;

function finiteOr(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeIdentity(value: number) {
  return Number.isFinite(value) ? Math.trunc(value) : -1;
}

export function createIdleScenarioInteractionTelemetry(): ScenarioInteractionTelemetry {
  return {
    entityId: null,
    status: 'idle',
    progress: 0,
    message: '',
    holdSeconds: 0,
    requiredHoldSeconds: 0,
  };
}

export function resolveNavigationGateHalfWidthM(
  entity: Pick<ScenarioInteractionEntity, 'radiusM' | 'interaction'>,
) {
  return positiveOr(
    entity.interaction?.gateHalfWidthM,
    Math.max(4, Math.min(9, finiteOr(entity.radiusM) * 0.42)),
  );
}

export function resolveNavigationGateApproachDistanceM(
  entity: Pick<ScenarioInteractionEntity, 'radiusM' | 'interaction'>,
) {
  return positiveOr(
    entity.interaction?.gateApproachDistanceM,
    Math.max(10, Math.min(24, finiteOr(entity.radiusM) * 0.9)),
  );
}

function resolveHoldProfile(
  entity: ScenarioInteractionEntity,
): HoldProfile {
  const configuredHold = entity.interaction?.holdSeconds;
  const configuredSpeed = entity.interaction?.maxSpeedKnots;

  switch (entity.type) {
    case 'cargo-pickup':
      return {
        holdSeconds: positiveOr(configuredHold, 1.5),
        maxSpeedKnots: positiveOr(configuredSpeed, 3),
        zoneLabel: 'loading zone',
      };
    case 'cargo-delivery':
      return {
        holdSeconds: positiveOr(configuredHold, 2),
        maxSpeedKnots: positiveOr(configuredSpeed, 2.5),
        zoneLabel: 'delivery zone',
      };
    case 'rescue-pickup':
      return {
        holdSeconds: positiveOr(configuredHold, 2.5),
        maxSpeedKnots: positiveOr(configuredSpeed, 3.5),
        zoneLabel: 'recovery zone',
      };
    case 'rescue-delivery':
      return {
        holdSeconds: positiveOr(configuredHold, 2),
        maxSpeedKnots: positiveOr(configuredSpeed, 5),
        zoneLabel: 'transfer zone',
      };
    case 'storm-beacon':
      return {
        holdSeconds: positiveOr(configuredHold, 5),
        maxSpeedKnots: positiveOr(configuredSpeed, 6),
        zoneLabel: 'relay zone',
      };
    default:
      return {
        holdSeconds: 0,
        maxSpeedKnots: Number.POSITIVE_INFINITY,
        zoneLabel: 'interaction zone',
      };
  }
}

function telemetry(
  entity: ScenarioInteractionEntity,
  status: ScenarioInteractionStatus,
  progress: number,
  message: string,
  holdSeconds = 0,
  requiredHoldSeconds = 0,
  completed = false,
): ScenarioInteractionEvaluation {
  return {
    entityId: entity.id,
    status,
    progress: clamp01(progress),
    message,
    holdSeconds: Math.max(0, finiteOr(holdSeconds)),
    requiredHoldSeconds: Math.max(
      0,
      finiteOr(requiredHoldSeconds),
    ),
    completed,
  };
}

function createState(
  boatX: number,
  boatZ: number,
): InteractionState {
  return {
    previousBoatX: finiteOr(boatX),
    previousBoatZ: finiteOr(boatZ),
    hasPreviousPosition: false,
    gateArmed: false,
    holdSeconds: 0,
  };
}

export class ScenarioInteractionRuntime {
  private runId = -1;
  private vesselGeneration = -1;
  private readonly states = new Map<string, InteractionState>();

  reset(runId = -1, vesselGeneration = -1) {
    this.runId = normalizeIdentity(runId);
    this.vesselGeneration = normalizeIdentity(vesselGeneration);
    this.states.clear();
  }

  evaluate(
    entity: ScenarioInteractionEntity,
    sample: ScenarioInteractionSample,
  ): ScenarioInteractionEvaluation {
    this.ensureIdentity(sample.runId, sample.vesselGeneration);

    if (sample.alreadyCompleted) {
      return telemetry(
        entity,
        'completed',
        1,
        `${entity.label} complete.`,
        0,
        0,
        true,
      );
    }

    let state = this.states.get(entity.id);
    if (!state) {
      state = createState(sample.boatX, sample.boatZ);
      this.states.set(entity.id, state);
    }

    if (!sample.prerequisiteMet) {
      state.holdSeconds = 0;
      this.reanchor(state, sample.boatX, sample.boatZ);
      return telemetry(
        entity,
        'blocked',
        0,
        'Complete the prerequisite task before entering this zone.',
      );
    }

    if (entity.type === 'navigation-gate') {
      return this.evaluateGate(entity, sample, state);
    }
    return this.evaluateHold(entity, sample, state);
  }

  private ensureIdentity(runId: number, vesselGeneration: number) {
    const normalizedRunId = normalizeIdentity(runId);
    const normalizedGeneration = normalizeIdentity(vesselGeneration);
    if (
      normalizedRunId !== this.runId ||
      normalizedGeneration !== this.vesselGeneration
    ) {
      this.reset(normalizedRunId, normalizedGeneration);
    }
  }

  private evaluateGate(
    entity: ScenarioInteractionEntity,
    sample: ScenarioInteractionSample,
    state: InteractionState,
  ) {
    const radians = finiteOr(entity.headingDeg) * DEGREES_TO_RADIANS;
    const forwardX = Math.sin(radians);
    const forwardZ = -Math.cos(radians);
    const rightX = -forwardZ;
    const rightZ = forwardX;
    const halfWidthM = resolveNavigationGateHalfWidthM(entity);
    const approachDistanceM =
      resolveNavigationGateApproachDistanceM(entity);
    const currentX = finiteOr(sample.boatX);
    const currentZ = finiteOr(sample.boatZ);
    const relativeX = currentX - entity.x;
    const relativeZ = currentZ - entity.z;
    const alongM = relativeX * forwardX + relativeZ * forwardZ;
    const acrossM = relativeX * rightX + relativeZ * rightZ;
    const approachChannelHalfWidthM =
      halfWidthM + GATE_LATERAL_MARGIN_M;

    let previousAlongM = alongM;
    let previousAcrossM = acrossM;
    if (state.hasPreviousPosition) {
      const previousRelativeX = state.previousBoatX - entity.x;
      const previousRelativeZ = state.previousBoatZ - entity.z;
      previousAlongM =
        previousRelativeX * forwardX +
        previousRelativeZ * forwardZ;
      previousAcrossM =
        previousRelativeX * rightX +
        previousRelativeZ * rightZ;
    }

    const currentApproachEligible =
      alongM <= -FORWARD_CROSSING_EPSILON_M &&
      alongM >= -approachDistanceM &&
      Math.abs(acrossM) <= approachChannelHalfWidthM;
    const previousApproachEligible =
      state.hasPreviousPosition &&
      previousAlongM <= -FORWARD_CROSSING_EPSILON_M &&
      previousAlongM >= -approachDistanceM &&
      Math.abs(previousAcrossM) <= approachChannelHalfWidthM;
    if (currentApproachEligible || previousApproachEligible) {
      state.gateArmed = true;
    }

    const forwardDeltaM = alongM - previousAlongM;
    const crossedForward =
      state.hasPreviousPosition &&
      state.gateArmed &&
      previousAlongM < 0 &&
      alongM >= 0 &&
      forwardDeltaM > FORWARD_CROSSING_EPSILON_M;

    if (crossedForward) {
      const interpolation = clamp01(
        -previousAlongM / Math.max(forwardDeltaM, 1e-9),
      );
      const crossingAcrossM =
        previousAcrossM +
        (acrossM - previousAcrossM) * interpolation;
      if (Math.abs(crossingAcrossM) <= halfWidthM) {
        state.gateArmed = false;
        this.reanchor(state, currentX, currentZ);
        return telemetry(
          entity,
          'completed',
          1,
          `${entity.label} crossed between the posts.`,
          0,
          0,
          true,
        );
      }
    }

    if (alongM > approachDistanceM * 0.5) {
      state.gateArmed = false;
    }

    this.reanchor(state, currentX, currentZ);
    if (!state.gateArmed) {
      return telemetry(
        entity,
        'approach',
        0,
        `Approach ${entity.label} from the marked route side.`,
      );
    }

    const approachProgress = clamp01(
      1 - Math.max(0, -alongM) / approachDistanceM,
    );
    return telemetry(
      entity,
      'approach',
      0.2 + approachProgress * 0.7,
      `Gate armed — cross between the ${entity.label} posts.`,
    );
  }

  private evaluateHold(
    entity: ScenarioInteractionEntity,
    sample: ScenarioInteractionSample,
    state: InteractionState,
  ) {
    const profile = resolveHoldProfile(entity);
    const distanceM = Math.hypot(
      finiteOr(sample.boatX) - entity.x,
      finiteOr(sample.boatZ) - entity.z,
    );
    const speedKnots = Math.abs(finiteOr(sample.speedKnots));
    const deltaSeconds = Math.max(0, finiteOr(sample.deltaSeconds));

    this.reanchor(state, sample.boatX, sample.boatZ);
    if (distanceM > entity.radiusM) {
      state.holdSeconds = 0;
      return telemetry(
        entity,
        'approach',
        0,
        `Approach the ${entity.label} ${profile.zoneLabel}.`,
        0,
        profile.holdSeconds,
      );
    }

    if (speedKnots > profile.maxSpeedKnots) {
      state.holdSeconds = 0;
      return telemetry(
        entity,
        'too-fast',
        0,
        `Reduce speed below ${profile.maxSpeedKnots.toFixed(1)} knots and hold position.`,
        0,
        profile.holdSeconds,
      );
    }

    state.holdSeconds = Math.min(
      profile.holdSeconds,
      state.holdSeconds + deltaSeconds,
    );
    const progress =
      profile.holdSeconds <= 0
        ? 1
        : state.holdSeconds / profile.holdSeconds;
    if (progress >= 1) {
      return telemetry(
        entity,
        'completed',
        1,
        `${entity.label} interaction complete.`,
        state.holdSeconds,
        profile.holdSeconds,
        true,
      );
    }

    const remainingSeconds = Math.max(
      0,
      profile.holdSeconds - state.holdSeconds,
    );
    return telemetry(
      entity,
      'holding',
      progress,
      `Hold position in the ${profile.zoneLabel} for ${remainingSeconds.toFixed(1)} more seconds.`,
      state.holdSeconds,
      profile.holdSeconds,
    );
  }

  private reanchor(
    state: InteractionState,
    boatX: number,
    boatZ: number,
  ) {
    state.previousBoatX = finiteOr(boatX);
    state.previousBoatZ = finiteOr(boatZ);
    state.hasPreviousPosition = true;
  }
}
