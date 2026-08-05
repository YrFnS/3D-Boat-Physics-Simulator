import type { BoatType } from '@/store/useSimStore';

export type ScenarioId =
  | 'open-water'
  | 'harbor-training'
  | 'storm-passage'
  | 'winter-rescue';

export type ScenarioDifficulty = 'Training' | 'Standard' | 'Advanced';

export interface ScenarioWaypointDefinition {
  id: string;
  label: string;
  x: number;
  z: number;
  radiusM: number;
  guidance: string;
}

export type ScenarioEntityType =
  | 'navigation-gate'
  | 'cargo-pickup'
  | 'cargo-delivery'
  | 'rescue-pickup'
  | 'rescue-delivery'
  | 'storm-beacon';

export interface ScenarioEntityDefinition {
  id: string;
  label: string;
  type: ScenarioEntityType;
  waypointId: string;
  radiusM: number;
  guidance: string;
  completionMessage: string;
  required: boolean;
  requiresEntityId?: string;
  offsetX?: number;
  offsetZ?: number;
}

export interface ScenarioCheckpointDefinition {
  id: string;
  label: string;
  waypointId: string;
}

export interface ScenarioMissionDefinition {
  waypoints: readonly ScenarioWaypointDefinition[];
  entities: readonly ScenarioEntityDefinition[];
  checkpoints: readonly ScenarioCheckpointDefinition[];
  timeLimitSeconds: number;
  parTimeSeconds: number;
  failureHullHealth: number;
  finalSpeedMaxKnots?: number;
  successSummary: string;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  title: string;
  kicker: string;
  summary: string;
  objective: string;
  difficulty: ScenarioDifficulty;
  recommendedBoat: BoatType;
  windSpeed: number;
  /** Compass heading the wind travels toward: 0° north (-Z), 90° east (+X). */
  windDir: number;
  currentSpeed: number;
  /** Compass heading the current travels toward: 0° north (-Z), 90° east (+X). */
  currentDir: number;
  targetTime: number;
  targetSeason: number;
  mission: ScenarioMissionDefinition;
}

export const DEFAULT_SCENARIO_ID: ScenarioId = 'open-water';

export const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: 'open-water',
    title: 'Open Water',
    kicker: 'Free cruise',
    summary:
      'A balanced daylight passage with enough wind and current to feel the six-degree vessel model without overwhelming the helm.',
    objective:
      'Follow the coastal training route, clear both sea gates, and return under control.',
    difficulty: 'Training',
    recommendedBoat: 'trawler',
    windSpeed: 8,
    windDir: 90,
    currentSpeed: 1.5,
    currentDir: 15,
    targetTime: 12,
    targetSeason: 0.25,
    mission: {
      timeLimitSeconds: 420,
      parTimeSeconds: 240,
      failureHullHealth: 0,
      finalSpeedMaxKnots: 8,
      successSummary:
        'The open-water circuit is complete and the vessel returned under control.',
      entities: [
        {
          id: 'east-training-gate',
          label: 'East training gate',
          type: 'navigation-gate',
          waypointId: 'east-mark',
          radiusM: 18,
          guidance: 'Pass between the illuminated east-gate posts.',
          completionMessage: 'East training gate cleared.',
          required: true,
        },
        {
          id: 'outer-training-gate',
          label: 'Outer training gate',
          type: 'navigation-gate',
          waypointId: 'outer-leg',
          radiusM: 20,
          guidance: 'Hold the line and clear the outer gate cleanly.',
          completionMessage: 'Outer training gate cleared.',
          required: true,
        },
      ],
      checkpoints: [
        {
          id: 'departure-checkpoint',
          label: 'Departure lane',
          waypointId: 'departure-lane',
        },
        {
          id: 'outer-leg-checkpoint',
          label: 'Outer leg',
          waypointId: 'outer-leg',
        },
      ],
      waypoints: [
        {
          id: 'departure-lane',
          label: 'Departure lane',
          x: 0,
          z: -90,
          radiusM: 26,
          guidance: 'Build speed while holding a steady outbound heading.',
        },
        {
          id: 'east-mark',
          label: 'East sea mark',
          x: 105,
          z: -165,
          radiusM: 28,
          guidance: 'Turn smoothly toward the eastern sea mark.',
        },
        {
          id: 'outer-leg',
          label: 'Outer leg',
          x: 215,
          z: -80,
          radiusM: 30,
          guidance: 'Cross the outer leg while monitoring wind and current.',
        },
        {
          id: 'return-gate',
          label: 'Return gate',
          x: 145,
          z: 55,
          radiusM: 28,
          guidance: 'Reduce speed before entering the final return gate.',
        },
      ],
    },
  },
  {
    id: 'harbor-training',
    title: 'Harbor Training',
    kicker: 'Precision handling',
    summary:
      'Low wind, a gentle cross-current, and dawn visibility create a calmer environment for throttle, rudder, stopping, and grounding practice.',
    objective:
      'Collect the harbor supply crate, complete the compact circuit, and deliver it at the final berth.',
    difficulty: 'Training',
    recommendedBoat: 'trawler',
    windSpeed: 3.5,
    windDir: 55,
    currentSpeed: 0.7,
    currentDir: 110,
    targetTime: 6,
    targetSeason: 0,
    mission: {
      timeLimitSeconds: 360,
      parTimeSeconds: 220,
      failureHullHealth: 15,
      finalSpeedMaxKnots: 3.5,
      successSummary:
        'The harbor circuit is complete and the supply crate was delivered safely.',
      entities: [
        {
          id: 'harbor-supply-pickup',
          label: 'Supply crate',
          type: 'cargo-pickup',
          waypointId: 'channel-entry',
          radiusM: 12,
          guidance: 'Approach the floating supply platform to load the crate.',
          completionMessage: 'Supply crate secured aboard.',
          required: true,
          offsetX: 5,
          offsetZ: -2,
        },
        {
          id: 'harbor-turn-gate',
          label: 'Port-turn gate',
          type: 'navigation-gate',
          waypointId: 'port-turn',
          radiusM: 13,
          guidance: 'Clear the narrow port-turn gate without contact.',
          completionMessage: 'Port-turn gate cleared.',
          required: true,
        },
        {
          id: 'harbor-supply-delivery',
          label: 'Berth delivery zone',
          type: 'cargo-delivery',
          waypointId: 'berth',
          radiusM: 11,
          guidance: 'Enter the delivery zone slowly to unload the supply crate.',
          completionMessage: 'Supply crate delivered to the berth.',
          required: true,
          requiresEntityId: 'harbor-supply-pickup',
          offsetX: -3,
          offsetZ: 1,
        },
      ],
      checkpoints: [
        {
          id: 'outer-dolphin-checkpoint',
          label: 'Outer dolphin',
          waypointId: 'outer-dolphin',
        },
        {
          id: 'inner-basin-checkpoint',
          label: 'Inner basin',
          waypointId: 'inner-basin',
        },
      ],
      waypoints: [
        {
          id: 'channel-entry',
          label: 'Channel entry',
          x: 0,
          z: -55,
          radiusM: 18,
          guidance: 'Enter the marked channel without over-correcting.',
        },
        {
          id: 'port-turn',
          label: 'Port turn',
          x: -55,
          z: -95,
          radiusM: 18,
          guidance: 'Make a controlled port turn through the narrow gate.',
        },
        {
          id: 'outer-dolphin',
          label: 'Outer dolphin',
          x: -108,
          z: -38,
          radiusM: 18,
          guidance: 'Pass the outer marker while managing cross-current drift.',
        },
        {
          id: 'inner-basin',
          label: 'Inner basin',
          x: -48,
          z: 25,
          radiusM: 18,
          guidance: 'Line up with the berth and begin reducing speed.',
        },
        {
          id: 'berth',
          label: 'Berth marker',
          x: 4,
          z: 8,
          radiusM: 16,
          guidance: 'Enter below 3.5 knots to complete the exercise.',
        },
      ],
    },
  },
  {
    id: 'storm-passage',
    title: 'Storm Passage',
    kicker: 'Heavy weather',
    summary:
      'Strong wind, fast current, dusk light, dense rain, and severe seas turn the world into a demanding survival passage.',
    objective:
      'Activate the emergency relay and cross the storm corridor before conditions overwhelm the vessel.',
    difficulty: 'Advanced',
    recommendedBoat: 'trawler',
    windSpeed: 34,
    windDir: 225,
    currentSpeed: 4.5,
    currentDir: 195,
    targetTime: 18,
    targetSeason: 0.5,
    mission: {
      timeLimitSeconds: 420,
      parTimeSeconds: 270,
      failureHullHealth: 20,
      successSummary:
        'The emergency relay is active and the vessel cleared the storm corridor with enough structural integrity to continue.',
      entities: [
        {
          id: 'storm-emergency-relay',
          label: 'Emergency relay',
          type: 'storm-beacon',
          waypointId: 'cross-sea',
          radiusM: 24,
          guidance: 'Hold near the relay long enough to trigger the automatic handoff.',
          completionMessage: 'Emergency relay activated.',
          required: true,
        },
        {
          id: 'storm-lee-gate',
          label: 'Lee-corridor gate',
          type: 'navigation-gate',
          waypointId: 'lee-corridor',
          radiusM: 25,
          guidance: 'Clear the lee-side gate while controlling roll.',
          completionMessage: 'Lee-corridor gate cleared.',
          required: true,
        },
      ],
      checkpoints: [
        {
          id: 'lee-corridor-checkpoint',
          label: 'Lee corridor',
          waypointId: 'lee-corridor',
        },
      ],
      waypoints: [
        {
          id: 'storm-entry',
          label: 'Storm entry',
          x: 0,
          z: -115,
          radiusM: 34,
          guidance: 'Set a stable heading before entering the strongest wind.',
        },
        {
          id: 'cross-sea',
          label: 'Cross-sea mark',
          x: 130,
          z: -215,
          radiusM: 38,
          guidance: 'Manage roll and avoid excessive rudder in the cross sea.',
        },
        {
          id: 'lee-corridor',
          label: 'Lee corridor',
          x: 275,
          z: -125,
          radiusM: 40,
          guidance: 'Use the current to reach the lee-side corridor.',
        },
        {
          id: 'clear-water',
          label: 'Clear-water gate',
          x: 310,
          z: 45,
          radiusM: 42,
          guidance: 'Clear the final gate before hull integrity falls below 20%.',
        },
      ],
    },
  },
  {
    id: 'winter-rescue',
    title: 'Winter Rescue',
    kicker: 'Cold-water response',
    summary:
      'Winter seas, cold morning light, packed ice, and a shifting current reward careful speed management and decisive route changes.',
    objective:
      'Recover the survivor pod, cross the ice route, and deliver it to safe water with the hull intact.',
    difficulty: 'Standard',
    recommendedBoat: 'speedboat',
    windSpeed: 17,
    windDir: 320,
    currentSpeed: 2.4,
    currentDir: 35,
    targetTime: 7,
    targetSeason: 0.75,
    mission: {
      timeLimitSeconds: 420,
      parTimeSeconds: 285,
      failureHullHealth: 35,
      finalSpeedMaxKnots: 10,
      successSummary:
        'The survivor pod reached safe water and the vessel exited the ice field intact.',
      entities: [
        {
          id: 'winter-survivor-pickup',
          label: 'Survivor pod',
          type: 'rescue-pickup',
          waypointId: 'rescue-sector',
          radiusM: 18,
          guidance: 'Approach the survivor pod carefully for automatic recovery.',
          completionMessage: 'Survivor pod recovered.',
          required: true,
          offsetX: -4,
          offsetZ: 3,
        },
        {
          id: 'winter-survivor-delivery',
          label: 'Safe-water rescue zone',
          type: 'rescue-delivery',
          waypointId: 'safe-water',
          radiusM: 22,
          guidance: 'Enter the safe-water zone below the arrival-speed limit.',
          completionMessage: 'Survivor pod transferred to the rescue team.',
          required: true,
          requiresEntityId: 'winter-survivor-pickup',
        },
      ],
      checkpoints: [
        {
          id: 'rescue-sector-checkpoint',
          label: 'Rescue sector',
          waypointId: 'rescue-sector',
        },
        {
          id: 'western-lead-checkpoint',
          label: 'Western lead',
          waypointId: 'western-lead',
        },
      ],
      waypoints: [
        {
          id: 'ice-entry',
          label: 'Ice-field entry',
          x: -20,
          z: -90,
          radiusM: 28,
          guidance: 'Reduce speed before entering the first ice band.',
        },
        {
          id: 'rescue-sector',
          label: 'Rescue sector',
          x: -125,
          z: -165,
          radiusM: 32,
          guidance: 'Reach the rescue sector while avoiding sustained ice impact.',
        },
        {
          id: 'western-lead',
          label: 'Western lead',
          x: -245,
          z: -90,
          radiusM: 34,
          guidance: 'Follow the open-water lead through the pack.',
        },
        {
          id: 'safe-water',
          label: 'Safe-water gate',
          x: -265,
          z: 65,
          radiusM: 34,
          guidance: 'Exit below 10 knots with at least 35% hull integrity.',
        },
      ],
    },
  },
] as const;

const SCENARIO_BY_ID = new Map(
  SCENARIOS.map((scenario) => [scenario.id, scenario] as const),
);

export function getScenarioDefinition(id: ScenarioId): ScenarioDefinition {
  return SCENARIO_BY_ID.get(id) ?? SCENARIOS[0];
}

export function getNextScenarioId(id: ScenarioId): ScenarioId {
  const currentIndex = SCENARIOS.findIndex((scenario) => scenario.id === id);
  return SCENARIOS[(currentIndex + 1 + SCENARIOS.length) % SCENARIOS.length].id;
}
