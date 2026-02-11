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
  bubbleLine?: string;
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

const getTalkBubbleModelName = () =>
  process.env.VERTEX_AI_MODEL_TALK_BUBBLE || "gemini-2.5-flash";

const resolveVertexLocation = (modelName?: string) => {
  if (process.env.VERTEX_AI_LOCATION) {
    return process.env.VERTEX_AI_LOCATION;
  }
  if (modelName?.startsWith("gemini-3") || modelName?.startsWith("gemini-2.5")) {
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

const stripCodeFence = (text: string) =>
  text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

const looksLikeJsonPayload = (text: string) => {
  const compact = text.trim();
  if (!compact) return false;
  if (/^```(?:json)?/i.test(compact)) return true;
  if (compact.startsWith("{") || compact.startsWith("[")) return true;
  if (/^[{\[]/.test(compact) && /"\w+"\s*:/.test(compact)) return true;
  if (/^\s*\{[\s\S]*"\w+"\s*:\s*[^}]*$/m.test(compact)) return true;
  return false;
};

const isPlaceholderText = (text: string) => {
  const stripped = text.replace(/[「」"'`]/g, "").trim();
  if (!stripped) return true;
  if (looksLikeJsonPayload(text)) return true;
  if (/^[.…・,，、。!?！？\-ー~〜]+$/.test(stripped)) return true;
  if (/^(?:\.{2,}|…{1,}|optional|n\/a|null|none)$/i.test(stripped)) return true;
  return false;
};

const normalizeTextField = (value: unknown, max: number) => {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact || isPlaceholderText(compact)) return undefined;
  if (compact.length <= max) return compact;
  const clipped = `${compact.slice(0, max)}…`;
  return isPlaceholderText(clipped) ? undefined : clipped;
};

const parseJsonObject = (text: string): Record<string, unknown> | undefined => {
  const candidates: string[] = [];
  const raw = text.trim();
  const stripped = stripCodeFence(raw);
  const extractedRaw = extractJson(raw).trim();
  const extractedStripped = extractJson(stripped).trim();
  [raw, stripped, extractedRaw, extractedStripped].forEach((candidate) => {
    if (!candidate) return;
    if (!candidates.includes(candidate)) candidates.push(candidate);
  });
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // continue
    }
  }
  return undefined;
};

const extractJsonStringField = (text: string, field: string, max: number) => {
  const object = parseJsonObject(text);
  if (object && typeof object[field] === "string") {
    return normalizeTextField(object[field], max);
  }
  const pattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s");
  const matched = text.match(pattern);
  if (!matched) return undefined;
  const rawValue = matched[1];
  try {
    const unescaped = JSON.parse(`"${rawValue}"`) as string;
    return normalizeTextField(unescaped, max);
  } catch {
    const loose = rawValue
      .replace(/\\n/g, " ")
      .replace(/\\r/g, " ")
      .replace(/\\t/g, " ")
      .replace(/\\"/g, '"');
    return normalizeTextField(loose, max);
  }
};

const extractLooseField = (text: string, field: string, max: number) => {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`['"]?${escaped}['"]?\\s*:\\s*"([^"\\n\\r}]*)`, "is"),
    new RegExp(`['"]?${escaped}['"]?\\s*:\\s*'([^'\\n\\r}]*)`, "is"),
    new RegExp(`['"]?${escaped}['"]?\\s*:\\s*([^,\\n\\r}]*)`, "is"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    const normalized = normalizeTextField(candidate, max);
    if (normalized) return normalized;
  }
  return undefined;
};

const parseSpokenField = (text: string, max: number, fields: string[]) => {
  for (const field of fields) {
    const extracted = extractJsonStringField(text, field, max);
    if (extracted) return extracted;
    const loose = extractLooseField(text, field, max);
    if (loose) return loose;
  }
  if (looksLikeJsonPayload(text)) return undefined;
  return normalizeTextField(text, max);
};

const normalizeDecision = (decision: AgentDecision): AgentDecision => ({
  ...decision,
  message: normalizeTextField(decision.message, 60),
  bubbleLine: normalizeTextField(decision.bubbleLine, 96),
  reflection: normalizeTextField(decision.reflection, 120),
  plan: normalizeTextField(decision.plan, 120),
  goal: normalizeTextField(decision.goal, 24),
});

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
  "reflection": "今は安全確認が最優先。",
  "plan": "危険を避けつつ近くの人に声をかける。",
  "goal": "安全確保",
  "activity": "${activityOptions}",
  "action": "MOVE|TALK|RUMOR|OFFICIAL|EVACUATE|SUPPORT|CHECKIN|WAIT",
  "targetIndex": 0,
  "targetAgentId": "optional",
  "message": "安全なルートを共有",
  "bubbleLine": "ここ危ない、いったん安全な場所に移ろう！"
}
Rules:
- reflection is 1-2 short sentences about what matters now based on memories.
- plan is 1-2 short steps; goal is a short phrase (<=16 chars).
- activity must be one of the listed options.
- If action is MOVE or EVACUATE, choose a valid targetIndex from moveOptions.
- If action is TALK, choose targetAgentId from nearbyAgents when possible.
- message is a concise timeline summary (<=40 chars, objective tone).
- bubbleLine is the citizen speech bubble line (<=56 chars, casual Japanese, lively game-like tone).
- bubbleLine should reflect the agent's mood/personality/profile (role, mobility, household, language, vulnerability).
- Use disaster-specific emotions and talk topics when composing a message.
- Match the town mood and age profile in tone and action tendency.
- If you reply to nearby chatter, mention the speaker name (e.g. "Yuki-san, ...").
- Prefer HELP/SUPPORT when agent has vulnerable tags or medical/volunteer roles.
- Avoid repeating exact phrasing from RecentEvents/NearbyChatter.
- Do not add labels like "公式:", "内省:", "計画:" in bubbleLine.
- Never output placeholders like "...", "optional", "n/a".
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

const buildTalkReplyPrompt = (input: {
  speaker: Agent;
  target: Agent;
  speakerLine: string;
  tick: number;
  metrics: Metrics;
  disaster: DisasterType;
  recentEvents: TimelineEvent[];
  nearbyChatter: NearbyChatter[];
  memories?: Array<{ content: string; sourceType?: string; createdAt?: string }>;
  simConfig?: Pick<SimConfig, "emotionTone" | "ageProfile">;
}) => {
  const profile =
    DISASTER_PROMPT_PROFILES[input.disaster] ?? DISASTER_PROMPT_PROFILES.EARTHQUAKE;
  const emotionTone = input.simConfig?.emotionTone ?? "NEUTRAL";
  const ageProfile = input.simConfig?.ageProfile ?? "BALANCED";
  const recentEvents = input.recentEvents.map((event) => ({
    type: event.type,
    message: event.message ?? event.type,
  }));
  const memories = (input.memories ?? []).map((memory) => ({
    content: memory.content,
    sourceType: memory.sourceType ?? "unknown",
    createdAt: memory.createdAt ?? "",
  }));

  return `You are a resident AI agent replying in a town disaster simulation.
Return JSON ONLY:
{
  "reply": "了解、坂道ルートで行こう。到着したら知らせるね。"
}
Rules:
- reply is one short line in Japanese (<=56 chars).
- Use casual, lively in-game citizen tone (not formal report style).
- Reflect target profile and state naturally (mood, role, mobility, household, personality tags, stress, trust).
- Reflect current disaster context and uncertainty.
- Don't just repeat speaker's sentence; add your own judgment/feeling.
- No labels like "公式:", "内省:", "計画:".
- No markdown.
- Never output placeholders like "...", "optional", "n/a".

SpeakerName: ${input.speaker.name}
SpeakerLine: ${input.speakerLine}
TargetAgent: ${JSON.stringify(input.target)}
Tick: ${input.tick}
Metrics: ${JSON.stringify(input.metrics)}
Disaster: ${input.disaster}
DisasterEmotions: ${profile.emotions.join("; ")}
DisasterTalkTopics: ${profile.talkTopics.join("; ")}
TownEmotionTone: ${emotionTone} (${EMOTION_TONE_GUIDE[emotionTone]})
TownAgeProfile: ${ageProfile} (${AGE_PROFILE_GUIDE[ageProfile]})
NearbyChatter: ${JSON.stringify(input.nearbyChatter)}
RecentEvents: ${JSON.stringify(recentEvents)}
Memories: ${JSON.stringify(memories)}
`;
};

const buildTalkSpeakerPrompt = (input: {
  speaker: Agent;
  target?: Agent | null;
  seedLine?: string;
  tick: number;
  metrics: Metrics;
  disaster: DisasterType;
  recentEvents: TimelineEvent[];
  nearbyChatter: NearbyChatter[];
  memories?: Array<{ content: string; sourceType?: string; createdAt?: string }>;
  simConfig?: Pick<SimConfig, "emotionTone" | "ageProfile">;
}) => {
  const profile =
    DISASTER_PROMPT_PROFILES[input.disaster] ?? DISASTER_PROMPT_PROFILES.EARTHQUAKE;
  const emotionTone = input.simConfig?.emotionTone ?? "NEUTRAL";
  const ageProfile = input.simConfig?.ageProfile ?? "BALANCED";
  const recentEvents = input.recentEvents.map((event) => ({
    type: event.type,
    message: event.message ?? event.type,
  }));
  const memories = (input.memories ?? []).map((memory) => ({
    content: memory.content,
    sourceType: memory.sourceType ?? "unknown",
    createdAt: memory.createdAt ?? "",
  }));
  const seed = normalizeTextField(input.seedLine, 80);

  return `You are a resident AI agent speaking in a town disaster simulation.
Return JSON ONLY:
{
  "line": "サイレン鳴ってる、先に安全な場所へ行こう！"
}
Rules:
- line is one short line in Japanese (<=56 chars).
- Use casual, lively in-game citizen tone (not formal report style).
- Reflect speaker profile and state naturally (mood, role, mobility, household, personality tags, stress, trust).
- Reflect current disaster context and uncertainty.
- If a target is present, speak to them naturally (e.g. "<name>さん、...").
- If seed line exists, keep intent but rewrite in natural characterful style.
- No labels like "公式:", "内省:", "計画:".
- No markdown.
- Never output placeholders like "...", "optional", "n/a".

SpeakerAgent: ${JSON.stringify(input.speaker)}
TargetAgent: ${JSON.stringify(input.target ?? null)}
SeedLine: ${seed ?? ""}
Tick: ${input.tick}
Metrics: ${JSON.stringify(input.metrics)}
Disaster: ${input.disaster}
DisasterEmotions: ${profile.emotions.join("; ")}
DisasterTalkTopics: ${profile.talkTopics.join("; ")}
TownEmotionTone: ${emotionTone} (${EMOTION_TONE_GUIDE[emotionTone]})
TownAgeProfile: ${ageProfile} (${AGE_PROFILE_GUIDE[ageProfile]})
NearbyChatter: ${JSON.stringify(input.nearbyChatter)}
RecentEvents: ${JSON.stringify(recentEvents)}
Memories: ${JSON.stringify(memories)}
`;
};

const buildGeneralBubblePrompt = (input: {
  agent: Agent;
  action: AgentDecision["action"];
  seedMessage?: string;
  thought?: string;
  tick: number;
  metrics: Metrics;
  disaster: DisasterType;
  recentEvents: TimelineEvent[];
  nearbyChatter: NearbyChatter[];
  memories?: Array<{ content: string; sourceType?: string; createdAt?: string }>;
  simConfig?: Pick<SimConfig, "emotionTone" | "ageProfile">;
}) => {
  const profile =
    DISASTER_PROMPT_PROFILES[input.disaster] ?? DISASTER_PROMPT_PROFILES.EARTHQUAKE;
  const emotionTone = input.simConfig?.emotionTone ?? "NEUTRAL";
  const ageProfile = input.simConfig?.ageProfile ?? "BALANCED";
  const recentEvents = input.recentEvents.map((event) => ({
    type: event.type,
    message: event.message ?? event.type,
  }));
  const memories = (input.memories ?? []).map((memory) => ({
    content: memory.content,
    sourceType: memory.sourceType ?? "unknown",
    createdAt: memory.createdAt ?? "",
  }));
  const seed = normalizeTextField(input.seedMessage, 80);
  const thought = normalizeTextField(input.thought, 100);

  return `You are a resident AI agent speaking one bubble line in a disaster simulation.
Return JSON ONLY:
{
  "line": "この先あぶないかも、いったん高い場所へ！"
}
Rules:
- line is one short line in Japanese (<=56 chars).
- Use casual, lively in-game citizen tone (not formal report style).
- Reflect agent profile and state naturally (mood, role, mobility, household, personality tags, stress, trust).
- Reflect the action and disaster context.
- If seed message exists, keep intent but rewrite naturally.
- If thought exists, include it briefly in plain spoken style.
- No labels like "公式:", "内省:", "計画:".
- No markdown.
- Never output placeholders like "...", "optional", "n/a".

Agent: ${JSON.stringify(input.agent)}
Action: ${input.action}
SeedMessage: ${seed ?? ""}
Thought: ${thought ?? ""}
Tick: ${input.tick}
Metrics: ${JSON.stringify(input.metrics)}
Disaster: ${input.disaster}
DisasterEmotions: ${profile.emotions.join("; ")}
DisasterTalkTopics: ${profile.talkTopics.join("; ")}
TownEmotionTone: ${emotionTone} (${EMOTION_TONE_GUIDE[emotionTone]})
TownAgeProfile: ${ageProfile} (${AGE_PROFILE_GUIDE[ageProfile]})
NearbyChatter: ${JSON.stringify(input.nearbyChatter)}
RecentEvents: ${JSON.stringify(recentEvents)}
Memories: ${JSON.stringify(memories)}
`;
};

let adkRuntimePromise:
  | Promise<{
      runner: unknown;
      isFinalResponse: unknown;
      createUserContent: unknown;
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
          bubbleLine: { type: Type.STRING },
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
  const isFinalResponseFn = isFinalResponse as (event: unknown) => boolean;
  const createUserContentFn = createUserContent as (text: string) => unknown;
  const sessionId = `decision-${input.agent.id}`;
  const userId = "sim";
  const sessionService = (runner as AdkRunner).sessionService;
  try {
    await sessionService.createSession({ appName: "agenttown", userId, sessionId });
  } catch {
    // ignore if session already exists
  }

  const newMessage = createUserContentFn(buildDecisionPrompt(input));
  let text = "";
  const iterator = (runner as AdkRunner).runAsync({
    userId,
    sessionId,
    newMessage,
  }) as AsyncIterable<unknown>;

  for await (const event of iterator) {
    if (!isFinalResponseFn(event)) continue;
    const content = (event as { content?: { parts?: Array<{ text?: string }> } }).content;
    const parts = content?.parts ?? [];
    text = parts.map((part) => part.text ?? "").join("");
  }

  const parsed = JSON.parse(extractJson(text)) as AgentDecision;
  return normalizeDecision(parsed);
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
    return normalizeDecision(parsed);
  } catch {
    return { action: "WAIT" } satisfies AgentDecision;
  }
};

export const generateAgentTalkReply = async (input: {
  speaker: Agent;
  target: Agent;
  speakerLine: string;
  tick: number;
  metrics: Metrics;
  disaster: DisasterType;
  recentEvents: TimelineEvent[];
  nearbyChatter: NearbyChatter[];
  memories?: Array<{ content: string; sourceType?: string; createdAt?: string }>;
  simConfig?: Pick<SimConfig, "emotionTone" | "ageProfile">;
}) => {
  const speakerLine = normalizeTextField(input.speakerLine, 96);
  if (!speakerLine) return undefined;

  const modelName = getTalkBubbleModelName();
  const vertex = getVertexClient(modelName);
  const model = vertex.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 128,
    },
  });

  const prompt = buildTalkReplyPrompt({ ...input, speakerLine });
  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text =
    response.response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .join("") || "";

  return parseSpokenField(text, 96, ["reply", "line"]);
};

export const generateAgentTalkSpeakerLine = async (input: {
  speaker: Agent;
  target?: Agent | null;
  seedLine?: string;
  tick: number;
  metrics: Metrics;
  disaster: DisasterType;
  recentEvents: TimelineEvent[];
  nearbyChatter: NearbyChatter[];
  memories?: Array<{ content: string; sourceType?: string; createdAt?: string }>;
  simConfig?: Pick<SimConfig, "emotionTone" | "ageProfile">;
}) => {
  const seedLine = normalizeTextField(input.seedLine, 96);
  const modelName = getTalkBubbleModelName();
  const vertex = getVertexClient(modelName);
  const model = vertex.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 128,
    },
  });

  const prompt = buildTalkSpeakerPrompt({ ...input, seedLine });
  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text =
    response.response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .join("") || "";

  return parseSpokenField(text, 96, ["line", "reply"]);
};

export const generateAgentBubbleLine = async (input: {
  agent: Agent;
  action: AgentDecision["action"];
  seedMessage?: string;
  thought?: string;
  tick: number;
  metrics: Metrics;
  disaster: DisasterType;
  recentEvents: TimelineEvent[];
  nearbyChatter: NearbyChatter[];
  memories?: Array<{ content: string; sourceType?: string; createdAt?: string }>;
  simConfig?: Pick<SimConfig, "emotionTone" | "ageProfile">;
}) => {
  const modelName = getTalkBubbleModelName();
  const vertex = getVertexClient(modelName);
  const model = vertex.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.78,
      maxOutputTokens: 128,
    },
  });

  const prompt = buildGeneralBubblePrompt(input);
  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text =
    response.response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .join("") || "";

  return parseSpokenField(text, 96, ["line", "reply"]);
};
