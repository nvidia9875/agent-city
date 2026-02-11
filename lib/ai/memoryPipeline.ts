import crypto from "crypto";
import type { Agent, TimelineEvent } from "@/types/sim";
import { saveMemory } from "@/lib/db/memories";
import { embedText } from "@/lib/gcp/embeddings";
import { upsertVector } from "@/lib/gcp/vectorSearch";

export type MemorySource =
  | "event"
  | "conversation"
  | "observation"
  | "reflection"
  | "plan";

let activeSimulationId: string | undefined;

export const setMemoryPipelineSimulationId = (simulationId?: string) => {
  activeSimulationId = simulationId;
};

const mergeSimulationMetadata = (
  metadata?: Record<string, unknown>
): Record<string, unknown> | undefined => {
  if (!activeSimulationId) {
    return metadata;
  }
  return {
    ...(metadata ?? {}),
    simulation_id: activeSimulationId,
  };
};

const buildEventMemory = (agent: Agent, event: TimelineEvent) => {
  const actorLabel = event.actors?.includes(agent.id) ? "自分" : "周囲";
  const message = event.message ?? event.type;
  return `${actorLabel}の出来事: ${message}`;
};

export const recordEventMemory = async (agent: Agent, event: TimelineEvent) => {
  try {
    const content = buildEventMemory(agent, event);
    const memoryId = crypto.randomUUID();
    const metadata = mergeSimulationMetadata({
      tick: event.tick,
      type: event.type,
      interventionKind: event.meta?.interventionKind,
      comboKey: event.meta?.comboKey,
    });

    await saveMemory({
      id: memoryId,
      agentId: agent.id,
      content,
      sourceType: "event",
      eventId: event.id,
      metadata,
    });

    if (process.env.MEMORY_PIPELINE_ENABLED !== "true") return;

    const vector = await embedText(content);
    if (!vector) return;
    await upsertVector({
      id: memoryId,
      vector,
      metadata: {
        agentId: agent.id,
        type: event.type,
        ...(activeSimulationId ? { simulation_id: activeSimulationId } : {}),
      },
    });
  } catch (error) {
    // Keep the simulation running even if the memory pipeline fails.
    console.warn("[memory] recordEventMemory failed", error);
  }
};

export const recordAgentMemory = async (input: {
  agent: Agent;
  content: string;
  sourceType: MemorySource;
  metadata?: Record<string, unknown>;
}) => {
  try {
    const memoryId = crypto.randomUUID();
    const metadata = mergeSimulationMetadata(input.metadata);
    await saveMemory({
      id: memoryId,
      agentId: input.agent.id,
      content: input.content,
      sourceType: input.sourceType,
      metadata,
    });

    if (process.env.MEMORY_PIPELINE_ENABLED !== "true") return;

    const vector = await embedText(input.content);
    if (!vector) return;
    await upsertVector({
      id: memoryId,
      vector,
      metadata: {
        agentId: input.agent.id,
        type: input.sourceType,
        ...(activeSimulationId ? { simulation_id: activeSimulationId } : {}),
      },
    });
  } catch (error) {
    console.warn("[memory] recordAgentMemory failed", error);
  }
};
