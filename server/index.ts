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
  TimelineEvent,
  TimelineEventType,
  SimConfig,
  World,
} from "../types/sim";
import type { WsClientMsg, WsServerMsg } from "../types/ws";
import { createMockWorld } from "../mocks/mockWorld";
import { clamp } from "../utils/easing";
import { buildAgentBubble } from "../utils/bubble";
import { toIndex } from "../utils/grid";
import { ACTIVITY_GOALS, ACTIVITY_LABELS, formatActivityMessage } from "../utils/activity";
import { generateAgentDecision } from "../lib/ai/decision";
import type { AgentDecision } from "../lib/ai/decision";
import { generateAndStoreReasoning } from "../lib/ai/reasoning";
import { recordAgentMemory, recordEventMemory } from "../lib/ai/memoryPipeline";
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
  TALK: ["近くの人と情報交換。", "状況を共有している。"],
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
  void saveEvent(event);
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
    void generateVectorInsights()
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
  const mergeAgentPatch = (agentId: string, patch: Partial<Agent>) => {
    if (!world) return;
    const existing = world.agents[agentId];
    if (!existing) return;
    world.agents[agentId] = { ...existing, ...patch };
    diffAgents[agentId] = { ...(diffAgents[agentId] ?? {}), ...patch };
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
        bubble: buildAgentBubble(target, {
          tick: world?.tick ?? 0,
          kind,
          message,
        }),
        icon: kind === "RUMOR" ? "RUMOR" : "OFFICIAL",
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
          bubble: buildAgentBubble(agent, {
            tick: world?.tick ?? 0,
            kind: "ACTIVITY",
            message: ACTIVITY_LABELS[nextActivity],
          }),
        });
        addEvent({
          id: randomId("activity"),
          tick: world.tick,
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
    const ambientMoveChance = isAiControlled
      ? agent.profile.mobility === "needs_assist"
        ? 0.04
        : agent.profile.mobility === "limited"
          ? 0.08
          : 0.12
      : baseMoveChance;
    const activityFactor = activityMoveFactor(agent.activity);
    if (Math.random() > clamp01(ambientMoveChance * activityFactor)) return;
    const neighbors = roadNeighbors(agent.pos);
    if (neighbors.length === 0) return;
    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    if (next.x === agent.pos.x && next.y === agent.pos.y) return;
    const speak = !isAiControlled && Math.random() > 0.9;
    mergeAgentPatch(agent.id, {
      pos: { x: next.x, y: next.y },
      dir:
        next.x > agent.pos.x
          ? "E"
          : next.x < agent.pos.x
            ? "W"
            : next.y > agent.pos.y
              ? "S"
              : "N",
      bubble: speak
        ? buildAgentBubble(agent, {
            tick: world?.tick ?? 0,
            kind: "MOVE",
          })
        : agent.bubble,
    });
    agent.pos = next;
  });

  runAIDecisions();

  if (Math.random() > 0.68) {
    const agents = Object.values(world.agents);
    if (agents.length === 0) return;
    const actor = agents[Math.floor(Math.random() * agents.length)];
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
    const talkTarget =
      type === "TALK"
        ? (() => {
            const nearby = getNearbyAgents(actor);
            if (nearby.length === 0) return null;
            const pick = nearby[Math.floor(Math.random() * nearby.length)];
            return world?.agents[pick.id] ?? null;
          })()
        : null;
    const baseMessage =
      type === "RUMOR" && Math.random() < misinfoFactor * 0.55
        ? randomPick(MISINFO_EVENT_MESSAGES)
        : pickEventMessage(type);
    const talkMessage =
      type === "TALK" && talkTarget && !baseMessage.includes(talkTarget.name)
        ? `${talkTarget.name}さん、${baseMessage}`
        : baseMessage;
    const event: TimelineEvent = {
      id: randomId("ev"),
      tick: world.tick,
      type,
      actors: talkTarget ? [actor.id, talkTarget.id] : [actor.id],
      at: actor.pos,
      message: talkMessage,
    };
    addEvent(event);

    if (type === "RUMOR") {
      actor.alertStatus = "RUMOR";
      mergeAgentPatch(actor.id, {
        alertStatus: "RUMOR",
        bubble: buildAgentBubble(actor, {
          tick: world.tick,
          kind: "RUMOR",
          message: event.message,
        }),
        icon: "RUMOR",
      });
      spreadAlert(actor, "RUMOR", event.message ?? "噂が広がっている…");
    }
    if (type === "OFFICIAL" || type === "ALERT") {
      actor.alertStatus = "OFFICIAL";
      mergeAgentPatch(actor.id, {
        alertStatus: "OFFICIAL",
        bubble: buildAgentBubble(actor, {
          tick: world.tick,
          kind: type === "ALERT" ? "ALERT" : "OFFICIAL",
          message: event.message,
        }),
        icon: "OFFICIAL",
      });
      spreadAlert(actor, "OFFICIAL", event.message ?? "公式警報が届いた");
    }
    if (type === "EVACUATE") {
      actor.evacStatus = "EVACUATING";
      mergeAgentPatch(actor.id, {
        evacStatus: "EVACUATING",
        bubble: buildAgentBubble(actor, {
          tick: world.tick,
          kind: "EVACUATE",
          message: event.message,
        }),
      });
    }
    if (type === "SUPPORT") {
      actor.evacStatus = "HELPING";
      mergeAgentPatch(actor.id, {
        evacStatus: "HELPING",
        bubble: buildAgentBubble(actor, {
          tick: world.tick,
          kind: "SUPPORT",
          message: event.message,
        }),
        icon: "HELP",
      });
    }
    if (type === "CHECKIN") {
      mergeAgentPatch(actor.id, {
        bubble: buildAgentBubble(actor, {
          tick: world.tick,
          kind: "CHECKIN",
          message: event.message,
        }),
      });
    }
    if (type === "TALK") {
      mergeAgentPatch(actor.id, {
        bubble: buildAgentBubble(actor, {
          tick: world.tick,
          kind: "TALK",
          message: event.message,
        }),
      });
      if (talkTarget) {
        mergeAgentPatch(talkTarget.id, {
          bubble: buildAgentBubble(talkTarget, {
            tick: world.tick,
            kind: "TALK",
            message: event.message,
          }),
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
        bubble: buildAgentBubble(agent, {
          tick: world?.tick ?? 0,
          kind: "OFFICIAL",
          message: "公式: 誤情報を訂正しました。",
        }),
        icon: "OFFICIAL",
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

  if (Object.keys(diffAgents).length > 0) {
    broadcast({ type: "WORLD_DIFF", tick: world.tick, agents: diffAgents });
  }

  metrics = computeMetricsFromWorld(world);
  updateMetricPeaks(world.tick, metrics);
  broadcast({ type: "METRICS", metrics, tick: world.tick });
  void saveMetrics(metrics, world.tick);

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

const applyAgentPatch = (agentId: string, patch: Partial<Agent>) => {
  if (!world || simEnded) return;
  const agent = world.agents[agentId];
  if (!agent) return;
  world.agents[agentId] = { ...agent, ...patch };
  broadcast({ type: "WORLD_DIFF", tick: world.tick, agents: { [agentId]: patch } });
};

const applyDecision = (
  agent: Agent,
  decision: AgentDecision,
  moveOptions: Array<{ x: number; y: number }>
) => {
  if (!world || simEnded) return;
  const message = decision.message?.slice(0, 60);
  const thoughtSeed = [decision.reflection, decision.plan]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const thought = thoughtSeed ? thoughtSeed.slice(0, 120) : undefined;
  const action =
    decision.action === "OFFICIAL" && world && world.tick < officialDelayTicks
      ? "RUMOR"
      : decision.action;
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
      const bubbleKind = action === "EVACUATE" ? "EVACUATE" : "MOVE";
      const moveThought =
        action === "EVACUATE" || (action === "MOVE" && agentEvacuating)
          ? thought
          : undefined;
      applyWithDecision({
        pos: { x: target.x, y: target.y },
        dir,
        ...(action === "EVACUATE" ? { evacStatus: "EVACUATING" } : {}),
        bubble: message || moveThought
          ? buildAgentBubble(agentSnapshot, {
              tick: world?.tick ?? 0,
              kind: bubbleKind,
              message,
              thought: moveThought,
            })
          : agent.bubble,
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
      bubble: buildAgentBubble(agentSnapshot, {
        tick: world?.tick ?? 0,
        kind: "RUMOR",
        message,
      }),
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
      bubble: buildAgentBubble(agentSnapshot, {
        tick: world?.tick ?? 0,
        kind: "OFFICIAL",
        message,
      }),
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
      bubble: buildAgentBubble(agentSnapshot, {
        tick: world?.tick ?? 0,
        kind: "SUPPORT",
        message,
      }),
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
      bubble: buildAgentBubble(agentSnapshot, {
        tick: world?.tick ?? 0,
        kind: "CHECKIN",
        message,
      }),
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
    const target =
      decision.targetAgentId && world.agents[decision.targetAgentId]
        ? world.agents[decision.targetAgentId]
        : (() => {
            const neighbors = getNearbyAgents(agent);
            if (neighbors.length === 0) return null;
            const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
            return world?.agents[pick.id] ?? null;
          })();
    const finalMessage =
      message && target && !message.includes(target.name)
        ? `${target.name}さん、${message}`
        : message;
    applyWithDecision({
      bubble: buildAgentBubble(agentSnapshot, {
        tick: world?.tick ?? 0,
        kind: "TALK",
        message: finalMessage,
      }),
    });
    if (target) {
      applyAgentPatch(target.id, {
        bubble: buildAgentBubble(target, {
          tick: world?.tick ?? 0,
          kind: "TALK",
          message: finalMessage,
        }),
      });
    }
    addEvent({
      id: randomId("ev"),
      tick: world.tick,
      type: "TALK",
      actors: target ? [agent.id, target.id] : [agent.id],
      at: agent.pos,
      message: finalMessage ?? pickEventMessage("TALK"),
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

  if (action === "WAIT") {
    const waitThought = agentEvacuating ? thought : undefined;
    applyWithDecision({
      bubble: buildAgentBubble(agentSnapshot, {
        tick: world?.tick ?? 0,
        kind: "ACTIVITY",
        message: nextActivity ? ACTIVITY_LABELS[nextActivity] : undefined,
        thought: waitThought,
      }),
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
      .then((decision) => {
        aiDecisionBackoffMs = aiDecisionBackoffBaseMs;
        logDebug("ai decision", { agent: agent.id, action: decision.action });
        applyDecision(agent, decision, moveOptions);
      })
      .catch((err) => {
        logDebug("ai decision error", { agent: agent.id, error: err });
        const status = (err as { code?: number; status?: string }) ?? {};
        if (status.code === 429 || status.status === "RESOURCE_EXHAUSTED") {
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
        }
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
  reasoningCache.clear();
  decisionInFlight.clear();
  aiDecisionNextAt = 0;
  aiDecisionBackoffUntil = 0;
  aiDecisionBackoffMs = aiDecisionBackoffBaseMs;
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
      const kindLabel: Record<string, string> = {
        official_alert: "公式警報一斉配信",
        open_shelter: "避難所拡張",
        fact_check: "ファクトチェック",
        support_vulnerable: "要支援者支援",
        multilingual_broadcast: "多言語一斉アラート",
        route_guidance: "避難ルート誘導",
        rumor_monitoring: "SNSデマ監視",
        volunteer_mobilization: "ボランティア招集",
      };
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
      const event: TimelineEvent = {
        id: randomId("intervention"),
        tick: world.tick,
        type: "INTERVENTION",
        message: `${kindLabel[msg.payload.kind] ?? msg.payload.kind}: ${
          msg.payload.message ?? "対応を実行しました"
        }`,
      };
      addEvent(event);

      if (msg.payload.kind === "official_alert") {
        Object.values(world.agents).forEach((agent) => {
          if (Math.random() > officialAcceptance(agent, 0.85)) return;
          mergeAgentPatch(agent.id, {
            alertStatus: "OFFICIAL",
            bubble: buildAgentBubble(agent, {
              tick: world.tick,
              kind: "OFFICIAL",
              message: msg.payload.message ?? "公式警報が届いた",
            }),
            icon: "OFFICIAL",
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

      if (msg.payload.kind === "fact_check") {
        Object.values(world.agents).forEach((agent) => {
          if (agent.alertStatus !== "RUMOR") return;
          if (Math.random() > officialAcceptance(agent, 0.7)) return;
          const nextState = {
            ...agent.state,
            stress: clamp(agent.state.stress - 8, 0, 100),
          };
          mergeAgentPatch(agent.id, {
            alertStatus: "OFFICIAL",
            bubble: buildAgentBubble(agent, {
              tick: world.tick,
              kind: "OFFICIAL",
              message: msg.payload.message ?? "誤情報が訂正された",
            }),
            icon: "OFFICIAL",
            state: nextState,
          });
        });
      }

      if (msg.payload.kind === "support_vulnerable") {
        Object.values(world.agents).forEach((agent) => {
          if (isVulnerable(agent)) {
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 12, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              evacStatus: agent.evacStatus === "HELPING" ? "HELPING" : "EVACUATING",
              bubble: buildAgentBubble(agent, {
                tick: world.tick,
                kind: "SUPPORT",
                message: msg.payload.message ?? "支援班が到着した",
              }),
              icon: "HELP",
              state: nextState,
            });
            return;
          }
          if (["volunteer", "medical", "staff"].includes(agent.profile.role)) {
            mergeAgentPatch(agent.id, {
              evacStatus: "HELPING",
              bubble: buildAgentBubble(agent, {
                tick: world.tick,
                kind: "SUPPORT",
                message: msg.payload.message ?? "要支援者の誘導を開始",
              }),
              icon: "HELP",
            });
          }
        });
      }

      if (msg.payload.kind === "open_shelter") {
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

      if (msg.payload.kind === "multilingual_broadcast") {
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
            bubble: buildAgentBubble(agent, {
              tick: world.tick,
              kind: "OFFICIAL",
              message: msg.payload.message ?? "多言語で警報が届いた",
            }),
            icon: "OFFICIAL",
            state: nextState,
          });
          if (isVulnerable(agent) && agent.evacStatus !== "HELPING") {
            mergeAgentPatch(agent.id, {
              evacStatus: "EVACUATING",
            });
          }
        });
      }

      if (msg.payload.kind === "route_guidance") {
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
              bubble: buildAgentBubble(agent, {
                tick: world.tick,
                kind: "OFFICIAL",
                message: msg.payload.message ?? "安全ルートが案内された",
              }),
              icon: "OFFICIAL",
              state: nextState,
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

      if (msg.payload.kind === "rumor_monitoring") {
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
            bubble: buildAgentBubble(agent, {
              tick: world.tick,
              kind: "OFFICIAL",
              message: msg.payload.message ?? "デマが訂正された",
            }),
            icon: "OFFICIAL",
            state: nextState,
          });
        });
      }

      if (msg.payload.kind === "volunteer_mobilization") {
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
              bubble: buildAgentBubble(agent, {
                tick: world.tick,
                kind: "SUPPORT",
                message: msg.payload.message ?? "支援班が誘導を開始",
              }),
              icon: "HELP",
              state: nextState,
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
              bubble: buildAgentBubble(agent, {
                tick: world.tick,
                kind: "SUPPORT",
                message: msg.payload.message ?? "支援要員が動員された",
              }),
              icon: "HELP",
              state: nextState,
            });
          }
        });
      }

      if (Object.keys(diffAgents).length > 0 || Object.keys(diffBuildings).length > 0) {
        broadcast({
          type: "WORLD_DIFF",
          tick: world.tick,
          agents: Object.keys(diffAgents).length > 0 ? diffAgents : undefined,
          buildings: Object.keys(diffBuildings).length > 0 ? diffBuildings : undefined,
        });
      }

      metrics = computeMetricsFromWorld(world);
      updateMetricPeaks(world.tick, metrics);
      broadcast({ type: "METRICS", metrics, tick: world.tick });
      logInfo("intervention", msg.payload.kind);
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
  });
});
