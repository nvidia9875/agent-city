import { isDbConfigured, query } from "@/lib/db/mysql";

export type MemoryRecord = {
  id: string;
  agentId: string;
  content: string;
  sourceType: string;
  eventId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
};

export const saveMemory = async (record: MemoryRecord) => {
  if (!isDbConfigured()) return;
  await query(
    `INSERT INTO agent_memories (id, agent_id, content, source_type, event_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       content = VALUES(content),
       source_type = VALUES(source_type),
       event_id = VALUES(event_id),
       metadata = VALUES(metadata)`,
    [
      record.id,
      record.agentId,
      record.content,
      record.sourceType,
      record.eventId ?? null,
      record.metadata ? JSON.stringify(record.metadata) : null,
    ]
  );
};

const parseMetadata = (metadata: unknown) => {
  if (!metadata) return null;
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof metadata === "object") {
    return metadata as Record<string, unknown>;
  }
  return null;
};

const normalizeMemory = (row: {
  id: string;
  agentId: string;
  content: string;
  sourceType: string;
  eventId?: string | null;
  metadata?: unknown;
  createdAt?: string;
}): MemoryRecord => ({
  id: row.id,
  agentId: row.agentId,
  content: row.content,
  sourceType: row.sourceType,
  eventId: row.eventId ?? null,
  metadata: parseMetadata(row.metadata),
  createdAt: row.createdAt,
});

export const getRecentMemories = async (
  limit: number,
  simulationId?: string
): Promise<MemoryRecord[]> => {
  if (!isDbConfigured()) return [];
  const params: unknown[] = [];
  const whereClause = simulationId
    ? "WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.simulation_id')) = ?"
    : "";
  if (simulationId) {
    params.push(simulationId);
  }
  params.push(limit);
  const rows = await query<{
    id: string;
    agentId: string;
    content: string;
    sourceType: string;
    eventId?: string | null;
    metadata?: unknown;
    createdAt?: string;
  }>(
    `SELECT id, agent_id AS agentId, content, source_type AS sourceType, event_id AS eventId, metadata, created_at AS createdAt
     FROM agent_memories
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ?`,
    params
  );
  return rows.map(normalizeMemory);
};

export const getRecentMemoriesByAgent = async (
  agentId: string,
  limit: number,
  simulationId?: string
): Promise<MemoryRecord[]> => {
  if (!isDbConfigured()) return [];
  const params: unknown[] = [agentId];
  const simulationClause = simulationId
    ? "AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.simulation_id')) = ?"
    : "";
  if (simulationId) {
    params.push(simulationId);
  }
  params.push(limit);
  const rows = await query<{
    id: string;
    agentId: string;
    content: string;
    sourceType: string;
    eventId?: string | null;
    metadata?: unknown;
    createdAt?: string;
  }>(
    `SELECT id, agent_id AS agentId, content, source_type AS sourceType, event_id AS eventId, metadata, created_at AS createdAt
     FROM agent_memories
     WHERE agent_id = ?
     ${simulationClause}
     ORDER BY created_at DESC
     LIMIT ?`,
    params
  );
  return rows.map(normalizeMemory);
};

export const getMemoriesByIds = async (
  ids: string[],
  simulationId?: string
): Promise<MemoryRecord[]> => {
  if (!isDbConfigured() || ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const params: unknown[] = [...ids];
  const simulationClause = simulationId
    ? "AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.simulation_id')) = ?"
    : "";
  if (simulationId) {
    params.push(simulationId);
  }
  const rows = await query<{
    id: string;
    agentId: string;
    content: string;
    sourceType: string;
    eventId?: string | null;
    metadata?: unknown;
    createdAt?: string;
  }>(
    `SELECT id, agent_id AS agentId, content, source_type AS sourceType, event_id AS eventId, metadata, created_at AS createdAt
     FROM agent_memories
     WHERE id IN (${placeholders})
     ${simulationClause}`,
    params
  );
  return rows.map(normalizeMemory);
};
