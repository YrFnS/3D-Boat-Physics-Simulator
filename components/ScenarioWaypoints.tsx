'use client';

import { Float, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { getResolvedScenarioRoute } from '@/sim/scenarios/ScenarioRoute';
import { useSimStore } from '@/store/useSimStore';

interface ScenarioWaypointsProps {
  enabled: boolean;
}

interface WaypointBeaconProps {
  x: number;
  z: number;
  radiusM: number;
  state: 'completed' | 'active' | 'future';
}

const BEACON_COLORS = {
  completed: '#34d399',
  active: '#38bdf8',
  future: '#94a3b8',
} as const;

function WaypointBeacon({
  x,
  z,
  radiusM,
  state,
}: WaypointBeaconProps) {
  const color = BEACON_COLORS[state];
  const ringRadius = Math.max(6, Math.min(radiusM, 14));
  const marker = (
    <group position={[x, 2.4, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ringRadius, state === 'active' ? 0.55 : 0.3, 10, 48]} />
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
  const activeWaypointIndex = useSimStore(
    (state) => state.activeWaypointIndex,
  );
  const scenarioRunStatus = useSimStore(
    (state) => state.scenarioRunStatus,
  );
  const route = useMemo(
    () => getResolvedScenarioRoute(activeScenario),
    [activeScenario],
  );
  const routePoints = useMemo(
    () =>
      route.map(
        (waypoint) =>
          [waypoint.x, 2.2, waypoint.z] as [number, number, number],
      ),
    [route],
  );

  if (!enabled || scenarioRunStatus !== 'active' || route.length === 0) {
    return null;
  }

  return (
    <group>
      <Line
        points={routePoints}
        color="#7dd3fc"
        lineWidth={1.4}
        transparent
        opacity={0.42}
        dashed
        dashSize={7}
        gapSize={5}
        depthWrite={false}
      />
      {route.map((waypoint, index) => (
        <WaypointBeacon
          key={waypoint.id}
          x={waypoint.x}
          z={waypoint.z}
          radiusM={waypoint.radiusM}
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
