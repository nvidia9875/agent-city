import { VertexAI } from "@google-cloud/vertexai";
import type {
  Agent,
  AgentActivity,
  Metrics,
  TimelineEvent,
  DisasterType,
  SimConfig,
  EmotionTone,
  AgeProfile,
} from "@/types/sim";

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
  targetAgentId?: string;
  message?: string;
  activity?: AgentActivity;
  reflection?: string;
  plan?: string;
  goal?: string;
};

type NearbyChatter = {
  type: TimelineEvent["type"];
  speaker: string;
  message: string;
  distance: number;
};

type NearbyAgent = {
  id: string;
  name: string;
  activity?: AgentActivity;
  role: Agent["profile"]["role"];
  distance: number;
};

type AdkSessionService = {
  createSession: (input: {
    appName: string;
    userId: string;
    sessionId: string;
  }) => Promise<unknown>;
};

type AdkRunner = {
  sessionService: AdkSessionService;
  runAsync: (input: {
    userId: string;
    sessionId: string;
    newMessage: unknown;
  }) => AsyncIterable<unknown>;
};

type DisasterPromptProfile = {
  emotions: string[];
  talkTopics: string[];
  actionCues: string[];
};

const EMOTION_TONE_GUIDE: Record<EmotionTone, string> = {
  WARM: "cooperative, empathetic, proactive to help others",
  NEUTRAL: "balanced, realistic, neither too calm nor too alarmist",
  COOL: "cautious, reserved, risk-aware, less trusting",
};

const AGE_PROFILE_GUIDE: Record<AgeProfile, string> = {
  YOUTH: "more students/children, faster reactions, curious chatter, mobile",
  BALANCED: "mixed ages, average pace, typical community balance",
  SENIOR: "more seniors, slower movement, careful decisions, need support",
};

const ACTIVITY_GUIDE: Record<AgentActivity, string> = {
  EATING: "食事中",
  COMMUTING: "通勤中",
  SHOPPING: "買い物中",
  WORKING: "仕事中",
  SCHOOLING: "学校にいる",
  TRAVELING: "移動中",
  PLAYING: "遊び中",
  RESTING: "休憩中",
  SOCIALIZING: "交流中",
  EMERGENCY: "非常時対応",
  IDLE: "待機中",
};

const DISASTER_PROMPT_PROFILES: Record<DisasterType, DisasterPromptProfile> = {
  TSUNAMI: {
    emotions: [
      "urgent fear of waves and time pressure",
      "protect family and reach higher ground",
      "uncertainty about second waves and aftershocks",
    ],
    talkTopics: [
      "go to higher ground and move inland",
      "coastal warnings, sirens, and evacuation timing",
      "safe routes away from rivers, bridges, and shoreline",
      "shelter locations and headcount",
    ],
    actionCues: [
      "prioritize EVACUATE or MOVE to higher elevation",
      "avoid coastal roads and low-lying areas",
      "assist people with limited mobility",
    ],
  },
  EARTHQUAKE: {
    emotions: [
      "shock and aftershock anxiety",
      "concern about building safety and falling debris",
      "need to confirm family safety",
    ],
    talkTopics: [
      "aftershocks and building damage",
      "gas leaks and safe open spaces",
      "official updates and shelter info",
    ],
    actionCues: [
      "MOVE to open areas and avoid unstable structures",
      "CHECKIN with family or neighbors",
      "SUPPORT injured or vulnerable people",
    ],
  },
  FLOOD: {
    emotions: [
      "slow rising anxiety and uncertainty",
      "isolation and frustration from blocked routes",
      "worry about water levels",
    ],
    talkTopics: [
      "water level and river overflow updates",
      "road closures and detours",
      "sandbag or defense efforts",
      "evacuation routes to higher ground",
    ],
    actionCues: [
      "avoid low-lying areas",
      "MOVE toward higher elevation",
      "CHECKIN on nearby residents",
    ],
  },
  METEOR: {
    emotions: [
      "disbelief and high urgency",
      "information seeking and confusion",
      "fear of impact and debris",
    ],
    talkTopics: [
      "impact time and predicted zone",
      "shelter readiness and safe rooms",
      "official instructions and alert updates",
      "family check-ins",
    ],
    actionCues: [
      "follow official guidance quickly",
      "MOVE to shelters or safe buildings",
      "CHECKIN with family and neighbors",
    ],
  },
};

const getDecisionModelName = () =>
  process.env.VERTEX_AI_MODEL_DECISION ||
  process.env.VERTEX_AI_MODEL ||
  "gemini-3-flash-preview";

const resolveVertexLocation = (modelName?: string) => {
  if (process.env.VERTEX_AI_LOCATION) {
    return process.env.VERTEX_AI_LOCATION;
  }
  if (modelName?.startsWith("gemini-3")) {
    return "global";
  }
  return process.env.GCP_REGION || "us-central1";
};

const getVertexClient = (modelName?: string) => {
  const project =
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_GCP_PROJECT_ID;
  const location = resolveVertexLocation(modelName);
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
  disaster: DisasterType;
  nearbyChatter: NearbyChatter[];
  nearbyAgents?: NearbyAgent[];
  memories?: Array<{ content: string; sourceType?: string; createdAt?: string }>;
  timeOfDay?: string;
  simConfig?: Pick<SimConfig, "emotionTone" | "ageProfile">;
}) => {
  const profile =
    DISASTER_PROMPT_PROFILES[input.disaster] ?? DISASTER_PROMPT_PROFILES.EARTHQUAKE;
  const recentEvents = input.recentEvents.map((event) => ({
    type: event.type,
    message: event.message ?? event.type,
  }));
  const emotionTone = input.simConfig?.emotionTone ?? "NEUTRAL";
  const ageProfile = input.simConfig?.ageProfile ?? "BALANCED";
  const memories = (input.memories ?? []).map((memory) => ({
    content: memory.content,
    sourceType: memory.sourceType ?? "unknown",
    createdAt: memory.createdAt ?? "",
  }));
  const activityOptions = Object.keys(ACTIVITY_GUIDE).join("|");
  const activityGuide = Object.entries(ACTIVITY_GUIDE)
    .map(([key, label]) => `${key}: ${label}`)
    .join(", ");

  return `You are an autonomous agent in a small town simulation. Follow the cycle: recall memories -> reflection -> plan -> action.
Return JSON ONLY in this shape:
{
  "reflection": "...",
  "plan": "...",
  "goal": "...",
  "activity": "${activityOptions}",
  "action": "MOVE|TALK|RUMOR|OFFICIAL|EVACUATE|SUPPORT|CHECKIN|WAIT",
  "targetIndex": 0,
  "targetAgentId": "optional",
  "message": "optional"
}
Rules:
- reflection is 1-2 short sentences about what matters now based on memories.
- plan is 1-2 short steps; goal is a short phrase (<=16 chars).
- activity must be one of the listed options.
- If action is MOVE or EVACUATE, choose a valid targetIndex from moveOptions.
- If action is TALK, choose targetAgentId from nearbyAgents when possible.
- Keep message short and human-like (<=40 chars).
- Use disaster-specific emotions and talk topics when composing a message.
- Match the town mood and age profile in tone and action tendency.
- If you reply to nearby chatter, mention the speaker name (e.g. "Yuki-san, ...").
- Prefer HELP/SUPPORT when agent has vulnerable tags or medical/volunteer roles.
Respond in Japanese.

Agent: ${JSON.stringify(input.agent)}
Tick: ${input.tick}
Metrics: ${JSON.stringify(input.metrics)}
TownTime: ${input.timeOfDay ?? "unknown"}
Disaster: ${input.disaster}
DisasterEmotions: ${profile.emotions.join("; ")}
DisasterTalkTopics: ${profile.talkTopics.join("; ")}
DisasterActionCues: ${profile.actionCues.join("; ")}
TownEmotionTone: ${emotionTone} (${EMOTION_TONE_GUIDE[emotionTone]})
TownAgeProfile: ${ageProfile} (${AGE_PROFILE_GUIDE[ageProfile]})
ActivityOptions: ${activityGuide}
NearbyAgents: ${JSON.stringify(input.nearbyAgents ?? [])}
NearbyChatter: ${JSON.stringify(input.nearbyChatter)}
RecentEvents: ${JSON.stringify(recentEvents)}
Memories: ${JSON.stringify(memories)}
MoveOptions: ${JSON.stringify(input.moveOptions)}
`;
};

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
    process.env.GOOGLE_CLOUD_LOCATION = resolveVertexLocation(getDecisionModelName());
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
          targetAgentId: { type: Type.STRING },
          message: { type: Type.STRING },
          activity: { type: Type.STRING },
          reflection: { type: Type.STRING },
          plan: { type: Type.STRING },
          goal: { type: Type.STRING },
        },
        required: ["action"],
      };

      const modelName = getDecisionModelName();
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
  disaster: DisasterType;
  nearbyChatter: NearbyChatter[];
  nearbyAgents?: NearbyAgent[];
  memories?: Array<{ content: string; sourceType?: string; createdAt?: string }>;
  timeOfDay?: string;
  simConfig?: Pick<SimConfig, "emotionTone" | "ageProfile">;
}): Promise<AgentDecision> => {
  ensureAdkVertexEnv();
  const { runner, isFinalResponse, createUserContent } = await getAdkRuntime();
  const sessionId = `decision-${input.agent.id}`;
  const userId = "sim";
  const sessionService = (runner as AdkRunner).sessionService;
  try {
    await sessionService.createSession({ appName: "agenttown", userId, sessionId });
  } catch {
    // ignore if session already exists
  }

  const newMessage = createUserContent(buildDecisionPrompt(input));
  let text = "";
  const iterator = (runner as AdkRunner).runAsync({
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
  disaster: DisasterType;
  nearbyChatter: NearbyChatter[];
  nearbyAgents?: NearbyAgent[];
  memories?: Array<{ content: string; sourceType?: string; createdAt?: string }>;
  timeOfDay?: string;
  simConfig?: Pick<SimConfig, "emotionTone" | "ageProfile">;
}) => {
  if (process.env.SIM_ADK_ENABLED === "true") {
    try {
      const decision = await generateAgentDecisionWithAdk(input);
      return decision;
    } catch {
      // fall back to Vertex AI
    }
  }
  const modelName = getDecisionModelName();
  const vertex = getVertexClient(modelName);
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
