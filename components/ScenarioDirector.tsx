'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils } from 'three';
import {
  normalizeSignedHeadingDeltaDegrees,
  worldDirectionToHeadingDegrees,
} from '@/sim/world/WorldDirection';
import { sharedMissionRuntimeStatistics } from '@/sim/scenarios/MissionRuntimeStatistics';
import {
  getScenarioDefinition,
  type ScenarioDefinition,
} from '@/sim/scenarios/ScenarioCatalog';
import {
  getResolvedScenarioCheckpoints,
  getResolvedScenarioEntities,
  getResolvedScenarioRoute,
} from '@/sim/scenarios/ScenarioRoute';
import { useNavigationPlanner } from '@/store/useNavigationPlanner';
import { useScenarioHistory } from '@/store/useScenarioHistory';
import {
  sharedPhysics,
  type ScenarioResult,
  useSimStore,
} from '@/store/useSimStore';

interface ScenarioDirectorProps {
  enabled: boolean;
}

interface RuntimeStatistics {
  lastProcessedElapsedSeconds: number;
  collisionSequenceAtStart: number;
}

type MissionTestMode = 'complete' | 'fail' | 'checkpoint' | null;

const NAVIGATION_UPDATE_INTERVAL_SECONDS = 0.1;
const MAX_OPERATIONAL_RADIUS_M = 1_500;

function readMissionTestMode(): MissionTestMode {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const missionValue = params.get('missionTest');
  if (missionValue === 'complete' || missionValue === 'fail') {
    return missionValue;
  }
  return params.get('checkpointTest') === '1' ? 'checkpoint' : null;
}

function calculateScore(
  scenario: ScenarioDefinition,
  result: Omit<ScenarioResult, 'score' | 'reason' | 'outcome'>,
) {
  const timePenalty =
    Math.min(result.elapsedSeconds, scenario.mission.parTimeSeconds) * 0.35 +
    Math.max(
      0,
      result.elapsedSeconds - scenario.mission.parTimeSeconds,
    ) *
      1.4;
  const damagePenalty =
    (100 - result.hullHealth) * 4 +
    (100 - result.engineHealth) * 1.5 +
    (100 - result.rudderHealth) * 1.2;
  const contactPenalty = result.collisionCount * 16;
  const resetPenalty = result.resetCount * 70;

  return Math.round(
    MathUtils.clamp(
      1_000 - timePenalty - damagePenalty - contactPenalty - resetPenalty,
      0,
      1_000,
    ),
  );
}

export default function ScenarioDirector({ enabled }: ScenarioDirectorProps) {
  const activeScenario = useSimStore((state) => state.activeScenario);
  const scenarioRunId = useSimStore((state) => state.scenarioRunId);
  const scenario = useMemo(
    () => getScenarioDefinition(activeScenario),
    [activeScenario],
  );
  const route = useMemo(
    () => getResolvedScenarioRoute(activeScenario),
    [activeScenario],
  );
  const entities = useMemo(
    () => getResolvedScenarioEntities(activeScenario),
    [activeScenario],
  );
  const checkpoints = useMemo(
    () => getResolvedScenarioCheckpoints(activeScenario),
    [activeScenario],
  );
  const missionTestMode = useRef<MissionTestMode>(readMissionTestMode());
  const missionTestRunId = useRef(-1);
  const updateAccumulator = useRef(0);
  const runtime = useRef<RuntimeStatistics>({
    lastProcessedElapsedSeconds: 0,
    collisionSequenceAtStart: 0,
  });

  useEffect(() => {
    runtime.current = {
      lastProcessedElapsedSeconds: 0,
      collisionSequenceAtStart: sharedPhysics.collisionSequence,
    };
    updateAccumulator.current = 0;
  }, [scenarioRunId]);

  useFrame(() => {
    if (!enabled || route.length === 0) return;

    const store = useSimStore.getState();
    if (
      store.sessionPhase !== 'running' ||
      store.scenarioRunStatus !== 'active' ||
      useNavigationPlanner.getState().mode !== 'mission'
    ) {
      return;
    }

    const missionStatistics =
      sharedMissionRuntimeStatistics.snapshot;
    if (missionStatistics.runId !== scenarioRunId) return;

    const statistics = runtime.current;
    const fixedStepAdvance = Math.max(
      0,
      missionStatistics.elapsedSeconds -
        statistics.lastProcessedElapsedSeconds,
    );
    statistics.lastProcessedElapsedSeconds =
      missionStatistics.elapsedSeconds;

    const boatX = sharedPhysics.boatPos.x;
    const boatZ = sharedPhysics.boatPos.z;

    updateAccumulator.current += fixedStepAdvance;
    if (
      updateAccumulator.current < NAVIGATION_UPDATE_INTERVAL_SECONDS
    ) {
      return;
    }
    updateAccumulator.current %= NAVIGATION_UPDATE_INTERVAL_SECONDS;

    const waypointIndex = MathUtils.clamp(
      store.activeWaypointIndex,
      0,
      route.length - 1,
    );
    const waypoint = route[waypointIndex];
    const deltaX = waypoint.x - boatX;
    const deltaZ = waypoint.z - boatZ;
    const distanceM = Math.hypot(deltaX, deltaZ);
    const bearingDeg = worldDirectionToHeadingDegrees(deltaX, deltaZ);
    const relativeBearingDeg = normalizeSignedHeadingDeltaDegrees(
      bearingDeg - store.heading,
    );
    const previousWaypoint =
      waypointIndex === 0
        ? { x: 0, z: 0 }
        : route[waypointIndex - 1];
    const segmentLengthM = Math.max(
      waypoint.radiusM,
      Math.hypot(
        waypoint.x - previousWaypoint.x,
        waypoint.z - previousWaypoint.z,
      ),
    );
    const segmentProgress = MathUtils.clamp(
      1 - distanceM / segmentLengthM,
      0,
      1,
    );
    const progress = MathUtils.clamp(
      (waypointIndex + segmentProgress) / route.length,
      0,
      1,
    );

    store.setScenarioNavigation({
      elapsedSeconds: missionStatistics.elapsedSeconds,
      progress,
      distanceM,
      bearingDeg,
      relativeBearingDeg,
      boatX,
      boatZ,
    });

    const collisionCount = Math.max(
      0,
      sharedPhysics.collisionSequence -
        statistics.collisionSequenceAtStart,
    );

    const finish = (
      outcome: ScenarioResult['outcome'],
      reason: string,
      waypointsCompleted: number,
    ) => {
      const latestStore = useSimStore.getState();
      const requiredEntities = entities.filter((entity) => entity.required);
      const entitiesCompleted = requiredEntities.filter((entity) =>
        latestStore.completedScenarioEntityIds.includes(entity.id),
      ).length;
      const baseResult = {
        runMode: latestStore.scenarioRunMode,
        assistanceReason:
          latestStore.scenarioAssistanceReason || null,
        elapsedSeconds: missionStatistics.elapsedSeconds,
        waypointsCompleted,
        totalWaypoints: route.length,
        entitiesCompleted,
        totalEntities: requiredEntities.length,
        hullHealth: latestStore.hullHealth,
        engineHealth: latestStore.engineHealth,
        rudderHealth: latestStore.rudderHealth,
        collisionCount,
        resetCount: latestStore.scenarioResetCount,
        maximumSpeedKnots: missionStatistics.maximumSpeedKnots,
        distanceTravelledM: missionStatistics.distanceTravelledM,
        checkpointLabel: latestStore.scenarioCheckpointLabel,
      };
      const result: ScenarioResult = {
        outcome,
        reason,
        score:
          outcome === 'completed'
            ? calculateScore(scenario, baseResult)
            : 0,
        ...baseResult,
      };

      useScenarioHistory
        .getState()
        .recordResult(activeScenario, latestStore.activeBoat, result);
      latestStore.finishScenario(result);
    };

    if (
      missionTestMode.current &&
      missionTestRunId.current !== scenarioRunId &&
      missionStatistics.elapsedSeconds >= 0.75
    ) {
      missionTestRunId.current = scenarioRunId;

      if (missionTestMode.current === 'checkpoint') {
        const checkpoint = checkpoints[0];
        if (checkpoint) {
          store.setScenarioCheckpoint(checkpoint);
          useSimStore.getState().resetVessel();
        }
        return;
      }

      if (missionTestMode.current === 'complete') {
        const requiredEntityIds = entities
          .filter((entity) => entity.required)
          .map((entity) => entity.id);
        store.completeScenarioEntities(
          requiredEntityIds,
          'Automated mission tasks completed.',
        );
        finish(
          'completed',
          'Automated mission completion probe passed.',
          route.length,
        );
      } else {
        finish('failed', 'Automated mission failure probe passed.', 0);
      }
      return;
    }

    if (store.hullHealth <= scenario.mission.failureHullHealth) {
      finish(
        'failed',
        `Hull integrity fell to ${store.hullHealth.toFixed(0)}%, below the ${scenario.mission.failureHullHealth}% mission limit.`,
        waypointIndex,
      );
      return;
    }

    if (missionStatistics.elapsedSeconds >
      scenario.mission.timeLimitSeconds) {
      finish(
        'failed',
        `The ${Math.round(scenario.mission.timeLimitSeconds / 60)} minute operational window expired before the route was complete.`,
        waypointIndex,
      );
      return;
    }

    if (Math.hypot(boatX, boatZ) > MAX_OPERATIONAL_RADIUS_M) {
      finish(
        'failed',
        'The vessel left the charted operational area.',
        waypointIndex,
      );
      return;
    }

    const entitiesAtWaypoint = entities.filter(
      (entity) => entity.waypointId === waypoint.id,
    );
    const completedBefore = new Set(store.completedScenarioEntityIds);
    const newlyCompleted = entitiesAtWaypoint.filter((entity) => {
      if (completedBefore.has(entity.id)) return false;
      if (
        entity.requiresEntityId &&
        !completedBefore.has(entity.requiresEntityId)
      ) {
        return false;
      }
      return Math.hypot(entity.x - boatX, entity.z - boatZ) <= entity.radiusM;
    });

    if (newlyCompleted.length > 0) {
      store.completeScenarioEntities(
        newlyCompleted.map((entity) => entity.id),
        newlyCompleted.map((entity) => entity.completionMessage).join(' '),
      );
      for (const entity of newlyCompleted) completedBefore.add(entity.id);
    }

    const pendingRequiredEntity = entitiesAtWaypoint.find(
      (entity) => entity.required && !completedBefore.has(entity.id),
    );
    if (pendingRequiredEntity) return;

    if (distanceM > waypoint.radiusM) return;

    const checkpoint = checkpoints.find(
      (candidate) => candidate.waypointId === waypoint.id,
    );
    if (checkpoint && store.scenarioCheckpointId !== checkpoint.id) {
      store.setScenarioCheckpoint(checkpoint);
    }

    const finalWaypoint = waypointIndex === route.length - 1;
    if (!finalWaypoint) {
      store.setActiveWaypointIndex(waypointIndex + 1);
      return;
    }

    const finalSpeedLimit = scenario.mission.finalSpeedMaxKnots;
    if (
      finalSpeedLimit !== undefined &&
      Math.abs(store.speedKnots) > finalSpeedLimit
    ) {
      return;
    }

    const incompleteRequiredEntity = entities.find(
      (entity) => entity.required && !completedBefore.has(entity.id),
    );
    if (incompleteRequiredEntity) return;

    finish(
      'completed',
      scenario.mission.successSummary,
      route.length,
    );
  });

  return null;
}
