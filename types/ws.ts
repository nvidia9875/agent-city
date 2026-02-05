import type {
  Agent,
  AgentReasoning,
  Building,
  BuildingId,
  AgentId,
  Metrics,
  TimelineEvent,
  World,
  SimConfig,
  SimEndSummary,
} from "./sim";

export type WsServerMsg =
  | { type: "WORLD_INIT"; world: World }
  | {
      type: "WORLD_DIFF";
      tick: number;
      agents?: Record<AgentId, Partial<Agent>>;
      buildings?: Record<BuildingId, Partial<Building>>;
    }
  | { type: "EVENT_LOG"; event: TimelineEvent }
  | { type: "EVENT"; event: TimelineEvent }
  | { type: "METRICS"; metrics: Metrics; tick: number }
  | { type: "SIM_END"; summary: SimEndSummary }
  | { type: "AGENT_REASONING"; payload: AgentReasoning }
  | { type: "ERROR"; message: string };

export type WsClientMsg =
  | { type: "SUBSCRIBE"; sessionId: string }
  | { type: "INIT_SIM"; config: SimConfig }
  | { type: "PAUSE" | "RESUME" }
  | { type: "SET_SPEED"; speed: 1 | 5 | 20 | 60 }
  | {
      type: "INTERVENTION";
      payload: { kind: string; message?: string; target?: unknown };
    }
  | { type: "SELECT_AGENT"; agentId: string }
  | { type: "SELECT_BUILDING"; buildingId: string };
