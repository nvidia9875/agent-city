import type { AgentReasoning } from "@/types/sim";
import { isDbConfigured, query } from "@/lib/db/mysql";

export const getAgentReasoning = async (
  agentId: string
): Promise<AgentReasoning | null> => {
  if (!isDbConfigured()) return null;
  const result = await query<AgentReasoning & { memoryRefs?: unknown }>(
    "SELECT agent_id as agentId, why, memory_refs as memoryRefs FROM agent_reasonings WHERE agent_id = ?",
    [agentId]
  );
  const row = result[0];
  if (!row) return null;
  const memoryRefs =
    typeof row.memoryRefs === "string"
      ? JSON.parse(row.memoryRefs)
      : row.memoryRefs;
  return { ...row, memoryRefs: memoryRefs ?? [] } as AgentReasoning;
};

export const saveAgentReasoning = async (reasoning: AgentReasoning) => {
  if (!isDbConfigured()) return;
  await query(
    `INSERT INTO agent_reasonings (agent_id, why, memory_refs)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       why = VALUES(why),
       memory_refs = VALUES(memory_refs),
       updated_at = NOW()`,
    [reasoning.agentId, reasoning.why, JSON.stringify(reasoning.memoryRefs ?? [])]
  );
};
