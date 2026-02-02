import { isDbConfigured, query } from "@/lib/db/mysql";

export type MemoryRecord = {
  id: string;
  agentId: string;
  content: string;
  sourceType: string;
  eventId?: string | null;
  metadata?: Record<string, unknown> | null;
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
