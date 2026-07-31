'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils } from 'three';
import {
  getScenarioDefinition,
  type ScenarioDefinition,
} from '@/sim/scenarios/ScenarioCatalog';
import { getResolvedScenarioRoute } from '@/sim/scenarios/ScenarioRoute';
import {
  sharedPhysics,
  type ScenarioResult,
  useSimStore,
} from '@/store/useSimStore';

interface ScenarioDirectorProps {
  enabled: boolean;
}

interface RuntimeStatistics {
  elapsedSeconds: number;
  maximumSpeedKnots: number;
  distanceTravelledM: number;
  previousBoatX: number;
  previousBoatZ: number;
  collisionSequenceAtStart: number;
}

type MissionTestMode = 'complete' | 'fail' | null;

const NAVIGATION_UPDATE_INTERVAL_SECONDS = 0.1;
const MAX_OPERATIONAL_RADIUS_M = 1_500;
const MAX_VALID_SAMPLE_DISTANCE_M = 60;

function normalizeBearing(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function normalizeSignedBearing(degrees: number) {
  return ((degrees + 540) % 360) - 180;
}

function readMissionTestMode(): MissionTestMode {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(
    'missionTest',
  );
  return value === 'complete' || value === 'fail' ? value : null;
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
  const missionTestMode = useRef<MissionTestMode>(readMissionTestMode());
  const missionTestRunId = useRef(-1);
  const updateAccumulator = useRef(0);
  const runtime = useRef<RuntimeStatistics>({
    elapsedSeconds: 0,
    maximumSpeedKnots: 0,
    distanceTravelledM: 0,
    previousBoatX: 0,
    previousBoatZ: 0,
    collisionSequenceAtStart: 0,
  });

  useEffect(() => {
    runtime.current = {
      elapsedSeconds: 0,
      maximumSpeedKnots: 0,
      distanceTravelledM: 0,
      previousBoatX: sharedPhysics.boatPos.x,
      previousBoatZ: sharedPhysics.boatPos.z,
      collisionSequenceAtStart: sharedPhysics.collisionSequence,
    };
    updateAccumulator.current = 0;
  }, [scenarioRunId]);

  useFrame((_, delta) => {
    if (!enabled || route.length === 0) return;

    const store = useSimStore.getState();
    if (
      store.sessionPhase !== 'running' ||
      store.scenarioRunStatus !== 'active'
    ) {
      return;
    }

    const frameDelta = Math.min(Math.max(delta, 0), 0.1);
    const statistics = runtime.current;
    statistics.elapsedSeconds += frameDelta;
    statistics.maximumSpeedKnots = Math.max(
      statistics.maximumSpeedKnots,
      Math.abs(store.speedKnots),
    );

    const boatX = sharedPhysics.boatPos.x;
    const boatZ = sharedPhysics.boatPos.z;
    const sampleDistance = Math.hypot(
      boatX - statistics.previousBoatX,
      boatZ - statistics.previousBoatZ,
    );
    if (
      Number.isFinite(sampleDistance) &&
      sampleDistance <= MAX_VALID_SAMPLE_DISTANCE_M
    ) {
      statistics.distanceTravelledM += sampleDistance;
    }
    statistics.previousBoatX = boatX;
    statistics.previousBoatZ = boatZ;

    updateAccumulator.current += frameDelta;
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
    const bearingDeg = normalizeBearing(
      MathUtils.radToDeg(Math.atan2(deltaX, -deltaZ)),
    );
    const relativeBearingDeg = normalizeSignedBearing(
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
      elapsedSeconds: statistics.elapsedSeconds,
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
      const baseResult = {
        elapsedSeconds: statistics.elapsedSeconds,
        waypointsCompleted,
        totalWaypoints: route.length,
        hullHealth: store.hullHealth,
        engineHealth: store.engineHealth,
        rudderHealth: store.rudderHealth,
        collisionCount,
        resetCount: store.scenarioResetCount,
        maximumSpeedKnots: statistics.maximumSpeedKnots,
        distanceTravelledM: statistics.distanceTravelledM,
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
      store.finishScenario(result);
    };

    if (
      missionTestMode.current &&
      missionTestRunId.current !== scenarioRunId &&
      statistics.elapsedSeconds >= 0.75
    ) {
      missionTestRunId.current = scenarioRunId;
      if (missionTestMode.current === 'complete') {
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

    if (statistics.elapsedSeconds > scenario.mission.timeLimitSeconds) {
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

    if (distanceM > waypoint.radiusM) return;

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

    finish(
      'completed',
      scenario.mission.successSummary,
      route.length,
    );
  });

  return null;
}
