import type { AgentActivity } from "@/types/sim";

export const ACTIVITY_LABELS: Record<AgentActivity, string> = {
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

export const ACTIVITY_LINES: Record<AgentActivity, string[]> = {
  EATING: ["食事中。", "軽く腹ごしらえ。", "ひと息ついて食事。"],
  COMMUTING: ["通勤中。", "目的地へ移動中。", "道の流れに合わせて移動。"],
  SHOPPING: ["買い物中。", "必要な物を探す。", "店を回っている。"],
  WORKING: ["仕事に集中。", "業務対応中。", "作業を進める。"],
  SCHOOLING: ["学校で授業中。", "学びの時間。", "教室にいる。"],
  TRAVELING: ["移動を楽しんでいる。", "旅の途中。", "次の場所へ向かう。"],
  PLAYING: ["遊びの時間。", "気分転換中。", "散歩がてら遊ぶ。"],
  RESTING: ["休憩中。", "少し休む。", "体力回復。"],
  SOCIALIZING: ["交流中。", "人と話している。", "情報交換中。"],
  EMERGENCY: ["緊急対応中。", "避難や支援に集中。", "非常時の行動中。"],
  IDLE: ["様子を見ている。", "待機中。", "周囲を観察。"],
};

export const ACTIVITY_GOALS: Record<AgentActivity, string> = {
  EATING: "食事をとる",
  COMMUTING: "目的地へ向かう",
  SHOPPING: "買い物を済ませる",
  WORKING: "作業を進める",
  SCHOOLING: "授業に参加する",
  TRAVELING: "移動を続ける",
  PLAYING: "気分転換する",
  RESTING: "休む",
  SOCIALIZING: "周囲と交流する",
  EMERGENCY: "安全確保と支援",
  IDLE: "周辺確認",
};

export const formatActivityMessage = (activity: AgentActivity, name?: string) => {
  const label = ACTIVITY_LABELS[activity] ?? ACTIVITY_LABELS.IDLE;
  return name ? `${name}は${label}。` : `${label}。`;
};
