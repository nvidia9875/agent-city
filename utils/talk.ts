import type { Agent } from "../types/sim";

type TalkExchangeInput = {
  speaker: Agent;
  target?: Agent | null;
  seedMessage?: string;
};

export type TalkExchange = {
  topic: string;
  speakerLine: string;
  targetLine?: string;
  timelineMessage: string;
};

export const formatTalkTimelineMessage = (input: {
  speakerName: string;
  speakerLine: string;
  targetName?: string;
  targetLine?: string;
}) => {
  const speaker = clipText(stripTrailingPunctuation(input.speakerLine), 24);
  if (!input.targetName || !input.targetLine) {
    return `${input.speakerName}:「${speaker}」`;
  }
  const target = clipText(stripTrailingPunctuation(input.targetLine), 24);
  return `${input.speakerName}:「${speaker}」→${input.targetName}:「${target}」`;
};

type PickTalkTargetInput = {
  speaker: Agent;
  nearbyAgents: Agent[];
  preferAiPartner?: boolean;
  preferredId?: string;
};

const randomPick = <T,>(items: T[]) =>
  items[Math.floor(Math.random() * items.length)];

const clipText = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const TALK_TOPIC_FALLBACKS = [
  "やばい、海側は危ないって出てる。高台いこう",
  "速報きた？ 公式の更新を今すぐ見たい",
  "避難所の混み具合、知ってる人いる？",
  "まず要支援の人を優先して動こう",
  "この辺で一番安全な道、どこだろう",
  "焦るけど、いったん深呼吸して判断しよう",
];

const TALK_REPLY_ALERT_LINES: Record<string, string[]> = {
  RUMOR: [
    "それ噂かも。公式でも裏取りしよう。",
    "不安になるけど、まず一次情報を見よう。",
    "その話はいったん保留。確かな情報を探そう。",
  ],
  OFFICIAL: [
    "了解。公式どおりで動こう。",
    "その方針でいこう。更新も追っておく。",
    "同意。周りにも公式情報を広げるよ。",
  ],
  NONE: [
    "了解。状況を見ながら一緒に判断しよう。",
    "ありがとう、周りにも共有してみる。",
    "OK、焦らず確認して進めよう。",
  ],
};

const TALK_REPLY_EVAC_LINES: Record<string, string[]> = {
  STAY: [
    "ここで様子見しつつ、いつでも動けるようにする。",
    "了解。必要ならすぐダッシュできる準備する。",
  ],
  EVACUATING: [
    "了解、移動しながら周りにも伝える。",
    "わかった。このまま避難を続けるよ。",
  ],
  SHELTERED: [
    "避難所で情報まとめて回しておく。",
    "ここで安否確認しながら情報を流すね。",
  ],
  HELPING: [
    "了解。支援しながら周囲にも声かけする。",
    "支援導線の中でその情報を活かすよ。",
  ],
};

const TALK_REPLY_ROLE_LINES: Record<string, string[]> = {
  medical: [
    "了解。体調不良の人の確認も進める。",
    "その情報、医療班にもすぐ回す。",
  ],
  volunteer: [
    "了解。誘導ルートに反映して声かけする。",
    "わかった。要支援者の搬送に活かすね。",
  ],
  leader: [
    "ありがとう。地区全体にも伝えておく。",
    "了解。全体の動きに反映するよ。",
  ],
  staff: [
    "了解。案内文を更新して共有する。",
    "受け取った。運営連絡にも反映するよ。",
  ],
};

const normalizeTalkSeed = (seedMessage?: string) => {
  if (!seedMessage) return "";
  const compact = seedMessage.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const withoutQuotes = compact.replace(/^「/, "").replace(/」$/, "");
  const withoutPrefix = withoutQuotes
    .replace(/^[^、。！？!?]{1,16}さん[、,:：]\s*/, "")
    .replace(/^公式[:：]\s*/, "");
  return clipText(withoutPrefix.trim(), 52);
};

const endsWithPunctuation = (text: string) => /[。！？!?]$/.test(text.trim());

const withPunctuation = (text: string) =>
  endsWithPunctuation(text) ? text.trim() : `${text.trim()}。`;

const stripTrailingPunctuation = (text: string) =>
  text.replace(/[。！？!?]+$/, "").trim();

const includesSpeakerPrefix = (text: string, targetName: string) =>
  text.startsWith(`${targetName}さん`) || text.includes(`${targetName}さん`);

const buildTalkReply = (input: {
  speaker: Agent;
  target: Agent;
  topic: string;
}) => {
  const alert = input.target.alertStatus ?? "NONE";
  const evac = input.target.evacStatus ?? "STAY";
  const role = input.target.profile.role;
  const topicFragment = clipText(stripTrailingPunctuation(input.topic), 20);
  const roleLines = TALK_REPLY_ROLE_LINES[role] ?? [];
  const alertLines = TALK_REPLY_ALERT_LINES[alert] ?? TALK_REPLY_ALERT_LINES.NONE;
  const evacLines = TALK_REPLY_EVAC_LINES[evac] ?? TALK_REPLY_EVAC_LINES.STAY;
  const languageLine =
    input.target.profile.language !== "ja"
      ? ["了解。日本語と英語の両方で共有してみる。", "わかった。多言語で周囲にも伝えるね。"]
      : [];
  const echoLines = [
    `${input.speaker.name}さん、${topicFragment}は大事だね。確認して動こう。`,
    `${topicFragment}、私も周囲に共有しておく。`,
  ];
  return clipText(
    withPunctuation(
      randomPick([...roleLines, ...evacLines, ...alertLines, ...languageLine, ...echoLines])
    ),
    72
  );
};

export const buildTalkExchange = (input: TalkExchangeInput): TalkExchange => {
  const normalizedSeed = normalizeTalkSeed(input.seedMessage);
  const baseTopic = normalizedSeed || randomPick(TALK_TOPIC_FALLBACKS);
  const topic = withPunctuation(clipText(baseTopic, 54));

  if (!input.target) {
    const soloSpeakerLine = clipText(topic, 72);
    return {
      topic,
      speakerLine: soloSpeakerLine,
      timelineMessage: formatTalkTimelineMessage({
        speakerName: input.speaker.name,
        speakerLine: soloSpeakerLine,
      }),
    };
  }

  const speakerLine = clipText(
    withPunctuation(
      includesSpeakerPrefix(topic, input.target.name)
        ? topic
        : `${input.target.name}さん、${stripTrailingPunctuation(topic)}`
    ),
    72
  );
  const targetLine = buildTalkReply({
    speaker: input.speaker,
    target: input.target,
    topic,
  });

  return {
    topic,
    speakerLine,
    targetLine,
    timelineMessage: formatTalkTimelineMessage({
      speakerName: input.speaker.name,
      speakerLine,
      targetName: input.target.name,
      targetLine,
    }),
  };
};

export const pickTalkTargetAgent = (input: PickTalkTargetInput): Agent | null => {
  const candidates = input.nearbyAgents.filter(
    (agent) => agent.id !== input.speaker.id
  );
  if (candidates.length === 0) return null;

  const aiCandidates = candidates.filter((agent) => agent.isAI);
  const preferred = input.preferredId
    ? candidates.find((agent) => agent.id === input.preferredId)
    : undefined;

  if (preferred) {
    const canUsePreferred =
      !input.preferAiPartner || preferred.isAI || aiCandidates.length === 0;
    if (canUsePreferred) return preferred;
  }

  const pool =
    input.preferAiPartner && aiCandidates.length > 0 ? aiCandidates : candidates;
  return pool.length > 0 ? randomPick(pool) : null;
};
