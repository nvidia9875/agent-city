import { VertexAI } from "@google-cloud/vertexai";
import type { Agent, AgentReasoning } from "@/types/sim";

const getVertexClient = () => {
  const project =
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_GCP_PROJECT_ID;
  const location = process.env.GCP_REGION || "us-central1";

  if (!project) {
    throw new Error("GCP_PROJECT_ID is not set");
  }

  return new VertexAI({ project, location });
};

const extractJson = (text: string) => {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
};

export const generateAgentReasoning = async (input: {
  agent: Agent;
  tick?: number;
  recentEvents?: string[];
}): Promise<AgentReasoning> => {
  const vertex = getVertexClient();
  const modelName = process.env.VERTEX_AI_MODEL || "gemini-1.5-pro-001";

  const model = vertex.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 256,
    },
  });

  const prompt = `You are a simulation analyst for a disaster rehearsal town. Generate a concise reasoning summary for the agent's current behavior.
Return JSON ONLY in the following shape:
{
  "why": "...",
  "memoryRefs": [
    { "title": "...", "text": "..." },
    { "title": "...", "text": "..." },
    { "title": "...", "text": "..." }
  ]
}
Respond in Japanese.
Focus on how the agent reacts to rumors, official alerts, and vulnerable populations.
Agent: ${JSON.stringify(input.agent)}
Tick: ${input.tick ?? 0}
RecentEvents: ${JSON.stringify(input.recentEvents ?? [])}
`;

  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text =
    response.response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .join("") || "";

  try {
    const parsed = JSON.parse(extractJson(text));
    return {
      agentId: input.agent.id,
      why: parsed.why ?? "",
      memoryRefs: Array.isArray(parsed.memoryRefs) ? parsed.memoryRefs : [],
    };
  } catch {
    return {
      agentId: input.agent.id,
      why: text || "解析に失敗しました。",
      memoryRefs: [],
    };
  }
};
