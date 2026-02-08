import { create } from "zustand";
import type {
  Agent,
  AgentId,
  AgentReasoning,
  Building,
  BuildingId,
  Metrics,
  SimEndSummary,
  TimelineEvent,
  TimelineEventType,
  World,
} from "@/types/sim";
import { ACTIVITY_LABELS } from "@/utils/activity";

const MAX_TIMELINE = 120;
const METRICS_HISTORY_LIMIT = 600;

const buildReasoning = (agent: Agent): AgentReasoning => ({
  agentId: agent.id,
  why: `${agent.name}は「${agent.goal ?? "状況確認"}」を優先しています。現在は${
    agent.activity ? ACTIVITY_LABELS[agent.activity] : "行動中"
  }で、公式情報の信頼度は${agent.profile.trustLevel}、噂への感受性は${
    agent.profile.rumorSusceptibility
  }です。`,
  memoryRefs: [
    {
      title: "近所の噂",
      text: "橋が危ないという話が広がり、周囲の様子を見に行くことにした。",
    },
    {
      title: "公式掲示",
      text: "避難所の開設情報を確認し、避難判断に反映した。",
    },
    {
      title: "友人の連絡",
      text: "安否確認のため連絡を取り合っている。",
    },
  ],
});

type SimState = {
  world?: World;
  metrics?: Metrics;
  metricsTick?: number;
  connectionReady: boolean;
  metricsHistory: Array<{ tick: number; metrics: Metrics }>;
  timeline: TimelineEvent[];
  selected: { agentId?: AgentId; buildingId?: BuildingId };
  hovered: { buildingId?: BuildingId; agentId?: AgentId };
  ui: { speed: 1 | 5 | 20 | 60; paused: boolean; filters: TimelineEventType[] };
  reasoning: Record<AgentId, AgentReasoning>;
  sim: { ended: boolean; summary?: SimEndSummary };
  setWorld: (world: World) => void;
  applyWorldDiff: (diff: {
    tick: number;
    agents?: Record<AgentId, Partial<Agent>>;
    buildings?: Record<BuildingId, Partial<Building>>;
  }) => void;
  addEvent: (event: TimelineEvent) => void;
  setMetrics: (metrics: Metrics, tick: number) => void;
  setReasoning: (reasoning: AgentReasoning) => void;
  setSimEnd: (summary: SimEndSummary) => void;
  setConnectionReady: (ready: boolean) => void;
  resetSim: () => void;
  selectAgent: (agentId: AgentId) => void;
  selectBuilding: (buildingId: BuildingId) => void;
  setHoveredBuilding: (buildingId?: BuildingId) => void;
  setHoveredAgent: (agentId?: AgentId) => void;
  clearHover: () => void;
  clearSelection: () => void;
  clearFocus: () => void;
  togglePause: () => void;
  setSpeed: (speed: 1 | 5 | 20 | 60) => void;
  toggleFilter: (type: TimelineEventType) => void;
};

export const useSimStore = create<SimState>((set, get) => ({
  world: undefined,
  metrics: undefined,
  metricsTick: undefined,
  connectionReady: false,
  metricsHistory: [],
  timeline: [],
  selected: {},
  hovered: {},
  ui: {
    speed: 1,
    paused: false,
    filters: [
      "ALERT",
      "OFFICIAL",
      "RUMOR",
      "EVACUATE",
      "SUPPORT",
      "CHECKIN",
      "ACTIVITY",
      "MOVE",
      "TALK",
      "INTERVENTION",
    ],
  },
  reasoning: {},
  sim: { ended: false },
  setWorld: (world) => set({ world }),
  applyWorldDiff: (diff) => {
    const current = get().world;
    if (!current) return;
    const nextAgents = { ...current.agents };
    if (diff.agents) {
      Object.entries(diff.agents).forEach(([id, patch]) => {
        const existing = nextAgents[id];
        if (existing) {
          nextAgents[id] = { ...existing, ...patch };
        } else if (patch) {
          nextAgents[id] = patch as Agent;
        }
      });
    }
    const nextBuildings = { ...current.buildings };
    if (diff.buildings) {
      Object.entries(diff.buildings).forEach(([id, patch]) => {
        const existing = nextBuildings[id];
        if (existing) {
          nextBuildings[id] = { ...existing, ...patch };
        } else if (patch) {
          nextBuildings[id] = patch as Building;
        }
      });
    }
    set({
      world: {
        ...current,
        tick: diff.tick,
        agents: nextAgents,
        buildings: nextBuildings,
      },
    });
  },
  addEvent: (event) =>
    set((state) => ({
      timeline: [event, ...state.timeline].slice(0, MAX_TIMELINE),
    })),
  setMetrics: (metrics, tick) =>
    set((state) => ({
      metrics,
      metricsTick: tick,
      metricsHistory: [...state.metricsHistory, { tick, metrics }].slice(
        -METRICS_HISTORY_LIMIT
      ),
    })),
  setReasoning: (reasoning) =>
    set((state) => ({
      reasoning: { ...state.reasoning, [reasoning.agentId]: reasoning },
    })),
  setSimEnd: (summary) =>
    set((state) => ({
      sim: { ended: true, summary },
      ui: { ...state.ui, paused: true },
    })),
  setConnectionReady: (ready) => set({ connectionReady: ready }),
  resetSim: () =>
    set((state) => ({
      world: undefined,
      metrics: undefined,
      metricsTick: undefined,
      metricsHistory: [],
      timeline: [],
      selected: {},
      hovered: {},
      reasoning: {},
      sim: { ended: false, summary: undefined },
      ui: { ...state.ui, paused: false },
    })),
  selectAgent: (agentId) => {
    const world = get().world;
    if (!world) return;
    const agent = world.agents[agentId];
    if (!agent) return;
    set((state) => ({
      selected: { agentId },
      hovered: {},
      reasoning: state.reasoning[agentId]
        ? state.reasoning
        : { ...state.reasoning, [agentId]: buildReasoning(agent) },
    }));
  },
  selectBuilding: (buildingId) => set({ selected: { buildingId }, hovered: {} }),
  setHoveredBuilding: (buildingId) => {
    const selected = get().selected;
    if (selected.agentId || selected.buildingId) return;
    if (!buildingId) {
      set({ hovered: {} });
      return;
    }
    set({ hovered: { buildingId, agentId: undefined } });
  },
  setHoveredAgent: (agentId) => {
    const selected = get().selected;
    if (selected.agentId || selected.buildingId) return;
    if (!agentId) {
      set({ hovered: {} });
      return;
    }
    set({ hovered: { agentId, buildingId: undefined } });
  },
  clearHover: () => set({ hovered: {} }),
  clearSelection: () => set({ selected: {} }),
  clearFocus: () => set({ selected: {}, hovered: {} }),
  togglePause: () => set((state) => ({ ui: { ...state.ui, paused: !state.ui.paused } })),
  setSpeed: (speed) => set((state) => ({ ui: { ...state.ui, speed } })),
  toggleFilter: (type) =>
    set((state) => {
      const exists = state.ui.filters.includes(type);
      const filters = exists
        ? state.ui.filters.filter((item) => item !== type)
        : [...state.ui.filters, type];
      return { ui: { ...state.ui, filters } };
    }),
}));
