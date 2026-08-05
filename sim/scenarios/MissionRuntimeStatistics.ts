export interface MissionRuntimeStatisticsStep {
  runId: number;
  vesselGeneration: number;
  enabled: boolean;
  deltaSeconds: number;
  boatX: number;
  boatZ: number;
  speedKnots: number;
}

export interface MissionRuntimeStatisticsSnapshot {
  runId: number;
  vesselGeneration: number;
  elapsedSeconds: number;
  distanceTravelledM: number;
  maximumSpeedKnots: number;
  fixedStepCount: number;
}

export const DEFAULT_MAXIMUM_MISSION_SAMPLE_DISTANCE_M = 60;

function normalizeIdentity(value: number) {
  return Number.isFinite(value) ? Math.trunc(value) : -1;
}

/**
 * Fixed-step authority for scored mission time and travelled distance.
 *
 * The tracker is shared across vessel remounts. A new scenario run
 * resets every statistic, while a vessel recovery generation only
 * reanchors the position sample so a teleport cannot become distance.
 * Disabled steps also reanchor without advancing mission time, which
 * keeps free-navigation and non-running frames out of scored results.
 */
export class MissionRuntimeStatistics {
  private readonly state: MissionRuntimeStatisticsSnapshot = {
    runId: -1,
    vesselGeneration: -1,
    elapsedSeconds: 0,
    distanceTravelledM: 0,
    maximumSpeedKnots: 0,
    fixedStepCount: 0,
  };
  private previousBoatX = 0;
  private previousBoatZ = 0;
  private hasPreviousPosition = false;
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
    this.state.vesselGeneration =
      normalizeIdentity(vesselGeneration);
    this.state.elapsedSeconds = 0;
    this.state.distanceTravelledM = 0;
    this.state.maximumSpeedKnots = 0;
    this.state.fixedStepCount = 0;
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
      this.reanchor(step.boatX, step.boatZ);
    }

    const deltaSeconds = Number.isFinite(step.deltaSeconds)
      ? Math.max(0, step.deltaSeconds)
      : 0;
    if (!step.enabled || deltaSeconds <= 0) {
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
