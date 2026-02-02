export type Vec2 = { x: number; y: number };

export type AgentId = string;
export type BuildingId = string;

export type AgentState = {
  mood: "calm" | "anxious" | "panic" | "helpful";
  stress: number;
  energy: number;
};

export type AlertStatus = "NONE" | "RUMOR" | "OFFICIAL";
export type EvacStatus = "STAY" | "EVACUATING" | "SHELTERED" | "HELPING";

export type AgentProfile = {
  ageGroup: "child" | "adult" | "senior";
  mobility: "normal" | "limited" | "needs_assist";
  language: "ja" | "en" | "zh" | "ko" | "other";
  hearing: "normal" | "impaired";
  household: "alone" | "family" | "group";
  role: "resident" | "medical" | "leader" | "staff" | "volunteer" | "visitor";
  vulnerabilityTags: string[];
  trustLevel: number;
  rumorSusceptibility: number;
};

export type Agent = {
  id: AgentId;
  name: string;
  job: string;
  personalityTags: string[];
  profile: AgentProfile;
  pos: Vec2;
  dir?: "N" | "S" | "E" | "W";
  state: AgentState;
  alertStatus?: AlertStatus;
  evacStatus?: EvacStatus;
  goal?: string;
  bubble?: string;
  icon?: "TALK" | "RUMOR" | "OFFICIAL" | "EMERGENCY" | "THINKING" | "HELP";
};

export type BuildingType =
  | "HOUSE_SMALL"
  | "HOUSE_MED"
  | "APARTMENT"
  | "OFFICE"
  | "CAFE"
  | "HOSPITAL"
  | "SCHOOL"
  | "SHELTER"
  | "BULLETIN_BOARD";

export type Building = {
  id: BuildingId;
  type: BuildingType;
  pos: Vec2;
  rotation?: 0 | 90 | 180 | 270;
  status?: "OPEN" | "CLOSED" | "CROWDED";
  capacity?: number;
  occupancy?: number;
};

export type TileType =
  | "GRASS"
  | "ROAD_STRAIGHT"
  | "ROAD_CORNER"
  | "ROAD_T"
  | "ROAD_CROSS"
  | "WATER"
  | "PARK"
  | "MOUNTAIN";

export type TownSize = "SMALL" | "MEDIUM" | "LARGE";
export type TerrainType = "COASTAL" | "MOUNTAIN" | "URBAN";

export type SimConfig = {
  size: TownSize;
  population: number;
  buildings: number;
  terrain: TerrainType;
};

export type World = {
  width: number;
  height: number;
  tiles: TileType[];
  buildings: Record<BuildingId, Building>;
  agents: Record<AgentId, Agent>;
  tick: number;
};

export type TimelineEventType =
  | "MOVE"
  | "TALK"
  | "RUMOR"
  | "OFFICIAL"
  | "ALERT"
  | "EVACUATE"
  | "SUPPORT"
  | "CHECKIN"
  | "INTERVENTION";

export type TimelineEvent = {
  id: string;
  tick: number;
  type: TimelineEventType;
  actors?: string[];
  at?: Vec2;
  message?: string;
};

export type Metrics = {
  confusion: number;
  rumorSpread: number;
  officialReach: number;
  vulnerableReach: number;
};

export type AgentReasoning = {
  agentId: AgentId;
  why: string;
  memoryRefs: { title: string; text: string }[];
};
