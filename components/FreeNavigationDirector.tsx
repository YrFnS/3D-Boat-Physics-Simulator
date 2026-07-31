'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { MathUtils } from 'three';
import { useNavigationPlanner } from '@/store/useNavigationPlanner';
import { sharedPhysics, useSimStore } from '@/store/useSimStore';

interface FreeNavigationDirectorProps {
  enabled: boolean;
}

const UPDATE_INTERVAL_SECONDS = 0.1;

function normalizeBearing(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function normalizeSignedBearing(degrees: number) {
  return ((degrees + 540) % 360) - 180;
}

export default function FreeNavigationDirector({
  enabled,
}: FreeNavigationDirectorProps) {
  const updateAccumulator = useRef(0);

  useFrame((_, delta) => {
    if (!enabled) return;

    const simulator = useSimStore.getState();
    const planner = useNavigationPlanner.getState();
    if (
      simulator.sessionPhase !== 'running' ||
      simulator.scenarioRunStatus !== 'active' ||
      planner.mode !== 'free' ||
      planner.status !== 'active' ||
      planner.waypoints.length === 0
    ) {
      updateAccumulator.current = 0;
      return;
    }

    updateAccumulator.current += Math.min(Math.max(delta, 0), 0.1);
    if (updateAccumulator.current < UPDATE_INTERVAL_SECONDS) return;

    const elapsedDelta = updateAccumulator.current;
    updateAccumulator.current %= UPDATE_INTERVAL_SECONDS;

    const waypointIndex = MathUtils.clamp(
      planner.activeWaypointIndex,
      0,
      planner.waypoints.length - 1,
    );
    const waypoint = planner.waypoints[waypointIndex];
    const boatX = sharedPhysics.boatPos.x;
    const boatZ = sharedPhysics.boatPos.z;
    const deltaX = waypoint.x - boatX;
    const deltaZ = waypoint.z - boatZ;
    const distanceM = Math.hypot(deltaX, deltaZ);
    const bearingDeg = normalizeBearing(
      MathUtils.radToDeg(Math.atan2(deltaX, -deltaZ)),
    );
    const relativeBearingDeg = normalizeSignedBearing(
      bearingDeg - simulator.heading,
    );
    const previousWaypoint =
      waypointIndex === 0
        ? { x: boatX, z: boatZ }
        : planner.waypoints[waypointIndex - 1];
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
      (waypointIndex + segmentProgress) / planner.waypoints.length,
      0,
      1,
    );

    planner.setTelemetry({
      elapsedSeconds: planner.elapsedSeconds + elapsedDelta,
      progress,
      distanceM,
      bearingDeg,
      relativeBearingDeg,
    });

    if (distanceM > waypoint.radiusM) return;

    if (waypointIndex >= planner.waypoints.length - 1) {
      planner.completeFreeRoute();
    } else {
      planner.setActiveWaypointIndex(waypointIndex + 1);
    }
  });

  return null;
}
