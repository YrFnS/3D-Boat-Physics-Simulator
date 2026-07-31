export interface FixedStepRunnerOptions {
  stepSeconds?: number;
  maxSubSteps?: number;
  maxFrameDeltaSeconds?: number;
}

export interface FixedStepAdvanceResult {
  steps: number;
  alpha: number;
  simulationTimeSeconds: number;
  droppedTimeSeconds: number;
}

export type FixedStepCallback = (
  stepSeconds: number,
  simulationTimeSeconds: number,
) => void;

const DEFAULT_STEP_SECONDS = 1 / 60;
const DEFAULT_MAX_SUB_STEPS = 5;
const DEFAULT_MAX_FRAME_DELTA_SECONDS = 0.1;

/**
 * Accumulator-based fixed timestep runner.
 *
 * Rendering may happen at any refresh rate, while simulation callbacks always
 * receive the same step duration. Excess backlog is discarded after the
 * configured substep budget so a suspended tab cannot trigger a spiral of
 * death when it resumes.
 */
export class FixedStepRunner {
  readonly stepSeconds: number;
  readonly maxSubSteps: number;
  readonly maxFrameDeltaSeconds: number;

  private accumulatorSeconds = 0;
  private currentSimulationTimeSeconds = 0;
  private totalDroppedTimeSeconds = 0;

  constructor(options: FixedStepRunnerOptions = {}) {
    this.stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
    this.maxSubSteps = options.maxSubSteps ?? DEFAULT_MAX_SUB_STEPS;
    this.maxFrameDeltaSeconds =
      options.maxFrameDeltaSeconds ?? DEFAULT_MAX_FRAME_DELTA_SECONDS;

    if (!Number.isFinite(this.stepSeconds) || this.stepSeconds <= 0) {
      throw new Error('FixedStepRunner stepSeconds must be positive.');
    }
    if (!Number.isInteger(this.maxSubSteps) || this.maxSubSteps < 1) {
      throw new Error('FixedStepRunner maxSubSteps must be a positive integer.');
    }
    if (
      !Number.isFinite(this.maxFrameDeltaSeconds) ||
      this.maxFrameDeltaSeconds <= 0
    ) {
      throw new Error(
        'FixedStepRunner maxFrameDeltaSeconds must be positive.',
      );
    }
  }

  get simulationTimeSeconds() {
    return this.currentSimulationTimeSeconds;
  }

  get droppedTimeSeconds() {
    return this.totalDroppedTimeSeconds;
  }

  reset(simulationTimeSeconds = 0) {
    this.accumulatorSeconds = 0;
    this.currentSimulationTimeSeconds = Math.max(0, simulationTimeSeconds);
    this.totalDroppedTimeSeconds = 0;
  }

  advance(
    frameDeltaSeconds: number,
    step: FixedStepCallback,
  ): FixedStepAdvanceResult {
    const safeFrameDelta = Number.isFinite(frameDeltaSeconds)
      ? Math.min(
          Math.max(frameDeltaSeconds, 0),
          this.maxFrameDeltaSeconds,
        )
      : 0;

    this.accumulatorSeconds += safeFrameDelta;

    let steps = 0;
    while (
      this.accumulatorSeconds + Number.EPSILON >= this.stepSeconds &&
      steps < this.maxSubSteps
    ) {
      this.currentSimulationTimeSeconds += this.stepSeconds;
      step(this.stepSeconds, this.currentSimulationTimeSeconds);
      this.accumulatorSeconds -= this.stepSeconds;
      steps += 1;
    }

    if (this.accumulatorSeconds >= this.stepSeconds) {
      const retainedTime = this.accumulatorSeconds % this.stepSeconds;
      this.totalDroppedTimeSeconds +=
        this.accumulatorSeconds - retainedTime;
      this.accumulatorSeconds = retainedTime;
    }

    return {
      steps,
      alpha: Math.min(
        1,
        Math.max(0, this.accumulatorSeconds / this.stepSeconds),
      ),
      simulationTimeSeconds: this.currentSimulationTimeSeconds,
      droppedTimeSeconds: this.totalDroppedTimeSeconds,
    };
  }
}
