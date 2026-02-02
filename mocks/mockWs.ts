import type {
  TimelineEvent,
  Metrics,
  Agent,
  TimelineEventType,
  SimConfig,
  World,
} from "@/types/sim";
import type { WsClientMsg, WsServerMsg } from "@/types/ws";
import { createMockWorld } from "@/mocks/mockWorld";
import { clamp } from "@/utils/easing";
import { toIndex } from "@/utils/grid";

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

  const resetMetrics = () => ({
    confusion: 34,
    rumorSpread: 26,
    officialReach: 42,
    vulnerableReach: 22,
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

  const tick = () => {
    if (paused || !world) return;
    world = { ...world, tick: world.tick + 1 };

    const diffAgents: Record<string, Partial<Agent>> = {};

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

    if (Object.keys(diffAgents).length > 0) {
      emit({ type: "WORLD_DIFF", tick: world.tick, agents: diffAgents });
    }

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
      emit({ type: "EVENT", event });
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
    emit({ type: "METRICS", metrics, tick: world.tick });
  };

  const startLoop = () => {
    if (!world) return;
    if (interval) clearInterval(interval);
    interval = setInterval(tick, 1000 / speed);
  };

  const startSimulation = (config: SimConfig) => {
    world = createMockWorld(config);
    paused = false;
    metrics = resetMetrics();
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
        paused = true;
        return;
      }
      if (msg.type === "RESUME") {
        paused = false;
        return;
      }
      if (msg.type === "SET_SPEED") {
        speed = msg.speed;
        startLoop();
        return;
      }
      if (msg.type === "INTERVENTION") {
        if (!world) return;
        const kindLabel: Record<string, string> = {
          official_alert: "公式警報一斉配信",
          open_shelter: "避難所拡張",
          fact_check: "ファクトチェック",
          support_vulnerable: "要支援者支援",
          broadcast: "公式アナウンス",
          counter_rumor: "噂訂正",
          traffic_control: "交通規制",
        };
        const event: TimelineEvent = {
          id: randomId("intervention"),
          tick: world.tick,
          type: "INTERVENTION",
          message: `${kindLabel[msg.payload.kind] ?? msg.payload.kind}: ${
            msg.payload.message ?? "対応を実行しました"
          }`,
        };
        emit({ type: "EVENT", event });
        metrics = {
          confusion: jitter(metrics.confusion, 10),
          rumorSpread: jitter(metrics.rumorSpread, 10),
          officialReach: jitter(metrics.officialReach, 8),
          vulnerableReach: jitter(metrics.vulnerableReach, 8),
        };
        emit({ type: "METRICS", metrics, tick: world.tick });
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
