import type { Agent, AgentReasoning } from "@/types/sim";
import { generateAgentReasoning } from "@/lib/gcp/vertex";
import { saveAgentReasoning } from "@/lib/db/agentReasoning";

export const generateAndStoreReasoning = async (input: {
  agent: Agent;
  tick?: number;
  recentEvents?: string[];
}): Promise<AgentReasoning> => {
  const reasoning = await generateAgentReasoning(input);
  await saveAgentReasoning(reasoning);
  return reasoning;
};
