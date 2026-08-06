export const MAX_SHARED_OBSTACLES = 250;
export const OBSTACLE_POSITION_EPSILON_M = 0.02;
export const OBSTACLE_RADIUS_EPSILON_M = 0.0001;

export interface ObstacleChangeCollection {
  version: number;
  fullSync: boolean;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Single-writer/multi-reader obstacle authority for the simulator.
 *
 * Writers mutate slots through set/clear, which advances a monotonic
 * revision only when collider-relevant data changes. Rapier readers
 * can then collect the unique slots changed since their own revision.
 * If a reader falls behind the bounded history, it receives one full
 * synchronization rather than silently missing an update.
 */
export class VersionedObstacleField {
  readonly data: Float32Array;
  readonly maxObstacles: number;

  private versionValue = 0;
  private readonly historyVersions: Float64Array;
  private readonly historyIndices: Uint32Array;
  private historyStart = 0;
  private historyCount = 0;
  private readonly collectionMarks: Uint32Array;
  private collectionEpoch = 0;
  private readonly collectionResult: ObstacleChangeCollection = {
    version: 0,
    fullSync: false,
  };

  constructor(
    maxObstacles = MAX_SHARED_OBSTACLES,
    historyCapacity = Math.max(maxObstacles * 8, maxObstacles),
  ) {
    if (!Number.isInteger(maxObstacles) || maxObstacles <= 0) {
      throw new RangeError('maxObstacles must be a positive integer.');
    }
    if (!Number.isInteger(historyCapacity) || historyCapacity <= 0) {
      throw new RangeError('historyCapacity must be a positive integer.');
    }

    this.maxObstacles = maxObstacles;
    this.data = new Float32Array(maxObstacles * 4);
    this.historyVersions = new Float64Array(historyCapacity);
    this.historyIndices = new Uint32Array(historyCapacity);
    this.collectionMarks = new Uint32Array(maxObstacles);
  }

  get version() {
    return this.versionValue;
  }

  set(
    index: number,
    x: number,
    y: number,
    z: number,
    radius: number,
  ) {
    this.assertIndex(index);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(radius) ||
      radius <= 0
    ) {
      return this.clear(index);
    }

    const offset = index * 4;
    const currentRadius = this.data[offset + 3];
    const changed =
      currentRadius <= 0 ||
      Math.abs(this.data[offset] - x) >
        OBSTACLE_POSITION_EPSILON_M ||
      Math.abs(this.data[offset + 1] - y) >
        OBSTACLE_POSITION_EPSILON_M ||
      Math.abs(this.data[offset + 2] - z) >
        OBSTACLE_POSITION_EPSILON_M ||
      Math.abs(currentRadius - radius) >
        OBSTACLE_RADIUS_EPSILON_M;
    if (!changed) return false;

    this.data[offset] = finite(x);
    this.data[offset + 1] = finite(y);
    this.data[offset + 2] = finite(z);
    this.data[offset + 3] = Math.max(0, finite(radius));
    this.recordChange(index);
    return true;
  }

  clear(index: number) {
    this.assertIndex(index);
    const offset = index * 4;
    if (
      this.data[offset] === 0 &&
      this.data[offset + 1] === 0 &&
      this.data[offset + 2] === 0 &&
      this.data[offset + 3] === 0
    ) {
      return false;
    }

    this.data.fill(0, offset, offset + 4);
    this.recordChange(index);
    return true;
  }

  collectChangedIndicesSince(
    sinceVersion: number,
    target: number[],
  ): Readonly<ObstacleChangeCollection> {
    target.length = 0;
    const currentVersion = this.versionValue;
    this.collectionResult.version = currentVersion;
    this.collectionResult.fullSync = false;

    if (sinceVersion === currentVersion) {
      return this.collectionResult;
    }

    if (
      !Number.isFinite(sinceVersion) ||
      sinceVersion < 0 ||
      sinceVersion > currentVersion ||
      this.historyCount === 0
    ) {
      this.collectFullSync(target);
      return this.collectionResult;
    }

    const oldestVersion =
      this.historyVersions[this.historyStart];
    if (sinceVersion < oldestVersion - 1) {
      this.collectFullSync(target);
      return this.collectionResult;
    }

    this.collectionEpoch = (this.collectionEpoch + 1) >>> 0;
    if (this.collectionEpoch === 0) {
      this.collectionMarks.fill(0);
      this.collectionEpoch = 1;
    }

    for (let offset = 0; offset < this.historyCount; offset += 1) {
      const historyIndex =
        (this.historyStart + offset) %
        this.historyVersions.length;
      if (this.historyVersions[historyIndex] <= sinceVersion) {
        continue;
      }
      const obstacleIndex = this.historyIndices[historyIndex];
      if (
        this.collectionMarks[obstacleIndex] ===
        this.collectionEpoch
      ) {
        continue;
      }
      this.collectionMarks[obstacleIndex] = this.collectionEpoch;
      target.push(obstacleIndex);
    }

    return this.collectionResult;
  }

  private collectFullSync(target: number[]) {
    for (let index = 0; index < this.maxObstacles; index += 1) {
      target.push(index);
    }
    this.collectionResult.fullSync = true;
  }

  private recordChange(index: number) {
    this.versionValue += 1;
    const capacity = this.historyVersions.length;
    let historyIndex: number;

    if (this.historyCount < capacity) {
      historyIndex =
        (this.historyStart + this.historyCount) % capacity;
      this.historyCount += 1;
    } else {
      historyIndex = this.historyStart;
      this.historyStart = (this.historyStart + 1) % capacity;
    }

    this.historyVersions[historyIndex] = this.versionValue;
    this.historyIndices[historyIndex] = index;
  }

  private assertIndex(index: number) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.maxObstacles
    ) {
      throw new RangeError(
        `Obstacle index ${index} is outside 0-${
          this.maxObstacles - 1
        }.`,
      );
    }
  }
}

export const sharedObstacleField = new VersionedObstacleField();
