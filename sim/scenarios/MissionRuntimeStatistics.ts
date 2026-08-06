export interface MissionRuntimeStatisticsStep {
  runId: number;
  vesselGeneration: number;
  enabled: boolean;
  repairTrackingEnabled?: boolean;
  deltaSeconds: number;
  boatX: number;
  boatZ: number;
  speedKnots: number;
  repairActive?: boolean;
  engineConditionRestored?: number;
  rudderConditionRestored?: number;
}

export interface MissionRuntimeStatisticsSnapshot {
  runId: number;
  vesselGeneration: number;
  elapsedSeconds: number;
  distanceTravelledM: number;
  maximumSpeedKnots: number;
  fixedStepCount: number;
  repairActiveSeconds: number;
  repairActivationCount: number;
  engineConditionRestored: number;
  rudderConditionRestored: number;
}

export const DEFAULT_MAXIMUM_MISSION_SAMPLE_DISTANCE_M = 60;

function normalizeIdentity(value: number) {
  return Number.isFinite(value) ? Math.trunc(value) : -1;
}

function finiteNonNegative(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

/**
 * Fixed-step authority for scored mission movement and repair use.
 *
 * A new scenario run resets every statistic. Vessel recovery only
 * reanchors position and repair activation state, preserving elapsed
 * time, travelled distance, and already-consumed repair allowance.
 * Free-navigation pauses scored movement while repair use remains
 * attributable to the active mission.
 */
export class MissionRuntimeStatistics {
  private readonly state: MissionRuntimeStatisticsSnapshot = {
    runId: -1,
    vesselGeneration: -1,
    elapsedSeconds: 0,
    distanceTravelledM: 0,
    maximumSpeedKnots: 0,
    fixedStepCount: 0,
    repairActiveSeconds: 0,
    repairActivationCount: 0,
    engineConditionRestored: 0,
    rudderConditionRestored: 0,
  };
  private previousBoatX = 0;
  private previousBoatZ = 0;
  private hasPreviousPosition = false;
  private repairWasActive = false;
  readonly maximumSampleDistanceM: number;

  constructor(
    maximumSampleDistanceM =
      DEFAULT_MAXIMUM_MISSION_SAMPLE_DISTANCE_M,
  ) {
    this.maximumSampleDistanceM =
      Number.isFinite(maximumSampleDistanceM) &&
      maximumSampleDistanceM > 0
        ? maximumSampleDistanceM
        : DEFAULT_MAXIMUM_MISSION_SAMPLE_DISTANCE_M;
  }

  get snapshot(): Readonly<MissionRuntimeStatisticsSnapshot> {
    return this.state;
  }

  reset(
    runId = -1,
    vesselGeneration = -1,
    boatX = Number.NaN,
    boatZ = Number.NaN,
  ) {
    this.state.runId = normalizeIdentity(runId);
    this.state.vesselGeneration = normalizeIdentity(vesselGeneration);
    this.state.elapsedSeconds = 0;
    this.state.distanceTravelledM = 0;
    this.state.maximumSpeedKnots = 0;
    this.state.fixedStepCount = 0;
    this.state.repairActiveSeconds = 0;
    this.state.repairActivationCount = 0;
    this.state.engineConditionRestored = 0;
    this.state.rudderConditionRestored = 0;
    this.repairWasActive = false;
    this.reanchor(boatX, boatZ);
    return this.state;
  }

  advance(
    step: MissionRuntimeStatisticsStep,
  ): Readonly<MissionRuntimeStatisticsSnapshot> {
    const runId = normalizeIdentity(step.runId);
    const vesselGeneration = normalizeIdentity(
      step.vesselGeneration,
    );

    if (this.state.runId !== runId) {
      this.reset(
        runId,
        vesselGeneration,
        step.boatX,
        step.boatZ,
      );
    } else if (
      this.state.vesselGeneration !== vesselGeneration
    ) {
      this.state.vesselGeneration = vesselGeneration;
      this.repairWasActive = false;
      this.reanchor(step.boatX, step.boatZ);
    }

    const deltaSeconds = finiteNonNegative(step.deltaSeconds);
    const repairTrackingEnabled =
      step.repairTrackingEnabled ?? step.enabled;

    if (deltaSeconds <= 0) {
      if (!repairTrackingEnabled) this.repairWasActive = false;
      if (!step.enabled) this.reanchor(step.boatX, step.boatZ);
      return this.state;
    }

    if (repairTrackingEnabled) {
      const repairActive = step.repairActive === true;
      if (repairActive) {
        this.state.repairActiveSeconds += deltaSeconds;
        if (!this.repairWasActive) {
          this.state.repairActivationCount += 1;
        }
      }
      this.repairWasActive = repairActive;
      this.state.engineConditionRestored += finiteNonNegative(
        step.engineConditionRestored,
      );
      this.state.rudderConditionRestored += finiteNonNegative(
        step.rudderConditionRestored,
      );
    } else {
      this.repairWasActive = false;
    }

    if (!step.enabled) {
      this.reanchor(step.boatX, step.boatZ);
      return this.state;
    }

    this.state.elapsedSeconds += deltaSeconds;
    this.state.fixedStepCount += 1;
    if (Number.isFinite(step.speedKnots)) {
      this.state.maximumSpeedKnots = Math.max(
        this.state.maximumSpeedKnots,
        Math.abs(step.speedKnots),
      );
    }

    if (
      Number.isFinite(step.boatX) &&
      Number.isFinite(step.boatZ)
    ) {
      if (this.hasPreviousPosition) {
        const sampleDistanceM = Math.hypot(
          step.boatX - this.previousBoatX,
          step.boatZ - this.previousBoatZ,
        );
        if (
          Number.isFinite(sampleDistanceM) &&
          sampleDistanceM <= this.maximumSampleDistanceM
        ) {
          this.state.distanceTravelledM += sampleDistanceM;
        }
      }
      this.previousBoatX = step.boatX;
      this.previousBoatZ = step.boatZ;
      this.hasPreviousPosition = true;
    } else {
      this.hasPreviousPosition = false;
    }

    return this.state;
  }

  private reanchor(boatX: number, boatZ: number) {
    if (Number.isFinite(boatX) && Number.isFinite(boatZ)) {
      this.previousBoatX = boatX;
      this.previousBoatZ = boatZ;
      this.hasPreviousPosition = true;
    } else {
      this.hasPreviousPosition = false;
    }
  }
}

/** Shared authority survives Boat remounts caused by recovery. */
export const sharedMissionRuntimeStatistics =
  new MissionRuntimeStatistics();
