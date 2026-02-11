import type {
  Agent,
  DisasterType,
  Metrics,
  SimConfig,
  TimelineEventType,
} from "../types/sim";

export type BubbleKind =
  | "AMBIENT"
  | "MOVE"
  | "TALK"
  | "RUMOR"
  | "OFFICIAL"
  | "ALERT"
  | "EVACUATE"
  | "SUPPORT"
  | "CHECKIN"
  | "ACTIVITY";

type NearbyChatter = {
  type: TimelineEventType;
  speaker: string;
  message: string;
  distance: number;
};

export type BubbleContext = {
  tick: number;
  kind?: BubbleKind;
  message?: string;
  thought?: string;
  disaster?: DisasterType;
  metrics?: Metrics;
  nearbyChatter?: NearbyChatter[];
  simConfig?: Pick<SimConfig, "emotionTone" | "ageProfile">;
};

const MAX_BUBBLE_CHARS = 120;
const GENERIC_MESSAGE_PATTERNS = [
  /安全な道を探して移動/,
  /避難ルートを確認中/,
  /日常の用事を進めている/,
  /今の活動を続ける/,
  /通れる道を探している/,
  /非常時対応/,
  /安否確認の連絡を送信/,
  /近所の無事を確認/,
  /公式:\s*$/,
];

const MOOD_LINES: Record<Agent["state"]["mood"], string[]> = {
  calm: ["よし、落ち着いて進もう", "まだ冷静、手順どおりでいける", "焦らず判断して動く"],
  anxious: ["うわ、ちょっと不安だ", "胸がざわつくけど止まれない", "嫌な予感はする、でも動く"],
  panic: ["やばい、急がないと", "まずい、時間がない", "うわっ、これは最優先で逃げる"],
  helpful: ["任せて、周りにも声かけする", "一人にしない、手伝いながら行く", "よし、支援モードで動く"],
};

const DISASTER_LINES: Record<DisasterType, string[]> = {
  TSUNAMI: ["海側は危ない、高台へ向かう", "川沿いは避けて内陸へ回る", "津波を想定して上へ逃げる"],
  EARTHQUAKE: ["落下物が少ない道を選ぶ", "余震に備えて開けた場所へ", "ブロック塀から離れて進む"],
  FLOOD: ["低い道は避けて高い地盤へ", "浸水しやすい通りはパスする", "水位を見ながらルート変更する"],
  METEOR: ["遮蔽物のあるルートを取る", "衝撃に備えて堅い建物へ", "危険ゾーンを外して移動する"],
};

const KIND_LINES: Record<BubbleKind, string[]> = {
  AMBIENT: ["状況を見ながら次の一歩を決める", "周囲の変化を観察している"],
  MOVE: ["いま通れる道で前進する", "遠回りでも安全ルートで行く"],
  TALK: ["近くの人にいまの情報を共有する", "声をかけて判断をそろえる"],
  RUMOR: ["その話、真偽を確認してから動く", "噂は広いけど一次情報を探す"],
  OFFICIAL: ["公式更新を優先して動く", "公式の避難情報に合わせる"],
  ALERT: ["警報を聞いた、すぐ対応する", "サイレンに合わせて行動を切り替える"],
  EVACUATE: ["とにかく避難を始める", "安全圏まで足を止めない"],
  SUPPORT: ["要支援の人を優先して誘導する", "周囲を支えながら移動する"],
  CHECKIN: ["無事を伝えて安心を広げる", "到着連絡を出して次の行動に移る"],
  ACTIVITY: ["生活行動を続けつつ警戒する", "日常タスクも安全優先で進める"],
};

const ROLE_LINES: Record<Agent["profile"]["role"], string[]> = {
  resident: ["近所にも一声かけておく"],
  medical: ["体調不良の人がいないか見ながら動く"],
  leader: ["周囲の判断がそろうよう案内する"],
  staff: ["案内情報を更新しながら動く"],
  volunteer: ["支援が必要な人を先に拾っていく"],
  visitor: ["土地勘は薄いけど標識を頼りに進む"],
};

const PERSONALITY_LINES: Partial<Record<string, string[]>> = {
  慎重: ["急がず確認してから進む"],
  社交的: ["見かけた人にどんどん共有する"],
  前向き: ["怖いけど、できることから回す"],
  助け好き: ["近くで困ってる人を放っておけない"],
  好奇心旺盛: ["情報は自分の目でも確かめたい"],
  観察的: ["小さな変化を見逃さないようにする"],
};

const clipText = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
};

const pickBySeed = (items: string[], seed: string) => {
  if (items.length === 0) return "";
  return items[hashSeed(seed) % items.length];
};

const compactText = (text?: string) =>
  text?.replace(/\s+/g, " ").replace(/^「|」$/g, "").trim() ?? "";

const normalizeText = (text?: string, max = MAX_BUBBLE_CHARS) => {
  const compact = compactText(text);
  if (!compact) return "";
  return clipText(compact, max);
};

const isGenericMessage = (text: string) =>
  GENERIC_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));

const sanitizeHint = (value?: string, max = 42) => {
  const compact = compactText(value);
  if (!compact) return "";
  if (/^[{\[]/.test(compact) || /^```/.test(compact)) return "";
  const quote = compact.match(/「([^」]{2,60})」/);
  const source = quote ? quote[1] : compact;
  const normalized = source
    .replace(/^[^、。！？!?]{1,18}[:：]\s*/, "")
    .replace(/^公式[:：]\s*/i, "")
    .trim();
  if (!normalized || isGenericMessage(normalized)) return "";
  return clipText(normalized, max);
};

const sentence = (value: string) => {
  const compact = compactText(value);
  if (!compact) return "";
  return /[。！？!?]$/.test(compact) ? compact : `${compact}。`;
};

const resolveMetricCue = (metrics?: Metrics) => {
  if (!metrics) return "";
  if (metrics.panicIndex >= 75) return "街全体が焦ってる、足元に注意する";
  if (metrics.rumorSpread >= 60 && metrics.officialReach <= 45) {
    return "噂が先行してる、公式確認を急ぐ";
  }
  if (metrics.officialReach >= 65 && metrics.rumorSpread <= 40) {
    return "公式情報が回ってきた、判断がしやすい";
  }
  if (metrics.vulnerableReach <= 45) return "支援の手が足りない、優先対応する";
  return "";
};

const resolveProfileCue = (agent: Agent, seed: string) => {
  const cues = [...(ROLE_LINES[agent.profile.role] ?? [])];
  if (agent.profile.mobility === "limited") {
    cues.push("無理はせず、段差の少ない道を選ぶ");
  } else if (agent.profile.mobility === "needs_assist") {
    cues.push("速度より安全優先、助けを呼びながら進む");
  }
  if (agent.profile.household === "family") {
    cues.push("家族の位置を見失わないようにする");
  } else if (agent.profile.household === "group") {
    cues.push("グループではぐれないよう声を掛け合う");
  }
  if (agent.profile.language !== "ja") {
    cues.push("日本語だけでなく多言語の案内も確認する");
  }
  if (agent.profile.vulnerabilityTags.length > 0) {
    cues.push("自分の安全条件を守りつつ行動する");
  }
  const personality = agent.personalityTags
    .flatMap((tag) => PERSONALITY_LINES[tag] ?? [])
    .filter(Boolean);
  if (personality.length > 0) {
    cues.push(pickBySeed(personality, `${seed}:personality`));
  }
  return cues.length > 0 ? pickBySeed(cues, `${seed}:profile`) : "";
};

const resolveChatterCue = (nearbyChatter: NearbyChatter[] | undefined, seed: string) => {
  if (!nearbyChatter || nearbyChatter.length === 0) return "";
  const nearest = [...nearbyChatter].sort((a, b) => a.distance - b.distance)[0];
  const hint = sanitizeHint(nearest.message, 20);
  if (!nearest.speaker) return "";
  if (nearest.type === "RUMOR") {
    return `${nearest.speaker}さんの噂は聞いた、でも裏取りして動く`;
  }
  if (nearest.type === "OFFICIAL" || nearest.type === "ALERT") {
    return `${nearest.speaker}さんも警報を追ってる、連携して進む`;
  }
  if (hint) {
    return pickBySeed(
      [`${nearest.speaker}さんの話「${hint}」も参考にする`, `${nearest.speaker}さんの情報も確認した`],
      `${seed}:chatter:${nearest.type}`
    );
  }
  return "";
};

const resolveToneCue = (context: BubbleContext, seed: string) => {
  const cues: string[] = [];
  if (context.simConfig?.emotionTone === "WARM") {
    cues.push("周りと連携しながら進めばいける");
  }
  if (context.simConfig?.emotionTone === "COOL") {
    cues.push("楽観せず、危険側に見積もって動く");
  }
  if (context.simConfig?.ageProfile === "SENIOR") {
    cues.push("急ぎすぎず、転倒しないペースで進む");
  }
  if (context.simConfig?.ageProfile === "YOUTH") {
    cues.push("反応は速く、でも情報の真偽は確認する");
  }
  return cues.length > 0 ? pickBySeed(cues, `${seed}:tone`) : "";
};

export const buildAgentBubble = (agent: Agent, context: BubbleContext) => {
  const kind = context.kind ?? "AMBIENT";
  const baseSeed = [
    agent.id,
    String(context.tick),
    kind,
    agent.state.mood,
    String(agent.state.stress),
    context.disaster ?? "",
  ].join(":");

  const hint = sanitizeHint(context.message);
  const thought = sanitizeHint(context.thought, 30);
  const moodLine = pickBySeed(MOOD_LINES[agent.state.mood], `${baseSeed}:mood`);
  const kindLine = pickBySeed(KIND_LINES[kind], `${baseSeed}:kind`);
  const disaster = context.disaster
    ? pickBySeed(DISASTER_LINES[context.disaster], `${baseSeed}:disaster`)
    : "";
  const profile = resolveProfileCue(agent, baseSeed);
  const metric = resolveMetricCue(context.metrics);
  const chatter = resolveChatterCue(context.nearbyChatter, baseSeed);
  const tone = resolveToneCue(context, baseSeed);

  const firstLine = hint ? `${moodLine}、${hint}` : `${moodLine}、${kindLine}`;
  const optionalCues = [disaster, profile, metric, chatter, tone, thought].filter(Boolean);
  const secondLine =
    optionalCues.length > 0
      ? pickBySeed(optionalCues, `${baseSeed}:optional`)
      : normalizeText(agent.reflection, 56) || normalizeText(agent.plan, 56);

  const text = [sentence(firstLine), sentence(secondLine)]
    .filter(Boolean)
    .join("");
  return normalizeText(text);
};
