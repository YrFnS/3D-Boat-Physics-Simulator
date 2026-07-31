import type { BoatType } from '@/store/useSimStore';

export type ScenarioId =
  | 'open-water'
  | 'harbor-training'
  | 'storm-passage'
  | 'winter-rescue';

export type ScenarioDifficulty = 'Training' | 'Standard' | 'Advanced';

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
}

export const DEFAULT_SCENARIO_ID: ScenarioId = 'open-water';

export const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: 'open-water',
    title: 'Open Water',
    kicker: 'Free cruise',
    summary:
      'A balanced daylight passage with enough wind and current to feel the new six-degree vessel model without overwhelming the helm.',
    objective: 'Explore, compare both vessels, and learn the handling model.',
    difficulty: 'Training',
    recommendedBoat: 'trawler',
    windSpeed: 8,
    windDir: 90,
    currentSpeed: 1.5,
    currentDir: 15,
    targetTime: 12,
    targetSeason: 0.25,
  },
  {
    id: 'harbor-training',
    title: 'Harbor Training',
    kicker: 'Precision handling',
    summary:
      'Low wind, a gentle cross-current, and dawn visibility create a calmer environment for throttle, rudder, stopping, and grounding practice.',
    objective: 'Practice controlled turns, stopping, reverse, and shoreline release.',
    difficulty: 'Training',
    recommendedBoat: 'trawler',
    windSpeed: 3.5,
    windDir: 55,
    currentSpeed: 0.7,
    currentDir: 110,
    targetTime: 6,
    targetSeason: 0,
  },
  {
    id: 'storm-passage',
    title: 'Storm Passage',
    kicker: 'Heavy weather',
    summary:
      'Strong wind, fast current, dusk light, dense rain, and severe seas turn the world into a demanding survival passage.',
    objective: 'Maintain control, protect the vessel, and avoid hazards in severe weather.',
    difficulty: 'Advanced',
    recommendedBoat: 'trawler',
    windSpeed: 34,
    windDir: 225,
    currentSpeed: 4.5,
    currentDir: 195,
    targetTime: 18,
    targetSeason: 0.5,
  },
  {
    id: 'winter-rescue',
    title: 'Winter Rescue',
    kicker: 'Cold-water response',
    summary:
      'Winter seas, cold morning light, packed ice, and a shifting current reward careful speed management and decisive route changes.',
    objective: 'Cross the ice field while limiting impact damage and loss of control.',
    difficulty: 'Standard',
    recommendedBoat: 'speedboat',
    windSpeed: 17,
    windDir: 320,
    currentSpeed: 2.4,
    currentDir: 35,
    targetTime: 7,
    targetSeason: 0.75,
  },
] as const;

const SCENARIO_BY_ID = new Map(
  SCENARIOS.map((scenario) => [scenario.id, scenario] as const),
);

export function getScenarioDefinition(id: ScenarioId): ScenarioDefinition {
  return SCENARIO_BY_ID.get(id) ?? SCENARIOS[0];
}
