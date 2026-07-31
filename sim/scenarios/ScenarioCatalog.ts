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

export interface ScenarioMissionDefinition {
  waypoints: readonly ScenarioWaypointDefinition[];
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
  windDir: number;
  currentSpeed: number;
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
      'Follow the coastal training route, learn the navigation display, and return under control.',
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
      'Complete the compact harbor circuit and stop at the final berth marker.',
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
        'The harbor circuit is complete and the vessel is secured at safe speed.',
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
      'Cross the storm corridor before conditions overwhelm the vessel.',
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
        'The vessel cleared the storm corridor with enough structural integrity to continue.',
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
      'Reach the rescue sector, cross the ice route, and return with the hull intact.',
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
        'The rescue route is complete and the vessel exited the ice field safely.',
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
