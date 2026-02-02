import { VertexAI } from "@google-cloud/vertexai";
import type { Agent, Metrics, TimelineEvent } from "@/types/sim";

export type AgentDecision = {
  action:
    | "MOVE"
    | "TALK"
    | "RUMOR"
    | "OFFICIAL"
    | "EVACUATE"
    | "SUPPORT"
    | "CHECKIN"
    | "WAIT";
  targetIndex?: number;
  message?: string;
};

const getVertexClient = () => {
  const project =
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_GCP_PROJECT_ID;
  const location = process.env.GCP_REGION || "us-central1";
  if (!project) {
    throw new Error("GCP_PROJECT_ID is not set");
  }
  const apiEndpoint =
    location === "global" ? "aiplatform.googleapis.com" : undefined;
  return new VertexAI({ project, location, apiEndpoint });
};

const extractJson = (text: string) => {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
};

const buildDecisionPrompt = (input: {
  agent: Agent;
  tick: number;
  metrics: Metrics;
  recentEvents: TimelineEvent[];
  moveOptions: Array<{ x: number; y: number }>;
}) => `You are an autonomous agent in a disaster rehearsal. Follow a three-phase pipeline: perceive, decide, act.
Return JSON ONLY in this shape:
{
  "action": "MOVE|TALK|RUMOR|OFFICIAL|EVACUATE|SUPPORT|CHECKIN|WAIT",
  "targetIndex": 0,
  "message": "optional"
}
Rules:
- If action is MOVE or EVACUATE, choose a valid targetIndex from moveOptions.
- Keep message short and human-like.
- Prefer HELP/SUPPORT when agent has vulnerable tags or medical/volunteer roles.
Respond in Japanese.

Agent: ${JSON.stringify(input.agent)}
Tick: ${input.tick}
Metrics: ${JSON.stringify(input.metrics)}
RecentEvents: ${JSON.stringify(input.recentEvents.map((e) => e.message ?? e.type))}
MoveOptions: ${JSON.stringify(input.moveOptions)}
`;

let adkRuntimePromise:
  | Promise<{
      runner: unknown;
      isFinalResponse: (event: unknown) => boolean;
      createUserContent: (text: string) => unknown;
    }>
  | null = null;

const ensureAdkVertexEnv = () => {
  if (!process.env.GOOGLE_GENAI_USE_VERTEXAI) {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
  }
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    process.env.GOOGLE_CLOUD_PROJECT =
      process.env.GCP_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.NEXT_PUBLIC_GCP_PROJECT_ID;
  }
  if (!process.env.GOOGLE_CLOUD_LOCATION) {
    process.env.GOOGLE_CLOUD_LOCATION = process.env.GCP_REGION || "us-central1";
  }
};

const getAdkRuntime = async () => {
  if (!adkRuntimePromise) {
    adkRuntimePromise = (async () => {
      const { InMemoryRunner, LlmAgent, isFinalResponse } = await import("@google/adk");
      const { createUserContent, Type } = await import("@google/genai");

      const outputSchema = {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            enum: [
              "MOVE",
              "TALK",
              "RUMOR",
              "OFFICIAL",
              "EVACUATE",
              "SUPPORT",
              "CHECKIN",
              "WAIT",
            ],
          },
          targetIndex: { type: Type.INTEGER },
          message: { type: Type.STRING },
        },
        required: ["action"],
      };

      const modelName = process.env.VERTEX_AI_MODEL || "gemini-2.5-flash";
      const agent = new LlmAgent({
        name: "decision-agent",
        model: modelName,
        instruction:
          "You are an autonomous evacuation simulation agent. Decide the next action and respond in JSON only.",
        outputSchema,
        outputKey: "decision",
      });

      const runner = new InMemoryRunner({ appName: "agenttown", agent });
      return { runner, isFinalResponse, createUserContent };
    })();
  }
  return adkRuntimePromise;
};

const generateAgentDecisionWithAdk = async (input: {
  agent: Agent;
  tick: number;
  metrics: Metrics;
  recentEvents: TimelineEvent[];
  moveOptions: Array<{ x: number; y: number }>;
}): Promise<AgentDecision> => {
  ensureAdkVertexEnv();
  const { runner, isFinalResponse, createUserContent } = await getAdkRuntime();
  const sessionId = `decision-${input.agent.id}`;
  const userId = "sim";
  const sessionService = (runner as { sessionService: { createSession: Function } })
    .sessionService;
  try {
    await sessionService.createSession({ appName: "agenttown", userId, sessionId });
  } catch {
    // ignore if session already exists
  }

  const newMessage = createUserContent(buildDecisionPrompt(input));
  let text = "";
  const iterator = (runner as { runAsync: Function }).runAsync({
    userId,
    sessionId,
    newMessage,
  }) as AsyncIterable<unknown>;

  for await (const event of iterator) {
    if (!isFinalResponse(event)) continue;
    const content = (event as { content?: { parts?: Array<{ text?: string }> } }).content;
    const parts = content?.parts ?? [];
    text = parts.map((part) => part.text ?? "").join("");
  }

  const parsed = JSON.parse(extractJson(text)) as AgentDecision;
  return parsed;
};

export const generateAgentDecision = async (input: {
  agent: Agent;
  tick: number;
  metrics: Metrics;
  recentEvents: TimelineEvent[];
  moveOptions: Array<{ x: number; y: number }>;
}) => {
  if (process.env.SIM_ADK_ENABLED === "true") {
    try {
      const decision = await generateAgentDecisionWithAdk(input);
      return decision;
    } catch {
      // fall back to Vertex AI
    }
  }
  const vertex = getVertexClient();
  const modelName = process.env.VERTEX_AI_MODEL || "gemini-1.5-pro-001";
  const model = vertex.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 256,
    },
  });

  const prompt = buildDecisionPrompt(input);

  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text =
    response.response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .join("") || "";

  try {
    const parsed = JSON.parse(extractJson(text)) as AgentDecision;
    return parsed;
  } catch {
    return { action: "WAIT" } satisfies AgentDecision;
  }
};
