import type { TimelineEventType, VectorClusterSummary, VectorInsights } from "@/types/sim";
import { embedText } from "@/lib/gcp/embeddings";
import { findNeighbors } from "@/lib/gcp/vectorSearch";
import { getMemoriesByIds, getRecentMemories } from "@/lib/db/memories";
import { isDbConfigured } from "@/lib/db/mysql";

const CLUSTER_LABELS: Record<string, string> = {
  RUMOR: "噂系クラスタ",
  OFFICIAL: "公式系クラスタ",
  ALERT: "警報系クラスタ",
  EVACUATE: "避難系クラスタ",
  SUPPORT: "支援系クラスタ",
  CHECKIN: "安否系クラスタ",
  TALK: "会話系クラスタ",
  MOVE: "移動系クラスタ",
  ACTIVITY: "生活系クラスタ",
  INTERVENTION: "介入系クラスタ",
};

const MAX_RECENT_MEMORIES = 80;
const MAX_CLUSTERS = 3;
const MAX_CLUSTER_NEIGHBORS = 8;
const MAX_RUMOR_SEEDS = 3;

const trimText = (text: string, max = 64) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const parseEventType = (
  metadata: Record<string, unknown> | null
): TimelineEventType | "OTHER" => {
  const value = metadata?.type;
  return typeof value === "string" ? (value as TimelineEventType) : "OTHER";
};

type MemoryWithType = {
  id: string;
  content: string;
  type: TimelineEventType | "OTHER";
  metadata?: Record<string, unknown> | null;
};

const countTypes = (items: Array<{ type: TimelineEventType | "OTHER" }>) => {
  const counts = new Map<TimelineEventType | "OTHER", number>();
  items.forEach((item) => {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
};

const hasVectorConfig = () =>
  Boolean(
    process.env.VERTEX_VECTOR_ENDPOINT_ID && process.env.VERTEX_VECTOR_DEPLOYED_INDEX_ID
  );

export const getVectorInsightsBootstrap = (): VectorInsights => {
  if (process.env.AI_ENABLED === "false") {
    return {
      status: "disabled",
      reason: "AI_ENABLED is false",
      clusters: [],
    };
  }
  if (process.env.MEMORY_PIPELINE_ENABLED !== "true") {
    return {
      status: "disabled",
      reason: "MEMORY_PIPELINE_ENABLED is false",
      clusters: [],
    };
  }
  if (!isDbConfigured()) {
    return {
      status: "unavailable",
      reason: "Database is not configured",
      clusters: [],
    };
  }
  if (!hasVectorConfig()) {
    return {
      status: "unavailable",
      reason: "Vector Search endpoint is not configured",
      clusters: [],
    };
  }
  return { status: "pending", clusters: [] };
};

const resolveNeighbors = async (content: string) => {
  const vector = await embedText(content);
  if (!vector) return [];
  const neighbors = await findNeighbors({
    vector,
    neighborCount: MAX_CLUSTER_NEIGHBORS,
  });
  const ids = neighbors.map((neighbor) => neighbor.id);
  const memories = await getMemoriesByIds(ids);
  const memoryMap = new Map(memories.map((memory) => [memory.id, memory]));
  const resolved = neighbors
    .map((neighbor) => {
      const memory = memoryMap.get(neighbor.id);
      if (!memory) return null;
      const type = parseEventType(memory.metadata ?? null);
      return {
        id: memory.id,
        content: memory.content,
        type,
        distance: neighbor.distance,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return resolved;
};

export const generateVectorInsights = async (): Promise<VectorInsights> => {
  try {
    const base = getVectorInsightsBootstrap();
    if (base.status !== "pending") return base;

    const memories = await getRecentMemories(MAX_RECENT_MEMORIES);
    if (memories.length === 0) {
      return {
        status: "unavailable",
        reason: "No memories found",
        clusters: [],
      };
    }

    const memoriesWithType: MemoryWithType[] = memories.map((memory) => ({
      ...memory,
      type: parseEventType(memory.metadata ?? null),
    }));

    const grouped = new Map<TimelineEventType | "OTHER", MemoryWithType[]>();
    memoriesWithType.forEach((memory) => {
      const bucket = grouped.get(memory.type) ?? ([] as MemoryWithType[]);
      bucket.push(memory);
      grouped.set(memory.type, bucket);
    });

    const seedTypes = Array.from(grouped.entries())
      .filter(([type]) => type !== "OTHER")
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_CLUSTERS)
      .map(([type]) => type);

    const clusters: VectorClusterSummary[] = [];
    for (const type of seedTypes) {
      const seed = grouped.get(type)?.[0];
      if (!seed) continue;
      const neighbors = await resolveNeighbors(seed.content);
      const typeCounts = countTypes(neighbors);
      clusters.push({
        label: CLUSTER_LABELS[type] ?? `${type}系クラスタ`,
        count: neighbors.length,
        representative: trimText(seed.content),
        topTypes: typeCounts.slice(0, 3),
      });
    }

    const rumorSeeds = (grouped.get("RUMOR") ?? []).slice(0, MAX_RUMOR_SEEDS);
    let rumorSamples = 0;
    let neighborSamples = 0;
    let officialLike = 0;
    for (const rumor of rumorSeeds) {
      const neighbors = await resolveNeighbors(rumor.content);
      rumorSamples += 1;
      neighbors.forEach((neighbor) => {
        neighborSamples += 1;
        if (neighbor.type === "OFFICIAL" || neighbor.type === "ALERT") {
          officialLike += 1;
        }
      });
    }

    const score =
      neighborSamples > 0
        ? Math.round((officialLike / neighborSamples) * 100)
        : 0;

    return {
      status: "ready",
      clusters,
      rumorOverlap: {
        score,
        rumorSamples,
        neighborSamples,
        officialLike,
      },
    };
  } catch (error) {
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "Vector insights failed",
      clusters: [],
    };
  }
};
