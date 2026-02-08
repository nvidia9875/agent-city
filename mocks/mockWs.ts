import type {
  TimelineEvent,
  Metrics,
  Agent,
  Building,
  TimelineEventType,
  SimConfig,
  World,
  SimEndReason,
  SimEndSummary,
} from "@/types/sim";
import type { WsClientMsg, WsServerMsg } from "@/types/ws";
import { createMockWorld } from "@/mocks/mockWorld";
import { clamp } from "@/utils/easing";
import { toIndex } from "@/utils/grid";
import { buildAgentBubble } from "@/utils/bubble";

const randomPick = <T,>(items: T[]) =>
  items[Math.floor(Math.random() * items.length)];

const randomId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const minutesToTicks = (minutes: number) => Math.max(0, Math.round(minutes * 60));
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

const SIM_END_MAX_TICKS = 360;
const SIM_END_STABLE_WINDOW = 30;
const SIM_END_ESCALATE_WINDOW = 20;
const SIM_END_STABLE_THRESHOLD = {
  confusionMax: 35,
  rumorMax: 25,
  officialMin: 70,
  vulnerableMin: 60,
  panicMax: 40,
  trustMin: 60,
  misinfoMax: 25,
  misallocationMax: 35,
  stabilityMin: 70,
};
const SIM_END_ESCALATE_THRESHOLD = {
  confusionMin: 85,
  rumorMin: 60,
  panicMin: 80,
  misinfoMin: 60,
  misallocationMin: 70,
};

export type MockWsConnection = {
  send: (msg: WsClientMsg) => void;
  close: () => void;
};

export const connectMockWs = (
  onMessage: (msg: WsServerMsg) => void
): MockWsConnection => {
  let world: World | undefined;
  let speed: 1 | 5 | 20 | 60 = 1;
  let paused = false;
  let interval: ReturnType<typeof setInterval> | undefined;
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

  const pickEventMessage = (type: TimelineEventType) => {
    const disaster = currentConfig?.disaster ?? "EARTHQUAKE";
    const overrides = DISASTER_EVENT_OVERRIDES[disaster]?.[type];
    const pool = overrides ?? BASE_EVENT_MESSAGES[type];
    return randomPick(pool);
  };

  const resetMetrics = () => ({
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

  const emit = (msg: WsServerMsg) => onMessage(msg);

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
    const avgStress =
      agents.reduce((sum, agent) => sum + agent.state.stress, 0) / total;
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
        simulatedMinutes: durationTicks / 60,
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
      simulatedMinutes: durationTicks / 60,
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
    const summary = buildEndSummary(reason, world.tick, durationTicks, durationSeconds, metrics);
    emit({ type: "SIM_END", summary });
  };

  const tick = () => {
    if (paused || !world || simEnded) return;
    world = { ...world, tick: world.tick + 1 };

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
              0.08 +
                misinfoFactor * 0.12 +
                clamp01(target.state.stress / 100) * 0.08
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
      if (Math.random() < mobilityHold) return;
      const neighbors = roadNeighbors(agent.pos);
      if (neighbors.length === 0) return;
    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    if (next.x === agent.pos.x && next.y === agent.pos.y) return;
    const speak = Math.random() > 0.9;
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
      const baseMessage =
        type === "RUMOR" && Math.random() < misinfoFactor * 0.55
          ? randomPick(MISINFO_EVENT_MESSAGES)
          : pickEventMessage(type);
      const event: TimelineEvent = {
        id: randomId("ev"),
        tick: world.tick,
        type,
        actors: [actor.id],
        at: actor.pos,
        message: baseMessage,
      };
      emit({ type: "EVENT", event });
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
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
      emit({
        type: "EVENT",
        event: {
          id: randomId("fact"),
          tick: world.tick,
          type: "OFFICIAL",
          actors: selected.slice(0, 2).map((agent) => agent.id),
          message: "公式: 誤情報を訂正しました。",
        },
      });
      eventCounts.OFFICIAL += 1;
    };

    runAutoFactCheck();

    if (Object.keys(diffAgents).length > 0) {
      emit({ type: "WORLD_DIFF", tick: world.tick, agents: diffAgents });
    }

    metrics = computeMetricsFromWorld(world);
    updateMetricPeaks(world.tick, metrics);
    emit({ type: "METRICS", metrics, tick: world.tick });

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

  const startSimulation = (config: SimConfig) => {
    world = createMockWorld(config);
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
    eventCounts = createEventCounts();
    emit({ type: "WORLD_INIT", world });
    startLoop();
  };

  return {
    send: (msg) => {
      if (msg.type === "INIT_SIM") {
        startSimulation(msg.config);
        return;
      }
      if (msg.type === "PAUSE") {
        if (simEnded) return;
        paused = true;
        return;
      }
      if (msg.type === "RESUME") {
        if (simEnded) return;
        paused = false;
        return;
      }
      if (msg.type === "SET_SPEED") {
        if (simEnded) return;
        speed = msg.speed;
        startLoop();
        return;
      }
      if (msg.type === "INTERVENTION") {
        if (!world || simEnded) return;
        const activeWorld = world;
        const interventionTick = activeWorld.tick;
        const kindLabel: Record<string, string> = {
          official_alert: "公式警報一斉配信",
          open_shelter: "避難所拡張",
          fact_check: "ファクトチェック",
          support_vulnerable: "要支援者支援",
          broadcast: "公式アナウンス",
          counter_rumor: "噂訂正",
          traffic_control: "交通規制",
        };
        const diffAgents: Record<string, Partial<Agent>> = {};
        const diffBuildings: Record<string, Partial<Building>> = {};
        const mergeAgentPatch = (agentId: string, patch: Partial<Agent>) => {
          const existing = activeWorld.agents[agentId];
          if (!existing) return;
          activeWorld.agents[agentId] = { ...existing, ...patch };
          diffAgents[agentId] = { ...(diffAgents[agentId] ?? {}), ...patch };
        };
        const mergeBuildingPatch = (buildingId: string, patch: Partial<Building>) => {
          const existing = activeWorld.buildings[buildingId];
          if (!existing) return;
          activeWorld.buildings[buildingId] = { ...existing, ...patch };
          diffBuildings[buildingId] = { ...(diffBuildings[buildingId] ?? {}), ...patch };
        };
        const officialAcceptance = (agent: Agent, base: number) => {
          const trustFactor = 0.4 + (agent.profile.trustLevel / 100) * 0.6;
          const rumorPenalty = clamp01(1 - agent.profile.rumorSusceptibility / 180);
          return clamp01(
            base *
              trustFactor *
              rumorPenalty *
              officialAccessibility(agent, multilingualCoverage)
          );
        };
        const event: TimelineEvent = {
          id: randomId("intervention"),
          tick: interventionTick,
          type: "INTERVENTION",
          message: `${kindLabel[msg.payload.kind] ?? msg.payload.kind}: ${
            msg.payload.message ?? "対応を実行しました"
          }`,
        };
        emit({ type: "EVENT", event });
        eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
        if (msg.payload.kind === "official_alert") {
          Object.values(activeWorld.agents).forEach((agent) => {
            if (Math.random() > officialAcceptance(agent, 0.85)) return;
            mergeAgentPatch(agent.id, {
              alertStatus: "OFFICIAL",
              bubble: buildAgentBubble(agent, {
                tick: interventionTick,
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
          Object.values(activeWorld.agents).forEach((agent) => {
            if (agent.alertStatus !== "RUMOR") return;
            if (Math.random() > officialAcceptance(agent, 0.7)) return;
            const nextState = {
              ...agent.state,
              stress: clamp(agent.state.stress - 8, 0, 100),
            };
            mergeAgentPatch(agent.id, {
              alertStatus: "OFFICIAL",
              bubble: buildAgentBubble(agent, {
                tick: interventionTick,
                kind: "OFFICIAL",
                message: msg.payload.message ?? "誤情報が訂正された",
              }),
              icon: "OFFICIAL",
              state: nextState,
            });
          });
        }

        if (msg.payload.kind === "support_vulnerable") {
          Object.values(activeWorld.agents).forEach((agent) => {
            if (isVulnerable(agent)) {
              const nextState = {
                ...agent.state,
                stress: clamp(agent.state.stress - 12, 0, 100),
              };
              mergeAgentPatch(agent.id, {
                evacStatus: agent.evacStatus === "HELPING" ? "HELPING" : "EVACUATING",
                bubble: buildAgentBubble(agent, {
                  tick: interventionTick,
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
                  tick: interventionTick,
                  kind: "SUPPORT",
                  message: msg.payload.message ?? "要支援者の誘導を開始",
                }),
                icon: "HELP",
              });
            }
          });
        }

        if (msg.payload.kind === "open_shelter") {
          Object.values(activeWorld.buildings).forEach((building) => {
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

        if (Object.keys(diffAgents).length > 0 || Object.keys(diffBuildings).length > 0) {
          emit({
            type: "WORLD_DIFF",
            tick: interventionTick,
            agents: Object.keys(diffAgents).length > 0 ? diffAgents : undefined,
            buildings: Object.keys(diffBuildings).length > 0 ? diffBuildings : undefined,
          });
        }

        metrics = computeMetricsFromWorld(activeWorld);
        updateMetricPeaks(interventionTick, metrics);
        emit({ type: "METRICS", metrics, tick: interventionTick });
        return;
      }
      if (msg.type === "SELECT_AGENT") {
        return;
      }
      if (msg.type === "SELECT_BUILDING") {
        return;
      }
    },
    close: () => {
      if (interval) clearInterval(interval);
    },
  };
};
