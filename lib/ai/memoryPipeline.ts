import crypto from "crypto";
import type { Agent, TimelineEvent } from "@/types/sim";
import { saveMemory } from "@/lib/db/memories";
import { embedText } from "@/lib/gcp/embeddings";
import { upsertVector } from "@/lib/gcp/vectorSearch";

export type MemorySource = "event" | "conversation" | "observation";

const buildEventMemory = (agent: Agent, event: TimelineEvent) => {
  const actorLabel = event.actors?.includes(agent.id) ? "自分" : "周囲";
  const message = event.message ?? event.type;
  return `${actorLabel}の出来事: ${message}`;
};

export const recordEventMemory = async (agent: Agent, event: TimelineEvent) => {
  const content = buildEventMemory(agent, event);
  const memoryId = crypto.randomUUID();

  await saveMemory({
    id: memoryId,
    agentId: agent.id,
    content,
    sourceType: "event",
    eventId: event.id,
    metadata: {
      tick: event.tick,
      type: event.type,
    },
  });

  if (process.env.MEMORY_PIPELINE_ENABLED !== "true") return;

  const vector = await embedText(content);
  await upsertVector({
    id: memoryId,
    vector,
    metadata: {
      agentId: agent.id,
      type: event.type,
    },
  });
};
