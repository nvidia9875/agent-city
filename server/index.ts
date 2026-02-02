import dotenv from "dotenv";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import type {
  Agent,
  AgentReasoning,
  Metrics,
  TimelineEvent,
  TimelineEventType,
  SimConfig,
  World,
} from "../types/sim";
import type { WsClientMsg, WsServerMsg } from "../types/ws";
import { createMockWorld } from "../mocks/mockWorld";
import { clamp } from "../utils/easing";
import { toIndex } from "../utils/grid";
import { generateAgentDecision } from "../lib/ai/decision";
import { generateAndStoreReasoning } from "../lib/ai/reasoning";
import { recordEventMemory } from "../lib/ai/memoryPipeline";
import { getAgentReasoning } from "../lib/db/agentReasoning";
import { saveEvent, saveMetrics } from "../lib/db/simState";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const logLevel = process.env.SIM_LOG_LEVEL ?? "info";
const allowInfo = logLevel === "info" || logLevel === "debug";
const allowDebug = logLevel === "debug";
const logInfo = (...args: unknown[]) => {
  if (allowInfo) {
    // eslint-disable-next-line no-console
    console.log("[sim]", ...args);
  }
};
const logDebug = (...args: unknown[]) => {
  if (allowDebug) {
    // eslint-disable-next-line no-console
    console.log("[sim:debug]", ...args);
  }
};

const randomPick = <T,>(items: T[]) =>
  items[Math.floor(Math.random() * items.length)];

const randomId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const jitter = (value: number, range = 6) =>
  clamp(value + (Math.random() * range - range / 2), 0, 100);

const EVENT_MESSAGES: Record<TimelineEventType, string[]> = {
  MOVE: ["避難ルートを確認中。", "安全な道を探して移動。"],
  TALK: ["近くの人と情報交換。", "状況を共有している。"],
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

const port = Number(process.env.SIM_SERVER_PORT ?? 3001);

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
const resetMetrics = (): Metrics => ({
  confusion: 34,
  rumorSpread: 26,
  officialReach: 42,
  vulnerableReach: 22,
});
let metrics: Metrics = resetMetrics();

const eventLog: TimelineEvent[] = [];
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
  if (!world) return;
  eventLog.unshift(event);
  if (eventLog.length > 200) eventLog.pop();
  logDebug("event", { type: event.type, id: event.id, tick: event.tick });
  broadcast({ type: "EVENT", event });
  void saveEvent(event);
  if (event.actors?.length) {
    event.actors.forEach((actorId) => {
      const agent = world.agents[actorId];
      if (agent) {
        void recordEventMemory(agent, event);
      }
    });
  }
};

const tick = () => {
  if (paused || !world) return;
  world = { ...world, tick: world.tick + 1 };
  if (allowDebug && world.tick % 10 === 0) {
    logDebug("tick", world.tick);
  }

  const diffAgents: Record<string, Partial<Agent>> = {};

  if (!aiDecisionEnabled) {
    Object.values(world.agents).forEach((agent) => {
      const mobilityHold =
        agent.profile.mobility === "needs_assist"
          ? 0.6
          : agent.profile.mobility === "limited"
            ? 0.4
            : 0.25;
      if (Math.random() < mobilityHold) return;
      const neighbors = roadNeighbors(agent.pos);
      if (neighbors.length === 0) return;
      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      if (next.x === agent.pos.x && next.y === agent.pos.y) return;
      diffAgents[agent.id] = {
        pos: { x: next.x, y: next.y },
        dir:
          next.x > agent.pos.x
            ? "E"
            : next.x < agent.pos.x
              ? "W"
              : next.y > agent.pos.y
                ? "S"
                : "N",
        bubble: Math.random() > 0.9 ? "周囲を確認中…" : agent.bubble,
      };
      agent.pos = next;
    });
  }

  if (Object.keys(diffAgents).length > 0) {
    broadcast({ type: "WORLD_DIFF", tick: world.tick, agents: diffAgents });
  }

  runAIDecisions();

  if (Math.random() > 0.68) {
    const agents = Object.values(world.agents);
    if (agents.length === 0) return;
    const actor = agents[Math.floor(Math.random() * agents.length)];
    const roll = Math.random();
    const type: TimelineEventType =
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
    const event: TimelineEvent = {
      id: randomId("ev"),
      tick: world.tick,
      type,
      actors: [actor.id],
      at: actor.pos,
      message: randomPick(EVENT_MESSAGES[type]),
    };
    addEvent(event);

    if (type === "RUMOR") {
      actor.alertStatus = "RUMOR";
      diffAgents[actor.id] = {
        ...(diffAgents[actor.id] ?? {}),
        alertStatus: "RUMOR",
        bubble: "噂が広がっている…",
        icon: "RUMOR",
      };
      metrics.rumorSpread = clamp(metrics.rumorSpread + 6, 0, 100);
      metrics.confusion = clamp(metrics.confusion + 4, 0, 100);
    }
    if (type === "OFFICIAL" || type === "ALERT") {
      actor.alertStatus = "OFFICIAL";
      diffAgents[actor.id] = {
        ...(diffAgents[actor.id] ?? {}),
        alertStatus: "OFFICIAL",
        bubble: "公式警報が届いた",
        icon: "OFFICIAL",
      };
      metrics.officialReach = clamp(metrics.officialReach + 5, 0, 100);
      metrics.confusion = clamp(metrics.confusion - 2, 0, 100);
    }
    if (type === "EVACUATE") {
      actor.evacStatus = "EVACUATING";
      diffAgents[actor.id] = {
        ...(diffAgents[actor.id] ?? {}),
        evacStatus: "EVACUATING",
      };
      metrics.vulnerableReach = clamp(metrics.vulnerableReach + 3, 0, 100);
    }
    if (type === "SUPPORT") {
      actor.evacStatus = "HELPING";
      diffAgents[actor.id] = {
        ...(diffAgents[actor.id] ?? {}),
        evacStatus: "HELPING",
        icon: "HELP",
      };
      metrics.vulnerableReach = clamp(metrics.vulnerableReach + 6, 0, 100);
    }
  }

  metrics = {
    confusion: jitter(metrics.confusion),
    rumorSpread: jitter(metrics.rumorSpread),
    officialReach: jitter(metrics.officialReach, 4),
    vulnerableReach: jitter(metrics.vulnerableReach, 4),
  };
  broadcast({ type: "METRICS", metrics, tick: world.tick });
  void saveMetrics(metrics, world.tick);
};

const startLoop = () => {
  if (!world) return;
  if (interval) clearInterval(interval);
  interval = setInterval(tick, 1000 / speed);
};

const getRecentEvents = (agentId: string) => {
  return eventLog
    .filter((event) => event.actors?.includes(agentId))
    .slice(0, 3)
    .map((event) => event.message ?? event.type);
};

const applyAgentPatch = (agentId: string, patch: Partial<Agent>) => {
  if (!world) return;
  const agent = world.agents[agentId];
  if (!agent) return;
  world.agents[agentId] = { ...agent, ...patch };
  broadcast({ type: "WORLD_DIFF", tick: world.tick, agents: { [agentId]: patch } });
};

const applyDecision = (
  agent: Agent,
  decision: { action: string; targetIndex?: number; message?: string },
  moveOptions: Array<{ x: number; y: number }>
) => {
  const message = decision.message?.slice(0, 60);

  if (decision.action === "MOVE" || decision.action === "EVACUATE") {
    const target =
      typeof decision.targetIndex === "number"
        ? moveOptions[decision.targetIndex]
        : moveOptions[0];
    if (target) {
      applyAgentPatch(agent.id, { pos: { x: target.x, y: target.y } });
    }
  }

  if (decision.action === "RUMOR") {
    applyAgentPatch(agent.id, { alertStatus: "RUMOR", bubble: message, icon: "RUMOR" });
    addEvent({
      id: randomId("ev"),
      tick: world.tick,
      type: "RUMOR",
      actors: [agent.id],
      at: agent.pos,
      message: message ?? randomPick(EVENT_MESSAGES.RUMOR),
    });
    return;
  }

  if (decision.action === "OFFICIAL") {
    applyAgentPatch(agent.id, {
      alertStatus: "OFFICIAL",
      bubble: message ?? "公式情報を共有中",
      icon: "OFFICIAL",
    });
    addEvent({
      id: randomId("ev"),
      tick: world.tick,
      type: "OFFICIAL",
      actors: [agent.id],
      at: agent.pos,
      message: message ?? randomPick(EVENT_MESSAGES.OFFICIAL),
    });
    return;
  }

  if (decision.action === "SUPPORT") {
    applyAgentPatch(agent.id, { evacStatus: "HELPING", bubble: message, icon: "HELP" });
    addEvent({
      id: randomId("ev"),
      tick: world.tick,
      type: "SUPPORT",
      actors: [agent.id],
      at: agent.pos,
      message: message ?? randomPick(EVENT_MESSAGES.SUPPORT),
    });
    return;
  }

  if (decision.action === "CHECKIN") {
    addEvent({
      id: randomId("ev"),
      tick: world.tick,
      type: "CHECKIN",
      actors: [agent.id],
      at: agent.pos,
      message: message ?? randomPick(EVENT_MESSAGES.CHECKIN),
    });
    return;
  }

  if (decision.action === "TALK") {
    addEvent({
      id: randomId("ev"),
      tick: world.tick,
      type: "TALK",
      actors: [agent.id],
      at: agent.pos,
      message: message ?? randomPick(EVENT_MESSAGES.TALK),
    });
  }
};

const runAIDecisions = () => {
  if (!aiDecisionEnabled || !world) return;
  const now = Date.now();
  if (now < aiDecisionBackoffUntil) return;
  if (now < aiDecisionNextAt) return;
  aiDecisionNextAt = now + aiDecisionIntervalMs;

  const candidates = Object.values(world.agents).filter(
    (agent) => !decisionInFlight.has(agent.id)
  );
  if (candidates.length === 0) return;

  const availableSlots = Math.max(0, aiDecisionMaxInFlight - decisionInFlight.size);
  const sampleCount = Math.min(aiDecisionCount, candidates.length, availableSlots);
  if (sampleCount <= 0) return;
  const pool = [...candidates];
  for (let i = 0; i < sampleCount; i += 1) {
    const index = Math.floor(Math.random() * pool.length);
    const agent = pool.splice(index, 1)[0];
    decisionInFlight.add(agent.id);
    const moveOptions = roadNeighbors(agent.pos);
    const recent = eventLog.slice(0, 5);

    void generateAgentDecision({
      agent,
      tick: world.tick,
      metrics,
      recentEvents: recent,
      moveOptions,
    })
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

  if (process.env.AI_ENABLED === "false") return;

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
  paused = false;
  metrics = resetMetrics();
  eventLog.length = 0;
  reasoningCache.clear();
  decisionInFlight.clear();
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
      paused = true;
      logInfo("paused");
      return;
    }
    if (msg.type === "RESUME") {
      paused = false;
      logInfo("resumed");
      return;
    }
    if (msg.type === "SET_SPEED") {
      speed = msg.speed;
      startLoop();
      logInfo("speed", speed);
      return;
    }
    if (msg.type === "INTERVENTION") {
      if (!world) return;
      const kindLabel: Record<string, string> = {
        official_alert: "公式警報一斉配信",
        open_shelter: "避難所拡張",
        fact_check: "ファクトチェック",
        support_vulnerable: "要支援者支援",
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
      metrics = {
        confusion: jitter(metrics.confusion, 10),
        rumorSpread: jitter(metrics.rumorSpread, 10),
        officialReach: jitter(metrics.officialReach, 8),
        vulnerableReach: jitter(metrics.vulnerableReach, 8),
      };
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
