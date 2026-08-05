export type CollisionContactKind = 'terrain' | 'obstacle';

export interface CollisionContactPairObservation {
  pairKey: string;
  externalKey: string;
  kind: CollisionContactKind;
  fixture?: boolean;
  debugProbe?: boolean;
}

export interface CollisionContactLifecycleSummary {
  activeContactPairCount: number;
  activeExternalContactCount: number;
  contactStartCount: number;
  terrainContactStartCount: number;
  obstacleContactStartCount: number;
  fixtureContactStartCount: number;
  debugProbeContactStartCount: number;
  contactEndCount: number;
}

interface ExternalContactState {
  observation: CollisionContactPairObservation;
  activePairKeys: Set<string>;
  missingSeconds: number;
}

export const DEFAULT_CONTACT_RELEASE_GRACE_SECONDS = 0.12;

function normalizeObservation(
  observation: CollisionContactPairObservation,
): CollisionContactPairObservation {
  return {
    pairKey: observation.pairKey,
    externalKey: observation.externalKey,
    kind: observation.kind === 'terrain' ? 'terrain' : 'obstacle',
    fixture: observation.fixture === true,
    debugProbe: observation.debugProbe === true,
  };
}

function mergeObservation(
  current: CollisionContactPairObservation,
  incoming: CollisionContactPairObservation,
): CollisionContactPairObservation {
  return {
    pairKey: current.pairKey,
    externalKey: current.externalKey,
    kind:
      current.kind === 'terrain' || incoming.kind === 'terrain'
        ? 'terrain'
        : 'obstacle',
    fixture: current.fixture === true || incoming.fixture === true,
    debugProbe:
      current.debugProbe === true || incoming.debugProbe === true,
  };
}

/**
 * Converts Rapier's compound-collider contact pairs into stable
 * gameplay collision events.
 *
 * Several hull pieces may touch one terrain or obstacle collider at
 * the same time. That remains one external contact until every pair
 * separates for the release grace period. Brief solver jitter or a
 * contact moving from the bow piece to the center piece therefore
 * cannot multiply a single grounding into dozens of score events.
 */
export class CollisionContactLifecycle {
  private readonly activePairs = new Map<
    string,
    CollisionContactPairObservation
  >();
  private readonly externalContacts = new Map<
    string,
    ExternalContactState
  >();
  readonly releaseGraceSeconds: number;

  constructor(
    releaseGraceSeconds = DEFAULT_CONTACT_RELEASE_GRACE_SECONDS,
  ) {
    this.releaseGraceSeconds = Number.isFinite(releaseGraceSeconds)
      ? Math.max(0, releaseGraceSeconds)
      : DEFAULT_CONTACT_RELEASE_GRACE_SECONDS;
  }

  advance(
    observations: Iterable<CollisionContactPairObservation>,
    deltaSeconds: number,
  ): CollisionContactLifecycleSummary {
    const currentPairs = new Map<
      string,
      CollisionContactPairObservation
    >();

    for (const rawObservation of observations) {
      if (
        !rawObservation?.pairKey ||
        !rawObservation.externalKey
      ) {
        continue;
      }

      const observation = normalizeObservation(rawObservation);
      const existing = currentPairs.get(observation.pairKey);
      if (
        existing &&
        existing.externalKey === observation.externalKey
      ) {
        currentPairs.set(
          observation.pairKey,
          mergeObservation(existing, observation),
        );
      } else if (!existing) {
        currentPairs.set(observation.pairKey, observation);
      }
    }

    let contactStartCount = 0;
    let terrainContactStartCount = 0;
    let obstacleContactStartCount = 0;
    let fixtureContactStartCount = 0;
    let debugProbeContactStartCount = 0;

    const recordStart = (
      observation: CollisionContactPairObservation,
    ) => {
      contactStartCount += 1;
      if (observation.kind === 'terrain') {
        terrainContactStartCount += 1;
      } else {
        obstacleContactStartCount += 1;
      }
      if (observation.fixture) fixtureContactStartCount += 1;
      if (observation.debugProbe) {
        debugProbeContactStartCount += 1;
      }
    };

    // Add current pairs before removing old ones. If a sustained
    // contact transfers between two compound hull pieces in one
    // step, the external contact never appears to end.
    for (const [pairKey, observation] of currentPairs) {
      const previousPair = this.activePairs.get(pairKey);
      if (
        previousPair &&
        previousPair.externalKey === observation.externalKey
      ) {
        const state = this.externalContacts.get(
          observation.externalKey,
        );
        if (state) {
          state.observation = mergeObservation(
            state.observation,
            observation,
          );
          state.activePairKeys.add(pairKey);
          state.missingSeconds = 0;
          continue;
        }
      }

      let state = this.externalContacts.get(
        observation.externalKey,
      );
      if (!state) {
        state = {
          observation,
          activePairKeys: new Set<string>(),
          missingSeconds: 0,
        };
        this.externalContacts.set(
          observation.externalKey,
          state,
        );
        recordStart(observation);
      } else {
        state.observation = mergeObservation(
          state.observation,
          observation,
        );
        state.missingSeconds = 0;
      }
      state.activePairKeys.add(pairKey);
    }

    for (const [pairKey, previousPair] of this.activePairs) {
      if (currentPairs.has(pairKey)) continue;
      const state = this.externalContacts.get(
        previousPair.externalKey,
      );
      if (!state) continue;
      state.activePairKeys.delete(pairKey);
      if (state.activePairKeys.size === 0) {
        state.missingSeconds = 0;
      }
    }

    this.activePairs.clear();
    for (const [pairKey, observation] of currentPairs) {
      this.activePairs.set(pairKey, observation);
    }

    const safeDeltaSeconds = Number.isFinite(deltaSeconds)
      ? Math.max(0, deltaSeconds)
      : 0;
    let contactEndCount = 0;
    for (const [externalKey, state] of this.externalContacts) {
      if (state.activePairKeys.size > 0) {
        state.missingSeconds = 0;
        continue;
      }

      state.missingSeconds += safeDeltaSeconds;
      if (
        state.missingSeconds + Number.EPSILON >=
        this.releaseGraceSeconds
      ) {
        this.externalContacts.delete(externalKey);
        contactEndCount += 1;
      }
    }

    let activeExternalContactCount = 0;
    for (const state of this.externalContacts.values()) {
      if (state.activePairKeys.size > 0) {
        activeExternalContactCount += 1;
      }
    }

    return {
      activeContactPairCount: currentPairs.size,
      activeExternalContactCount,
      contactStartCount,
      terrainContactStartCount,
      obstacleContactStartCount,
      fixtureContactStartCount,
      debugProbeContactStartCount,
      contactEndCount,
    };
  }

  reset() {
    this.activePairs.clear();
    this.externalContacts.clear();
  }
}
