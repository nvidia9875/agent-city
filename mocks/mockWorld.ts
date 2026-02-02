import type {
  Agent,
  Building,
  BuildingType,
  SimConfig,
  TerrainType,
  TileType,
  World,
} from "@/types/sim";
import { toIndex } from "@/utils/grid";
import {
  DEFAULT_SIM_CONFIG,
  SIZE_DIMENSIONS,
} from "@/utils/simConfig";

const randomPick = <T,>(items: T[]) =>
  items[Math.floor(Math.random() * items.length)];

const createRoadSet = (
  width: number,
  height: number,
  isLand: (x: number, y: number) => boolean
) => {
  const road = new Set<string>();
  const verticals = [4, 9, 14, 20, 25, 28].filter((x) => x < width - 2);
  const horizontals = [5, 11, 17, 22, 26].filter((y) => y < height - 2);

  verticals.forEach((x) => {
    for (let y = 2; y < height - 2; y += 1) {
      if (isLand(x, y)) road.add(`${x},${y}`);
    }
  });

  horizontals.forEach((y) => {
    for (let x = 2; x < width - 2; x += 1) {
      if (isLand(x, y)) road.add(`${x},${y}`);
    }
  });

  return road;
};

const deriveRoadType = (
  north: boolean,
  south: boolean,
  west: boolean,
  east: boolean
): TileType => {
  const count = [north, south, west, east].filter(Boolean).length;
  if (count >= 4) return "ROAD_CROSS";
  if (count === 3) return "ROAD_T";
  if (count === 2) {
    if ((north && south) || (east && west)) return "ROAD_STRAIGHT";
    return "ROAD_CORNER";
  }
  return "ROAD_STRAIGHT";
};

const createTerrainBase = (
  width: number,
  height: number,
  terrain: TerrainType
) => {
  const tiles: TileType[] = Array.from({ length: width * height }, () => "GRASS");

  if (terrain === "COASTAL") {
    const depth = Math.max(3, Math.floor(height * 0.18));
    for (let y = 0; y < depth; y += 1) {
      for (let x = 0; x < width; x += 1) {
        tiles[toIndex(x, y, width)] = "WATER";
      }
    }
  }

  if (terrain === "MOUNTAIN") {
    const depth = Math.max(3, Math.floor(width * 0.18));
    for (let x = width - depth; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        tiles[toIndex(x, y, width)] = "MOUNTAIN";
      }
    }
  }

  if (terrain === "URBAN") {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (tiles[toIndex(x, y, width)] !== "GRASS") continue;
        if (Math.random() > 0.96) {
          tiles[toIndex(x, y, width)] = "PARK";
        }
      }
    }
  }

  return tiles;
};

const createTiles = (width: number, height: number, terrain: TerrainType) => {
  const tiles = createTerrainBase(width, height, terrain);
  const isLand = (x: number, y: number) => {
    const tile = tiles[toIndex(x, y, width)];
    return tile !== "WATER" && tile !== "MOUNTAIN";
  };

  const road = createRoadSet(width, height, isLand);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = `${x},${y}`;
      if (!road.has(key)) continue;
      const north = road.has(`${x},${y - 1}`);
      const south = road.has(`${x},${y + 1}`);
      const west = road.has(`${x - 1},${y}`);
      const east = road.has(`${x + 1},${y}`);
      tiles[toIndex(x, y, width)] = deriveRoadType(north, south, west, east);
    }
  }

  return tiles;
};

const placeBuildings = (
  width: number,
  height: number,
  tiles: TileType[],
  targetCount: number
) => {
  const buildings: Record<string, Building> = {};
  const occupied = new Set<string>();
  let id = 1;
  const capacityByType: Partial<Record<BuildingType, number>> = {
    SHELTER: 120,
    HOSPITAL: 60,
    SCHOOL: 100,
    CAFE: 30,
    BULLETIN_BOARD: 12,
  };

  const isRoad = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const tile = tiles[toIndex(x, y, width)];
    return tile.startsWith("ROAD");
  };

  const isBuildable = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const tile = tiles[toIndex(x, y, width)];
    if (tile !== "GRASS" && tile !== "PARK") return false;
    if (occupied.has(`${x},${y}`)) return false;
    return (
      isRoad(x + 1, y) ||
      isRoad(x - 1, y) ||
      isRoad(x, y + 1) ||
      isRoad(x, y - 1)
    );
  };

  const addBuilding = (type: BuildingType, x: number, y: number) => {
    if (!isBuildable(x, y)) return false;
    const key = `B-${id}`;
    const capacity = capacityByType[type];
    const occupancy = capacity
      ? Math.floor(capacity * (0.2 + Math.random() * 0.7))
      : undefined;
    let status: Building["status"] = Math.random() > 0.2 ? "OPEN" : "CLOSED";
    if (capacity && occupancy && occupancy / capacity > 0.82) {
      status = "CROWDED";
    }
    buildings[key] = {
      id: key,
      type,
      pos: { x, y },
      rotation: randomPick([0, 90, 180, 270]),
      status,
      capacity,
      occupancy,
    };
    occupied.add(`${x},${y}`);
    id += 1;
    return true;
  };

  const facilities: Array<[BuildingType, number, number]> = [
    ["HOSPITAL", Math.floor(width * 0.25), Math.floor(height * 0.25)],
    ["SCHOOL", Math.floor(width * 0.65), Math.floor(height * 0.3)],
    ["SHELTER", Math.floor(width * 0.7), Math.floor(height * 0.7)],
    ["BULLETIN_BOARD", Math.floor(width * 0.3), Math.floor(height * 0.65)],
    ["CAFE", Math.floor(width * 0.45), Math.floor(height * 0.55)],
  ];

  facilities.forEach(([type, x, y]) => {
    if (Object.keys(buildings).length >= targetCount) return;
    const offsets = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of offsets) {
      if (addBuilding(type, x + dx, y + dy)) break;
    }
  });

  const houseTypes: BuildingType[] = [
    "HOUSE_SMALL",
    "HOUSE_SMALL",
    "HOUSE_MED",
    "APARTMENT",
    "OFFICE",
  ];

  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (!isBuildable(x, y)) continue;
      candidates.push({ x, y });
    }
  }

  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const swap = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[swap]] = [candidates[swap], candidates[i]];
  }

  for (const candidate of candidates) {
    if (Object.keys(buildings).length >= targetCount) break;
    const type = randomPick(houseTypes);
    addBuilding(type, candidate.x, candidate.y);
  }

  return buildings;
};

const createAgents = (
  width: number,
  height: number,
  tiles: TileType[],
  agentCount: number
) => {
  const agents: Record<string, Agent> = {};
  const roadPositions: { x: number; y: number }[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (tiles[toIndex(x, y, width)].startsWith("ROAD")) {
        roadPositions.push({ x, y });
      }
    }
  }

  const names = [
    "葵",
    "蓮",
    "美空",
    "陽菜",
    "健人",
    "結衣",
    "陽太",
    "凛",
    "杏奈",
    "蒼",
    "大翔",
    "結月",
    "海斗",
    "心春",
    "颯太",
    "美結",
    "樹",
    "芽依",
    "悠真",
    "紬",
    "一花",
    "湊",
    "咲良",
    "律",
  ];

  const roleJobMap = {
    resident: ["会社員", "商店主", "デザイナー", "在宅勤務"],
    medical: ["看護師", "医師", "薬剤師"],
    leader: ["自治会長", "防災担当"],
    staff: ["避難所スタッフ", "市役所職員"],
    volunteer: ["ボランティア", "消防団"],
    visitor: ["観光客", "留学生"],
  } satisfies Record<Agent["profile"]["role"], string[]>;

  const tags = ["慎重", "社交的", "前向き", "助け好き", "好奇心旺盛", "観察的"];
  const moods: Agent["state"]["mood"][] = ["calm", "anxious", "panic", "helpful"];
  const count = Math.min(agentCount, roadPositions.length);

  for (let i = 0; i < count; i += 1) {
    const pos = randomPick(roadPositions);
    const id = `A-${i + 1}`;
    const ageGroup = randomPick(["adult", "adult", "adult", "senior", "child"]);
    const language = randomPick(["ja", "ja", "ja", "ja", "en", "zh", "ko"]);
    const hearing = Math.random() > 0.92 ? "impaired" : "normal";
    const mobility =
      ageGroup === "senior"
        ? randomPick(["limited", "needs_assist", "normal"])
        : ageGroup === "child"
          ? randomPick(["normal", "limited"])
          : randomPick(["normal", "normal", "limited"]);
    const household =
      ageGroup === "child" ? "family" : randomPick(["alone", "family", "group"]);
    const role = randomPick(
      Object.keys(roleJobMap) as Array<Agent["profile"]["role"]>
    );
    const vulnerabilityTags: string[] = [];
    if (ageGroup === "senior") vulnerabilityTags.push("高齢者");
    if (ageGroup === "child") vulnerabilityTags.push("子ども");
    if (household === "family" && ageGroup === "adult")
      vulnerabilityTags.push("養育者");
    if (mobility === "limited") vulnerabilityTags.push("移動制約");
    if (mobility === "needs_assist") vulnerabilityTags.push("要介助");
    if (hearing === "impaired") vulnerabilityTags.push("聴覚障害");
    if (language !== "ja") vulnerabilityTags.push("非日本語話者");
    if (household === "alone" && ageGroup === "senior")
      vulnerabilityTags.push("独居");

    const trustBase = language === "ja" ? 50 : 40;
    const trustLevel = trustBase + Math.floor(Math.random() * 40);
    const rumorSusceptibility = 25 + Math.floor(Math.random() * 55);
    const alertRoll = Math.random();
    const alertStatus =
      alertRoll > 0.88 ? "OFFICIAL" : alertRoll > 0.72 ? "RUMOR" : "NONE";
    const evacStatus =
      role === "volunteer" && Math.random() > 0.65
        ? "HELPING"
        : alertStatus !== "NONE" && Math.random() > 0.6
          ? "EVACUATING"
          : "STAY";
    const goal =
      role === "medical"
        ? "負傷者の状況確認"
        : role === "leader"
          ? "住民へ声掛け"
          : role === "volunteer"
            ? "要支援者の誘導"
            : alertStatus === "OFFICIAL"
              ? "高台へ避難"
              : "周辺の様子を確認";
    const bubble =
      alertStatus === "RUMOR"
        ? "橋が危ないらしい…"
        : alertStatus === "OFFICIAL"
          ? "公式警報が出た！"
          : Math.random() > 0.75
            ? "近所の人と情報交換中"
            : undefined;
    const icon =
      alertStatus === "RUMOR"
        ? "RUMOR"
        : alertStatus === "OFFICIAL"
          ? "OFFICIAL"
          : Math.random() > 0.9
            ? "THINKING"
            : undefined;

    agents[id] = {
      id,
      name: names[i % names.length],
      job: randomPick(roleJobMap[role]),
      personalityTags: [randomPick(tags), randomPick(tags)],
      profile: {
        ageGroup,
        mobility,
        language,
        hearing,
        household,
        role,
        vulnerabilityTags,
        trustLevel,
        rumorSusceptibility,
      },
      pos: { x: pos.x, y: pos.y },
      state: {
        mood: randomPick(moods),
        stress: 20 + Math.floor(Math.random() * 50),
        energy: 40 + Math.floor(Math.random() * 50),
      },
      alertStatus,
      evacStatus,
      goal,
      bubble,
      icon,
    };
  }

  return agents;
};

export const createMockWorld = (config: SimConfig = DEFAULT_SIM_CONFIG): World => {
  const size = SIZE_DIMENSIONS[config.size];
  const width = size;
  const height = size;
  const tiles = createTiles(width, height, config.terrain);
  const buildings = placeBuildings(width, height, tiles, config.buildings);
  const agents = createAgents(width, height, tiles, config.population);

  return {
    width,
    height,
    tiles,
    buildings,
    agents,
    tick: 0,
  };
};
