const DEFAULT_NON_ZERO_SEED = 0x6d2b79f5;

/**
 * Small deterministic xorshift32 generator for simulation-only randomness.
 *
 * Rendering effects may remain nondeterministic, but any randomness that
 * changes vessel state should come from this generator so the same fixed-step
 * input sequence produces the same result.
 */
export class SeededRandom {
  private state: number;

  constructor(seed = DEFAULT_NON_ZERO_SEED) {
    this.state = SeededRandom.normalizeSeed(seed);
  }

  reset(seed = DEFAULT_NON_ZERO_SEED) {
    this.state = SeededRandom.normalizeSeed(seed);
  }

  next() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  signed() {
    return this.next() * 2 - 1;
  }

  chancePerSecond(ratePerSecond: number, deltaSeconds: number) {
    const safeRate = Math.max(0, ratePerSecond);
    const safeDelta = Math.max(0, deltaSeconds);
    return this.next() < 1 - Math.exp(-safeRate * safeDelta);
  }

  private static normalizeSeed(seed: number) {
    const normalized = Number.isFinite(seed) ? seed >>> 0 : 0;
    return normalized === 0 ? DEFAULT_NON_ZERO_SEED : normalized;
  }
}
