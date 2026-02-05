import type {
  SimConfig,
  TownSize,
  TerrainType,
  DisasterType,
  EmotionTone,
  AgeProfile,
} from "@/types/sim";

const roundTo = (value: number, step: number) =>
  Math.max(step, Math.round(value / step) * step);

export const SIZE_DIMENSIONS: Record<TownSize, number> = {
  SMALL: 24,
  MEDIUM: 32,
  LARGE: 40,
};

const RESEARCH_AGENT_COUNTS: Record<TownSize, number> = {
  SMALL: 266,
  MEDIUM: 1000,
  LARGE: 3000,
};

const AGENT_SCALE = 0.2;

export const POPULATION_PRESETS: Record<TownSize, number> = {
  SMALL: roundTo(RESEARCH_AGENT_COUNTS.SMALL * AGENT_SCALE, 10),
  MEDIUM: roundTo(RESEARCH_AGENT_COUNTS.MEDIUM * AGENT_SCALE, 10),
  LARGE: roundTo(RESEARCH_AGENT_COUNTS.LARGE * AGENT_SCALE, 10),
};

const RESEARCH_BUILDING_COUNT_LARGE = 2000;
const BUILDING_SCALE = 0.2;
const baseBuildingCount = roundTo(
  RESEARCH_BUILDING_COUNT_LARGE * BUILDING_SCALE,
  10
);

export const BUILDING_PRESETS: Record<TownSize, number> = {
  SMALL: roundTo(
    baseBuildingCount *
      ((SIZE_DIMENSIONS.SMALL ** 2) / (SIZE_DIMENSIONS.LARGE ** 2)),
    10
  ),
  MEDIUM: roundTo(
    baseBuildingCount *
      ((SIZE_DIMENSIONS.MEDIUM ** 2) / (SIZE_DIMENSIONS.LARGE ** 2)),
    10
  ),
  LARGE: baseBuildingCount,
};

export const DEFAULT_TERRAIN: TerrainType = "URBAN";
export const DEFAULT_DISASTER: DisasterType = "EARTHQUAKE";
export const OFFICIAL_DELAY_PRESETS = [5, 15, 30];
export const DEFAULT_OFFICIAL_DELAY_MINUTES = 15;
export const AMBIGUITY_PRESETS = [20, 50, 80];
export const DEFAULT_AMBIGUITY_LEVEL = 50;
export const MISINFORMATION_PRESETS = [20, 50, 80];
export const DEFAULT_MISINFORMATION_LEVEL = 50;
export const MULTILINGUAL_COVERAGE_PRESETS = [30, 60, 90];
export const DEFAULT_MULTILINGUAL_COVERAGE = 60;
export const FACT_CHECK_SPEED_PRESETS = [30, 60, 90];
export const DEFAULT_FACT_CHECK_SPEED = 60;
export const DEFAULT_EMOTION_TONE: EmotionTone = "NEUTRAL";
export const DEFAULT_AGE_PROFILE: AgeProfile = "BALANCED";
export const DEFAULT_INTERVENTION_BUDGET = 120;

export const DEFAULT_SIM_CONFIG: SimConfig = {
  size: "MEDIUM",
  population: POPULATION_PRESETS.MEDIUM,
  buildings: BUILDING_PRESETS.MEDIUM,
  terrain: DEFAULT_TERRAIN,
  disaster: DEFAULT_DISASTER,
  officialDelayMinutes: DEFAULT_OFFICIAL_DELAY_MINUTES,
  ambiguityLevel: DEFAULT_AMBIGUITY_LEVEL,
  misinformationLevel: DEFAULT_MISINFORMATION_LEVEL,
  multilingualCoverage: DEFAULT_MULTILINGUAL_COVERAGE,
  factCheckSpeed: DEFAULT_FACT_CHECK_SPEED,
  emotionTone: DEFAULT_EMOTION_TONE,
  ageProfile: DEFAULT_AGE_PROFILE,
};

export const TERRAIN_LABELS: Record<TerrainType, string> = {
  COASTAL: "海沿い",
  MOUNTAIN: "山",
  URBAN: "都市",
};

export const DISASTER_LABELS: Record<DisasterType, string> = {
  TSUNAMI: "津波",
  EARTHQUAKE: "地震",
  FLOOD: "洪水",
  METEOR: "隕石",
};

export const EMOTION_TONE_LABELS: Record<EmotionTone, string> = {
  WARM: "温かめ",
  NEUTRAL: "中立",
  COOL: "冷ため",
};

export const AGE_PROFILE_LABELS: Record<AgeProfile, string> = {
  YOUTH: "若年層多め",
  BALANCED: "バランス",
  SENIOR: "高齢層多め",
};
