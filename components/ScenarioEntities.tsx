'use client';

import { Float } from '@react-three/drei';
import { useMemo } from 'react';
import type { ScenarioEntityType } from '@/sim/scenarios/ScenarioCatalog';
import { resolveNavigationGateHalfWidthM } from '@/sim/scenarios/ScenarioInteractionRuntime';
import { headingDegreesToYawRadians } from '@/sim/world/WorldDirection';
import {
  getResolvedScenarioEntities,
  getResolvedScenarioRoute,
} from '@/sim/scenarios/ScenarioRoute';
import { useNavigationPlanner } from '@/store/useNavigationPlanner';
import { useSimStore } from '@/store/useSimStore';

interface ScenarioEntitiesProps {
  enabled: boolean;
}

type EntityVisualState = 'completed' | 'active' | 'future';

const STATE_COLORS = {
  completed: '#34d399',
  active: '#fbbf24',
  future: '#64748b',
} as const;

function NavigationGate({
  halfWidthM,
  color,
  opacity,
}: {
  halfWidthM: number;
  color: string;
  opacity: number;
}) {
  const halfWidth = halfWidthM;

  return (
    <group>
      {[-halfWidth, halfWidth].map((x) => (
        <group key={x} position={[x, 4.5, 0]}>
          <mesh>
            <cylinderGeometry args={[0.32, 0.48, 9, 10]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.45}
              transparent
              opacity={opacity}
            />
          </mesh>
          <mesh position={[0, 4.8, 0]}>
            <sphereGeometry args={[0.72, 12, 8]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={opacity}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 9.2, 0]}>
        <boxGeometry args={[halfWidth * 2, 0.18, 0.18]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.7}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function CargoEntity({
  delivered,
  color,
  opacity,
}: {
  delivered: boolean;
  color: string;
  opacity: number;
}) {
  return (
    <group>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[3.6, 4, 0.7, 12]} />
        <meshStandardMaterial
          color="#334155"
          metalness={0.35}
          roughness={0.7}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, delivered ? 0.75 : 1.45, 0]}>
        <boxGeometry args={[2.8, 1.7, 2.2]} />
        <meshStandardMaterial
          color={delivered ? color : '#d97706'}
          emissive={color}
          emissiveIntensity={delivered ? 0.3 : 0.08}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, 3.3, 0]}>
        <torusGeometry args={[2.2, 0.12, 8, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.75}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function RescueEntity({
  delivered,
  color,
  opacity,
}: {
  delivered: boolean;
  color: string;
  opacity: number;
}) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.8, 0]}>
        <torusGeometry args={[2.4, 0.55, 10, 32]} />
        <meshStandardMaterial
          color={delivered ? color : '#fb923c'}
          emissive={color}
          emissiveIntensity={0.2}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <capsuleGeometry args={[0.65, 1.7, 6, 12]} />
        <meshStandardMaterial
          color="#f8fafc"
          emissive={color}
          emissiveIntensity={delivered ? 0.35 : 0.1}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, 6.2, 0]}>
        <octahedronGeometry args={[1.05, 0]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

function StormBeacon({
  color,
  opacity,
}: {
  color: string;
  opacity: number;
}) {
  return (
    <group>
      <mesh position={[0, 4.2, 0]}>
        <cylinderGeometry args={[0.5, 1.2, 8.4, 10]} />
        <meshStandardMaterial
          color="#334155"
          metalness={0.5}
          roughness={0.45}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, 8.8, 0]}>
        <sphereGeometry args={[1.25, 16, 10]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 12.5, 0]}>
        <coneGeometry args={[2.2, 4.5, 16, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.18}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function EntityModel({
  type,
  radiusM,
  state,
}: {
  type: ScenarioEntityType;
  radiusM: number;
  state: EntityVisualState;
}) {
  const color = STATE_COLORS[state];
  const opacity = state === 'future' ? 0.4 : state === 'completed' ? 0.65 : 0.95;
  const delivered =
    type === 'cargo-delivery' || type === 'rescue-delivery';

  if (type === 'navigation-gate') {
    return (
      <NavigationGate
        halfWidthM={resolveNavigationGateHalfWidthM({ radiusM })}
        color={color}
        opacity={opacity}
      />
    );
  }
  if (type === 'cargo-pickup' || type === 'cargo-delivery') {
    return (
      <CargoEntity delivered={delivered} color={color} opacity={opacity} />
    );
  }
  if (type === 'rescue-pickup' || type === 'rescue-delivery') {
    return (
      <RescueEntity delivered={delivered} color={color} opacity={opacity} />
    );
  }
  return <StormBeacon color={color} opacity={opacity} />;
}

export default function ScenarioEntities({
  enabled,
}: ScenarioEntitiesProps) {
  const activeScenario = useSimStore((state) => state.activeScenario);
  const activeWaypointIndex = useSimStore(
    (state) => state.activeWaypointIndex,
  );
  const completedEntityIds = useSimStore(
    (state) => state.completedScenarioEntityIds,
  );
  const scenarioRunStatus = useSimStore(
    (state) => state.scenarioRunStatus,
  );
  const navigationMode = useNavigationPlanner((state) => state.mode);
  const route = useMemo(
    () => getResolvedScenarioRoute(activeScenario),
    [activeScenario],
  );
  const entities = useMemo(
    () => getResolvedScenarioEntities(activeScenario),
    [activeScenario],
  );
  const completedSet = useMemo(
    () => new Set(completedEntityIds),
    [completedEntityIds],
  );
  const activeWaypointId = route[activeWaypointIndex]?.id;

  if (
    !enabled ||
    navigationMode !== 'mission' ||
    scenarioRunStatus !== 'active'
  ) {
    return null;
  }

  return (
    <group>
      {entities.map((entity) => {
        const completed = completedSet.has(entity.id);
        const prerequisiteMet =
          !entity.requiresEntityId || completedSet.has(entity.requiresEntityId);
        const active =
          !completed &&
          prerequisiteMet &&
          entity.waypointId === activeWaypointId;
        const state: EntityVisualState = completed
          ? 'completed'
          : active
            ? 'active'
            : 'future';
        const model = (
          <group
            position={[entity.x, 0.3, entity.z]}
            rotation={[
              0,
              entity.type === 'navigation-gate'
                ? headingDegreesToYawRadians(entity.headingDeg)
                : 0,
              0,
            ]}
          >
            <EntityModel
              type={entity.type}
              radiusM={entity.radiusM}
              state={state}
            />
          </group>
        );

        return active ? (
          <Float
            key={entity.id}
            speed={1.7}
            rotationIntensity={0.08}
            floatIntensity={0.35}
          >
            {model}
          </Float>
        ) : (
          <group key={entity.id}>{model}</group>
        );
      })}
    </group>
  );
}
