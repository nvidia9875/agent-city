import type { SimConfig, TownSize, TerrainType } from "@/types/sim";

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

export const DEFAULT_SIM_CONFIG: SimConfig = {
  size: "MEDIUM",
  population: POPULATION_PRESETS.MEDIUM,
  buildings: BUILDING_PRESETS.MEDIUM,
  terrain: DEFAULT_TERRAIN,
};

export const TERRAIN_LABELS: Record<TerrainType, string> = {
  COASTAL: "海沿い",
  MOUNTAIN: "山",
  URBAN: "都市",
};

