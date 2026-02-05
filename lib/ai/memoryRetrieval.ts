import type { Agent, TimelineEvent } from "@/types/sim";
import { embedText } from "@/lib/gcp/embeddings";
import { findNeighbors } from "@/lib/gcp/vectorSearch";
import { getMemoriesByIds, getRecentMemoriesByAgent } from "@/lib/db/memories";

export type RetrievedMemory = {
  id: string;
  content: string;
  sourceType?: string;
  createdAt?: string;
};

const buildQueryText = (agent: Agent, recentEvents: TimelineEvent[]) => {
  const recentMessages = recentEvents
    .map((event) => event.message ?? event.type)
    .filter(Boolean)
    .slice(0, 5)
    .join(" / ");

  return [
    agent.name,
    agent.job,
    agent.goal ?? "",
    agent.activity ?? "",
    `気分:${agent.state.mood}`,
    `ストレス:${agent.state.stress}`,
    `エネルギー:${agent.state.energy}`,
    recentMessages,
  ]
    .filter(Boolean)
    .join(" ");
};

const dedupeById = (memories: RetrievedMemory[]) => {
  const seen = new Set<string>();
  return memories.filter((memory) => {
    if (seen.has(memory.id)) return false;
    seen.add(memory.id);
    return true;
  });
};

export const getRelevantMemories = async (input: {
  agent: Agent;
  recentEvents?: TimelineEvent[];
  limit?: number;
}): Promise<RetrievedMemory[]> => {
  const limit = input.limit ?? 6;
  const recentEvents = input.recentEvents ?? [];
  const fallback = await getRecentMemoriesByAgent(input.agent.id, limit);

  const retrievalEnabled =
    process.env.SIM_AI_MEMORY_RETRIEVAL_ENABLED !== "false" &&
    process.env.MEMORY_PIPELINE_ENABLED === "true";

  if (!retrievalEnabled) {
    return fallback.map((memory) => ({
      id: memory.id,
      content: memory.content,
      sourceType: memory.sourceType,
      createdAt: memory.createdAt,
    }));
  }

  try {
    const query = buildQueryText(input.agent, recentEvents);
    const vector = await embedText(query);
    if (!vector) {
      return fallback.map((memory) => ({
        id: memory.id,
        content: memory.content,
        sourceType: memory.sourceType,
        createdAt: memory.createdAt,
      }));
    }
    const neighbors = await findNeighbors({ vector, neighborCount: limit * 2 });
    const memoryIds = neighbors.map((neighbor) => neighbor.id).filter(Boolean);
    if (memoryIds.length === 0) {
      return fallback.map((memory) => ({
        id: memory.id,
        content: memory.content,
        sourceType: memory.sourceType,
        createdAt: memory.createdAt,
      }));
    }

    const memories = await getMemoriesByIds(memoryIds);
    const filtered = memories.filter((memory) => memory.agentId === input.agent.id);
    const combined = dedupeById([
      ...filtered.map((memory) => ({
        id: memory.id,
        content: memory.content,
        sourceType: memory.sourceType,
        createdAt: memory.createdAt,
      })),
      ...fallback.map((memory) => ({
        id: memory.id,
        content: memory.content,
        sourceType: memory.sourceType,
        createdAt: memory.createdAt,
      })),
    ]);

    return combined.slice(0, limit);
  } catch {
    return fallback.map((memory) => ({
      id: memory.id,
      content: memory.content,
      sourceType: memory.sourceType,
      createdAt: memory.createdAt,
    }));
  }
};
