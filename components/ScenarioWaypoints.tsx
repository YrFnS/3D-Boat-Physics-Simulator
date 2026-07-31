'use client';

import { Float, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getResolvedScenarioRoute } from '@/sim/scenarios/ScenarioRoute';
import { useNavigationPlanner } from '@/store/useNavigationPlanner';
import { useSimStore } from '@/store/useSimStore';

interface ScenarioWaypointsProps {
  enabled: boolean;
}

interface WaypointBeaconProps {
  x: number;
  z: number;
  radiusM: number;
  state: 'completed' | 'active' | 'future';
  activeColor: string;
}

function WaypointBeacon({
  x,
  z,
  radiusM,
  state,
  activeColor,
}: WaypointBeaconProps) {
  const color =
    state === 'completed'
      ? '#34d399'
      : state === 'active'
        ? activeColor
        : '#94a3b8';
  const ringRadius = Math.max(6, Math.min(radiusM, 14));
  const marker = (
    <group position={[x, 2.4, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry
          args={[ringRadius, state === 'active' ? 0.55 : 0.3, 10, 48]}
        />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={state === 'future' ? 0.42 : 0.82}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[0.18, 0.42, 16, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={state === 'future' ? 0.24 : 0.55}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 16.4, 0]}>
        <octahedronGeometry args={[state === 'active' ? 1.8 : 1.2, 0]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );

  return state === 'active' ? (
    <Float speed={2.2} rotationIntensity={0.25} floatIntensity={0.9}>
      {marker}
    </Float>
  ) : (
    marker
  );
}

export default function ScenarioWaypoints({
  enabled,
}: ScenarioWaypointsProps) {
  const activeScenario = useSimStore((state) => state.activeScenario);
  const missionWaypointIndex = useSimStore(
    (state) => state.activeWaypointIndex,
  );
  const scenarioRunStatus = useSimStore(
    (state) => state.scenarioRunStatus,
  );
  const planner = useNavigationPlanner(
    useShallow((state) => ({
      mode: state.mode,
      status: state.status,
      waypoints: state.waypoints,
      activeWaypointIndex: state.activeWaypointIndex,
    })),
  );
  const missionRoute = useMemo(
    () => getResolvedScenarioRoute(activeScenario),
    [activeScenario],
  );
  const route =
    planner.mode === 'free' ? planner.waypoints : missionRoute;
  const activeWaypointIndex =
    planner.mode === 'free'
      ? planner.activeWaypointIndex
      : missionWaypointIndex;
  const routePoints = useMemo(
    () =>
      route.map(
        (waypoint) =>
          [waypoint.x, 2.2, waypoint.z] as [number, number, number],
      ),
    [route],
  );
  const routeActive =
    planner.mode === 'mission'
      ? scenarioRunStatus === 'active'
      : planner.status !== 'idle';
  const activeColor = planner.mode === 'free' ? '#fbbf24' : '#38bdf8';

  if (!enabled || !routeActive || route.length === 0) return null;

  return (
    <group>
      {routePoints.length > 1 && (
        <Line
          points={routePoints}
          color={activeColor}
          lineWidth={1.4}
          transparent
          opacity={0.42}
          dashed
          dashSize={7}
          gapSize={5}
          depthWrite={false}
        />
      )}
      {route.map((waypoint, index) => (
        <WaypointBeacon
          key={waypoint.id}
          x={waypoint.x}
          z={waypoint.z}
          radiusM={waypoint.radiusM}
          activeColor={activeColor}
          state={
            index < activeWaypointIndex
              ? 'completed'
              : index === activeWaypointIndex
                ? 'active'
                : 'future'
          }
        />
      ))}
    </group>
  );
}
