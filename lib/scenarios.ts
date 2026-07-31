export const SCENARIO_IDS = [
  'training',
  'storm',
  'polar',
  'night',
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];
export type ScenarioDifficulty = 'Training' | 'Moderate' | 'Severe';
export type ScenarioBoat = 'trawler' | 'speedboat';

export interface ScenarioPreset {
  id: ScenarioId;
  name: string;
  shortName: string;
  description: string;
  objective: string;
  difficulty: ScenarioDifficulty;
  recommendedBoat: ScenarioBoat;
  windSpeed: number;
  windDir: number;
  currentSpeed: number;
  currentDir: number;
  targetTime: number;
  targetSeason: number;
}

export const SCENARIO_PRESETS = {
  training: {
    id: 'training',
    name: 'Open-Water Training',
    shortName: 'Training',
    description:
      'A bright, forgiving sea state for learning throttle, steering, cameras, and recovery procedures.',
    objective:
      'Build speed, complete a controlled turn, then bring the vessel safely back below two knots.',
    difficulty: 'Training',
    recommendedBoat: 'trawler',
    windSpeed: 5,
    windDir: 110,
    currentSpeed: 0.6,
    currentDir: 20,
    targetTime: 10,
    targetSeason: 0.25,
  },
  storm: {
    id: 'storm',
    name: 'Storm Front',
    shortName: 'Storm',
    description:
      'Heavy crosswind, fast current, poor light, and active severe-weather systems test control authority.',
    objective:
      'Hold a stable heading through the squall while protecting the engine, rudder, and hull.',
    difficulty: 'Severe',
    recommendedBoat: 'trawler',
    windSpeed: 38,
    windDir: 240,
    currentSpeed: 4.5,
    currentDir: 220,
    targetTime: 18,
    targetSeason: 0.5,
  },
  polar: {
    id: 'polar',
    name: 'Polar Passage',
    shortName: 'Polar',
    description:
      'Cold water, winter terrain, and an ice field reward careful speed management and smooth steering.',
    objective:
      'Cross the winter passage without sustaining major hull damage from the ice pack.',
    difficulty: 'Moderate',
    recommendedBoat: 'trawler',
    windSpeed: 18,
    windDir: 320,
    currentSpeed: 2.2,
    currentDir: 300,
    targetTime: 8,
    targetSeason: 0.75,
  },
  night: {
    id: 'night',
    name: 'Night Watch',
    shortName: 'Night',
    description:
      'Dark open water and a steady beam wind shift attention toward instruments and camera discipline.',
    objective:
      'Maintain course and speed using the instrument HUD while visibility is limited.',
    difficulty: 'Moderate',
    recommendedBoat: 'speedboat',
    windSpeed: 12,
    windDir: 90,
    currentSpeed: 1.5,
    currentDir: 45,
    targetTime: 0,
    targetSeason: 0,
  },
} as const satisfies Readonly<Record<ScenarioId, ScenarioPreset>>;

export const SCENARIO_LIST = SCENARIO_IDS.map(
  (scenarioId) => SCENARIO_PRESETS[scenarioId],
);
