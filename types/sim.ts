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
export type AgentActivity =
  | "EATING"
  | "COMMUTING"
  | "SHOPPING"
  | "WORKING"
  | "SCHOOLING"
  | "TRAVELING"
  | "PLAYING"
  | "RESTING"
  | "SOCIALIZING"
  | "EMERGENCY"
  | "IDLE";

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
  activity?: AgentActivity;
  goal?: string;
  plan?: string;
  reflection?: string;
  isAI?: boolean;
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
export type DisasterType = "TSUNAMI" | "EARTHQUAKE" | "FLOOD" | "METEOR";
export type EmotionTone = "WARM" | "NEUTRAL" | "COOL";
export type AgeProfile = "YOUTH" | "BALANCED" | "SENIOR";

export type SimConfig = {
  size: TownSize;
  population: number;
  buildings: number;
  terrain: TerrainType;
  disaster: DisasterType;
  officialDelayMinutes: number;
  ambiguityLevel: number;
  misinformationLevel: number;
  multilingualCoverage: number;
  factCheckSpeed: number;
  emotionTone: EmotionTone;
  ageProfile: AgeProfile;
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
  | "INTERVENTION"
  | "ACTIVITY";

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
  panicIndex: number;
  trustIndex: number;
  misinfoBelief: number;
  resourceMisallocation: number;
  stabilityScore: number;
};

export type VectorClusterSummary = {
  label: string;
  count: number;
  representative: string;
  topTypes: Array<{ type: TimelineEventType | "OTHER"; count: number }>;
};

export type VectorRumorOverlap = {
  score: number;
  rumorSamples: number;
  neighborSamples: number;
  officialLike: number;
};

export type VectorInsightsStatus =
  | "pending"
  | "ready"
  | "disabled"
  | "unavailable"
  | "error";

export type VectorInsights = {
  status: VectorInsightsStatus;
  reason?: string;
  clusters: VectorClusterSummary[];
  rumorOverlap?: VectorRumorOverlap;
};

export type AgentReasoning = {
  agentId: AgentId;
  why: string;
  memoryRefs: { title: string; text: string }[];
};

export type SimEndReason = "STABILIZED" | "TIME_LIMIT" | "ESCALATED";

export type MetricsPeak = { value: number; tick: number };

export type SimEndSummary = {
  reason: SimEndReason;
  tick: number;
  durationTicks: number;
  durationSeconds: number;
  simulatedMinutes: number;
  metrics: Metrics;
  peaks: Record<keyof Metrics, MetricsPeak>;
  eventCounts: Record<TimelineEventType, number>;
  population: {
    total: number;
    alertStatus: Record<AlertStatus, number>;
    evacStatus: Record<EvacStatus, number>;
  };
  disaster: DisasterType;
  vectorInsights?: VectorInsights;
};
