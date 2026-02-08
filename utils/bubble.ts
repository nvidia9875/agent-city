import type { Agent } from "../types/sim";
import { ACTIVITY_LINES } from "./activity";

type BubbleKind =
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

type BubbleContext = {
  tick: number;
  kind?: BubbleKind;
  message?: string;
  thought?: string;
};

const MAX_BUBBLE_CHARS = 160;

const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
};

const pickBySeed = (items: string[], seed: number) =>
  items.length === 0 ? "" : items[seed % items.length];

const clipText = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const normalizeQuote = (text?: string, max = 26) => {
  if (!text) return "";
  const cleaned = text.replace(/[。！？!?]/g, "").trim();
  if (!cleaned) return "";
  return clipText(cleaned, max);
};

const normalizeThought = (text?: string, max = 84) => {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return clipText(cleaned, max);
};

const MOOD_LINES: Record<Agent["state"]["mood"], string[]> = {
  calm: ["落ち着いて状況を整理中。", "深呼吸して考える。", "冷静に全体を見る。"],
  anxious: ["少し不安がある。", "胸がざわつく。", "嫌な予感がする。"],
  panic: ["焦りが止まらない。", "息が上がる…落ち着きたい。", "頭が真っ白になりそう。"],
  helpful: ["誰かの役に立ちたい。", "支援に回りたい。", "手伝えることを探す。"],
};

const ROLE_LINES: Record<Agent["profile"]["role"], string[]> = {
  resident: [
    "家族のことが気になる。",
    "近所の様子が心配。",
    "自宅の安全を確認したい。",
  ],
  medical: [
    "具合の悪い人がいないか確認。",
    "応急手当の準備を進める。",
    "医療チームと連携中。",
  ],
  leader: ["地区の動きを把握中。", "周囲に声をかけている。", "集団の安全を優先。"],
  staff: ["運営の連絡を整理している。", "案内の準備を進める。", "情報を一本化したい。"],
  volunteer: [
    "要支援者を探している。",
    "避難の誘導に回る。",
    "手が足りない所を探す。",
  ],
  visitor: ["土地勘がなくて不安。", "案内が欲しい。", "周囲に確認している。"],
};

const RUMOR_LINES = [
  "噂が気になる。",
  "本当か確かめたい。",
  "情報の真偽が不安。",
];

const OFFICIAL_LINES = [
  "公式の案内を確認。",
  "公式情報に従う。",
  "指示を整理している。",
];

const ALERT_LINES = ["警報に反応した。", "サイレンが気になる。", "警報内容を確認中。"];

const MOVE_LINES = [
  "安全そうな道を探す。",
  "周辺を確認しながら移動。",
  "通れる道を探している。",
];

const TALK_LINES = [
  "近くの人と情報交換。",
  "声を掛け合っている。",
  "様子を聞いて回る。",
];

const CHECKIN_LINES = [
  "安否確認を送っている。",
  "連絡がつくか不安。",
  "無事を確認したい。",
];

const SUPPORT_LINES = [
  "支援の手順を考える。",
  "助けが必要な人を探す。",
  "無理のない範囲で支援。",
];

const EVAC_LINES: Record<NonNullable<Agent["evacStatus"]>, string[]> = {
  STAY: ["まだ様子見。", "今は動かず判断待ち。", "状況を見極めたい。"],
  EVACUATING: ["避難を始めた。", "高台へ向かう。", "安全な場所を探す。"],
  SHELTERED: ["避難所で待機中。", "ここで落ち着く。", "しばらく様子を見る。"],
  HELPING: ["支援に回っている。", "誘導を手伝う。", "周囲を支える。"],
};

const MOBILITY_LINES: Record<Agent["profile"]["mobility"], string[]> = {
  normal: [],
  limited: ["無理な移動は避けたい。", "足元に注意。"],
  needs_assist: ["一人で動くのは不安。", "支援が必要かも。"],
};

const STRESS_LINES = {
  high: ["落ち着け、落ち着け。", "一度呼吸を整えたい。"],
  lowEnergy: ["体力が足りない…", "少し休みたい。"],
};

const LANGUAGE_LINES = ["言葉が通じるか不安。", "翻訳が欲しい。", "聞き取れるか心配。"];

export const buildAgentBubble = (agent: Agent, context: BubbleContext) => {
  const base = `${agent.id}:${context.tick}:${context.kind ?? "AMBIENT"}:${
    context.message ?? ""
  }:${context.thought ?? ""}`;
  const pick = (items: string[], salt: string) =>
    pickBySeed(items, hashSeed(`${base}:${salt}`));

  const moodLine = pick(MOOD_LINES[agent.state.mood], "mood");
  const roleLine = pick(ROLE_LINES[agent.profile.role], "role");
  const evacLine = agent.evacStatus ? pick(EVAC_LINES[agent.evacStatus], "evac") : "";
  const mobilityLine = pick(MOBILITY_LINES[agent.profile.mobility], "mobility");
  const activityLine = agent.activity
    ? pick(ACTIVITY_LINES[agent.activity] ?? ACTIVITY_LINES.IDLE, "activity")
    : "";
  const personalityTag =
    agent.personalityTags.length > 0
      ? agent.personalityTags[hashSeed(`${base}:tag`) % agent.personalityTags.length]
      : "";
  const personalityLine = personalityTag ? `${personalityTag}らしく動く。` : "";
  const goalLine = agent.goal ? `いまは「${agent.goal}」を意識。` : "";

  const stressLine =
    agent.state.stress >= 75
      ? pick(STRESS_LINES.high, "stress")
      : agent.state.energy <= 25
        ? pick(STRESS_LINES.lowEnergy, "energy")
        : "";

  const languageLine = agent.profile.language !== "ja" ? pick(LANGUAGE_LINES, "lang") : "";

  const quote = normalizeQuote(context.message);
  const thought = normalizeThought(context.thought);

  const contextLine = (() => {
    switch (context.kind) {
      case "RUMOR":
        return quote
          ? pick(
              [`「${quote}」って噂。`, `「${quote}」らしい。`, `「${quote}」だって。`],
              "rumor-quote"
            )
          : pick(RUMOR_LINES, "rumor");
      case "OFFICIAL":
        return quote
          ? pick(
              [`公式から${quote}の連絡。`, `「${quote}」という指示。`, `公式: ${quote}`],
              "official-quote"
            )
          : pick(OFFICIAL_LINES, "official");
      case "ALERT":
        return quote
          ? pick([`警報: ${quote}`, `警報で${quote}と聞いた。`, `警報内容を確認。`], "alert")
          : pick(ALERT_LINES, "alert");
      case "SUPPORT":
        return quote
          ? pick([`支援: ${quote}`, `「${quote}」の対応中。`, `${quote}に向かう。`], "support")
          : pick(SUPPORT_LINES, "support");
      case "CHECKIN":
        return quote
          ? pick([`安否確認: ${quote}`, `「${quote}」の返事待ち。`, `${quote}に連絡中。`], "checkin")
          : pick(CHECKIN_LINES, "checkin");
      case "TALK":
        return quote
          ? pick([`話題は「${quote}」。`, `「${quote}」について話した。`, `${quote}を共有中。`], "talk")
          : pick(TALK_LINES, "talk");
      case "MOVE":
        return thought
          ? pick(
              [`移動しながら考え中: ${thought}`, `この道を選ぶ理由: ${thought}`, `頭の中: ${thought}`],
              "move-thought"
            )
          : pick(MOVE_LINES, "move");
      case "ACTIVITY":
        return quote
          ? pick([`今は${quote}。`, `${quote}をしている。`, `${quote}中。`], "activity")
          : agent.activity
            ? pick(ACTIVITY_LINES[agent.activity] ?? ACTIVITY_LINES.IDLE, "activity")
            : "";
      case "EVACUATE":
        if (thought) {
          return pick(
            [`避難判断: ${thought}`, `避難中の考え: ${thought}`, `このまま避難継続: ${thought}`],
            "evac-thought"
          );
        }
        return quote
          ? pick([`避難: ${quote}`, `「${quote}」に向かう。`, `${quote}へ移動中。`], "evac")
          : pick(EVAC_LINES.EVACUATING, "evacuate");
      default:
        if (thought) return `思考: ${thought}`;
        if (agent.alertStatus === "RUMOR") return pick(RUMOR_LINES, "alert-rumor");
        if (agent.alertStatus === "OFFICIAL")
          return pick(OFFICIAL_LINES, "alert-official");
        return "";
    }
  })();

  const extras = [
    goalLine,
    activityLine,
    roleLine,
    evacLine,
    personalityLine,
    mobilityLine,
    stressLine,
    languageLine,
  ].filter(Boolean);

  const extraSlots = thought ? 0 : contextLine ? 1 : 2;
  const orderedExtras = extras
    .map((text, index) => ({
      text,
      score: hashSeed(`${base}:extra:${index}`),
    }))
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.text);

  const parts = [moodLine, contextLine, ...orderedExtras.slice(0, extraSlots)].filter(Boolean);

  const text = parts.length > 0 ? parts.join(" ") : "周囲の様子を確認中。";
  return clipText(text, MAX_BUBBLE_CHARS);
};
