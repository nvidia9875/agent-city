import dotenv from "dotenv";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import type {
  Agent,
  AgentActivity,
  AgentReasoning,
  Building,
  Metrics,
  SimEndReason,
  SimEndSummary,
  InterventionComboKey,
  InterventionKind,
  TimelineEvent,
  TimelineEventType,
  SimConfig,
  World,
} from "../types/sim";
import type { WsClientMsg, WsServerMsg } from "../types/ws";
import { createMockWorld } from "../mocks/mockWorld";
import { clamp } from "../utils/easing";
import {
  buildTalkExchange,
  formatTalkTimelineMessage,
  pickTalkTargetAgent,
} from "../utils/talk";
import { buildAgentBubble } from "../utils/bubble";
import { toIndex } from "../utils/grid";
import { ACTIVITY_GOALS, ACTIVITY_LABELS, formatActivityMessage } from "../utils/activity";
import {
  generateAgentBubbleLine,
  generateAgentDecision,
  generateAgentTalkReply,
  generateAgentTalkSpeakerLine,
} from "../lib/ai/decision";
import type { AgentDecision } from "../lib/ai/decision";
import { generateAndStoreReasoning } from "../lib/ai/reasoning";
import {
  recordAgentMemory,
  recordEventMemory,
  setMemoryPipelineSimulationId,
} from "../lib/ai/memoryPipeline";
import { getRelevantMemories } from "../lib/ai/memoryRetrieval";
import { generateVectorInsights, getVectorInsightsBootstrap } from "../lib/ai/vectorInsights";
import { getAgentReasoning } from "../lib/db/agentReasoning";
import { saveEvent, saveMetrics } from "../lib/db/simState";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const logLevel = process.env.SIM_LOG_LEVEL ?? "info";
const allowInfo = logLevel === "info" || logLevel === "debug";
const allowDebug = logLevel === "debug";
const logInfo = (...args: unknown[]) => {
  if (allowInfo) {
    console.log("[sim]", ...args);
  }
};
const logDebug = (...args: unknown[]) => {
  if (allowDebug) {
    console.log("[sim:debug]", ...args);
  }
};
const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const randomPick = <T,>(items: T[]) =>
  items[Math.floor(Math.random() * items.length)];

const randomId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const minutesToTicks = (minutes: number) =>
  Math.max(0, Math.round(minutes / Math.max(1, minutesPerTick)));
const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const isVulnerable = (agent: Agent) => agent.profile.vulnerabilityTags.length > 0;
const officialAccessibility = (agent: Agent, coverage: number) => {
  const coverageFactor = clamp01(coverage / 100);
  const languageFactor =
    agent.profile.language === "ja" ? 1 : 0.3 + coverageFactor * 0.7;
  const hearingFactor = agent.profile.hearing === "normal" ? 1 : 0.7;
  return languageFactor * hearingFactor;
};
const MINUTES_IN_DAY = 24 * 60;
const DEFAULT_START_MINUTE = 9 * 60;
const DEFAULT_MINUTES_PER_TICK = 5;

const resolveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const simStartMinute = resolveNumber(
  process.env.SIM_START_MINUTE ?? undefined,
  DEFAULT_START_MINUTE
);
const minutesPerTick = Math.max(
  1,
  resolveNumber(process.env.SIM_MINUTES_PER_TICK ?? undefined, DEFAULT_MINUTES_PER_TICK)
);

const getSimMinute = (tick: number) => {
  const raw = simStartMinute + tick * minutesPerTick;
  return ((raw % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
};

const formatSimTime = (minute: number) => {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

const deriveDailyActivity = (agent: Agent, minute: number): AgentActivity => {
  if (agent.evacStatus && agent.evacStatus !== "STAY") return "EMERGENCY";
  if (agent.alertStatus !== "NONE") {
    if (["medical", "staff", "leader", "volunteer"].includes(agent.profile.role)) {
      return "EMERGENCY";
    }
  }

  const hour = Math.floor(minute / 60);
  const isNight = hour >= 22 || hour < 6;
  if (isNight) return "RESTING";

  if (hour >= 6 && hour < 9) {
    if (agent.profile.ageGroup === "child") return "COMMUTING";
    if (agent.profile.role === "visitor") return "TRAVELING";
    return "COMMUTING";
  }

  if (hour >= 9 && hour < 12) {
    if (agent.profile.role === "visitor") return "TRAVELING";
    if (agent.profile.ageGroup === "child") return "SCHOOLING";
    if (agent.profile.ageGroup === "senior") return Math.random() > 0.5 ? "RESTING" : "SHOPPING";
    if (["medical", "staff", "leader", "volunteer"].includes(agent.profile.role))
      return "WORKING";
    return "WORKING";
  }

  if (hour >= 12 && hour < 13) return "EATING";

  if (hour >= 13 && hour < 17) {
    if (agent.profile.role === "visitor") return "TRAVELING";
    if (agent.profile.ageGroup === "child") return "SCHOOLING";
    if (agent.profile.ageGroup === "senior") return Math.random() > 0.5 ? "RESTING" : "SHOPPING";
    return "WORKING";
  }

  if (hour >= 17 && hour < 19) {
    if (agent.profile.ageGroup === "child") return "PLAYING";
    if (agent.profile.ageGroup === "senior")
      return Math.random() > 0.5 ? "RESTING" : "SHOPPING";
    return Math.random() > 0.5 ? "COMMUTING" : "SHOPPING";
  }

  if (hour >= 19 && hour < 22) {
    return Math.random() > 0.5 ? "EATING" : "SOCIALIZING";
  }

  return "IDLE";
};

const activityMoveFactor = (activity?: AgentActivity) => {
  switch (activity) {
    case "COMMUTING":
    case "TRAVELING":
      return 1.35;
    case "SHOPPING":
    case "PLAYING":
      return 1.15;
    case "WORKING":
    case "SCHOOLING":
      return 0.5;
    case "EATING":
      return 0.35;
    case "RESTING":
      return 0.25;
    case "SOCIALIZING":
      return 0.75;
    case "EMERGENCY":
      return 1.2;
    default:
      return 0.9;
  }
};

const normalizeActivity = (value?: string): AgentActivity | undefined => {
  if (!value) return undefined;
  return Object.prototype.hasOwnProperty.call(ACTIVITY_LABELS, value)
    ? (value as AgentActivity)
    : undefined;
};

const pickEventMessage = (type: TimelineEventType) => {
  const disaster = currentConfig?.disaster ?? "EARTHQUAKE";
  const overrides = DISASTER_EVENT_OVERRIDES[disaster]?.[type];
  const pool = overrides ?? BASE_EVENT_MESSAGES[type];
  return randomPick(pool);
};

const BASE_EVENT_MESSAGES: Record<TimelineEventType, string[]> = {
  MOVE: ["避難ルートを確認中。", "安全な道を探して移動。"],
  TALK: [
    "いま安全なルートを確認しよう。",
    "避難所の混雑状況を共有したい。",
    "この周辺の危険箇所を確認しよう。",
    "公式情報の更新を見た？",
    "要支援者の状況を優先して見よう。",
  ],
  ACTIVITY: ["日常の用事を進めている。", "今の活動を続ける。"],
  RUMOR: [
    "橋が落ちたという噂が広がる。",
    "避難所が満員だという話が出回る。",
  ],
  OFFICIAL: ["公式: 津波警報を発表。", "公式: 避難所の場所を案内。"],
  ALERT: ["サイレンが鳴った。", "緊急放送が流れた。"],
  EVACUATE: ["高台へ避難開始。", "家族を迎えて避難を開始。"],
  SUPPORT: ["高齢者の避難を支援。", "要支援者の誘導を開始。"],
  CHECKIN: ["安否確認の連絡を送信。", "近所の無事を確認。"],
  INTERVENTION: ["介入が実施された。"],
};

const MISINFO_EVENT_MESSAGES = [
  "AI生成の避難指示が出回っている。",
  "真偽不明の地震予知が拡散中。",
  "誤った避難先の情報が共有されている。",
];

const DISASTER_EVENT_OVERRIDES: Record<
  SimConfig["disaster"],
  Partial<Record<TimelineEventType, string[]>>
> = {
  TSUNAMI: {
    OFFICIAL: ["公式: 津波警報を発表。", "公式: 津波到達に備え避難。"],
    ALERT: ["津波警報サイレンが鳴った。", "緊急放送が流れた。"],
    EVACUATE: ["高台へ避難開始。", "沿岸部から避難を開始。"],
    RUMOR: ["港が危険だという噂が広がる。", "海が急に引いたと話題。"],
  },
  EARTHQUAKE: {
    OFFICIAL: ["公式: 余震に警戒。", "公式: 避難所の場所を案内。"],
    ALERT: ["緊急地震速報が鳴った。", "強い揺れが発生。"],
    EVACUATE: ["避難所へ移動開始。", "安全な場所へ避難。"],
    RUMOR: ["建物が倒れたという噂が広がる。", "橋が使えないらしい。"],
  },
  FLOOD: {
    OFFICIAL: ["公式: 氾濫警戒情報を発表。", "公式: 浸水地域から避難。"],
    ALERT: ["河川の水位が急上昇。", "浸水警報が流れた。"],
    EVACUATE: ["高い場所へ避難開始。", "浸水を避けて移動。"],
    RUMOR: ["堤防が決壊したという噂。", "地下が浸水したらしい。"],
  },
  METEOR: {
    OFFICIAL: ["公式: 落下予測を更新。", "公式: 直ちに避難。"],
    ALERT: ["隕石警報が発令された。", "衝撃波に警戒。"],
    EVACUATE: ["地下施設へ避難開始。", "安全区域へ移動。"],
    RUMOR: ["隕石が街に落ちたという噂。", "通信が途絶えたらしい。"],
  },
};

const SIM_END_MAX_TICKS = 60;
const SIM_END_STABLE_WINDOW = 12;
const SIM_END_ESCALATE_WINDOW = 12;
const SIM_END_STABLE_THRESHOLD = {
  confusionMax: 40,
  rumorMax: 32,
  officialMin: 65,
  vulnerableMin: 55,
  panicMax: 45,
  trustMin: 55,
  misinfoMax: 30,
  misallocationMax: 40,
  stabilityMin: 65,
};
const SIM_END_ESCALATE_THRESHOLD = {
  confusionMin: 85,
  rumorMin: 60,
  panicMin: 80,
  misinfoMin: 60,
  misallocationMin: 70,
};

const port = Number(process.env.SIM_SERVER_PORT ?? process.env.PORT ?? 3001);

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

let world: World | undefined;
let speed: 1 | 5 | 20 | 60 = 1;
let paused = false;
let interval: NodeJS.Timeout | undefined;
let officialDelayMinutes = 15;
let officialDelayTicks = 0;
let ambiguityLevel = 50;
let misinformationLevel = 50;
let multilingualCoverage = 60;
let factCheckSpeed = 60;
let simEnded = false;
let simStartedAt = 0;
let simStartTick = 0;
let currentSimulationId: string | undefined;
let stableTicks = 0;
let escalatedTicks = 0;
let currentConfig: SimConfig | undefined;
const resetMetrics = (): Metrics => ({
  confusion: 34,
  rumorSpread: 26,
  officialReach: 42,
  vulnerableReach: 22,
  panicIndex: 38,
  trustIndex: 55,
  misinfoBelief: 18,
  resourceMisallocation: 20,
  stabilityScore: 52,
});
let metrics: Metrics = resetMetrics();

type InterventionHistoryItem = { kind: InterventionKind; tick: number };
type InterventionCombo = {
  key: InterventionComboKey;
  sequence: [InterventionKind, InterventionKind];
  label: string;
  message: string;
};

const INTERVENTION_COMBO_WINDOW_TICKS = 8;
const INTERVENTION_COMBOS: InterventionCombo[] = [
  {
    key: "TRUTH_CASCADE",
    sequence: ["rumor_monitoring", "official_alert"],
    label: "Truth Cascade",
    message: "デマ抑止の直後に公式警報が波及し、信頼回復が加速した。",
  },
  {
    key: "EVAC_EXPRESS",
    sequence: ["multilingual_broadcast", "route_guidance"],
    label: "Evac Express",
    message: "多言語警報とルート誘導が噛み合い、避難開始が連鎖した。",
  },
  {
    key: "CARE_CHAIN",
    sequence: ["support_vulnerable", "operations_rebalance"],
    label: "Care Chain",
    message: "要支援者支援と再配分が連携し、現場の負荷が下がった。",
  },
];
let interventionHistory: InterventionHistoryItem[] = [];

const INTERVENTION_KIND_LABELS: Record<InterventionKind, string> = {
  official_alert: "公式警報一斉配信",
  open_shelter: "避難所拡張",
  fact_check: "ファクトチェック",
  support_vulnerable: "要支援者支援",
  multilingual_broadcast: "多言語一斉アラート",
  route_guidance: "避難ルート誘導",
  rumor_monitoring: "SNSデマ監視",
  volunteer_mobilization: "ボランティア招集",
  operations_rebalance: "支援優先度リバランス",
  triage_dispatch: "誤配分是正トリアージ",
};

const isInterventionKind = (value: string): value is InterventionKind =>
  Object.prototype.hasOwnProperty.call(INTERVENTION_KIND_LABELS, value);

const resolveInterventionCombo = (
  history: InterventionHistoryItem[]
): InterventionCombo | null => {
  const latest = history[history.length - 1];
  if (!latest) return null;

  for (const combo of INTERVENTION_COMBOS) {
    const [, second] = combo.sequence;
    if (latest.kind !== second) continue;
    for (let i = history.length - 2; i >= 0; i -= 1) {
      const item = history[i];
      if (!item) continue;
      if (latest.tick - item.tick > INTERVENTION_COMBO_WINDOW_TICKS) break;
      if (item.kind === combo.sequence[0]) {
        return combo;
      }
    }
  }

  return null;
};

const eventLog: TimelineEvent[] = [];
const createEventCounts = (): Record<TimelineEventType, number> => ({
  MOVE: 0,
  TALK: 0,
  ACTIVITY: 0,
  RUMOR: 0,
  OFFICIAL: 0,
  ALERT: 0,
  EVACUATE: 0,
  SUPPORT: 0,
  CHECKIN: 0,
  INTERVENTION: 0,
});
let eventCounts = createEventCounts();
let metricsPeaks: Record<keyof Metrics, { value: number; tick: number }> = {
  confusion: { value: 0, tick: 0 },
  rumorSpread: { value: 0, tick: 0 },
  officialReach: { value: 0, tick: 0 },
  vulnerableReach: { value: 0, tick: 0 },
  panicIndex: { value: 0, tick: 0 },
  trustIndex: { value: 0, tick: 0 },
  misinfoBelief: { value: 0, tick: 0 },
  resourceMisallocation: { value: 0, tick: 0 },
  stabilityScore: { value: 0, tick: 0 },
};
const reasoningCache = new Map<string, { ts: number; data: AgentReasoning }>();
const decisionInFlight = new Set<string>();
const adkDecisionEnabled = process.env.SIM_ADK_ENABLED === "true";
const aiDecisionEnabled =
  process.env.SIM_AI_DECISION_ENABLED === "true" || adkDecisionEnabled;
const aiDecisionCount = Number(process.env.SIM_AI_DECISION_COUNT ?? 2);
const aiDecisionIntervalMs = Number(process.env.SIM_AI_DECISION_INTERVAL_MS ?? 1500);
const aiDecisionMaxInFlight = Number(process.env.SIM_AI_DECISION_MAX_INFLIGHT ?? 2);
const aiDecisionBackoffBaseMs = Number(process.env.SIM_AI_DECISION_BACKOFF_MS ?? 15000);
const aiDecisionBackoffMaxMs = Number(
  process.env.SIM_AI_DECISION_BACKOFF_MAX_MS ?? 120000
);
let aiDecisionNextAt = 0;
let aiDecisionBackoffUntil = 0;
let aiDecisionBackoffMs = aiDecisionBackoffBaseMs;
const forceAiBubbleText = process.env.SIM_FORCE_AI_BUBBLE_TEXT === "true";
const aiBubbleOnlyAiAgents = process.env.SIM_AI_BUBBLE_ONLY_AI_AGENTS === "true";
const aiBubbleMinIntervalMs = Math.max(
  0,
  resolveNumber(process.env.SIM_AI_BUBBLE_MIN_INTERVAL_MS ?? undefined, 1200)
);
const aiBubbleGlobalMinIntervalMs = Math.max(
  0,
  resolveNumber(process.env.SIM_AI_BUBBLE_GLOBAL_MIN_INTERVAL_MS ?? undefined, 500)
);
const aiBubbleMaxInFlight = Math.max(
  1,
  resolveNumber(process.env.SIM_AI_BUBBLE_MAX_INFLIGHT ?? undefined, 2)
);
const aiBubbleSampleRate = clamp01(
  resolveNumber(process.env.SIM_AI_BUBBLE_SAMPLE_RATE ?? undefined, 0.35)
);
const aiBubbleBackoffBaseMs = Math.max(
  1000,
  resolveNumber(process.env.SIM_AI_BUBBLE_BACKOFF_MS ?? undefined, 10000)
);
const aiBubbleBackoffMaxMs = Math.max(
  aiBubbleBackoffBaseMs,
  resolveNumber(process.env.SIM_AI_BUBBLE_BACKOFF_MAX_MS ?? undefined, 120000)
);
const aiBubbleFallbackMinIntervalMs = Math.max(
  0,
  resolveNumber(process.env.SIM_AI_BUBBLE_FALLBACK_MIN_INTERVAL_MS ?? undefined, 900)
);
const aiBubbleInFlight = new Set<string>();
const aiBubbleSeqByAgent = new Map<string, number>();
const aiBubbleLastQueuedAt = new Map<string, number>();
const aiBubbleLastFallbackAt = new Map<string, number>();
let aiBubbleHasAiAgents = false;
let aiBubbleGlobalLastQueuedAt = 0;
let aiBubbleActiveRequests = 0;
let aiBubbleBackoffUntil = 0;
let aiBubbleBackoffMs = aiBubbleBackoffBaseMs;
let aiBubbleLastBackoffLogAt = 0;

const roadNeighbors = (pos: { x: number; y: number }) => {
  if (!world) return [];
  const { width, height, tiles } = world;
  const candidates = [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ].filter(
    (candidate) =>
      candidate.x >= 0 &&
      candidate.y >= 0 &&
      candidate.x < width &&
      candidate.y < height &&
      tiles[toIndex(candidate.x, candidate.y, width)].startsWith("ROAD")
  );
  return candidates;
};

const isShelterBuilding = (building: Building) =>
  building.type === "SHELTER" || building.type === "SCHOOL";

const hasShelterCapacity = (
  building: Building
): building is Building & { capacity: number; occupancy?: number } =>
  typeof building.capacity === "number";

const shelterOccupancyRatio = (building: Building) => {
  if (!hasShelterCapacity(building) || !building.capacity) return 0;
  return (building.occupancy ?? 0) / Math.max(1, building.capacity);
};

const resolveShelterStatus = (building: Building) => {
  if (building.status === "CLOSED") return "CLOSED";
  if (!hasShelterCapacity(building)) return "OPEN";
  return shelterOccupancyRatio(building) >= 0.9 ? "CROWDED" : "OPEN";
};

const broadcast = (msg: WsServerMsg) => {
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

const sendTo = (client: WebSocket, msg: WsServerMsg) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(msg));
  }
};

const addEvent = (event: TimelineEvent) => {
  if (!world || simEnded) return;
  const activeWorld = world;
  eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
  eventLog.unshift(event);
  if (eventLog.length > 200) eventLog.pop();
  logDebug("event", { type: event.type, id: event.id, tick: event.tick });
  broadcast({ type: "EVENT", event });
  void saveEvent(event).catch((error) => {
    logDebug("saveEvent failed", formatError(error));
  });
  if (event.actors?.length) {
    event.actors.forEach((actorId) => {
      const agent = activeWorld.agents[actorId];
      if (agent) {
        void recordEventMemory(agent, event);
      }
    });
  }
};

const computeMetricsFromWorld = (current: World): Metrics => {
  const agents = Object.values(current.agents);
  const total = agents.length;
  if (total === 0) {
    return {
      confusion: 0,
      rumorSpread: 0,
      officialReach: 0,
      vulnerableReach: 0,
      panicIndex: 0,
      trustIndex: 0,
      misinfoBelief: 0,
      resourceMisallocation: 0,
      stabilityScore: 0,
    };
  }
  const rumorCount = agents.filter((agent) => agent.alertStatus === "RUMOR").length;
  const officialCount = agents.filter((agent) => agent.alertStatus === "OFFICIAL")
    .length;
  const vulnerableAgents = agents.filter((agent) => isVulnerable(agent));
  const vulnerableReached = vulnerableAgents.filter((agent) =>
    ["EVACUATING", "SHELTERED", "HELPING"].includes(agent.evacStatus ?? "STAY")
  ).length;
  const avgStress = agents.reduce((sum, agent) => sum + agent.state.stress, 0) / total;
  const avgTrust =
    agents.reduce((sum, agent) => sum + agent.profile.trustLevel, 0) / total;
  const rumorRatio = rumorCount / total;
  const officialRatio = officialCount / total;
  const stressRatio = clamp01(avgStress / 100);
  const ambiguityFactor = clamp01(ambiguityLevel / 100);
  const misinfoFactor = clamp01(misinformationLevel / 100);
  const confusionBase = rumorRatio * 0.6 + (1 - officialRatio) * 0.2 + stressRatio * 0.2;
  const confusion = clamp(
    Math.round(confusionBase * (0.7 + ambiguityFactor * 0.3 + misinfoFactor * 0.2) * 100),
    0,
    100
  );
  const rumorSpread = Math.round(rumorRatio * 100);
  const officialReach = Math.round(officialRatio * 100);
  const vulnerableReach =
    vulnerableAgents.length === 0
      ? 0
      : Math.round((vulnerableReached / vulnerableAgents.length) * 100);
  const panicRatio =
    agents.filter((agent) => agent.state.mood === "panic").length / total;
  const panicIndex = clamp(
    Math.round(avgStress * 0.7 + panicRatio * 100 * 0.3),
    0,
    100
  );
  const trustIndex = clamp(
    Math.round(
      avgTrust *
        (0.6 + officialRatio * 0.4) *
        (1 - rumorRatio * 0.25) *
        (1 - ambiguityFactor * 0.15)
    ),
    0,
    100
  );
  const misinfoBelievers = agents.filter(
    (agent) => agent.alertStatus === "RUMOR" && agent.state.stress > 55
  ).length;
  const misinfoBelief = Math.round((misinfoBelievers / total) * 100);
  const nonVulnerableActive = agents.filter(
    (agent) =>
      !isVulnerable(agent) &&
      ["EVACUATING", "HELPING"].includes(agent.evacStatus ?? "STAY")
  ).length;
  const vulnerableWaiting = vulnerableAgents.filter(
    (agent) => (agent.evacStatus ?? "STAY") === "STAY"
  ).length;
  const misallocRatio =
    nonVulnerableActive / Math.max(1, nonVulnerableActive + vulnerableWaiting);
  const resourceMisallocation = Math.round(
    clamp01(misallocRatio * (0.5 + rumorRatio * 0.5)) * 100
  );
  const stabilityScore = clamp(
    Math.round(
      officialReach * 0.2 +
        vulnerableReach * 0.2 +
        (100 - confusion) * 0.15 +
        (100 - rumorSpread) * 0.1 +
        (100 - panicIndex) * 0.1 +
        trustIndex * 0.1 +
        (100 - misinfoBelief) * 0.05 +
        (100 - resourceMisallocation) * 0.1
    ),
    0,
    100
  );
  return {
    confusion,
    rumorSpread,
    officialReach,
    vulnerableReach,
    panicIndex,
    trustIndex,
    misinfoBelief,
    resourceMisallocation,
    stabilityScore,
  };
};

const updateMetricPeaks = (tick: number, current: Metrics) => {
  (Object.keys(current) as Array<keyof Metrics>).forEach((key) => {
    if (current[key] >= metricsPeaks[key].value) {
      metricsPeaks[key] = { value: current[key], tick };
    }
  });
};

const buildEndSummary = (
  reason: SimEndReason,
  tick: number,
  durationTicks: number,
  durationSeconds: number,
  current: Metrics
): SimEndSummary => {
  if (!world) {
    return {
      reason,
      tick,
      durationTicks,
      durationSeconds,
      simulatedMinutes: durationTicks * minutesPerTick,
      metrics: current,
      peaks: metricsPeaks,
      eventCounts,
      population: {
        total: 0,
        alertStatus: { NONE: 0, RUMOR: 0, OFFICIAL: 0 },
        evacStatus: { STAY: 0, EVACUATING: 0, SHELTERED: 0, HELPING: 0 },
      },
      disaster: currentConfig?.disaster ?? "EARTHQUAKE",
    };
  }
  const agents = Object.values(world.agents);
  const alertStatus = { NONE: 0, RUMOR: 0, OFFICIAL: 0 };
  const evacStatus = { STAY: 0, EVACUATING: 0, SHELTERED: 0, HELPING: 0 };
  agents.forEach((agent) => {
    const alert = agent.alertStatus ?? "NONE";
    alertStatus[alert] += 1;
    const evac = agent.evacStatus ?? "STAY";
    evacStatus[evac] += 1;
  });
  return {
    reason,
    tick,
    durationTicks,
    durationSeconds,
    simulatedMinutes: durationTicks * minutesPerTick,
    metrics: current,
    peaks: metricsPeaks,
    eventCounts,
    population: {
      total: agents.length,
      alertStatus,
      evacStatus,
    },
    disaster: currentConfig?.disaster ?? "EARTHQUAKE",
  };
};

const endSimulation = (reason: SimEndReason) => {
  if (!world || simEnded) return;
  simEnded = true;
  paused = true;
  if (interval) clearInterval(interval);
  const endedAt = Date.now();
  const durationTicks = world.tick - simStartTick;
  const durationSeconds = (endedAt - simStartedAt) / 1000;
  const vectorBootstrap = getVectorInsightsBootstrap();
  const summary = {
    ...buildEndSummary(reason, world.tick, durationTicks, durationSeconds, metrics),
    vectorInsights: vectorBootstrap,
  };
  broadcast({ type: "SIM_END", summary });
  logInfo("sim end", { reason, tick: world.tick });

  if (vectorBootstrap.status === "pending") {
    void generateVectorInsights({ simulationId: currentSimulationId })
      .then((vectorInsights) => {
        broadcast({ type: "SIM_END", summary: { ...summary, vectorInsights } });
      })
      .catch(() => undefined);
  }
};

const tick = () => {
  if (paused || !world || simEnded) return;
  world = { ...world, tick: world.tick + 1 };
  if (allowDebug && world.tick % 10 === 0) {
    logDebug("tick", world.tick);
  }

  const simMinute = getSimMinute(world.tick);

  const diffAgents: Record<string, Partial<Agent>> = {};
  const diffBuildings: Record<string, Partial<Building>> = {};
  const mergeAgentPatch = (agentId: string, patch: Partial<Agent>) => {
    if (!world) return;
    const existing = world.agents[agentId];
    if (!existing) return;
    world.agents[agentId] = { ...existing, ...patch };
    diffAgents[agentId] = { ...(diffAgents[agentId] ?? {}), ...patch };
  };
  const mergeBuildingPatch = (buildingId: string, patch: Partial<Building>) => {
    if (!world) return;
    const existing = world.buildings[buildingId];
    if (!existing) return;
    world.buildings[buildingId] = { ...existing, ...patch };
    diffBuildings[buildingId] = { ...(diffBuildings[buildingId] ?? {}), ...patch };
  };
  const ambiguityFactor = clamp01(ambiguityLevel / 100);
  const misinfoFactor = clamp01(misinformationLevel / 100);
  const factCheckFactor = clamp01(factCheckSpeed / 100);
  const updateAgentStress = (agent: Agent, delta: number) => {
    const nextStress = clamp(agent.state.stress + delta, 0, 100);
    let nextMood = agent.state.mood;
    if (nextStress >= 80) {
      nextMood = "panic";
    } else if (nextStress >= 60) {
      nextMood = "anxious";
    } else if (nextStress <= 30) {
      nextMood = "calm";
    }
    if (nextStress === agent.state.stress && nextMood === agent.state.mood) return;
    mergeAgentPatch(agent.id, {
      state: { ...agent.state, stress: nextStress, mood: nextMood },
    });
  };
  const rumorChance = (agent: Agent, distanceFactor: number) => {
    if (agent.alertStatus === "RUMOR") return 0;
    const susceptibility = agent.profile.rumorSusceptibility / 100;
    const trustPenalty = clamp01(1 - agent.profile.trustLevel / 140);
    const confusionFactor = clamp01(metrics.confusion / 100);
    const statusPenalty = agent.alertStatus === "OFFICIAL" ? 0.2 : 1;
    const amplification = 0.6 + ambiguityFactor * 0.4 + misinfoFactor * 0.4;
    return clamp01(
      0.4 *
        susceptibility *
        (0.4 + confusionFactor * 0.6) *
        trustPenalty *
        distanceFactor *
        statusPenalty *
        amplification
    );
  };
  const officialChance = (agent: Agent, distanceFactor: number) => {
    if (agent.alertStatus === "OFFICIAL") return 0;
    const trustFactor = 0.4 + (agent.profile.trustLevel / 100) * 0.6;
    const rumorPenalty = clamp01(1 - agent.profile.rumorSusceptibility / 180);
    const clarityBoost = 1 - ambiguityFactor * 0.3;
    const misinfoPenalty = 1 - misinfoFactor * 0.2;
    return clamp01(
      0.5 *
        trustFactor *
        rumorPenalty *
        distanceFactor *
        officialAccessibility(agent, multilingualCoverage) *
        clarityBoost *
        misinfoPenalty
    );
  };
  const spreadAlert = (
    source: Agent,
    kind: "RUMOR" | "OFFICIAL",
    message: string
  ) => {
    if (!world) return;
    const radius = kind === "RUMOR" ? 3 : 2;
    Object.values(world.agents).forEach((target) => {
      if (target.id === source.id) return;
      const distance = manhattan(target.pos, source.pos);
      if (distance > radius) return;
      const distanceFactor = clamp01(1 - distance / (radius + 1));
      const chance =
        kind === "RUMOR"
          ? rumorChance(target, distanceFactor)
          : officialChance(target, distanceFactor);
      if (Math.random() > chance) return;
      mergeAgentPatch(target.id, {
        alertStatus: kind,
        icon: kind === "RUMOR" ? "RUMOR" : "OFFICIAL",
      });
      queueAIBubbleLine({
        agentId: target.id,
        action: kind === "RUMOR" ? "RUMOR" : "OFFICIAL",
        seedMessage: message,
      });
      if (kind === "RUMOR") {
        const stressDelta = 4 + ambiguityFactor * 6 + misinfoFactor * 5;
        updateAgentStress(target, stressDelta);
        if (
          target.evacStatus === "STAY" &&
          target.profile.mobility !== "needs_assist" &&
          Math.random() <
            0.08 + misinfoFactor * 0.12 + clamp01(target.state.stress / 100) * 0.08
        ) {
          mergeAgentPatch(target.id, { evacStatus: "EVACUATING" });
        }
      }
      if (kind === "OFFICIAL") {
        const calmDelta = -2 - factCheckFactor * 3;
        updateAgentStress(target, calmDelta);
        if (
          target.evacStatus === "STAY" &&
          isVulnerable(target) &&
          Math.random() < 0.15 + clamp01(target.profile.trustLevel / 100) * 0.15
        ) {
          mergeAgentPatch(target.id, { evacStatus: "EVACUATING" });
        }
      }
    });
  };

  let shelterArrivalEvents = 0;
  const SHELTER_ARRIVAL_EVENT_LIMIT = 3;

  const getShelterTargets = () => {
    if (!world) return [] as Building[];
    return Object.values(world.buildings).filter((building) => {
      if (!isShelterBuilding(building)) return false;
      if (building.status === "CLOSED") return false;
      if (!hasShelterCapacity(building)) return true;
      return (building.occupancy ?? 0) < building.capacity;
    });
  };

  const findNearestShelter = (agent: Agent) => {
    const shelters = getShelterTargets();
    if (shelters.length === 0) return undefined;
    let nearest = shelters[0];
    let nearestDistance = manhattan(agent.pos, nearest.pos);
    for (let i = 1; i < shelters.length; i += 1) {
      const candidate = shelters[i];
      const distance = manhattan(agent.pos, candidate.pos);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    return nearest;
  };

  const hasNearbyHelper = (agent: Agent) => {
    if (!world) return false;
    return Object.values(world.agents).some((other) => {
      if (other.id === agent.id) return false;
      if ((other.evacStatus ?? "STAY") !== "HELPING") return false;
      return manhattan(agent.pos, other.pos) <= 2;
    });
  };

  const tryEnterShelter = (agent: Agent) => {
    if (!world) return false;
    if ((agent.evacStatus ?? "STAY") !== "EVACUATING") return false;
    const nearbyShelters = Object.values(world.buildings).filter((building) => {
      if (!isShelterBuilding(building)) return false;
      if (building.status === "CLOSED") return false;
      return manhattan(agent.pos, building.pos) <= 1;
    });
    if (nearbyShelters.length === 0) return false;
    const target = nearbyShelters.reduce((best, current) =>
      manhattan(agent.pos, current.pos) < manhattan(agent.pos, best.pos)
        ? current
        : best
    );
    if (
      hasShelterCapacity(target) &&
      target.capacity > 0 &&
      (target.occupancy ?? 0) >= target.capacity
    ) {
      mergeBuildingPatch(target.id, {
        status: "CROWDED",
      });
      queueAIBubbleLine({
        agentId: agent.id,
        action: "EVACUATE",
        seedMessage: "避難所が混雑しています。別ルートを探す。",
      });
      updateAgentStress(agent, 3 + ambiguityFactor * 2);
      return false;
    }

    if (hasShelterCapacity(target)) {
      const nextOccupancy = Math.min(
        target.capacity,
        Math.max(0, (target.occupancy ?? 0) + 1)
      );
      const nextStatus = resolveShelterStatus({
        ...target,
        occupancy: nextOccupancy,
      });
      mergeBuildingPatch(target.id, {
        occupancy: nextOccupancy,
        status: nextStatus,
      });
    } else {
      mergeBuildingPatch(target.id, {
        status: resolveShelterStatus(target),
      });
    }

    mergeAgentPatch(agent.id, {
      evacStatus: "SHELTERED",
      alertStatus: "OFFICIAL",
      icon: "OFFICIAL",
    });
    queueAIBubbleLine({
      agentId: agent.id,
      action: "CHECKIN",
      seedMessage: "避難所に到着。安否を共有します。",
    });
    updateAgentStress(agent, -8 - factCheckFactor * 3);

    if (shelterArrivalEvents < SHELTER_ARRIVAL_EVENT_LIMIT) {
      shelterArrivalEvents += 1;
      addEvent({
        id: randomId("shelter"),
        tick: world.tick,
        type: "CHECKIN",
        actors: [agent.id],
        at: target.pos,
        message: `${agent.name}が避難所に到着した。`,
      });
    }

    return true;
  };

  const syncShelterStatus = () => {
    if (!world) return;
    Object.values(world.buildings).forEach((building) => {
      if (!isShelterBuilding(building) || building.status === "CLOSED") return;
      const nextStatus = resolveShelterStatus(building);
      if (nextStatus !== building.status) {
        mergeBuildingPatch(building.id, { status: nextStatus });
      }
    });
  };

  const tickSnapshot = world.tick;
  Object.values(world.agents).forEach((agent) => {
    if (!agent.isAI) {
      const nextActivity = deriveDailyActivity(agent, simMinute);
      const shouldChange =
        !agent.activity || (nextActivity !== agent.activity && Math.random() < 0.18);
      if (shouldChange) {
        agent.activity = nextActivity;
        const nextGoal =
          agent.alertStatus === "NONE" && (agent.evacStatus ?? "STAY") === "STAY"
            ? ACTIVITY_GOALS[nextActivity] ?? agent.goal
            : agent.goal;
        mergeAgentPatch(agent.id, {
          activity: nextActivity,
          goal: nextGoal,
        });
        queueAIBubbleLine({
          agentId: agent.id,
          action: "WAIT",
          seedMessage: ACTIVITY_LABELS[nextActivity],
        });
        addEvent({
          id: randomId("activity"),
          tick: tickSnapshot,
          type: "ACTIVITY",
          actors: [agent.id],
          at: agent.pos,
          message: formatActivityMessage(nextActivity, agent.name),
        });
      }
    }

    const driftRoll = Math.random();
    if (driftRoll < 0.25) {
      const confusionFactor = clamp01(metrics.confusion / 100);
      const officialFactor = clamp01(metrics.officialReach / 100);
      const drift =
        (confusionFactor * (0.6 + ambiguityFactor * 0.3 + misinfoFactor * 0.2) -
          officialFactor * 0.4 -
          factCheckFactor * 0.2) *
        2;
      if (Math.abs(drift) > 0.05) {
        updateAgentStress(agent, drift);
      }
    }

    const mobilityHold =
      agent.profile.mobility === "needs_assist"
        ? 0.6
        : agent.profile.mobility === "limited"
          ? 0.4
          : 0.25;
    const baseMoveChance = 1 - mobilityHold;
    const isAiControlled = aiDecisionEnabled && Boolean(agent.isAI);
    const evacStatus = agent.evacStatus ?? "STAY";
    if (evacStatus === "EVACUATING" && tryEnterShelter(agent)) return;
    const needsEscort =
      evacStatus === "EVACUATING" && agent.profile.mobility === "needs_assist";
    const helperNearby = needsEscort ? hasNearbyHelper(agent) : false;
    if (needsEscort && !helperNearby) {
      updateAgentStress(agent, 0.8 + misinfoFactor * 1.1);
    }
    const ambientMoveChance = isAiControlled
      ? agent.profile.mobility === "needs_assist"
        ? 0.04
        : agent.profile.mobility === "limited"
          ? 0.08
          : 0.12
      : baseMoveChance;
    const activityFactor = activityMoveFactor(
      evacStatus === "EVACUATING" ? "EMERGENCY" : agent.activity
    );
    const escortFactor = !needsEscort ? 1 : helperNearby ? 0.7 : 0.15;
    if (Math.random() > clamp01(ambientMoveChance * activityFactor * escortFactor)) return;
    const neighbors = roadNeighbors(agent.pos);
    if (neighbors.length === 0) return;
    const shelterTarget =
      evacStatus === "EVACUATING" ? findNearestShelter(agent) : undefined;
    let next = neighbors[Math.floor(Math.random() * neighbors.length)];
    if (shelterTarget) {
      const bestDistance = Math.min(
        ...neighbors.map((neighbor) => manhattan(neighbor, shelterTarget.pos))
      );
      const bestNeighbors = neighbors.filter(
        (neighbor) => manhattan(neighbor, shelterTarget.pos) === bestDistance
      );
      const shouldFollowGuidance = Math.random() < 0.82 || bestNeighbors.length === 1;
      if (shouldFollowGuidance) {
        next = randomPick(bestNeighbors);
      }
    }
    if (next.x === agent.pos.x && next.y === agent.pos.y) return;
    const speak = !isAiControlled && Math.random() > 0.9;
    const prevPos = agent.pos;
    mergeAgentPatch(agent.id, {
      pos: { x: next.x, y: next.y },
      dir:
        next.x > prevPos.x
          ? "E"
          : next.x < prevPos.x
            ? "W"
            : next.y > prevPos.y
              ? "S"
              : "N",
    });
    if (speak) {
      queueAIBubbleLine({
        agentId: agent.id,
        action: "MOVE",
        seedMessage: "移動中",
      });
    }
    agent.pos = next;
    const movedAgent = world?.agents[agent.id];
    if (movedAgent && (movedAgent.evacStatus ?? "STAY") === "EVACUATING") {
      tryEnterShelter(movedAgent);
    }
  });

  runAIDecisions();

  if (Math.random() > 0.68) {
    const agents = Object.values(world.agents);
    if (agents.length === 0) return;
    let actor = agents[Math.floor(Math.random() * agents.length)];
    const roll = Math.random();
    const officialAllowed = world.tick >= officialDelayTicks;
    let type: TimelineEventType =
      roll > 0.88
        ? "RUMOR"
        : roll > 0.78
          ? "OFFICIAL"
          : roll > 0.68
            ? "ALERT"
            : roll > 0.56
              ? "EVACUATE"
              : roll > 0.48
                ? "SUPPORT"
                : roll > 0.4
                  ? "CHECKIN"
                  : roll > 0.3
                  ? "TALK"
                  : "MOVE";
    if (!officialAllowed && (type === "OFFICIAL" || type === "ALERT")) {
      type = "RUMOR";
    }
    if (Math.random() < misinfoFactor * 0.35 + ambiguityFactor * 0.2) {
      type = "RUMOR";
    }
    if (aiDecisionEnabled && type === "TALK") {
      // Prefer AI-decided TALK actions over scripted random chatter.
      type = "MOVE";
    }
    if (type === "TALK") {
      const aiActors = agents.filter((candidate) => candidate.isAI);
      if (aiActors.length > 0 && (!actor.isAI || Math.random() < 0.7)) {
        actor = randomPick(aiActors);
      }
    }
    const talkTarget =
      type === "TALK"
        ? pickTalkTarget({
            speaker: actor,
            preferAiPartner: Boolean(actor.isAI),
          })
        : null;
    const baseMessage =
      type === "RUMOR" && Math.random() < misinfoFactor * 0.55
        ? randomPick(MISINFO_EVENT_MESSAGES)
        : pickEventMessage(type);
    const talkExchange =
      type === "TALK"
        ? buildTalkExchange({
            speaker: actor,
            target: talkTarget,
            seedMessage: baseMessage,
          })
        : undefined;
    const talkLineSeed =
      type === "TALK"
        ? normalizeBubbleLine(talkExchange?.speakerLine ?? baseMessage)
        : undefined;
    const event: TimelineEvent = {
      id: randomId("ev"),
      tick: world.tick,
      type,
      actors: talkTarget ? [actor.id, talkTarget.id] : [actor.id],
      at: actor.pos,
      message:
        type === "TALK"
          ? talkExchange?.timelineMessage ??
            formatTalkTimelineMessage({
              speakerName: actor.name,
              speakerLine: talkLineSeed ?? baseMessage,
            })
          : baseMessage,
    };
    addEvent(event);

    if (type === "RUMOR") {
      actor.alertStatus = "RUMOR";
      mergeAgentPatch(actor.id, {
        alertStatus: "RUMOR",
        icon: "RUMOR",
      });
      queueAIBubbleLine({
        agentId: actor.id,
        action: "RUMOR",
        seedMessage: event.message,
      });
      spreadAlert(actor, "RUMOR", event.message ?? "噂が広がっている…");
    }
    if (type === "OFFICIAL" || type === "ALERT") {
      actor.alertStatus = "OFFICIAL";
      mergeAgentPatch(actor.id, {
        alertStatus: "OFFICIAL",
        icon: "OFFICIAL",
      });
      queueAIBubbleLine({
        agentId: actor.id,
        action: "OFFICIAL",
        seedMessage: event.message,
      });
      spreadAlert(actor, "OFFICIAL", event.message ?? "公式警報が届いた");
    }
    if (type === "EVACUATE") {
      actor.evacStatus = "EVACUATING";
      mergeAgentPatch(actor.id, {
        evacStatus: "EVACUATING",
      });
      queueAIBubbleLine({
        agentId: actor.id,
        action: "EVACUATE",
        seedMessage: event.message,
      });
    }
    if (type === "SUPPORT") {
      actor.evacStatus = "HELPING";
      mergeAgentPatch(actor.id, {
        evacStatus: "HELPING",
        icon: "HELP",
      });
      queueAIBubbleLine({
        agentId: actor.id,
        action: "SUPPORT",
        seedMessage: event.message,
      });
    }
    if (type === "CHECKIN") {
      queueAIBubbleLine({
        agentId: actor.id,
        action: "CHECKIN",
        seedMessage: event.message,
      });
    }
    if (type === "TALK") {
      queueAIBubbleLine({
        agentId: actor.id,
        action: "TALK",
        seedMessage: talkExchange?.speakerLine ?? talkLineSeed ?? event.message,
        force: true,
      });
      if (talkTarget) {
        queueAIBubbleLine({
          agentId: talkTarget.id,
          action: "TALK",
          seedMessage: talkExchange?.targetLine ?? talkLineSeed ?? event.message,
          force: true,
        });
      }
    }
  }

  const runAutoFactCheck = () => {
    if (!world) return;
    if (world.tick < officialDelayTicks) return;
    const rumorAgents = Object.values(world.agents).filter(
      (agent) => agent.alertStatus === "RUMOR"
    );
    if (rumorAgents.length === 0) return;
    const rumorFactor = clamp01(metrics.rumorSpread / 100);
    const intensity = clamp01(
      rumorFactor * (0.5 + factCheckFactor * 0.4 + (1 - ambiguityFactor) * 0.1)
    );
    if (Math.random() > intensity * 0.25) return;
    const sampleCount = Math.max(
      1,
      Math.round(rumorAgents.length * (0.05 + intensity * 0.12))
    );
    const pool = [...rumorAgents];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const swap = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[swap]] = [pool[swap], pool[i]];
    }
    const selected = pool.slice(0, sampleCount);
    selected.forEach((agent) => {
      mergeAgentPatch(agent.id, {
        alertStatus: "OFFICIAL",
        icon: "OFFICIAL",
      });
      queueAIBubbleLine({
        agentId: agent.id,
        action: "OFFICIAL",
        seedMessage: "公式: 誤情報を訂正しました。",
      });
      updateAgentStress(agent, -6 - factCheckFactor * 4);
    });
    addEvent({
      id: randomId("fact"),
      tick: world.tick,
      type: "OFFICIAL",
      actors: selected.slice(0, 2).map((agent) => agent.id),
      message: "公式: 誤情報を訂正しました。",
    });
  };

  runAutoFactCheck();
  syncShelterStatus();

  if (Object.keys(diffAgents).length > 0 || Object.keys(diffBuildings).length > 0) {
    broadcast({
      type: "WORLD_DIFF",
      tick: world.tick,
      agents: Object.keys(diffAgents).length > 0 ? diffAgents : undefined,
      buildings:
        Object.keys(diffBuildings).length > 0 ? diffBuildings : undefined,
    });
  }

  metrics = computeMetricsFromWorld(world);
  updateMetricPeaks(world.tick, metrics);
  broadcast({ type: "METRICS", metrics, tick: world.tick });
  void saveMetrics(metrics, world.tick).catch((error) => {
    logDebug("saveMetrics failed", formatError(error));
  });

  const isStable =
    metrics.confusion <= SIM_END_STABLE_THRESHOLD.confusionMax &&
    metrics.rumorSpread <= SIM_END_STABLE_THRESHOLD.rumorMax &&
    metrics.officialReach >= SIM_END_STABLE_THRESHOLD.officialMin &&
    metrics.vulnerableReach >= SIM_END_STABLE_THRESHOLD.vulnerableMin &&
    metrics.panicIndex <= SIM_END_STABLE_THRESHOLD.panicMax &&
    metrics.trustIndex >= SIM_END_STABLE_THRESHOLD.trustMin &&
    metrics.misinfoBelief <= SIM_END_STABLE_THRESHOLD.misinfoMax &&
    metrics.resourceMisallocation <= SIM_END_STABLE_THRESHOLD.misallocationMax &&
    metrics.stabilityScore >= SIM_END_STABLE_THRESHOLD.stabilityMin;
  stableTicks = isStable ? stableTicks + 1 : 0;

  const isEscalated =
    metrics.confusion >= SIM_END_ESCALATE_THRESHOLD.confusionMin &&
    metrics.rumorSpread >= SIM_END_ESCALATE_THRESHOLD.rumorMin &&
    metrics.panicIndex >= SIM_END_ESCALATE_THRESHOLD.panicMin &&
    metrics.misinfoBelief >= SIM_END_ESCALATE_THRESHOLD.misinfoMin &&
    metrics.resourceMisallocation >= SIM_END_ESCALATE_THRESHOLD.misallocationMin;
  escalatedTicks = isEscalated ? escalatedTicks + 1 : 0;

  if (stableTicks >= SIM_END_STABLE_WINDOW) {
    endSimulation("STABILIZED");
    return;
  }
  if (escalatedTicks >= SIM_END_ESCALATE_WINDOW) {
    endSimulation("ESCALATED");
    return;
  }
  if (world.tick >= SIM_END_MAX_TICKS) {
    endSimulation("TIME_LIMIT");
  }
};

const startLoop = () => {
  if (!world || simEnded) return;
  if (interval) clearInterval(interval);
  interval = setInterval(tick, 1000 / speed);
};

const getRecentEvents = (agentId: string) => {
  return eventLog
    .filter((event) => event.actors?.includes(agentId))
    .slice(0, 3)
    .map((event) => event.message ?? event.type);
};

type NearbyChatter = {
  type: TimelineEventType;
  speaker: string;
  message: string;
  distance: number;
};

type NearbyAgent = {
  id: string;
  name: string;
  activity?: AgentActivity;
  role: Agent["profile"]["role"];
  distance: number;
};

const getNearbyChatter = (agent: Agent): NearbyChatter[] => {
  if (!world) return [];
  const maxDistance = 4;
  const limit = 4;
  const allowedTypes: TimelineEventType[] = [
    "TALK",
    "RUMOR",
    "OFFICIAL",
    "ALERT",
    "CHECKIN",
    "SUPPORT",
    "ACTIVITY",
  ];
  const chatter: NearbyChatter[] = [];
  for (const event of eventLog) {
    if (!event.at || !event.actors?.length) continue;
    if (!allowedTypes.includes(event.type)) continue;
    const speakerId = event.actors[0];
    if (speakerId === agent.id) continue;
    const distance = manhattan(agent.pos, event.at);
    if (distance > maxDistance) continue;
    const speaker = world.agents[speakerId]?.name ?? "unknown";
    chatter.push({
      type: event.type,
      speaker,
      message: event.message ?? event.type,
      distance,
    });
    if (chatter.length >= limit) break;
  }
  return chatter;
};

const getNearbyAgents = (agent: Agent): NearbyAgent[] => {
  if (!world) return [];
  const maxDistance = 4;
  const limit = 4;
  const neighbors: NearbyAgent[] = [];
  for (const target of Object.values(world.agents)) {
    if (target.id === agent.id) continue;
    const distance = manhattan(agent.pos, target.pos);
    if (distance > maxDistance) continue;
    neighbors.push({
      id: target.id,
      name: target.name,
      activity: target.activity,
      role: target.profile.role,
      distance,
    });
    if (neighbors.length >= limit) break;
  }
  return neighbors;
};

const getNearbyAgentEntities = (agent: Agent): Agent[] => {
  if (!world) return [];
  return getNearbyAgents(agent)
    .map((nearby) => world?.agents[nearby.id])
    .filter((value): value is Agent => Boolean(value));
};

const pickTalkTarget = (input: {
  speaker: Agent;
  preferredId?: string;
  preferAiPartner?: boolean;
}) =>
  pickTalkTargetAgent({
    speaker: input.speaker,
    nearbyAgents: getNearbyAgentEntities(input.speaker),
    preferredId: input.preferredId,
    preferAiPartner: input.preferAiPartner,
  });

const applyAgentPatch = (agentId: string, patch: Partial<Agent>) => {
  if (!world || simEnded) return;
  const agent = world.agents[agentId];
  if (!agent) return;
  world.agents[agentId] = { ...agent, ...patch };
  broadcast({ type: "WORLD_DIFF", tick: world.tick, agents: { [agentId]: patch } });
};

const normalizeBubbleLine = (value?: string, max = 96) => {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").replace(/^「|」$/g, "").trim();
  if (!compact) return undefined;
  if (/^```(?:json)?/i.test(compact)) return undefined;
  if (compact.startsWith("{") || compact.startsWith("[")) return undefined;
  if (/^[{\[]/.test(compact) && /"\w+"\s*:/.test(compact)) return undefined;
  if (/^\s*\{[\s\S]*"\w+"\s*:\s*[^}]*$/m.test(compact)) return undefined;
  const stripped = compact.replace(/[「」"'`]/g, "").trim();
  if (!stripped) return undefined;
  if (/^[.…・,，、。!?！？\-ー~〜]+$/.test(stripped)) return undefined;
  if (/^(?:\.{2,}|…{1,}|optional|n\/a|null|none)$/i.test(stripped)) return undefined;
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
};

const parseStatusFromMessage = (message: string) => {
  let code: number | undefined;
  let status: string | undefined;
  const jsonMatch = message.match(/\{[\s\S]*\}$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        error?: { code?: unknown; status?: unknown };
      };
      if (typeof parsed.error?.code === "number") {
        code = parsed.error.code;
      }
      if (typeof parsed.error?.status === "string") {
        status = parsed.error.status;
      }
    } catch {
      // ignore malformed message payload
    }
  }
  if (code === undefined && /\b429\b/.test(message)) {
    code = 429;
  }
  if (!status && message.includes("RESOURCE_EXHAUSTED")) {
    status = "RESOURCE_EXHAUSTED";
  }
  return { code, status };
};

const extractStatusLike = (
  value: unknown
): { code?: number; status?: string; message?: string } => {
  if (!value || typeof value !== "object") {
    return {};
  }
  const obj = value as Record<string, unknown>;
  const rawMessage = typeof obj.message === "string" ? obj.message : undefined;
  const parsedFromMessage: { code?: number; status?: string } = rawMessage
    ? parseStatusFromMessage(rawMessage)
    : {};
  const code =
    typeof obj.code === "number" ? obj.code : parsedFromMessage.code;
  const status =
    typeof obj.status === "string" ? obj.status : parsedFromMessage.status;
  return { code, status, message: rawMessage };
};

const extractVertexErrorStatus = (error: unknown) => {
  const direct = extractStatusLike(error);
  const cause = extractStatusLike((error as { cause?: unknown } | undefined)?.cause);
  const stackTrace = extractStatusLike(
    (error as { stackTrace?: unknown } | undefined)?.stackTrace
  );
  const code = direct.code ?? cause.code ?? stackTrace.code;
  const status = direct.status ?? cause.status ?? stackTrace.status;
  const message =
    direct.message ??
    cause.message ??
    stackTrace.message ??
    (error instanceof Error ? error.message : String(error));
  return { code, status, message };
};

const isResourceExhausted = (status: { code?: number; status?: string }) =>
  status.code === 429 || status.status === "RESOURCE_EXHAUSTED";

const activateAiBubbleBackoff = () => {
  const until = Date.now() + aiBubbleBackoffMs;
  aiBubbleBackoffUntil = Math.max(aiBubbleBackoffUntil, until);
  aiBubbleBackoffMs = Math.min(aiBubbleBackoffMs * 2, aiBubbleBackoffMaxMs);
  if (Date.now() - aiBubbleLastBackoffLogAt >= 5000) {
    aiBubbleLastBackoffLogAt = Date.now();
    logInfo("ai bubble backoff", {
      until: new Date(aiBubbleBackoffUntil).toISOString(),
      nextMs: aiBubbleBackoffMs,
      maxInFlight: aiBubbleMaxInFlight,
      sampleRate: aiBubbleSampleRate,
    });
  }
};

const bubbleKindFromAction = (action: AgentDecision["action"]) => {
  switch (action) {
    case "MOVE":
      return "MOVE";
    case "TALK":
      return "TALK";
    case "RUMOR":
      return "RUMOR";
    case "OFFICIAL":
      return "OFFICIAL";
    case "EVACUATE":
      return "EVACUATE";
    case "SUPPORT":
      return "SUPPORT";
    case "CHECKIN":
      return "CHECKIN";
    default:
      return "AMBIENT";
  }
};

const buildRuleBubbleLine = (input: {
  agent: Agent;
  action: AgentDecision["action"];
  seedMessage?: string;
  thought?: string;
  tick?: number;
}) => {
  const disaster = currentConfig?.disaster ?? "EARTHQUAKE";
  const line = buildAgentBubble(input.agent, {
    tick: input.tick ?? world?.tick ?? 0,
    kind: bubbleKindFromAction(input.action),
    message: input.seedMessage,
    thought: input.thought,
    disaster,
    metrics,
    nearbyChatter: getNearbyChatter(input.agent),
    simConfig: currentConfig
      ? {
          emotionTone: currentConfig.emotionTone,
          ageProfile: currentConfig.ageProfile,
        }
      : undefined,
  });
  return normalizeBubbleLine(line, 120);
};

const applyAIBubbleFallback = (
  agent: Agent,
  input: { action: AgentDecision["action"]; seedMessage?: string; thought?: string }
) => {
  const now = Date.now();
  const last = aiBubbleLastFallbackAt.get(agent.id) ?? 0;
  if (now - last < aiBubbleFallbackMinIntervalMs) return;
  const fallback =
    buildRuleBubbleLine({
      agent,
      action: input.action,
      seedMessage: input.seedMessage,
      thought: input.thought,
    }) ??
    normalizeBubbleLine(input.seedMessage, 100) ??
    normalizeBubbleLine(input.thought, 120) ??
    normalizeBubbleLine(agent.goal, 96) ??
    normalizeBubbleLine(agent.plan, 96) ??
    normalizeBubbleLine(agent.reflection, 96);
  if (!fallback || fallback === agent.bubble) return;
  aiBubbleLastFallbackAt.set(agent.id, now);
  applyAgentPatch(agent.id, { bubble: fallback });
};

const queueAIBubbleLine = (input: {
  agentId: string;
  action: AgentDecision["action"];
  seedMessage?: string;
  thought?: string;
  force?: boolean;
}) => {
  if (!world || simEnded) return;
  const agent = world.agents[input.agentId];
  if (!agent) return;
  if (aiBubbleOnlyAiAgents && aiBubbleHasAiAgents && !agent.isAI) return;

  applyAIBubbleFallback(agent, input);
  if (!forceAiBubbleText) return;

  const now = Date.now();
  if (now < aiBubbleBackoffUntil) return;
  if (!input.force && Math.random() > aiBubbleSampleRate) return;
  const lastQueuedAt = aiBubbleLastQueuedAt.get(input.agentId) ?? 0;
  if (!input.force && now - lastQueuedAt < aiBubbleMinIntervalMs) return;
  if (aiBubbleInFlight.has(input.agentId)) return;
  if (aiBubbleActiveRequests >= aiBubbleMaxInFlight) return;
  const globalGap = input.force
    ? Math.min(200, aiBubbleGlobalMinIntervalMs)
    : aiBubbleGlobalMinIntervalMs;
  if (now - aiBubbleGlobalLastQueuedAt < globalGap) return;

  const seq = (aiBubbleSeqByAgent.get(input.agentId) ?? 0) + 1;
  aiBubbleSeqByAgent.set(input.agentId, seq);
  aiBubbleLastQueuedAt.set(input.agentId, now);
  aiBubbleGlobalLastQueuedAt = now;
  aiBubbleInFlight.add(input.agentId);
  aiBubbleActiveRequests += 1;

  const tickSnapshot = world.tick;
  const recentEvents = eventLog.slice(0, 5);
  const nearbyChatter = getNearbyChatter(agent);
  const thought = normalizeBubbleLine(input.thought, 120);
  const seedMessage = normalizeBubbleLine(input.seedMessage, 100);

  void (async () => {
    try {
      const memories = await getRelevantMemories({
        agent,
        recentEvents,
        limit: 4,
      });
      const aiLine = await generateAgentBubbleLine({
        agent,
        action: input.action,
        seedMessage,
        thought,
        tick: tickSnapshot,
        metrics,
        disaster: currentConfig?.disaster ?? "EARTHQUAKE",
        recentEvents,
        nearbyChatter,
        memories,
        simConfig: currentConfig
          ? {
              emotionTone: currentConfig.emotionTone,
              ageProfile: currentConfig.ageProfile,
            }
          : undefined,
      });
      const normalized = normalizeBubbleLine(aiLine);
      if (!normalized) return;
      if (!world || simEnded) return;
      if ((aiBubbleSeqByAgent.get(input.agentId) ?? 0) !== seq) return;
      applyAgentPatch(input.agentId, { bubble: normalized });
      aiBubbleBackoffMs = aiBubbleBackoffBaseMs;
    } catch (err) {
      const status = extractVertexErrorStatus(err);
      const exhausted = isResourceExhausted(status);
      if (exhausted) {
        activateAiBubbleBackoff();
        applyAIBubbleFallback(agent, input);
      } else {
        logDebug("ai bubble generation error", {
          agent: input.agentId,
          action: input.action,
          code: status.code,
          status: status.status,
          message: status.message,
        });
      }
    } finally {
      aiBubbleInFlight.delete(input.agentId);
      aiBubbleActiveRequests = Math.max(0, aiBubbleActiveRequests - 1);
    }
  })();
};

const applyDecision = async (
  agent: Agent,
  decision: AgentDecision,
  moveOptions: Array<{ x: number; y: number }>
) => {
  if (!world || simEnded) return;
  const decisionTick = world.tick;
  const message = decision.message?.slice(0, 60);
  let bubbleLine = normalizeBubbleLine(decision.bubbleLine);
  const thoughtSeed = [decision.reflection, decision.plan]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const thought = thoughtSeed ? thoughtSeed.slice(0, 120) : undefined;
  const action =
    decision.action === "OFFICIAL" && world && world.tick < officialDelayTicks
      ? "RUMOR"
      : decision.action;
  const ruleBubbleLine = buildRuleBubbleLine({
    agent,
    action,
    seedMessage: message,
    thought,
    tick: decisionTick,
  });
  if (!bubbleLine) {
    bubbleLine = ruleBubbleLine;
  }
  if (!bubbleLine && forceAiBubbleText) {
    if (Date.now() >= aiBubbleBackoffUntil) {
      try {
        const aiBubbleLine = await generateAgentBubbleLine({
          agent,
          action,
          seedMessage: message,
          thought,
          tick: decisionTick,
          metrics,
          disaster: currentConfig?.disaster ?? "EARTHQUAKE",
          recentEvents: eventLog.slice(0, 5),
          nearbyChatter: getNearbyChatter(agent),
          simConfig: currentConfig
            ? {
                emotionTone: currentConfig.emotionTone,
                ageProfile: currentConfig.ageProfile,
              }
            : undefined,
        });
        const normalized = normalizeBubbleLine(aiBubbleLine);
        if (normalized) {
          bubbleLine = normalized;
        }
        aiBubbleBackoffMs = aiBubbleBackoffBaseMs;
      } catch (err) {
        const status = extractVertexErrorStatus(err);
        if (isResourceExhausted(status)) {
          activateAiBubbleBackoff();
        } else {
          logDebug("ai bubble line error", {
            agent: agent.id,
            action,
            code: status.code,
            status: status.status,
            message: status.message,
          });
        }
      }
    }
    if (!world || simEnded) return;
  }
  const bubbleMessage = bubbleLine ?? ruleBubbleLine ?? normalizeBubbleLine(message);
  const agentEvacuating = (agent.evacStatus ?? "STAY") === "EVACUATING";
  const simMinute = getSimMinute(world.tick);
  const fallbackActivity = deriveDailyActivity(agent, simMinute);
  const resolvedActivity = normalizeActivity(decision.activity);
  const nextActivity =
    resolvedActivity ??
    (action === "TALK" || action === "CHECKIN" ? "SOCIALIZING" : undefined) ??
    agent.activity ??
    fallbackActivity;

  const decisionPatch: Partial<Agent> = {};
  if (decision.reflection) decisionPatch.reflection = decision.reflection;
  if (decision.plan) decisionPatch.plan = decision.plan;
  if (decision.goal) {
    decisionPatch.goal = decision.goal;
  } else if (
    nextActivity &&
    agent.alertStatus === "NONE" &&
    (agent.evacStatus ?? "STAY") === "STAY"
  ) {
    decisionPatch.goal = ACTIVITY_GOALS[nextActivity] ?? agent.goal;
  }
  if (nextActivity && nextActivity !== agent.activity) {
    decisionPatch.activity = nextActivity;
  }
  const agentSnapshot = { ...agent, ...decisionPatch };

  const applyWithDecision = (patch: Partial<Agent>) => {
    applyAgentPatch(agent.id, { ...decisionPatch, ...patch });
  };

  if (action === "MOVE" || action === "EVACUATE") {
    const target =
      typeof decision.targetIndex === "number"
        ? moveOptions[decision.targetIndex]
        : moveOptions[0];
    if (target) {
      const dir =
        target.x > agent.pos.x
          ? "E"
          : target.x < agent.pos.x
            ? "W"
            : target.y > agent.pos.y
              ? "S"
              : "N";
      const moveThought =
        action === "EVACUATE" || (action === "MOVE" && agentEvacuating)
          ? thought
          : undefined;
      const fallbackBubble = bubbleMessage ?? moveThought;
      applyWithDecision({
        pos: { x: target.x, y: target.y },
        dir,
        ...(action === "EVACUATE" ? { evacStatus: "EVACUATING" } : {}),
        bubble: fallbackBubble ?? agent.bubble,
      });
      addEvent({
        id: randomId("ev"),
        tick: world.tick,
        type: action === "EVACUATE" ? "EVACUATE" : "MOVE",
        actors: [agent.id],
        at: { x: target.x, y: target.y },
        message:
          message ??
          pickEventMessage(action === "EVACUATE" ? "EVACUATE" : "MOVE"),
      });
    }
  }

  if (action === "RUMOR") {
    applyWithDecision({
      alertStatus: "RUMOR",
      bubble: bubbleMessage ?? agent.bubble,
      icon: "RUMOR",
    });
    addEvent({
      id: randomId("ev"),
      tick: world.tick,
      type: "RUMOR",
      actors: [agent.id],
      at: agent.pos,
      message: message ?? pickEventMessage("RUMOR"),
    });
    if (decision.reflection) {
      void recordAgentMemory({
        agent,
        content: `内省: ${decision.reflection}`,
        sourceType: "reflection",
        metadata: { tick: world.tick, action },
      });
    }
    if (decision.plan) {
      void recordAgentMemory({
        agent,
        content: `計画: ${decision.plan}`,
        sourceType: "plan",
        metadata: { tick: world.tick, action },
      });
    }
    return;
  }

  if (action === "OFFICIAL") {
    applyWithDecision({
      alertStatus: "OFFICIAL",
      bubble: bubbleMessage ?? agent.bubble,
      icon: "OFFICIAL",
    });
    addEvent({
      id: randomId("ev"),
      tick: world.tick,
      type: "OFFICIAL",
      actors: [agent.id],
      at: agent.pos,
      message: message ?? pickEventMessage("OFFICIAL"),
    });
    if (decision.reflection) {
      void recordAgentMemory({
        agent,
        content: `内省: ${decision.reflection}`,
        sourceType: "reflection",
        metadata: { tick: world.tick, action },
      });
    }
    if (decision.plan) {
      void recordAgentMemory({
        agent,
        content: `計画: ${decision.plan}`,
        sourceType: "plan",
        metadata: { tick: world.tick, action },
      });
    }
    return;
  }

  if (action === "SUPPORT") {
    applyWithDecision({
      evacStatus: "HELPING",
      bubble: bubbleMessage ?? agent.bubble,
      icon: "HELP",
    });
    addEvent({
      id: randomId("ev"),
      tick: world.tick,
      type: "SUPPORT",
      actors: [agent.id],
      at: agent.pos,
      message: message ?? pickEventMessage("SUPPORT"),
    });
    if (decision.reflection) {
      void recordAgentMemory({
        agent,
        content: `内省: ${decision.reflection}`,
        sourceType: "reflection",
        metadata: { tick: world.tick, action },
      });
    }
    if (decision.plan) {
      void recordAgentMemory({
        agent,
        content: `計画: ${decision.plan}`,
        sourceType: "plan",
        metadata: { tick: world.tick, action },
      });
    }
    return;
  }

  if (action === "CHECKIN") {
    applyWithDecision({
      bubble: bubbleMessage ?? agent.bubble,
    });
    addEvent({
      id: randomId("ev"),
      tick: world.tick,
      type: "CHECKIN",
      actors: [agent.id],
      at: agent.pos,
      message: message ?? pickEventMessage("CHECKIN"),
    });
    if (decision.reflection) {
      void recordAgentMemory({
        agent,
        content: `内省: ${decision.reflection}`,
        sourceType: "reflection",
        metadata: { tick: world.tick, action },
      });
    }
    if (decision.plan) {
      void recordAgentMemory({
        agent,
        content: `計画: ${decision.plan}`,
        sourceType: "plan",
        metadata: { tick: world.tick, action },
      });
    }
    return;
  }

  if (action === "TALK") {
    const target = pickTalkTarget({
      speaker: agent,
      preferredId: decision.targetAgentId,
      preferAiPartner: Boolean(agent.isAI),
    });
    const talkExchange = buildTalkExchange({
      speaker: agentSnapshot,
      target,
      seedMessage: message ?? bubbleMessage ?? thought,
    });
    const baseSpeakerSeed =
      bubbleLine ??
      normalizeBubbleLine(talkExchange.speakerLine) ??
      normalizeBubbleLine(message);
    let speakerLine = normalizeBubbleLine(baseSpeakerSeed);
    let targetLine: string | undefined = normalizeBubbleLine(talkExchange.targetLine);

    if (!speakerLine && forceAiBubbleText) {
      if (Date.now() >= aiBubbleBackoffUntil) {
        try {
          const aiSpeakerLine = await generateAgentTalkSpeakerLine({
            speaker: agentSnapshot,
            target,
            seedLine: baseSpeakerSeed,
            tick: decisionTick,
            metrics,
            disaster: currentConfig?.disaster ?? "EARTHQUAKE",
            recentEvents: eventLog.slice(0, 5),
            nearbyChatter: getNearbyChatter(agent),
            simConfig: currentConfig
              ? {
                  emotionTone: currentConfig.emotionTone,
                  ageProfile: currentConfig.ageProfile,
                }
              : undefined,
          });
          const normalizedSpeaker = normalizeBubbleLine(aiSpeakerLine);
          if (normalizedSpeaker) {
            speakerLine = normalizedSpeaker;
          }
          aiBubbleBackoffMs = aiBubbleBackoffBaseMs;
        } catch (err) {
          const status = extractVertexErrorStatus(err);
          if (isResourceExhausted(status)) {
            activateAiBubbleBackoff();
          } else {
            logDebug("ai talk speaker error", {
              speaker: agent.id,
              code: status.code,
              status: status.status,
              message: status.message,
            });
          }
        }
      }
      if (!world || simEnded) return;
    }

    if (
      target &&
      !targetLine &&
      forceAiBubbleText &&
      aiDecisionEnabled &&
      speakerLine &&
      Date.now() >= aiBubbleBackoffUntil
    ) {
      try {
        const targetMemories = await getRelevantMemories({
          agent: target,
          recentEvents: eventLog.slice(0, 5),
          limit: 4,
        });
        const aiReply = await generateAgentTalkReply({
          speaker: agentSnapshot,
          target,
          speakerLine,
          tick: decisionTick,
          metrics,
          disaster: currentConfig?.disaster ?? "EARTHQUAKE",
          recentEvents: eventLog.slice(0, 5),
          nearbyChatter: getNearbyChatter(target),
          memories: targetMemories,
          simConfig: currentConfig
            ? {
                emotionTone: currentConfig.emotionTone,
                ageProfile: currentConfig.ageProfile,
              }
            : undefined,
        });
        const normalizedReply = normalizeBubbleLine(aiReply);
        if (normalizedReply) {
          targetLine = normalizedReply;
        }
        aiBubbleBackoffMs = aiBubbleBackoffBaseMs;
      } catch (err) {
        const status = extractVertexErrorStatus(err);
        if (isResourceExhausted(status)) {
          activateAiBubbleBackoff();
        } else {
          logDebug("ai talk reply error", {
            speaker: agent.id,
            target: target.id,
            code: status.code,
            status: status.status,
            message: status.message,
          });
        }
      }
      if (!world || simEnded) return;
    }

    const resolvedSpeakerLine =
      speakerLine ??
      normalizeBubbleLine(talkExchange.speakerLine) ??
      normalizeBubbleLine(message) ??
      normalizeBubbleLine(agent.bubble);
    if (!resolvedSpeakerLine) return;
    applyWithDecision({ bubble: resolvedSpeakerLine });
    if (target && targetLine) {
      applyAgentPatch(target.id, { bubble: targetLine });
    } else if (target) {
      queueAIBubbleLine({
        agentId: target.id,
        action: "TALK",
        seedMessage: resolvedSpeakerLine,
        force: true,
      });
    }
    addEvent({
      id: randomId("ev"),
      tick: decisionTick,
      type: "TALK",
      actors: target ? [agent.id, target.id] : [agent.id],
      at: agent.pos,
      message: formatTalkTimelineMessage({
        speakerName: agent.name,
        speakerLine: resolvedSpeakerLine,
        targetName: target?.name,
        targetLine,
      }),
    });
    if (decision.reflection) {
      void recordAgentMemory({
        agent,
        content: `内省: ${decision.reflection}`,
        sourceType: "reflection",
        metadata: { tick: decisionTick, action },
      });
    }
    if (decision.plan) {
      void recordAgentMemory({
        agent,
        content: `計画: ${decision.plan}`,
        sourceType: "plan",
        metadata: { tick: decisionTick, action },
      });
    }
    return;
  }

  if (action === "WAIT") {
    const waitThought = agentEvacuating ? thought : undefined;
    const waitLine = bubbleMessage ?? waitThought;
    applyWithDecision({
      bubble: waitLine ?? agent.bubble,
    });
  }

  if (decision.reflection) {
    void recordAgentMemory({
      agent,
      content: `内省: ${decision.reflection}`,
      sourceType: "reflection",
      metadata: { tick: world.tick, action },
    });
  }
  if (decision.plan) {
    void recordAgentMemory({
      agent,
      content: `計画: ${decision.plan}`,
      sourceType: "plan",
      metadata: { tick: world.tick, action },
    });
  }
};

const runAIDecisions = () => {
  if (!aiDecisionEnabled || !world || simEnded) return;
  const now = Date.now();
  if (now < aiDecisionBackoffUntil) return;
  if (now < aiDecisionNextAt) return;
  aiDecisionNextAt = now + aiDecisionIntervalMs;

  const candidates = Object.values(world.agents).filter(
    (agent) => agent.isAI && !decisionInFlight.has(agent.id)
  );
  if (candidates.length === 0) return;

  const availableSlots = Math.max(0, aiDecisionMaxInFlight - decisionInFlight.size);
  const sampleCount = Math.min(aiDecisionCount, candidates.length, availableSlots);
  if (sampleCount <= 0) return;
  const pool = [...candidates];
  const timeOfDay = formatSimTime(getSimMinute(world.tick));
  for (let i = 0; i < sampleCount; i += 1) {
    const index = Math.floor(Math.random() * pool.length);
    const agent = pool.splice(index, 1)[0];
    decisionInFlight.add(agent.id);
    const moveOptions = roadNeighbors(agent.pos);
    const recent = eventLog.slice(0, 5);
    const nearbyChatter = getNearbyChatter(agent);
    const nearbyAgents = getNearbyAgents(agent);

    void (async () => {
      const memories = await getRelevantMemories({
        agent,
        recentEvents: recent,
        limit: 6,
      });
      return generateAgentDecision({
        agent,
        tick: world.tick,
        metrics,
        recentEvents: recent,
        moveOptions,
        disaster: currentConfig?.disaster ?? "EARTHQUAKE",
        nearbyChatter,
        nearbyAgents,
        memories,
        timeOfDay,
        simConfig: currentConfig
          ? { emotionTone: currentConfig.emotionTone, ageProfile: currentConfig.ageProfile }
          : undefined,
      });
    })()
      .then(async (decision) => {
        aiDecisionBackoffMs = aiDecisionBackoffBaseMs;
        logDebug("ai decision", { agent: agent.id, action: decision.action });
        await applyDecision(agent, decision, moveOptions);
      })
      .catch((err) => {
        const status = extractVertexErrorStatus(err);
        if (isResourceExhausted(status)) {
          const next = Date.now() + aiDecisionBackoffMs;
          aiDecisionBackoffUntil = Math.max(aiDecisionBackoffUntil, next);
          aiDecisionBackoffMs = Math.min(
            aiDecisionBackoffMs * 2,
            aiDecisionBackoffMaxMs
          );
          logInfo("ai backoff", {
            until: new Date(aiDecisionBackoffUntil).toISOString(),
            ms: aiDecisionBackoffMs,
          });
          return;
        }
        logDebug("ai decision error", {
          agent: agent.id,
          code: status.code,
          status: status.status,
          message: status.message,
        });
      })
      .finally(() => {
        decisionInFlight.delete(agent.id);
      });
  }
};
const handleSelectAgent = async (client: WebSocket, agentId: string) => {
  if (!world) return;
  const agent = world.agents[agentId];
  if (!agent) return;

  const cached = reasoningCache.get(agentId);
  if (cached) {
    sendTo(client, { type: "AGENT_REASONING", payload: cached.data });
    return;
  }

  try {
    const stored = await getAgentReasoning(agentId);
    if (stored) {
      reasoningCache.set(agentId, { ts: Date.now(), data: stored });
      sendTo(client, { type: "AGENT_REASONING", payload: stored });
      return;
    }
  } catch {
    // ignore storage errors
  }

  if (!agent.isAI) return;
  if (simEnded || process.env.AI_ENABLED === "false") return;

  try {
    const reasoning = await generateAndStoreReasoning({
      agent,
      tick: world.tick,
      recentEvents: getRecentEvents(agentId),
    });
    reasoningCache.set(agentId, { ts: Date.now(), data: reasoning });
    sendTo(client, { type: "AGENT_REASONING", payload: reasoning });
  } catch {
    // ignore AI errors
  }
};

const initSimulation = (config: SimConfig) => {
  world = createMockWorld(config);
  aiBubbleHasAiAgents = Object.values(world.agents).some((agent) => Boolean(agent.isAI));
  currentSimulationId = randomId("sim");
  setMemoryPipelineSimulationId(currentSimulationId);
  speed = 1;
  paused = false;
  simEnded = false;
  simStartedAt = Date.now();
  simStartTick = world.tick;
  stableTicks = 0;
  escalatedTicks = 0;
  currentConfig = config;
  officialDelayMinutes = config.officialDelayMinutes;
  officialDelayTicks = minutesToTicks(officialDelayMinutes);
  ambiguityLevel = config.ambiguityLevel ?? 50;
  misinformationLevel = config.misinformationLevel ?? 50;
  multilingualCoverage = config.multilingualCoverage ?? 60;
  factCheckSpeed = config.factCheckSpeed ?? 60;
  metrics = computeMetricsFromWorld(world);
  metricsPeaks = {
    confusion: { value: metrics.confusion, tick: world.tick },
    rumorSpread: { value: metrics.rumorSpread, tick: world.tick },
    officialReach: { value: metrics.officialReach, tick: world.tick },
    vulnerableReach: { value: metrics.vulnerableReach, tick: world.tick },
    panicIndex: { value: metrics.panicIndex, tick: world.tick },
    trustIndex: { value: metrics.trustIndex, tick: world.tick },
    misinfoBelief: { value: metrics.misinfoBelief, tick: world.tick },
    resourceMisallocation: { value: metrics.resourceMisallocation, tick: world.tick },
    stabilityScore: { value: metrics.stabilityScore, tick: world.tick },
  };
  eventLog.length = 0;
  eventCounts = createEventCounts();
  interventionHistory = [];
  reasoningCache.clear();
  decisionInFlight.clear();
  aiDecisionNextAt = 0;
  aiDecisionBackoffUntil = 0;
  aiDecisionBackoffMs = aiDecisionBackoffBaseMs;
  aiBubbleInFlight.clear();
  aiBubbleSeqByAgent.clear();
  aiBubbleLastQueuedAt.clear();
  aiBubbleLastFallbackAt.clear();
  aiBubbleGlobalLastQueuedAt = 0;
  aiBubbleActiveRequests = 0;
  aiBubbleBackoffUntil = 0;
  aiBubbleBackoffMs = aiBubbleBackoffBaseMs;
  aiBubbleLastBackoffLogAt = 0;
  logInfo("init", config);
  broadcast({ type: "WORLD_INIT", world });
  startLoop();
};

wss.on("connection", (client) => {
  logInfo("ws connected", { clients: wss.clients.size });
  if (world) {
    sendTo(client, { type: "WORLD_INIT", world });
  }

  client.on("message", (raw) => {
    let msg: WsClientMsg | null = null;
    try {
      msg = JSON.parse(raw.toString()) as WsClientMsg;
    } catch {
      return;
    }

    if (!msg) return;

    logDebug("ws message", msg.type);

    if (msg.type === "INIT_SIM") {
      initSimulation(msg.config);
      return;
    }

    if (msg.type === "SUBSCRIBE") {
      if (world) {
        sendTo(client, { type: "WORLD_INIT", world });
      }
      return;
    }

    if (msg.type === "PAUSE") {
      if (simEnded) return;
      paused = true;
      logInfo("paused");
      return;
    }
    if (msg.type === "RESUME") {
      if (simEnded) return;
      paused = false;
      logInfo("resumed");
      return;
    }
    if (msg.type === "SET_SPEED") {
      if (simEnded) return;
      speed = msg.speed;
      startLoop();
      logInfo("speed", speed);
      return;
    }
    if (msg.type === "INTERVENTION") {
      if (!world || simEnded) return;
      if (!isInterventionKind(msg.payload.kind)) return;
      const interventionKind = msg.payload.kind;
      const interventionTick = world.tick;
      const diffAgents: Record<string, Partial<Agent>> = {};
      const diffBuildings: Record<string, Partial<Building>> = {};
      const mergeAgentPatch = (agentId: string, patch: Partial<Agent>) => {
        if (!world) return;
        const existing = world.agents[agentId];
        if (!existing) return;
        world.agents[agentId] = { ...existing, ...patch };
        diffAgents[agentId] = { ...(diffAgents[agentId] ?? {}), ...patch };
      };
      const mergeBuildingPatch = (buildingId: string, patch: Partial<Building>) => {
        if (!world) return;
        const existing = world.buildings[buildingId];
        if (!existing) return;
        world.buildings[buildingId] = { ...existing, ...patch };
        diffBuildings[buildingId] = { ...(diffBuildings[buildingId] ?? {}), ...patch };
      };
      const officialAcceptance = (
        agent: Agent,
        base: number,
        coverage: number = multilingualCoverage
      ) => {
        const trustFactor = 0.4 + (agent.profile.trustLevel / 100) * 0.6;
        const rumorPenalty = clamp01(1 - agent.profile.rumorSusceptibility / 180);
        return clamp01(
          base * trustFactor * rumorPenalty * officialAccessibility(agent, coverage)
        );
      };
      const applyComboEffect = (combo: InterventionCombo) => {
        if (!world) return;
        if (combo.key === "TRUTH_CASCADE") {
          Object.values(world.agents).forEach((agent) => {
            if (agent.alertStatus !== "RUMOR") return;
            if (Math.random() > officialAcceptance(agent, 0.92)) return;
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 12, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              alertStatus: "OFFICIAL",
              evacStatus: agent.evacStatus === "STAY" ? "EVACUATING" : agent.evacStatus,
              icon: "OFFICIAL",
              state: nextState,
            });
            queueAIBubbleLine({
              agentId: agent.id,
              action: "OFFICIAL",
              seedMessage: "訂正情報が一気に浸透した",
            });
          });
          return;
        }

        if (combo.key === "EVAC_EXPRESS") {
          Object.values(world.agents).forEach((agent) => {
            const evacStatus = agent.evacStatus ?? "STAY";
            if (evacStatus !== "STAY") return;
            const assistPenalty = agent.profile.mobility === "needs_assist" ? -0.15 : 0;
            const guideChance = clamp01(
              0.48 + agent.profile.trustLevel / 240 + assistPenalty
            );
            if (Math.random() > guideChance) return;
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 7, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              evacStatus: "EVACUATING",
              alertStatus: "OFFICIAL",
              icon: "OFFICIAL",
              state: nextState,
            });
            queueAIBubbleLine({
              agentId: agent.id,
              action: "EVACUATE",
              seedMessage: "案内が届き、避難を開始",
            });
          });
          return;
        }

        if (combo.key === "CARE_CHAIN") {
          Object.values(world.agents).forEach((agent) => {
            if (isVulnerable(agent) && (agent.evacStatus ?? "STAY") === "STAY") {
              if (Math.random() > officialAcceptance(agent, 0.9)) return;
              const nextState = {
                ...agent.state,
                stress: clamp(agent.state.stress - 10, 0, 100),
              };
              mergeAgentPatch(agent.id, {
                evacStatus: "EVACUATING",
                alertStatus: "OFFICIAL",
                icon: "HELP",
                state: nextState,
              });
              queueAIBubbleLine({
                agentId: agent.id,
                action: "SUPPORT",
                seedMessage: "優先支援ルートで避難開始",
              });
              return;
            }
            if (["volunteer", "medical", "staff", "leader"].includes(agent.profile.role)) {
              const nextState = {
                ...agent.state,
                stress: clamp(agent.state.stress - 5, 0, 100),
              };
              mergeAgentPatch(agent.id, {
                evacStatus: "HELPING",
                icon: "HELP",
                state: nextState,
              });
              queueAIBubbleLine({
                agentId: agent.id,
                action: "SUPPORT",
                seedMessage: "優先支援体制へ移行",
              });
            }
          });
        }
      };
      const event: TimelineEvent = {
        id: randomId("intervention"),
        tick: interventionTick,
        type: "INTERVENTION",
        message: `${INTERVENTION_KIND_LABELS[interventionKind]}: ${
          msg.payload.message ?? "対応を実行しました"
        }`,
        meta: {
          interventionKind,
        },
      };
      addEvent(event);
      interventionHistory.push({ kind: interventionKind, tick: interventionTick });
      if (interventionHistory.length > 24) {
        interventionHistory = interventionHistory.slice(-24);
      }

      if (interventionKind === "official_alert") {
        Object.values(world.agents).forEach((agent) => {
          if (Math.random() > officialAcceptance(agent, 0.85)) return;
          mergeAgentPatch(agent.id, {
            alertStatus: "OFFICIAL",
            icon: "OFFICIAL",
          });
          queueAIBubbleLine({
            agentId: agent.id,
            action: "OFFICIAL",
            seedMessage: msg.payload.message ?? "公式警報が届いた",
          });
          if (isVulnerable(agent) && agent.evacStatus !== "HELPING") {
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 6, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              evacStatus: "EVACUATING",
              state: nextState,
            });
          }
        });
      }

      if (interventionKind === "fact_check") {
        Object.values(world.agents).forEach((agent) => {
          if (agent.alertStatus !== "RUMOR") return;
          if (Math.random() > officialAcceptance(agent, 0.7)) return;
          const nextState = {
            ...agent.state,
            stress: clamp(agent.state.stress - 8, 0, 100),
          };
          mergeAgentPatch(agent.id, {
            alertStatus: "OFFICIAL",
            icon: "OFFICIAL",
            state: nextState,
          });
          queueAIBubbleLine({
            agentId: agent.id,
            action: "OFFICIAL",
            seedMessage: msg.payload.message ?? "誤情報が訂正された",
          });
        });
      }

      if (interventionKind === "support_vulnerable") {
        Object.values(world.agents).forEach((agent) => {
          if (isVulnerable(agent)) {
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 12, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              evacStatus: agent.evacStatus === "HELPING" ? "HELPING" : "EVACUATING",
              icon: "HELP",
              state: nextState,
            });
            queueAIBubbleLine({
              agentId: agent.id,
              action: "SUPPORT",
              seedMessage: msg.payload.message ?? "支援班が到着した",
            });
            return;
          }
          if (["volunteer", "medical", "staff"].includes(agent.profile.role)) {
            mergeAgentPatch(agent.id, {
              evacStatus: "HELPING",
              icon: "HELP",
            });
            queueAIBubbleLine({
              agentId: agent.id,
              action: "SUPPORT",
              seedMessage: msg.payload.message ?? "要支援者の誘導を開始",
            });
          }
        });
      }

      if (interventionKind === "open_shelter") {
        Object.values(world.buildings).forEach((building) => {
          if (building.type !== "SHELTER" && building.type !== "SCHOOL") return;
          const nextOccupancy =
            typeof building.occupancy === "number"
              ? Math.max(0, Math.floor(building.occupancy * 0.6))
              : building.occupancy;
          mergeBuildingPatch(building.id, {
            status: "OPEN",
            occupancy: nextOccupancy,
          });
        });
      }

      if (interventionKind === "multilingual_broadcast") {
        const boostedCoverage = Math.min(100, multilingualCoverage + 30);
        Object.values(world.agents).forEach((agent) => {
          if (agent.alertStatus === "OFFICIAL") return;
          const isLocalLang = agent.profile.language === "ja";
          const coverage = isLocalLang ? multilingualCoverage : boostedCoverage;
          const base = isLocalLang ? 0.65 : 0.9;
          if (Math.random() > officialAcceptance(agent, base, coverage)) return;
          const nextState = {
            ...agent.state,
            stress: clamp(agent.state.stress - (isLocalLang ? 4 : 7), 0, 100),
          };
          mergeAgentPatch(agent.id, {
            alertStatus: "OFFICIAL",
            icon: "OFFICIAL",
            state: nextState,
          });
          queueAIBubbleLine({
            agentId: agent.id,
            action: "OFFICIAL",
            seedMessage: msg.payload.message ?? "多言語で警報が届いた",
          });
          if (isVulnerable(agent) && agent.evacStatus !== "HELPING") {
            mergeAgentPatch(agent.id, {
              evacStatus: "EVACUATING",
            });
          }
        });
      }

      if (interventionKind === "route_guidance") {
        Object.values(world.agents).forEach((agent) => {
          const evacStatus = agent.evacStatus ?? "STAY";
          const canMove =
            evacStatus === "STAY" && agent.profile.mobility !== "needs_assist";
          const trustFactor = (agent.profile.trustLevel / 100) * 0.3;
          const officialBoost =
            agent.alertStatus === "OFFICIAL"
              ? 0.25
              : agent.alertStatus === "RUMOR"
              ? 0.1
              : 0;
          const vulnerableBoost = isVulnerable(agent) ? 0.15 : 0;
          const guidanceChance = clamp01(0.2 + trustFactor + officialBoost + vulnerableBoost);
          if (canMove && Math.random() < guidanceChance) {
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 5, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              evacStatus: "EVACUATING",
              alertStatus: "OFFICIAL",
              icon: "OFFICIAL",
              state: nextState,
            });
            queueAIBubbleLine({
              agentId: agent.id,
              action: "EVACUATE",
              seedMessage: msg.payload.message ?? "安全ルートが案内された",
            });
            return;
          }
          if (evacStatus === "EVACUATING" && Math.random() < 0.4) {
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 4, 0, 100),
            };
            mergeAgentPatch(agent.id, { state: nextState });
          }
        });
      }

      if (interventionKind === "operations_rebalance") {
        const responderRoles: Agent["profile"]["role"][] = [
          "volunteer",
          "medical",
          "staff",
          "leader",
        ];
        Object.values(world.agents).forEach((agent) => {
          const evacStatus = agent.evacStatus ?? "STAY";
          const vulnerable = isVulnerable(agent);
          const isResponder = responderRoles.includes(agent.profile.role);

          if (
            agent.alertStatus === "RUMOR" &&
            Math.random() <= officialAcceptance(agent, 0.86)
          ) {
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 9, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              alertStatus: "OFFICIAL",
              icon: "OFFICIAL",
              state: nextState,
            });
            queueAIBubbleLine({
              agentId: agent.id,
              action: "OFFICIAL",
              seedMessage: msg.payload.message ?? "優先度の再配分を実施した",
            });
          }

          if (vulnerable && evacStatus === "STAY") {
            if (Math.random() > officialAcceptance(agent, 0.9)) return;
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 11, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              evacStatus: "EVACUATING",
              alertStatus: "OFFICIAL",
              icon: "HELP",
              state: nextState,
            });
            queueAIBubbleLine({
              agentId: agent.id,
              action: "SUPPORT",
              seedMessage: msg.payload.message ?? "要支援者優先で搬送を開始",
            });
            return;
          }

          if (!vulnerable && ["EVACUATING", "HELPING"].includes(evacStatus)) {
            const settleBase = isResponder ? 0.42 : 0.74;
            const rumorPenalty = agent.alertStatus === "RUMOR" ? -0.14 : 0;
            const officialBoost = agent.alertStatus === "OFFICIAL" ? 0.08 : 0;
            const settleChance = clamp01(settleBase + rumorPenalty + officialBoost);
            if (Math.random() > settleChance) return;
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - (isResponder ? 4 : 7), 0, 100),
            };
            mergeAgentPatch(agent.id, {
              evacStatus: "STAY",
              alertStatus: "OFFICIAL",
              icon: "OFFICIAL",
              state: nextState,
            });
            queueAIBubbleLine({
              agentId: agent.id,
              action: "OFFICIAL",
              seedMessage: msg.payload.message ?? "要支援者優先で待機へ切替",
            });
          }
        });
      }

      if (interventionKind === "triage_dispatch") {
        const responderRoles: Agent["profile"]["role"][] = [
          "volunteer",
          "medical",
          "staff",
          "leader",
        ];
        Object.values(world.agents).forEach((agent) => {
          const evacStatus = agent.evacStatus ?? "STAY";
          const vulnerable = isVulnerable(agent);
          const isResponder = responderRoles.includes(agent.profile.role);
          const isNonVulnerableActive =
            !vulnerable && ["EVACUATING", "HELPING"].includes(evacStatus);

          if (isNonVulnerableActive) {
            const retaskBase = isResponder ? 0.56 : 0.84;
            const rumorBoost = agent.alertStatus === "RUMOR" ? 0.1 : 0;
            const helperBoost = evacStatus === "HELPING" ? 0.06 : 0;
            const retaskChance = clamp01(retaskBase + rumorBoost + helperBoost);
            if (Math.random() <= retaskChance) {
              const nextState = {
                ...agent.state,
                stress: clamp(agent.state.stress - (isResponder ? 6 : 9), 0, 100),
              };
              mergeAgentPatch(agent.id, {
                evacStatus: "STAY",
                alertStatus: "OFFICIAL",
                icon: "OFFICIAL",
                state: nextState,
              });
              queueAIBubbleLine({
                agentId: agent.id,
                action: "OFFICIAL",
                seedMessage: msg.payload.message ?? "不要な出動を停止して待機に戻る",
              });
            }
          }

          if (agent.alertStatus === "RUMOR") {
            const correctionBase = vulnerable ? 0.78 : 0.9;
            if (Math.random() <= officialAcceptance(agent, correctionBase)) {
              const nextState = {
                ...agent.state,
                stress: clamp(agent.state.stress - 9, 0, 100),
              };
              mergeAgentPatch(agent.id, {
                alertStatus: "OFFICIAL",
                icon: vulnerable ? "HELP" : "OFFICIAL",
                state: nextState,
              });
              queueAIBubbleLine({
                agentId: agent.id,
                action: "OFFICIAL",
                seedMessage: msg.payload.message ?? "要請内容を再確認し、誤情報を訂正した",
              });
            }
          }
        });
      }

      if (interventionKind === "rumor_monitoring") {
        Object.values(world.agents).forEach((agent) => {
          if (agent.alertStatus !== "RUMOR") return;
          const base = agent.profile.trustLevel > 65 ? 0.88 : 0.8;
          if (Math.random() > officialAcceptance(agent, base)) return;
          const nextState = {
            ...agent.state,
            stress: clamp(agent.state.stress - 10, 0, 100),
          };
          mergeAgentPatch(agent.id, {
            alertStatus: "OFFICIAL",
            icon: "OFFICIAL",
            state: nextState,
          });
          queueAIBubbleLine({
            agentId: agent.id,
            action: "OFFICIAL",
            seedMessage: msg.payload.message ?? "デマが訂正された",
          });
        });
      }

      if (interventionKind === "volunteer_mobilization") {
        Object.values(world.agents).forEach((agent) => {
          if (isVulnerable(agent) && (agent.evacStatus ?? "STAY") === "STAY") {
            const assistChance =
              0.35 + clamp01(agent.profile.trustLevel / 100) * 0.15;
            if (Math.random() > assistChance) return;
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 8, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              evacStatus: "EVACUATING",
              icon: "HELP",
              state: nextState,
            });
            queueAIBubbleLine({
              agentId: agent.id,
              action: "SUPPORT",
              seedMessage: msg.payload.message ?? "支援班が誘導を開始",
            });
            return;
          }
          if (["volunteer", "medical", "staff", "leader"].includes(agent.profile.role)) {
            if (agent.evacStatus === "HELPING") return;
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 6, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              evacStatus: "HELPING",
              icon: "HELP",
              state: nextState,
            });
            queueAIBubbleLine({
              agentId: agent.id,
              action: "SUPPORT",
              seedMessage: msg.payload.message ?? "支援要員が動員された",
            });
          }
        });
      }

      const triggeredCombo = resolveInterventionCombo(interventionHistory);
      if (triggeredCombo) {
        applyComboEffect(triggeredCombo);
        addEvent({
          id: randomId("combo"),
          tick: interventionTick,
          type: "INTERVENTION",
          message: `COMBO ${triggeredCombo.label}: ${triggeredCombo.message}`,
          meta: {
            comboKey: triggeredCombo.key,
            comboLabel: triggeredCombo.label,
            interventionKind,
          },
        });
      }

      if (Object.keys(diffAgents).length > 0 || Object.keys(diffBuildings).length > 0) {
        broadcast({
          type: "WORLD_DIFF",
          tick: interventionTick,
          agents: Object.keys(diffAgents).length > 0 ? diffAgents : undefined,
          buildings: Object.keys(diffBuildings).length > 0 ? diffBuildings : undefined,
        });
      }

      metrics = computeMetricsFromWorld(world);
      updateMetricPeaks(interventionTick, metrics);
      broadcast({ type: "METRICS", metrics, tick: interventionTick });
      logInfo("intervention", interventionKind);
      return;
    }
    if (msg.type === "SELECT_AGENT") {
      void handleSelectAgent(client, msg.agentId);
    }
  });
});

server.listen(port, () => {
  logInfo("listening", {
    port,
    aiDecisionEnabled,
    adkDecisionEnabled,
    aiDecisionCount,
    aiDecisionIntervalMs,
    aiDecisionMaxInFlight,
    forceAiBubbleText,
    aiBubbleSampleRate,
    aiBubbleMaxInFlight,
    aiBubbleMinIntervalMs,
    aiBubbleGlobalMinIntervalMs,
  });
});
