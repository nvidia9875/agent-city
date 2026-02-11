import type {
  TimelineEventType,
  VectorClusterSummary,
  VectorConversationMood,
  VectorConversationThread,
  VectorInsights,
  VectorInsightsDiagnostics,
} from "@/types/sim";
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

const THREAD_TYPE_LABELS: Record<string, string> = {
  TALK: "会話ライン",
  RUMOR: "噂ライン",
  OFFICIAL: "公式ライン",
  ALERT: "警報ライン",
  CHECKIN: "安否ライン",
};

const MAX_RECENT_MEMORIES = 120;
const MAX_CLUSTERS = 3;
const MAX_CLUSTER_NEIGHBORS = 8;
const MAX_RUMOR_SEEDS = 3;
const MAX_CONVERSATION_THREADS = 6;
const MAX_CONVERSATION_NEIGHBORS = 12;
const MAX_THREAD_TURNS = 6;
const MIN_THREAD_TURNS = 2;
const MIN_FALLBACK_THREAD_TURNS = 1;
const TIMELINE_WINDOW_TICKS = 60;
const TIMELINE_LINK_WINDOW_TICKS = 10;
const MAX_FALLBACK_UNTICKED_MEMORIES = 32;
const TIMELINE_TYPES: TimelineEventType[] = [
  "MOVE",
  "TALK",
  "RUMOR",
  "OFFICIAL",
  "ALERT",
  "EVACUATE",
  "SUPPORT",
  "CHECKIN",
  "INTERVENTION",
  "ACTIVITY",
];
const CONVERSATION_TYPES = new Set<TimelineEventType>([
  "TALK",
  "RUMOR",
  "OFFICIAL",
  "ALERT",
  "CHECKIN",
]);
const CONVERSATION_TYPE_PRIORITY: TimelineEventType[] = [
  "RUMOR",
  "OFFICIAL",
  "ALERT",
  "CHECKIN",
  "TALK",
];
const TIMELINE_TYPE_SET = new Set(TIMELINE_TYPES);

const trimText = (text: string, max = 64) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const stripMemoryPrefix = (text: string) =>
  text.replace(/^(自分|周囲)の出来事:\s*/, "").trim();

const toTimelineType = (value: unknown): TimelineEventType | null => {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase() as TimelineEventType;
  return TIMELINE_TYPE_SET.has(normalized) ? normalized : null;
};

const parseEventType = (
  metadata: Record<string, unknown> | null,
  sourceType?: string
): TimelineEventType | "OTHER" => {
  const metadataType = toTimelineType(metadata?.type);
  if (metadataType) return metadataType;

  const eventType = toTimelineType(metadata?.eventType);
  if (eventType) return eventType;

  const sourceEventType = toTimelineType(sourceType);
  if (sourceEventType) return sourceEventType;

  return "OTHER";
};

const parseTick = (metadata: Record<string, unknown> | null) => {
  const value = metadata?.tick;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

type MemoryWithType = {
  id: string;
  agentId: string;
  content: string;
  type: TimelineEventType | "OTHER";
  sourceType: string;
  metadata?: Record<string, unknown> | null;
  tick?: number;
};

type ResolvedNeighbor = {
  id: string;
  agentId: string;
  content: string;
  type: TimelineEventType | "OTHER";
  distance: number;
  tick?: number;
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

const dedupeById = <T extends { id: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const hasVectorEndpoint = () => Boolean(process.env.VERTEX_VECTOR_ENDPOINT_ID);

type NeighborResolution = {
  items: ResolvedNeighbor[];
  issue: NonNullable<VectorClusterSummary["issue"]>;
  neighborCount: number;
  unresolvedCount: number;
};

const createDiagnostics = (): VectorInsightsDiagnostics => ({
  embedSkipped: 0,
  neighborQueries: 0,
  emptyNeighborResults: 0,
  resolvedNeighborSamples: 0,
  unresolvedNeighborSamples: 0,
});

const collectResolution = (
  diagnostics: VectorInsightsDiagnostics,
  resolution: NeighborResolution
) => {
  diagnostics.neighborQueries += 1;
  diagnostics.resolvedNeighborSamples += resolution.items.length;
  diagnostics.unresolvedNeighborSamples += resolution.unresolvedCount;
  if (resolution.issue === "EMBEDDING_COOLDOWN") {
    diagnostics.embedSkipped += 1;
  }
  if (resolution.issue === "NO_NEIGHBORS") {
    diagnostics.emptyNeighborResults += 1;
  }
};

const resolveFailureReason = (
  diagnostics: VectorInsightsDiagnostics,
  fallback?: string
) => {
  if (diagnostics.embedSkipped > 0) {
    return "Embedding がクールダウン中のため近傍検索がスキップされました。";
  }
  if (diagnostics.emptyNeighborResults > 0) {
    return "Vector Search から近傍データが返りませんでした。";
  }
  if (diagnostics.unresolvedNeighborSamples > 0) {
    return "Vector ID と Memory DB の照合に失敗しました。";
  }
  return fallback;
};

const isConversationType = (
  type: TimelineEventType | "OTHER"
): type is TimelineEventType => type !== "OTHER" && CONVERSATION_TYPES.has(type);

const resolveThreadMood = (
  rumorCount: number,
  officialCount: number,
  total: number
): VectorConversationMood => {
  const rumorShare = rumorCount / Math.max(1, total);
  const officialShare = officialCount / Math.max(1, total);
  if (officialShare >= rumorShare + 0.2) return "STABILIZING";
  if (rumorShare > officialShare) return "ESCALATING";
  return "CONTESTED";
};

const buildThreadTitle = (
  seed: MemoryWithType,
  dominantType: TimelineEventType | "OTHER"
) => {
  const prefix = THREAD_TYPE_LABELS[dominantType] ?? "会話ライン";
  const topic = trimText(stripMemoryPrefix(seed.content), 28);
  return `${prefix}: ${topic}`;
};

const toResolvedNeighbor = (memory: MemoryWithType, distance = 0): ResolvedNeighbor => ({
  id: memory.id,
  agentId: memory.agentId,
  content: memory.content,
  type: memory.type,
  distance,
  tick: memory.tick,
});

const limitToRecentConversationWindow = <T extends MemoryWithType>(memories: T[]) => {
  const tickValues = memories
    .map((memory) => memory.tick)
    .filter((tick): tick is number => typeof tick === "number");
  if (tickValues.length === 0) {
    return memories.slice(0, MAX_FALLBACK_UNTICKED_MEMORIES);
  }
  const latestTick = Math.max(...tickValues);
  return memories.filter(
    (memory, index) =>
      (typeof memory.tick === "number" &&
        memory.tick >= latestTick - TIMELINE_WINDOW_TICKS) ||
      (typeof memory.tick !== "number" && index < MAX_FALLBACK_UNTICKED_MEMORIES)
  );
};

const buildConversationSeeds = (
  memories: Array<MemoryWithType & { type: TimelineEventType }>,
  limit = MAX_CONVERSATION_THREADS
): Array<MemoryWithType & { type: TimelineEventType }> => {
  const bucketByType = new Map<
    TimelineEventType,
    Array<MemoryWithType & { type: TimelineEventType }>
  >();
  memories.forEach((memory) => {
    const bucket = bucketByType.get(memory.type) ?? [];
    bucket.push(memory);
    bucketByType.set(memory.type, bucket);
  });
  return dedupeById([
    ...CONVERSATION_TYPE_PRIORITY.map((type) => bucketByType.get(type)?.[0]).filter(
      (memory): memory is MemoryWithType & { type: TimelineEventType } =>
        Boolean(memory)
    ),
    ...memories,
  ]).slice(0, limit);
};

const buildTimelineNeighbors = (input: {
  seed: MemoryWithType;
  pool: MemoryWithType[];
  limit: number;
}) => {
  const seedIndex = input.pool.findIndex((memory) => memory.id === input.seed.id);
  return input.pool
    .filter((memory, index) => {
      if (memory.id === input.seed.id) return false;
      if (typeof input.seed.tick === "number" && typeof memory.tick === "number") {
        return Math.abs(memory.tick - input.seed.tick) <= TIMELINE_LINK_WINDOW_TICKS;
      }
      if (seedIndex < 0) return false;
      return Math.abs(index - seedIndex) <= TIMELINE_LINK_WINDOW_TICKS;
    })
    .slice(0, input.limit)
    .map((memory) => toResolvedNeighbor(memory, 1));
};

const resolveReversal = (input: {
  conversationItems: ResolvedNeighbor[];
  interventionTicks: number[];
}) => {
  const sorted = input.conversationItems
    .filter((item) => typeof item.tick === "number")
    .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
  if (sorted.length < 2 || input.interventionTicks.length === 0) {
    return {};
  }

  const interventionTicksAsc = [...input.interventionTicks].sort((a, b) => a - b);
  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    if (!item || (item.type !== "OFFICIAL" && item.type !== "ALERT")) continue;
    const currentTick = item.tick;
    if (typeof currentTick !== "number") continue;

    const hadRumorBefore = sorted
      .slice(0, index)
      .some((prev) => prev.type === "RUMOR");
    if (!hadRumorBefore) continue;

    const interventionTick = [...interventionTicksAsc]
      .reverse()
      .find((tick) => tick <= currentTick);
    if (typeof interventionTick !== "number") continue;

    const rumorBeforeIntervention = sorted.some(
      (turn) =>
        turn.type === "RUMOR" &&
        typeof turn.tick === "number" &&
        turn.tick <= currentTick &&
        turn.tick >= interventionTick - 6
    );
    if (!rumorBeforeIntervention) continue;

    return {
      reversalTick: currentTick,
      reversalInterventionTick: interventionTick,
    };
  }

  return {};
};

const buildThreadFromItems = (input: {
  seed: MemoryWithType;
  items: ResolvedNeighbor[];
  interventionTicks: number[];
  minTurns: number;
}): VectorConversationThread | null => {
  const conversationItems = dedupeById(input.items).filter((item) =>
    isConversationType(item.type)
  );
  if (conversationItems.length < input.minTurns) return null;

  const sortedByTick = [...conversationItems].sort(
    (a, b) => (b.tick ?? -1) - (a.tick ?? -1)
  );
  const dominantTypes = countTypes(conversationItems).slice(0, 3);
  const dominantType = dominantTypes[0]?.type ?? input.seed.type;

  const rumorCount = conversationItems.filter((item) => item.type === "RUMOR").length;
  const officialCount = conversationItems.filter(
    (item) => item.type === "OFFICIAL" || item.type === "ALERT"
  ).length;
  const contamination = Math.round(
    (rumorCount / Math.max(1, conversationItems.length)) * 100
  );
  const participantCount = new Set(
    conversationItems.map((item) => item.agentId).filter(Boolean)
  ).size;

  const ticks = conversationItems
    .map((item) => item.tick)
    .filter((tick): tick is number => typeof tick === "number");
  const tickStart = ticks.length > 0 ? Math.min(...ticks) : undefined;
  const tickEnd = ticks.length > 0 ? Math.max(...ticks) : undefined;
  const { reversalTick, reversalInterventionTick } = resolveReversal({
    conversationItems,
    interventionTicks: input.interventionTicks,
  });

  return {
    id: input.seed.id,
    title: buildThreadTitle(input.seed, dominantType),
    mood: resolveThreadMood(rumorCount, officialCount, conversationItems.length),
    contamination,
    participantCount,
    turnCount: conversationItems.length,
    tickStart,
    tickEnd,
    reversalTick,
    reversalInterventionTick,
    lead: trimText(stripMemoryPrefix(input.seed.content), 80),
    dominantTypes,
    turns: sortedByTick.slice(0, MAX_THREAD_TURNS).map((item) => ({
      id: item.id,
      speakerId: item.agentId,
      type: item.type,
      text: trimText(stripMemoryPrefix(item.content), 88),
      tick: item.tick,
      distance: item.distance,
    })),
  };
};

const rankConversationThreads = (threads: VectorConversationThread[]) => {
  const seenLead = new Set<string>();
  return threads
    .filter((thread) => {
      if (seenLead.has(thread.lead)) return false;
      seenLead.add(thread.lead);
      return true;
    })
    .sort((a, b) => {
      if (b.turnCount !== a.turnCount) return b.turnCount - a.turnCount;
      return b.contamination - a.contamination;
    });
};

const buildTimelineFallbackThreads = (input: {
  recentConversationMemories: Array<MemoryWithType & { type: TimelineEventType }>;
  interventionTicks: number[];
}) => {
  const threads: VectorConversationThread[] = [];
  const seeds = buildConversationSeeds(
    input.recentConversationMemories,
    MAX_CONVERSATION_THREADS * 2
  );

  for (const seed of seeds) {
    if (threads.length >= MAX_CONVERSATION_THREADS) break;
    const timelineNeighbors = buildTimelineNeighbors({
      seed,
      pool: input.recentConversationMemories,
      limit: Math.max(0, MAX_THREAD_TURNS - 1),
    });
    const thread = buildThreadFromItems({
      seed,
      items: [toResolvedNeighbor(seed, 0), ...timelineNeighbors],
      interventionTicks: input.interventionTicks,
      minTurns: MIN_FALLBACK_THREAD_TURNS,
    });
    if (!thread) continue;
    threads.push(thread);
  }

  return rankConversationThreads(threads).slice(0, MAX_CONVERSATION_THREADS);
};

const buildConversationThreads = async (input: {
  memoriesWithType: MemoryWithType[];
  diagnostics: VectorInsightsDiagnostics;
  interventionTicks: number[];
  simulationId?: string;
}): Promise<VectorConversationThread[]> => {
  const conversationMemories = input.memoriesWithType
    .filter((memory) => isConversationType(memory.type))
    .filter((memory) => memory.content.trim().length > 0) as Array<
    MemoryWithType & { type: TimelineEventType }
  >;
  if (conversationMemories.length === 0) return [];
  const recentConversationMemories = limitToRecentConversationWindow(
    conversationMemories
  );
  const conversationSeeds = buildConversationSeeds(
    recentConversationMemories,
    MAX_CONVERSATION_THREADS
  );

  const threads: VectorConversationThread[] = [];

  for (const seed of conversationSeeds) {
    const resolution = await resolveNeighbors(
      seed.content,
      MAX_CONVERSATION_NEIGHBORS,
      input.simulationId
    );
    collectResolution(input.diagnostics, resolution);

    const conversationNeighbors = resolution.items
      .filter((item) => item.id !== seed.id)
      .filter((item) => isConversationType(item.type));

    const timelineNeighbors =
      conversationNeighbors.length >= MIN_THREAD_TURNS - 1
        ? []
        : buildTimelineNeighbors({
            seed,
            pool: recentConversationMemories,
            limit: Math.max(0, MAX_THREAD_TURNS - 1),
          });

    const thread = buildThreadFromItems({
      seed,
      items: [
        toResolvedNeighbor(seed, 0),
        ...conversationNeighbors,
        ...timelineNeighbors,
      ],
      interventionTicks: input.interventionTicks,
      minTurns: MIN_THREAD_TURNS,
    });
    if (!thread) continue;
    threads.push(thread);
  }

  const rankedThreads = rankConversationThreads(threads);
  if (rankedThreads.length >= MAX_CONVERSATION_THREADS) {
    return rankedThreads.slice(0, MAX_CONVERSATION_THREADS);
  }

  const fallbackThreads = buildTimelineFallbackThreads({
    recentConversationMemories,
    interventionTicks: input.interventionTicks,
  });
  const merged = rankConversationThreads([...rankedThreads, ...fallbackThreads]);
  return merged.slice(0, MAX_CONVERSATION_THREADS);
};

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
  if (!hasVectorEndpoint()) {
    return {
      status: "unavailable",
      reason: "VERTEX_VECTOR_ENDPOINT_ID is not set",
      clusters: [],
    };
  }
  return { status: "pending", clusters: [] };
};

const resolveNeighbors = async (
  content: string,
  neighborCount = MAX_CLUSTER_NEIGHBORS,
  simulationId?: string
): Promise<NeighborResolution> => {
  const vector = await embedText(content);
  if (!vector) {
    return {
      items: [],
      issue: "EMBEDDING_COOLDOWN",
      neighborCount: 0,
      unresolvedCount: 0,
    };
  }
  const neighbors = await findNeighbors({
    vector,
    neighborCount,
  });
  if (neighbors.length === 0) {
    return {
      items: [],
      issue: "NO_NEIGHBORS",
      neighborCount: 0,
      unresolvedCount: 0,
    };
  }
  const ids = neighbors.map((neighbor) => neighbor.id);
  const memories = await getMemoriesByIds(ids, simulationId);
  const memoryMap = new Map(memories.map((memory) => [memory.id, memory]));
  const resolved = neighbors
    .map((neighbor) => {
      const memory = memoryMap.get(neighbor.id);
      if (!memory) return null;
      const type = parseEventType(memory.metadata ?? null, memory.sourceType);
      return {
        id: memory.id,
        agentId: memory.agentId,
        content: memory.content,
        type,
        distance: neighbor.distance,
        tick: parseTick(memory.metadata ?? null),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const unresolvedCount = Math.max(0, neighbors.length - resolved.length);
  return {
    items: resolved,
    issue: unresolvedCount > 0 ? "MISSING_MEMORY_LINKS" : "NONE",
    neighborCount: neighbors.length,
    unresolvedCount,
  };
};

export const generateVectorInsights = async (input?: {
  simulationId?: string;
}): Promise<VectorInsights> => {
  try {
    const base = getVectorInsightsBootstrap();
    if (base.status !== "pending") return base;

    const memories = await getRecentMemories(
      MAX_RECENT_MEMORIES,
      input?.simulationId
    );
    if (memories.length === 0) {
      return {
        status: "unavailable",
        reason: "No memories found",
        clusters: [],
      };
    }

    const memoriesWithType: MemoryWithType[] = memories.map((memory) => ({
      ...memory,
      sourceType: memory.sourceType,
      type: parseEventType(memory.metadata ?? null, memory.sourceType),
      tick: parseTick(memory.metadata ?? null),
    }));

    const grouped = new Map<TimelineEventType | "OTHER", MemoryWithType[]>();
    memoriesWithType.forEach((memory) => {
      const bucket = grouped.get(memory.type) ?? ([] as MemoryWithType[]);
      bucket.push(memory);
      grouped.set(memory.type, bucket);
    });
    const interventionTicks = memoriesWithType
      .filter(
        (memory): memory is MemoryWithType & { tick: number } =>
          memory.type === "INTERVENTION" && typeof memory.tick === "number"
      )
      .map((memory) => memory.tick);

    const seedTypes = Array.from(grouped.entries())
      .filter(([type]) => type !== "OTHER")
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_CLUSTERS)
      .map(([type]) => type);

    const diagnostics = createDiagnostics();
    const clusters: VectorClusterSummary[] = [];
    for (const type of seedTypes) {
      const bucket = grouped.get(type) ?? [];
      const seed = bucket[0];
      if (!seed) continue;
      const resolution = await resolveNeighbors(
        seed.content,
        MAX_CLUSTER_NEIGHBORS,
        input?.simulationId
      );
      collectResolution(diagnostics, resolution);
      const typeCounts = countTypes(resolution.items);
      clusters.push({
        label: CLUSTER_LABELS[type] ?? `${type}系クラスタ`,
        count: bucket.length,
        representative: trimText(stripMemoryPrefix(seed.content)),
        topTypes:
          typeCounts.length > 0 ? typeCounts.slice(0, 3) : [{ type, count: bucket.length }],
        vectorNeighborCount: resolution.neighborCount,
        resolvedNeighborCount: resolution.items.length,
        unresolvedNeighborCount: resolution.unresolvedCount,
        issue: resolution.issue,
      });
    }

    const rumorSeeds = (grouped.get("RUMOR") ?? []).slice(0, MAX_RUMOR_SEEDS);
    let rumorSamples = 0;
    let neighborSamples = 0;
    let officialLike = 0;
    for (const rumor of rumorSeeds) {
      const resolution = await resolveNeighbors(
        rumor.content,
        MAX_CLUSTER_NEIGHBORS,
        input?.simulationId
      );
      collectResolution(diagnostics, resolution);
      rumorSamples += 1;
      resolution.items.forEach((neighbor) => {
        neighborSamples += 1;
        if (neighbor.type === "OFFICIAL" || neighbor.type === "ALERT") {
          officialLike += 1;
        }
      });
    }

    const conversationThreads = await buildConversationThreads({
      memoriesWithType,
      diagnostics,
      interventionTicks,
      simulationId: input?.simulationId,
    });

    const score =
      neighborSamples > 0
        ? Math.round(((neighborSamples - officialLike) / neighborSamples) * 100)
        : 0;
    const metricsAvailable = diagnostics.embedSkipped === 0;
    const hasResolvedClusterNeighbors = clusters.some(
      (cluster) => (cluster.resolvedNeighborCount ?? 0) > 0
    );
    const hasPartialThreadData = conversationThreads.length > 0 || hasResolvedClusterNeighbors;

    let reason: string | undefined;
    if (diagnostics.embedSkipped > 0 && hasPartialThreadData) {
      reason = "Embedding クールダウンが一部発生したため、会話分析は部分結果です。";
    } else if (conversationThreads.length === 0) {
      reason = resolveFailureReason(
        diagnostics,
        "会話スレッドを構築できる記憶が不足しています。"
      );
    } else if (!hasResolvedClusterNeighbors) {
      reason = resolveFailureReason(diagnostics);
    }
    if (!metricsAvailable && !reason) {
      reason = "Embedding がクールダウン中のため汚染系指標は N/A です。";
    }

    return {
      status: "ready",
      reason,
      metricsAvailable,
      clusters,
      rumorOverlap: {
        score,
        rumorSamples,
        neighborSamples,
        officialLike,
      },
      diagnostics,
      conversationThreads,
    };
  } catch (error) {
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "Vector insights failed",
      clusters: [],
    };
  }
};
