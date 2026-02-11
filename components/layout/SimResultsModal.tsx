"use client";

import { useState } from "react";
import type {
  Metrics,
  SimConfig,
  SimEndSummary,
  TimelineEventType,
  VectorClusterSummary,
  VectorConversationThread,
} from "@/types/sim";
import {
  DISASTER_LABELS,
  TERRAIN_LABELS,
  EMOTION_TONE_LABELS,
  AGE_PROFILE_LABELS,
} from "@/utils/simConfig";

type MetricsHistoryItem = { tick: number; metrics: Metrics };

type SimResultsModalProps = {
  summary: SimEndSummary;
  metricsHistory: MetricsHistoryItem[];
  config: SimConfig;
  onRestart: () => void;
};

type ResultTab = "overview" | "metrics" | "breakdown" | "population" | "vector";
const REAL_HOURS_PER_SIM_MINUTE = 1;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

const formatTick = (tick: number) => {
  const minutes = Math.floor(tick / 60);
  const seconds = Math.max(0, tick % 60);
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
};

const formatDuration = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return `${minutes}m${String(rem).padStart(2, "0")}s`;
};

const formatRealWorldEquivalent = (simulatedMinutes: number) => {
  const totalRealMinutes = Math.max(
    0,
    Math.round(simulatedMinutes * REAL_HOURS_PER_SIM_MINUTE * MINUTES_PER_HOUR)
  );
  const days = Math.floor(totalRealMinutes / MINUTES_PER_DAY);
  const hours = Math.floor((totalRealMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const minutes = totalRealMinutes % MINUTES_PER_HOUR;

  if (days > 0) {
    if (hours > 0) return `${days}日${hours}時間`;
    return `${days}日`;
  }
  if (hours > 0) {
    if (minutes > 0) return `${hours}時間${minutes}分`;
    return `${hours}時間`;
  }
  return `${minutes}分`;
};

const computeScore = (metrics: Metrics) => {
  return Math.max(0, Math.min(100, Math.round(metrics.stabilityScore)));
};

const STABILIZE_TARGET = {
  confusionMax: 40,
  rumorMax: 32,
  officialMin: 65,
  vulnerableMin: 55,
  panicMax: 45,
  trustMin: 55,
  misinfoMax: 30,
  misallocationMax: 40,
  stabilityMin: 65,
};

const getScoreGrade = (score: number) => {
  if (score >= 85) {
    return { label: "Sランク", tone: "text-emerald-200" };
  }
  if (score >= 70) {
    return { label: "Aランク", tone: "text-sky-200" };
  }
  if (score >= 55) {
    return { label: "Bランク", tone: "text-amber-200" };
  }
  return { label: "Cランク", tone: "text-rose-200" };
};

const buildScoreBreakdown = (metrics: Metrics) => {
  const parts = [
    {
      label: "行政情報の到達",
      value: metrics.officialReach,
      weight: 0.2,
      tone: "text-emerald-300",
    },
    {
      label: "要支援者への到達",
      value: metrics.vulnerableReach,
      weight: 0.2,
      tone: "text-sky-300",
    },
    {
      label: "混乱抑制",
      value: 100 - metrics.confusion,
      weight: 0.15,
      tone: "text-rose-200",
    },
    {
      label: "噂抑制",
      value: 100 - metrics.rumorSpread,
      weight: 0.1,
      tone: "text-amber-200",
    },
    {
      label: "パニック抑制",
      value: 100 - metrics.panicIndex,
      weight: 0.1,
      tone: "text-rose-300",
    },
    {
      label: "行政情報の信頼",
      value: metrics.trustIndex,
      weight: 0.1,
      tone: "text-emerald-200",
    },
    {
      label: "誤情報抑制",
      value: 100 - metrics.misinfoBelief,
      weight: 0.05,
      tone: "text-amber-300",
    },
    {
      label: "誤配分抑制",
      value: 100 - metrics.resourceMisallocation,
      weight: 0.1,
      tone: "text-indigo-200",
    },
  ];
  return parts.map((part) => ({
    ...part,
    contribution: Math.round(part.value * part.weight),
  }));
};

const buildSparkPath = (data: number[], width: number, height: number) => {
  if (data.length < 2) return "";
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  return data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

const buildMissionChecks = (metrics: Metrics) => [
  {
    key: "officialReach",
    label: "行政情報の到達",
    current: metrics.officialReach,
    target: `${STABILIZE_TARGET.officialMin}以上`,
    ok: metrics.officialReach >= STABILIZE_TARGET.officialMin,
  },
  {
    key: "vulnerableReach",
    label: "要支援者への到達",
    current: metrics.vulnerableReach,
    target: `${STABILIZE_TARGET.vulnerableMin}以上`,
    ok: metrics.vulnerableReach >= STABILIZE_TARGET.vulnerableMin,
  },
  {
    key: "confusion",
    label: "混乱度",
    current: metrics.confusion,
    target: `${STABILIZE_TARGET.confusionMax}以下`,
    ok: metrics.confusion <= STABILIZE_TARGET.confusionMax,
  },
  {
    key: "rumorSpread",
    label: "噂拡散",
    current: metrics.rumorSpread,
    target: `${STABILIZE_TARGET.rumorMax}以下`,
    ok: metrics.rumorSpread <= STABILIZE_TARGET.rumorMax,
  },
  {
    key: "panicIndex",
    label: "パニック",
    current: metrics.panicIndex,
    target: `${STABILIZE_TARGET.panicMax}以下`,
    ok: metrics.panicIndex <= STABILIZE_TARGET.panicMax,
  },
  {
    key: "trustIndex",
    label: "行政情報の信頼",
    current: metrics.trustIndex,
    target: `${STABILIZE_TARGET.trustMin}以上`,
    ok: metrics.trustIndex >= STABILIZE_TARGET.trustMin,
  },
  {
    key: "misinfoBelief",
    label: "誤情報信念",
    current: metrics.misinfoBelief,
    target: `${STABILIZE_TARGET.misinfoMax}以下`,
    ok: metrics.misinfoBelief <= STABILIZE_TARGET.misinfoMax,
  },
  {
    key: "resourceMisallocation",
    label: "誤配分",
    current: metrics.resourceMisallocation,
    target: `${STABILIZE_TARGET.misallocationMax}以下`,
    ok: metrics.resourceMisallocation <= STABILIZE_TARGET.misallocationMax,
  },
  {
    key: "stabilityScore",
    label: "安定度スコア",
    current: metrics.stabilityScore,
    target: `${STABILIZE_TARGET.stabilityMin}以上`,
    ok: metrics.stabilityScore >= STABILIZE_TARGET.stabilityMin,
  },
];

const MISSION_CHECK_VISUALS: Record<
  string,
  { icon: string; cardTone: string; helper: string }
> = {
  officialReach: {
    icon: "📡",
    cardTone:
      "border-cyan-300/35 bg-[linear-gradient(135deg,rgba(8,47,73,0.5),rgba(12,74,110,0.14))]",
    helper: "行政情報の広がり",
  },
  vulnerableReach: {
    icon: "🫶",
    cardTone:
      "border-sky-300/35 bg-[linear-gradient(135deg,rgba(12,74,110,0.5),rgba(30,64,175,0.14))]",
    helper: "要支援者のフォロー",
  },
  confusion: {
    icon: "🌀",
    cardTone:
      "border-rose-300/35 bg-[linear-gradient(135deg,rgba(76,5,25,0.5),rgba(127,29,29,0.14))]",
    helper: "混乱を抑える",
  },
  rumorSpread: {
    icon: "🗣️",
    cardTone:
      "border-amber-300/35 bg-[linear-gradient(135deg,rgba(120,53,15,0.5),rgba(146,64,14,0.14))]",
    helper: "うわさを抑える",
  },
  panicIndex: {
    icon: "😵",
    cardTone:
      "border-orange-300/35 bg-[linear-gradient(135deg,rgba(124,45,18,0.5),rgba(154,52,18,0.14))]",
    helper: "パニックを抑える",
  },
  trustIndex: {
    icon: "🛡️",
    cardTone:
      "border-emerald-300/35 bg-[linear-gradient(135deg,rgba(6,78,59,0.5),rgba(6,95,70,0.14))]",
    helper: "行政情報の信頼",
  },
  misinfoBelief: {
    icon: "🧪",
    cardTone:
      "border-fuchsia-300/35 bg-[linear-gradient(135deg,rgba(88,28,135,0.5),rgba(126,34,206,0.14))]",
    helper: "誤情報への信念",
  },
  resourceMisallocation: {
    icon: "📦",
    cardTone:
      "border-indigo-300/35 bg-[linear-gradient(135deg,rgba(49,46,129,0.5),rgba(67,56,202,0.14))]",
    helper: "支援の配分",
  },
  stabilityScore: {
    icon: "🌟",
    cardTone:
      "border-lime-300/35 bg-[linear-gradient(135deg,rgba(63,98,18,0.5),rgba(77,124,15,0.14))]",
    helper: "総合の安定度",
  },
};

const minGap = (value: number, min: number) => Math.max(0, min - value);
const maxGap = (value: number, max: number) => Math.max(0, value - max);

const resolveTimeLimitFeedback = (metrics: Metrics) => {
  const checks = buildMissionChecks(metrics);
  const unmetCount = checks.filter((check) => !check.ok).length;
  const communicationGap =
    minGap(metrics.officialReach, STABILIZE_TARGET.officialMin) +
    minGap(metrics.vulnerableReach, STABILIZE_TARGET.vulnerableMin);
  const rumorGap =
    maxGap(metrics.confusion, STABILIZE_TARGET.confusionMax) +
    maxGap(metrics.rumorSpread, STABILIZE_TARGET.rumorMax);
  const trustGap =
    minGap(metrics.trustIndex, STABILIZE_TARGET.trustMin) +
    maxGap(metrics.misinfoBelief, STABILIZE_TARGET.misinfoMax);
  const operationsGap =
    maxGap(metrics.panicIndex, STABILIZE_TARGET.panicMax) +
    maxGap(metrics.resourceMisallocation, STABILIZE_TARGET.misallocationMax);
  const stabilityGap = minGap(metrics.stabilityScore, STABILIZE_TARGET.stabilityMin);

  if (unmetCount <= 2 && stabilityGap <= 8) {
    return {
      pattern: "判定: あと一歩",
      desc: "複数指標は閾値付近まで到達しましたが、終盤の維持が足りませんでした。",
      tip: "終盤に未達の1〜2指標へ介入を集中すると安定化に届きやすくなります。",
    };
  }

  const dominant = [
    { key: "communication", score: communicationGap },
    { key: "rumor", score: rumorGap },
    { key: "trust", score: trustGap },
    { key: "operations", score: operationsGap },
  ].sort((a, b) => b.score - a.score)[0];

  if (dominant.key === "communication") {
    return {
      pattern: "判定: 情報到達不足",
      desc: "行政からのお知らせと要支援者への案内が不足し、収束条件に届きませんでした。",
      tip: "序盤で行政アラート・多言語配信・要支援者支援を優先してください。",
    };
  }
  if (dominant.key === "rumor") {
    return {
      pattern: "判定: 噂過熱",
      desc: "噂拡散と混乱度が高止まりし、安定化ラインを超えられませんでした。",
      tip: "デマ監視とファクトチェックの重ね掛けを早めると抑制しやすくなります。",
    };
  }
  if (dominant.key === "trust") {
    return {
      pattern: "判定: 信頼回復遅れ",
      desc: "行政情報への信頼回復が遅く、誤情報信念の低下が不十分でした。",
      tip: "行政アナウンスの頻度を維持しつつ、誤情報訂正を継続すると改善しやすいです。",
    };
  }
  if (dominant.key === "operations") {
    return {
      pattern: "判定: 運用分散",
      desc: "パニックと支援誤配分が残り、避難運用が安定しませんでした。",
      tip: "ルート誘導と支援系介入を合わせて、現場の流れを先に整えてください。",
    };
  }

  return {
    pattern: "判定: あと一歩",
    desc: "時間内に安定化しきれませんでした。",
    tip: "未達指標を1つずつ優先して押し上げると再現性が上がります。",
  };
};

const OutcomeBadge = ({ summary }: { summary: SimEndSummary }) => {
  const timeLimitFeedback = resolveTimeLimitFeedback(summary.metrics);
  const config = {
    STABILIZED: {
      label: "安定化達成",
      tone: "from-emerald-400/30 to-emerald-500/10 text-emerald-200",
      desc: "混乱と噂が沈静化しました。",
      pattern: "判定: 安定化達成",
      tip: "現状の介入順序は有効です。再現できるか別条件でも確認してみてください。",
    },
    TIME_LIMIT: {
      label: "タイムアップ",
      tone: "from-amber-300/30 to-amber-500/10 text-amber-200",
      desc: timeLimitFeedback.desc,
      pattern: timeLimitFeedback.pattern,
      tip: timeLimitFeedback.tip,
    },
    ESCALATED: {
      label: "危機拡大",
      tone: "from-rose-400/30 to-rose-500/10 text-rose-200",
      desc: "噂と混乱が閾値を超えました。",
      pattern: "判定: 危機拡大",
      tip: "初動を前倒しし、噂拡散を最優先で抑えると立て直しやすくなります。",
    },
  }[summary.reason];

  return (
    <div
      className={`rounded-2xl border border-slate-800/80 bg-gradient-to-br p-3 ${config.tone}`}
    >
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
        Outcome
      </p>
      <h3 className="mt-2 text-base font-semibold">{config.label}</h3>
      <p className="mt-1 text-xs text-slate-300">{config.desc}</p>
      <p className="mt-2 text-[11px] font-semibold text-slate-200">{config.pattern}</p>
      <p className="mt-1 text-[11px] text-slate-400">{config.tip}</p>
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  peak,
  history,
  tone,
  compact = false,
}: {
  label: string;
  value: number;
  peak: { value: number; tick: number };
  history: number[];
  tone: string;
  compact?: boolean;
}) => {
  const width = compact ? 110 : 140;
  const height = compact ? 32 : 42;
  const path = buildSparkPath(history, width, height);

  return (
    <div
      className={`rounded-2xl border border-slate-800/70 bg-slate-950/70 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
          {label}
        </p>
        <span className={`text-sm font-semibold ${tone}`}>{value}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-4">
        {compact ? (
          <div className="text-[10px] text-slate-600">Peak {peak.value}</div>
        ) : (
          <div className="text-[10px] text-slate-500">
            Peak {peak.value} @ {formatTick(peak.tick)}
          </div>
        )}
        <svg width={width} height={height} className="overflow-visible">
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className={tone} />
        </svg>
      </div>
    </div>
  );
};

const RatioBar = ({
  label,
  segments,
}: {
  label: string;
  segments: Array<{ label: string; value: number; color: string }>;
}) => {
  const totalRaw = segments.reduce((sum, segment) => sum + segment.value, 0);
  const total = totalRaw || 1;
  const [hoveredSegmentLabel, setHoveredSegmentLabel] = useState<string | null>(null);
  const withPercent = segments.map((segment, index) => {
    const widthPercent = (segment.value / total) * 100;
    const leftPercent = segments
      .slice(0, index)
      .reduce((sum, prev) => sum + (prev.value / total) * 100, 0);
    return {
      ...segment,
      percent: Math.round(widthPercent),
      widthPercent,
      leftPercent,
    };
  });
  const hoveredSegment = withPercent.find(
    (segment) => segment.label === hoveredSegmentLabel
  );
  const tooltipLeftPercent = hoveredSegment
    ? Math.min(
        96,
        Math.max(4, hoveredSegment.leftPercent + hoveredSegment.widthPercent / 2)
      )
    : 50;

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="uppercase tracking-[0.2em]">{label}</span>
        <span className="text-slate-500">母数 {totalRaw}人 (100%)</span>
      </div>
      <div
        className="relative mt-3"
        onMouseLeave={() => setHoveredSegmentLabel(null)}
      >
        {hoveredSegment ? (
          <div
            className="pointer-events-none absolute -top-9 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-700/80 bg-slate-950/95 px-2 py-1 text-[10px] text-slate-100 shadow-lg"
            style={{ left: `${tooltipLeftPercent}%` }}
          >
            {hoveredSegment.label}: {hoveredSegment.value} ({hoveredSegment.percent}%)
          </div>
        ) : null}
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-800">
          {withPercent.map((segment) => (
            <button
              key={segment.label}
              type="button"
              style={{ width: `${segment.widthPercent}%` }}
              className={`${segment.color} h-full border-0 p-0 transition-opacity hover:opacity-80 focus-visible:opacity-80 focus-visible:outline-none`}
              onMouseEnter={() => setHoveredSegmentLabel(segment.label)}
              onFocus={() => setHoveredSegmentLabel(segment.label)}
              onBlur={() => setHoveredSegmentLabel((prev) =>
                prev === segment.label ? null : prev
              )}
              aria-label={`${segment.label}: ${segment.value} (${segment.percent}%)`}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
        {withPercent.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between">
            <span>{segment.label}</span>
            <span className="text-slate-300">
              {segment.value} ({segment.percent}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const EVENT_LABELS: Record<string, string> = {
  ALERT: "警報アラート",
  OFFICIAL: "行政アナウンス",
  RUMOR: "うわさ拡散",
  EVACUATE: "避難行動",
  SUPPORT: "救助・支援",
  CHECKIN: "安否報告",
  TALK: "会話",
  MOVE: "移動",
  ACTIVITY: "日常行動",
  INTERVENTION: "プレイヤー介入",
};

const EVENT_VISUALS: Record<
  string,
  {
    icon: string;
    detail: string;
    cardTone: string;
    meterTone: string;
  }
> = {
  ALERT: {
    icon: "🚨",
    detail: "危険を知らせる緊急通知",
    cardTone: "border-rose-300/40 bg-rose-500/10",
    meterTone: "bg-rose-400",
  },
  OFFICIAL: {
    icon: "📣",
    detail: "行政からのお知らせ",
    cardTone: "border-cyan-300/40 bg-cyan-500/10",
    meterTone: "bg-cyan-400",
  },
  RUMOR: {
    icon: "🗣️",
    detail: "未確認のうわさ情報",
    cardTone: "border-amber-300/40 bg-amber-500/10",
    meterTone: "bg-amber-400",
  },
  EVACUATE: {
    icon: "🏃",
    detail: "避難移動のアクション",
    cardTone: "border-sky-300/40 bg-sky-500/10",
    meterTone: "bg-sky-400",
  },
  SUPPORT: {
    icon: "🤝",
    detail: "救助・支援の行動ログ",
    cardTone: "border-emerald-300/40 bg-emerald-500/10",
    meterTone: "bg-emerald-400",
  },
  CHECKIN: {
    icon: "✅",
    detail: "安否確認・連絡の記録",
    cardTone: "border-lime-300/40 bg-lime-500/10",
    meterTone: "bg-lime-400",
  },
  TALK: {
    icon: "💬",
    detail: "住民同士の会話",
    cardTone: "border-fuchsia-300/40 bg-fuchsia-500/10",
    meterTone: "bg-fuchsia-400",
  },
  MOVE: {
    icon: "🧭",
    detail: "エリア間の移動",
    cardTone: "border-indigo-300/40 bg-indigo-500/10",
    meterTone: "bg-indigo-400",
  },
  ACTIVITY: {
    icon: "🏠",
    detail: "日常行動のログ",
    cardTone: "border-slate-400/40 bg-slate-600/20",
    meterTone: "bg-slate-400",
  },
  INTERVENTION: {
    icon: "🎯",
    detail: "プレイヤー操作で発生",
    cardTone: "border-orange-300/40 bg-orange-500/10",
    meterTone: "bg-orange-400",
  },
};

const VECTOR_STATUS_LABELS: Record<string, string> = {
  pending: "集計中",
  ready: "集計完了",
  disabled: "無効",
  unavailable: "未設定",
  error: "エラー",
};

const VECTOR_STATUS_TONES: Record<string, string> = {
  pending: "border-amber-300/40 bg-amber-400/15 text-amber-100",
  ready: "border-cyan-300/40 bg-cyan-400/15 text-cyan-100",
  disabled: "border-slate-600/60 bg-slate-800/60 text-slate-300",
  unavailable: "border-slate-600/60 bg-slate-800/60 text-slate-300",
  error: "border-rose-300/40 bg-rose-500/15 text-rose-100",
};

const VECTOR_ISSUE_LABELS: Record<string, string> = {
  NONE: "リンク正常",
  EMBEDDING_COOLDOWN: "Embedding待機",
  NO_NEIGHBORS: "近傍0件",
  MISSING_MEMORY_LINKS: "ID照合失敗",
};

const THREAD_MOOD_LABELS: Record<string, string> = {
  ESCALATING: "炎上中",
  CONTESTED: "拮抗",
  STABILIZING: "鎮静化",
};

const THREAD_MOOD_TONES: Record<string, string> = {
  ESCALATING: "border-rose-300/40 bg-rose-500/15 text-rose-100",
  CONTESTED: "border-amber-300/40 bg-amber-500/15 text-amber-100",
  STABILIZING: "border-emerald-300/40 bg-emerald-500/15 text-emerald-100",
};

const VECTOR_NARRATIVE_LIMIT = 3;

const trimLine = (text: string, max = 60) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const dedupeTextLines = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const formatThreadTickWindow = (thread: VectorConversationThread) => {
  if (
    typeof thread.tickStart === "number" &&
    typeof thread.tickEnd === "number"
  ) {
    return ` (t${thread.tickStart}-t${thread.tickEnd})`;
  }
  return "";
};

const hasDominantType = (
  thread: VectorConversationThread,
  targets: TimelineEventType[]
) =>
  thread.dominantTypes.some((type) =>
    targets.includes(type.type as TimelineEventType)
  );

const hasResolutionSignal = (thread: VectorConversationThread) =>
  thread.mood === "STABILIZING" ||
  typeof thread.reversalTick === "number" ||
  hasDominantType(thread, ["CHECKIN", "OFFICIAL", "ALERT"]);

const isConcernThread = (thread: VectorConversationThread) => {
  const hasRumorSignal =
    thread.mood === "ESCALATING" ||
    thread.contamination >= 50 ||
    hasDominantType(thread, ["RUMOR"]);
  if (!hasRumorSignal) return false;

  const likelyResolved =
    hasResolutionSignal(thread) &&
    thread.mood !== "ESCALATING" &&
    thread.contamination < 60 &&
    !hasDominantType(thread, ["RUMOR"]);

  return !likelyResolved;
};

const isResolutionThread = (thread: VectorConversationThread) =>
  hasResolutionSignal(thread);

const buildVectorPlayerSummary = (input: {
  threads: VectorConversationThread[];
  clusters: VectorClusterSummary[];
}) => {
  const conversationHighlights = dedupeTextLines(
    input.threads
      .slice(0, VECTOR_NARRATIVE_LIMIT)
      .map((thread) => `${trimLine(thread.lead, 58)}${formatThreadTickWindow(thread)}`)
  ).slice(0, VECTOR_NARRATIVE_LIMIT);

  const concernHighlights = dedupeTextLines(
    input.threads
      .filter((thread) => isConcernThread(thread))
      .sort((a, b) => {
        if (b.contamination !== a.contamination) {
          return b.contamination - a.contamination;
        }
        return b.turnCount - a.turnCount;
      })
      .map((thread) => {
        const tag = thread.contamination >= 60 ? "噂優勢" : "注意";
        return `${tag}: ${trimLine(thread.lead, 50)}${formatThreadTickWindow(thread)}`;
      })
  ).slice(0, VECTOR_NARRATIVE_LIMIT);

  const resolutionHighlights = dedupeTextLines(
    input.threads
      .filter((thread) => isResolutionThread(thread))
      .sort((a, b) => {
        if (
          typeof b.reversalTick === "number" &&
          typeof a.reversalTick !== "number"
        ) {
          return 1;
        }
        if (
          typeof a.reversalTick === "number" &&
          typeof b.reversalTick !== "number"
        ) {
          return -1;
        }
        return b.turnCount - a.turnCount;
      })
      .map((thread) => {
        if (typeof thread.reversalTick === "number") {
          return `反転 t${thread.reversalTick}: ${trimLine(thread.lead, 46)}`;
        }
        if (hasDominantType(thread, ["CHECKIN"])) {
          return `安否確認: ${trimLine(thread.lead, 48)}`;
        }
        if (hasDominantType(thread, ["OFFICIAL", "ALERT"])) {
          return `行政情報が浸透: ${trimLine(thread.lead, 48)}`;
        }
        return `鎮静化: ${trimLine(thread.lead, 48)}`;
      })
  ).slice(0, VECTOR_NARRATIVE_LIMIT);

  const rumorCluster = input.clusters.find((cluster) => cluster.label.includes("噂"));
  const officialCluster = input.clusters.find(
    (cluster) =>
      cluster.label.includes("公式") ||
      cluster.label.includes("警報") ||
      cluster.label.includes("安否")
  );

  return {
    conversations:
      conversationHighlights.length > 0
        ? conversationHighlights
        : dedupeTextLines(
            input.clusters
              .slice(0, VECTOR_NARRATIVE_LIMIT)
              .map((cluster) => trimLine(cluster.representative, 60))
          ).slice(0, VECTOR_NARRATIVE_LIMIT),
    concerns:
      concernHighlights.length > 0
        ? concernHighlights
        : rumorCluster
          ? [`噂系の会話が${rumorCluster.count}件あり、監視継続が必要です。`]
          : ["大きな不安拡大は検出されませんでした。"],
    resolutions:
      resolutionHighlights.length > 0
        ? resolutionHighlights
        : officialCluster
          ? [`${officialCluster.label.replace("クラスタ", "")}が${officialCluster.count}件あり、収束の兆しがあります。`]
          : ["解決に向かう会話は次回集計で確認してください。"],
  };
};

const buildVectorActionHint = (input: {
  metrics: Metrics;
  vectorMetricsAvailable: boolean;
  rumorScore: number;
  stabilizationRate: number;
  hasConcern: boolean;
}) => {
  if (!input.vectorMetricsAvailable) {
    return "Embedding待機が発生したため部分結果です。行政アナウンスと安否確認を優先して次回集計で汚染度を確認してください。";
  }
  if (
    input.rumorScore >= 60 ||
    input.metrics.rumorSpread > STABILIZE_TARGET.rumorMax
  ) {
    return "噂が優勢です。デマ監視とファクトチェックを早めに重ねると沈静化しやすくなります。";
  }
  if (input.metrics.vulnerableReach < STABILIZE_TARGET.vulnerableMin) {
    return "要支援者への到達が不足しています。要支援者支援を優先して到達率を先に底上げしてください。";
  }
  if (
    input.stabilizationRate >= 50 ||
    input.metrics.officialReach >= STABILIZE_TARGET.officialMin
  ) {
    return "収束傾向です。行政アナウンスの頻度を維持し、安否ラインを途切れさせない運用が有効です。";
  }
  if (input.hasConcern) {
    return "不安会話が残っています。行政アラートとルート誘導を組み合わせ、噂に先回りしてください。";
  }
  return "会話は拮抗しています。次のターンで行政アナウンスを重ね、優勢を固定すると安定化しやすくなります。";
};

const resolveIssueTone = (issue?: string) => {
  if (!issue || issue === "NONE") {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
  }
  if (issue === "EMBEDDING_COOLDOWN") {
    return "border-amber-300/40 bg-amber-500/15 text-amber-100";
  }
  if (issue === "NO_NEIGHBORS") {
    return "border-rose-300/40 bg-rose-500/15 text-rose-100";
  }
  return "border-orange-300/40 bg-orange-500/15 text-orange-100";
};

const SimResultsModal = ({
  summary,
  metricsHistory,
  config,
  onRestart,
}: SimResultsModalProps) => {
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const score = computeScore(summary.metrics);
  const grade = getScoreGrade(score);
  const breakdown = buildScoreBreakdown(summary.metrics);
  const history = {
    confusion: metricsHistory.map((item) => item.metrics.confusion),
    rumorSpread: metricsHistory.map((item) => item.metrics.rumorSpread),
    officialReach: metricsHistory.map((item) => item.metrics.officialReach),
    vulnerableReach: metricsHistory.map((item) => item.metrics.vulnerableReach),
    panicIndex: metricsHistory.map((item) => item.metrics.panicIndex),
    trustIndex: metricsHistory.map((item) => item.metrics.trustIndex),
    misinfoBelief: metricsHistory.map((item) => item.metrics.misinfoBelief),
    resourceMisallocation: metricsHistory.map(
      (item) => item.metrics.resourceMisallocation
    ),
  };

  const alertStatus = summary.population.alertStatus;
  const evacStatus = summary.population.evacStatus;
  const eventEntries = Object.entries(summary.eventCounts).sort(
    ([, left], [, right]) => right - left
  );
  const totalEventsRaw = eventEntries.reduce((sum, [, value]) => sum + value, 0);
  const totalEvents = totalEventsRaw || 1;
  const realWorldEquivalent = formatRealWorldEquivalent(summary.simulatedMinutes);
  const vectorInsights = summary.vectorInsights;
  const vectorStatus = vectorInsights?.status ?? "unavailable";
  const vectorMetricsAvailable =
    vectorStatus === "ready" ? (vectorInsights?.metricsAvailable ?? true) : true;
  const rumorOverlap = vectorInsights?.rumorOverlap;
  const vectorReason = vectorInsights?.reason;
  const vectorDiagnostics = vectorInsights?.diagnostics;
  const vectorClusters = vectorInsights?.clusters ?? [];
  const vectorThreads = vectorInsights?.conversationThreads ?? [];
  const totalClusterMemories = vectorClusters.reduce(
    (sum, cluster) => sum + cluster.count,
    0
  );
  const totalNeighborCandidates = vectorClusters.reduce(
    (sum, cluster) => sum + (cluster.vectorNeighborCount ?? 0),
    0
  );
  const totalResolvedNeighbors = vectorClusters.reduce(
    (sum, cluster) => sum + (cluster.resolvedNeighborCount ?? 0),
    0
  );
  const totalUnresolvedNeighbors = vectorClusters.reduce(
    (sum, cluster) => sum + (cluster.unresolvedNeighborCount ?? 0),
    0
  );
  const totalThreadTurns = vectorThreads.reduce(
    (sum, thread) => sum + thread.turnCount,
    0
  );
  const totalThreadParticipants = vectorThreads.reduce(
    (sum, thread) => sum + thread.participantCount,
    0
  );
  const uniqueThreadParticipants = new Set(
    vectorThreads.flatMap((thread) =>
      thread.turns
        .map((turn) => turn.speakerId)
        .filter((speakerId): speakerId is string => Boolean(speakerId))
    )
  ).size;
  const participantCountLabel = uniqueThreadParticipants || totalThreadParticipants;
  const hottestContamination = vectorThreads.reduce(
    (max, thread) => Math.max(max, thread.contamination),
    0
  );
  const averageContamination =
    vectorThreads.length > 0
      ? Math.round(
          vectorThreads.reduce((sum, thread) => sum + thread.contamination, 0) /
            vectorThreads.length
        )
      : 0;
  const stabilizingThreads = vectorThreads.filter(
    (thread) => thread.mood === "STABILIZING"
  ).length;
  const stabilizationRate =
    vectorThreads.length > 0
      ? Math.round((stabilizingThreads / vectorThreads.length) * 100)
      : 0;
  const linkRate =
    totalNeighborCandidates > 0
      ? Math.round((totalResolvedNeighbors / totalNeighborCandidates) * 100)
      : 0;
  const rumorScore = rumorOverlap?.score ?? 0;
  const rumorScoreLabel = vectorMetricsAvailable ? `${rumorScore}%` : "N/A";
  const hottestContaminationLabel = vectorMetricsAvailable
    ? `${hottestContamination}%`
    : "N/A";
  const averageContaminationLabel = vectorMetricsAvailable
    ? `${averageContamination}%`
    : "N/A";
  const stabilizationRateLabel = vectorMetricsAvailable ? `${stabilizationRate}%` : "N/A";
  const stabilizationDetailLabel = vectorMetricsAvailable
    ? `鎮静化 ${stabilizingThreads}/${vectorThreads.length}`
    : "Embedding cooldown中";
  const rumorBarClass =
    !vectorMetricsAvailable
      ? "bg-slate-600"
      : rumorScore >= 60
      ? "bg-rose-400"
      : rumorScore >= 30
        ? "bg-amber-400"
        : "bg-emerald-400";
  const vectorPlayerSummary = buildVectorPlayerSummary({
    threads: vectorThreads,
    clusters: vectorClusters,
  });
  const vectorConcernCount = vectorThreads.filter((thread) =>
    isConcernThread(thread)
  ).length;
  const vectorActionHint = buildVectorActionHint({
    metrics: summary.metrics,
    vectorMetricsAvailable,
    rumorScore,
    stabilizationRate,
    hasConcern: vectorConcernCount > 0,
  });
  const statusTone =
    VECTOR_STATUS_TONES[vectorStatus] ??
    "border-slate-600/60 bg-slate-800/60 text-slate-300";
  const tabs: Array<{ id: ResultTab; label: string }> = [
    { id: "overview", label: "概要" },
    { id: "metrics", label: "主要指標" },
    { id: "breakdown", label: "スコア内訳" },
    { id: "population", label: "人口/イベント" },
    { id: "vector", label: "AI分析" },
  ];

  return (
    <section className="w-full max-w-none rounded-3xl border border-slate-800/80 bg-slate-950/90 p-5 text-slate-100 shadow-[0_40px_120px_rgba(4,8,16,0.65)]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Mission Report
          </p>
          <h2 className="text-2xl font-semibold text-slate-100">
            ミッション結果
          </h2>
          <p className="mt-2 text-xs text-slate-400">
            終了ティック {summary.tick} / 実時間 {formatDuration(summary.durationSeconds)} /
            仮想時間 {summary.simulatedMinutes.toFixed(1)}分 / 現実換算{" "}
            {realWorldEquivalent}（仮想1分=現実{REAL_HOURS_PER_SIM_MINUTE}時間）
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-6 py-4 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
            Town Resilience
          </p>
          <p className="text-[11px] text-emerald-200/80">街の安定度スコア</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-200">{score}</p>
          <p className={`mt-1 text-xs font-semibold ${grade.tone}`}>{grade.label}</p>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition ${
              activeTab === tab.id
                ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-200"
                : "border-slate-800/70 bg-slate-950/60 text-slate-500 hover:border-slate-600/70 hover:text-slate-300"
            }`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-active={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <div key={activeTab} className="tab-panel">
          {activeTab === "overview" ? (
          <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <div className="grid gap-3">
              <OutcomeBadge summary={summary} />
              <div className="grid grid-cols-2 gap-2">
                <MetricCard
                  compact
                  label="混乱度"
                  value={summary.metrics.confusion}
                  peak={summary.peaks.confusion}
                  history={history.confusion}
                  tone="text-rose-300"
                />
                <MetricCard
                  compact
                  label="噂拡散"
                  value={summary.metrics.rumorSpread}
                  peak={summary.peaks.rumorSpread}
                  history={history.rumorSpread}
                  tone="text-amber-300"
                />
                <MetricCard
                  compact
                  label="行政情報の到達"
                  value={summary.metrics.officialReach}
                  peak={summary.peaks.officialReach}
                  history={history.officialReach}
                  tone="text-emerald-300"
                />
                <MetricCard
                  compact
                  label="要支援者への到達"
                  value={summary.metrics.vulnerableReach}
                  peak={summary.peaks.vulnerableReach}
                  history={history.vulnerableReach}
                  tone="text-sky-300"
                />
              </div>
            </div>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  ミッション結果
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  {buildMissionChecks(summary.metrics).map((mission) => (
                    <div
                      key={mission.key}
                      className={`rounded-xl border p-2.5 ${
                        MISSION_CHECK_VISUALS[mission.key]?.cardTone ??
                        "border-slate-700/60 bg-slate-900/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300/40 bg-slate-200/10 text-sm"
                              aria-hidden="true"
                            >
                              {MISSION_CHECK_VISUALS[mission.key]?.icon ?? "✅"}
                            </span>
                            <p className="truncate text-[10px] font-semibold text-slate-100">
                              {mission.label} (
                              {MISSION_CHECK_VISUALS[mission.key]?.helper ?? "ミッション指標"})
                            </p>
                          </div>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            mission.ok
                              ? "border-emerald-300/55 bg-emerald-500/15 text-emerald-100"
                              : "border-slate-600/65 bg-slate-800/70 text-slate-300"
                          }`}
                        >
                          {mission.ok ? "達成" : "未達"}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">目標 {mission.target}</span>
                        <span className="text-slate-300">現在値 {mission.current}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  町のプロフィール
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-cyan-300/35 bg-[linear-gradient(135deg,rgba(8,47,73,0.55),rgba(12,74,110,0.18))] p-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/45 bg-cyan-400/15 text-base"
                        aria-hidden="true"
                      >
                        🗺️
                      </span>
                      <div>
                        <p className="text-[10px] text-slate-400">地形</p>
                        <p className="text-xs font-semibold text-cyan-100">
                          {TERRAIN_LABELS[config.terrain]}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-rose-300/35 bg-[linear-gradient(135deg,rgba(76,5,25,0.55),rgba(127,29,29,0.16))] p-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300/45 bg-rose-400/15 text-base"
                        aria-hidden="true"
                      >
                        🌋
                      </span>
                      <div>
                        <p className="text-[10px] text-slate-400">災害</p>
                        <p className="text-xs font-semibold text-rose-100">
                          {DISASTER_LABELS[summary.disaster]}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-300/35 bg-[linear-gradient(135deg,rgba(120,53,15,0.55),rgba(146,64,14,0.16))] p-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-300/45 bg-amber-400/15 text-base"
                        aria-hidden="true"
                      >
                        😊
                      </span>
                      <div>
                        <p className="text-[10px] text-slate-400">住民気分</p>
                        <p className="text-xs font-semibold text-amber-100">
                          {EMOTION_TONE_LABELS[config.emotionTone]}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-300/35 bg-[linear-gradient(135deg,rgba(6,78,59,0.55),rgba(6,95,70,0.16))] p-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300/45 bg-emerald-400/15 text-base"
                        aria-hidden="true"
                      >
                        👨‍👩‍👧‍👦
                      </span>
                      <div>
                        <p className="text-[10px] text-slate-400">年齢層</p>
                        <p className="text-xs font-semibold text-emerald-100">
                          {AGE_PROFILE_LABELS[config.ageProfile]}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

          {activeTab === "metrics" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              compact
              label="混乱度"
              value={summary.metrics.confusion}
              peak={summary.peaks.confusion}
              history={history.confusion}
              tone="text-rose-300"
            />
            <MetricCard
              compact
              label="噂拡散"
              value={summary.metrics.rumorSpread}
              peak={summary.peaks.rumorSpread}
              history={history.rumorSpread}
              tone="text-amber-300"
            />
            <MetricCard
              compact
              label="行政情報の到達"
              value={summary.metrics.officialReach}
              peak={summary.peaks.officialReach}
              history={history.officialReach}
              tone="text-emerald-300"
            />
            <MetricCard
              compact
              label="要支援者への到達"
              value={summary.metrics.vulnerableReach}
              peak={summary.peaks.vulnerableReach}
              history={history.vulnerableReach}
              tone="text-sky-300"
            />
            <MetricCard
              compact
              label="パニック"
              value={summary.metrics.panicIndex}
              peak={summary.peaks.panicIndex}
              history={history.panicIndex}
              tone="text-rose-200"
            />
            <MetricCard
              compact
              label="行政情報の信頼"
              value={summary.metrics.trustIndex}
              peak={summary.peaks.trustIndex}
              history={history.trustIndex}
              tone="text-emerald-200"
            />
            <MetricCard
              compact
              label="誤情報信念"
              value={summary.metrics.misinfoBelief}
              peak={summary.peaks.misinfoBelief}
              history={history.misinfoBelief}
              tone="text-amber-200"
            />
            <MetricCard
              compact
              label="誤配分"
              value={summary.metrics.resourceMisallocation}
              peak={summary.peaks.resourceMisallocation}
              history={history.resourceMisallocation}
              tone="text-indigo-200"
            />
          </div>
        ) : null}

          {activeTab === "breakdown" ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              スコアの読み方
            </p>
            <p className="mt-2 text-sm text-slate-200">
              行政のお知らせと支援が届き、うわさと混乱が抑えられるほどスコアが高くなります。
            </p>
            <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
              {breakdown.map((part) => (
                <div
                  key={part.label}
                  className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/50 px-3 py-2"
                >
                  <span className="text-slate-300">{part.label}</span>
                  <span className="text-slate-500">
                    {part.value} × {Math.round(part.weight * 100)}%
                  </span>
                  <span className={`text-sm font-semibold ${part.tone}`}>
                    +{part.contribution}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

          {activeTab === "population" ? (
          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3">
              <RatioBar
                label="警報の伝わり方"
                segments={[
                  {
                    label: "行政のお知らせで把握",
                    value: alertStatus.OFFICIAL,
                    color: "bg-emerald-400",
                  },
                  {
                    label: "うわさで把握",
                    value: alertStatus.RUMOR,
                    color: "bg-amber-400",
                  },
                  {
                    label: "まだ把握できていない",
                    value: alertStatus.NONE,
                    color: "bg-slate-600",
                  },
                ]}
              />
              <RatioBar
                label="住民の行動状態"
                segments={[
                  { label: "避難中", value: evacStatus.EVACUATING, color: "bg-sky-400" },
                  {
                    label: "避難所に到着",
                    value: evacStatus.SHELTERED,
                    color: "bg-emerald-400",
                  },
                  {
                    label: "支援活動中",
                    value: evacStatus.HELPING,
                    color: "bg-indigo-400",
                  },
                  { label: "その場待機", value: evacStatus.STAY, color: "bg-slate-600" },
                ]}
              />
            </div>
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  イベントログ
                </p>
                <span className="rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-300">
                  Total {totalEventsRaw}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                起きた出来事をアイコン付きで表示しています。
              </p>
              <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-800/80 text-[11px] text-slate-400">
                {eventEntries.map(([key, value]) => {
                  const visual = EVENT_VISUALS[key] ?? {
                    icon: "🧩",
                    detail: "分類外イベント",
                    cardTone: "border-slate-500/40 bg-slate-700/20",
                    meterTone: "bg-slate-400",
                  };
                  const ratio = Math.round((value / totalEvents) * 100);
                  return (
                    <div
                      key={key}
                      className="bg-slate-950/90 p-2 transition-colors hover:bg-slate-900/85"
                      title={`${EVENT_LABELS[key] ?? key}: ${value}件 (${ratio}%) / ${visual.detail}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm leading-none" aria-hidden="true">
                          {visual.icon}
                        </span>
                        <p className="ml-auto text-sm font-semibold text-slate-100">{value}</p>
                      </div>
                      <p className="mt-1 truncate text-[10px] font-semibold text-slate-200">
                        {EVENT_LABELS[key] ?? key}
                      </p>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                        <div className={`h-full rounded-full ${visual.meterTone}`} style={{ width: `${ratio}%` }} />
                      </div>
                      <p className="mt-1 text-[9px] text-slate-500">{ratio}%</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

          {activeTab === "vector" ? (
          <div className="relative overflow-hidden rounded-2xl border border-cyan-900/70 bg-[radial-gradient(circle_at_12%_8%,rgba(6,182,212,0.2),transparent_40%),radial-gradient(circle_at_90%_0%,rgba(16,185,129,0.14),transparent_38%),rgba(2,6,23,0.92)] p-4">
            <div className="pointer-events-none absolute -right-16 top-8 h-40 w-40 rounded-full bg-cyan-300/15 blur-3xl" />
            <div className="pointer-events-none absolute -left-12 bottom-6 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />
            <div className="relative flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-200/70">
                  Vector Insights
                </p>
                <h3 className="mt-1 text-sm font-semibold text-slate-100">
                  Tactical Signal Board
                </h3>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${statusTone}`}
              >
                {VECTOR_STATUS_LABELS[vectorStatus] ?? vectorStatus}
              </span>
            </div>
            {vectorInsights?.status === "ready" ? (
              <div className="relative mt-4 grid gap-3 text-[11px] text-slate-300">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-cyan-900/70 bg-slate-950/75 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      会話ライン
                    </p>
                    <p className="mt-1 text-xl font-semibold text-cyan-100">
                      {vectorThreads.length}
                    </p>
                    <p className="text-[10px] text-slate-500">主要スレッド</p>
                  </div>
                  <div className="rounded-xl border border-cyan-900/70 bg-slate-950/75 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      発話ターン
                    </p>
                    <p className="mt-1 text-xl font-semibold text-slate-100">
                      {totalThreadTurns}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      参加者 {participantCountLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-900/70 bg-slate-950/75 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      噂の汚染度
                    </p>
                    <p className="mt-1 text-xl font-semibold text-rose-200">{rumorScoreLabel}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-1.5 ${rumorBarClass}`}
                        style={{ width: `${vectorMetricsAvailable ? rumorScore : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-cyan-900/70 bg-slate-950/75 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      鎮静化率
                    </p>
                    <p className="mt-1 text-xl font-semibold text-emerald-200">
                      {stabilizationRateLabel}
                    </p>
                    <p className="text-[10px] text-slate-500">{stabilizationDetailLabel}</p>
                  </div>
                </div>

                {vectorReason ? (
                  <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                    補足: {vectorReason}
                  </div>
                ) : null}

                <div className="grid gap-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/75 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      どんな会話があったか
                    </p>
                    <ul className="mt-2 space-y-1.5 text-[11px] text-slate-200">
                      {vectorPlayerSummary.conversations.length > 0 ? (
                        vectorPlayerSummary.conversations.map((line) => (
                          <li key={`conversation-${line}`}>・{line}</li>
                        ))
                      ) : (
                        <li className="text-slate-500">・会話サマリーを作れるデータがありません。</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/75 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      不安ポイント
                    </p>
                    <ul className="mt-2 space-y-1.5 text-[11px] text-amber-100">
                      {vectorPlayerSummary.concerns.map((line) => (
                        <li key={`concern-${line}`}>・{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/75 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      解決の進展
                    </p>
                    <ul className="mt-2 space-y-1.5 text-[11px] text-emerald-100">
                      {vectorPlayerSummary.resolutions.map((line) => (
                        <li key={`resolution-${line}`}>・{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
                  次の一手: {vectorActionHint}
                </div>

                <details className="rounded-xl border border-slate-800/80 bg-slate-950/65 p-3 text-[10px] text-slate-400">
                  <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    技術詳細を表示
                  </summary>
                  <div className="mt-3 grid gap-2 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-xl border border-slate-800/80 bg-slate-950/75 p-3">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300">噂の汚染度</span>
                        <span className="font-semibold text-slate-100">{rumorScoreLabel}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-2 ${rumorBarClass}`}
                          style={{ width: `${vectorMetricsAvailable ? rumorScore : 0}%` }}
                        />
                      </div>
                      {vectorMetricsAvailable ? (
                        <p className="mt-2 text-[10px] text-slate-500">
                          噂サンプル {rumorOverlap?.rumorSamples ?? 0}件 / 近傍解決{" "}
                          {rumorOverlap?.neighborSamples ?? 0}件 / 行政情報近似{" "}
                          {rumorOverlap?.officialLike ?? 0}件
                        </p>
                      ) : (
                        <p className="mt-2 text-[10px] text-slate-500">
                          Embedding cooldown中のため汚染度は未算出です。
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
                        <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1">
                          クラスタ対象 {totalClusterMemories}
                        </span>
                        <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1">
                          近傍候補 {totalNeighborCandidates}
                        </span>
                        <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1">
                          接続率 {linkRate}%
                        </span>
                        <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1">
                          未接続ID {totalUnresolvedNeighbors}
                        </span>
                        <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1">
                          最大汚染度 {hottestContaminationLabel}
                        </span>
                        <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1">
                          平均汚染度 {averageContaminationLabel}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800/80 bg-slate-950/75 p-3">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        パイプライン診断
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <div className="rounded-lg border border-slate-800/70 bg-slate-900/70 px-2 py-1">
                          クエリ数 {vectorDiagnostics?.neighborQueries ?? 0}
                        </div>
                        <div className="rounded-lg border border-slate-800/70 bg-slate-900/70 px-2 py-1">
                          Embedding待機 {vectorDiagnostics?.embedSkipped ?? 0}
                        </div>
                        <div className="rounded-lg border border-slate-800/70 bg-slate-900/70 px-2 py-1">
                          近傍0件 {vectorDiagnostics?.emptyNeighborResults ?? 0}
                        </div>
                        <div className="rounded-lg border border-slate-800/70 bg-slate-900/70 px-2 py-1">
                          未接続ID {vectorDiagnostics?.unresolvedNeighborSamples ?? 0}
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {vectorClusters.slice(0, 3).map((cluster) => (
                          <div
                            key={`${cluster.label}-${cluster.issue}`}
                            className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/60 px-2 py-1"
                          >
                            <span className="text-slate-500">{cluster.label}</span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] ${resolveIssueTone(
                                cluster.issue
                              )}`}
                            >
                              {VECTOR_ISSUE_LABELS[cluster.issue ?? "NONE"] ?? cluster.issue}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {vectorThreads.length > 0 ? (
                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                      {vectorThreads.map((thread) => (
                        <div
                          key={thread.id}
                          className="rounded-xl border border-cyan-900/70 bg-slate-950/75 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                              {thread.title}
                            </p>
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] ${
                                THREAD_MOOD_TONES[thread.mood] ??
                                "border-slate-500/40 bg-slate-700/30 text-slate-200"
                              }`}
                            >
                              {THREAD_MOOD_LABELS[thread.mood] ?? thread.mood}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-300">{thread.lead}</p>
                          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
                            <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1">
                              汚染度 {thread.contamination}%
                            </span>
                            <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1">
                              発話 {thread.turnCount}件
                            </span>
                            {typeof thread.reversalTick === "number" ? (
                              <span className="rounded-full border border-emerald-300/45 bg-emerald-500/12 px-2 py-1 text-emerald-100">
                                反転 t{thread.reversalTick}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </details>
              </div>
            ) : (
              <div className="mt-3 space-y-2 text-[11px]">
                <p className="text-slate-300">
                  {vectorStatus === "pending"
                    ? "Vector Search を集計中です。"
                    : "Vector Search の集計結果がまだありません。"}
                </p>
                {vectorReason ? (
                  <p className="rounded-lg border border-slate-700/70 bg-slate-950/70 px-2 py-1 text-slate-400">
                    reason: {vectorReason}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          ミッションは停止済みです。再開する場合は設定から始め直してください。
        </p>
        <button
          className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300"
          onClick={onRestart}
          type="button"
        >
          設定を変更して再開
        </button>
      </div>
    </section>
  );
};

export default SimResultsModal;
