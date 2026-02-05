"use client";

import { useState } from "react";
import type { Metrics, SimConfig, SimEndSummary } from "@/types/sim";
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

const computeScore = (metrics: Metrics) => {
  return Math.max(0, Math.min(100, Math.round(metrics.stabilityScore)));
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
      label: "公式到達",
      value: metrics.officialReach,
      weight: 0.2,
      tone: "text-emerald-300",
    },
    {
      label: "要支援到達",
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
      label: "公式信頼",
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

const OutcomeBadge = ({ reason }: { reason: SimEndSummary["reason"] }) => {
  const config = {
    STABILIZED: {
      label: "安定化達成",
      tone: "from-emerald-400/30 to-emerald-500/10 text-emerald-200",
      desc: "混乱と噂が沈静化しました。",
    },
    TIME_LIMIT: {
      label: "タイムアップ",
      tone: "from-amber-300/30 to-amber-500/10 text-amber-200",
      desc: "時間内に安定化しきれませんでした。",
    },
    ESCALATED: {
      label: "危機拡大",
      tone: "from-rose-400/30 to-rose-500/10 text-rose-200",
      desc: "噂と混乱が閾値を超えました。",
    },
  }[reason];

  return (
    <div
      className={`rounded-2xl border border-slate-800/80 bg-gradient-to-br p-3 ${config.tone}`}
    >
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
        Outcome
      </p>
      <h3 className="mt-2 text-base font-semibold">{config.label}</h3>
      <p className="mt-1 text-xs text-slate-300">{config.desc}</p>
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
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="uppercase tracking-[0.2em]">{label}</span>
        <span className="text-slate-500">Total {total}</span>
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-800">
        {segments.map((segment) => (
          <div
            key={segment.label}
            style={{ width: `${(segment.value / total) * 100}%` }}
            className={segment.color}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between">
            <span>{segment.label}</span>
            <span className="text-slate-300">
              {segment.value} (
              {Math.round((segment.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const EVENT_LABELS: Record<string, string> = {
  ALERT: "警報",
  OFFICIAL: "公式情報",
  RUMOR: "噂",
  EVACUATE: "避難",
  SUPPORT: "支援",
  CHECKIN: "安否",
  TALK: "会話",
  MOVE: "移動",
  ACTIVITY: "生活",
  INTERVENTION: "介入",
};

const VECTOR_STATUS_LABELS: Record<string, string> = {
  pending: "集計中",
  ready: "集計完了",
  disabled: "無効",
  unavailable: "未設定",
  error: "エラー",
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
  const vectorInsights = summary.vectorInsights;
  const vectorStatus = vectorInsights?.status ?? "unavailable";
  const rumorOverlap = vectorInsights?.rumorOverlap;
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
            仮想時間 {summary.simulatedMinutes.toFixed(1)}分
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
              <OutcomeBadge reason={summary.reason} />
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
                  label="公式到達"
                  value={summary.metrics.officialReach}
                  peak={summary.peaks.officialReach}
                  history={history.officialReach}
                  tone="text-emerald-300"
                />
                <MetricCard
                  compact
                  label="要支援到達"
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
                  {[
                    {
                      label: "公式到達 70以上",
                      ok: summary.metrics.officialReach >= 70,
                    },
                    {
                      label: "要支援到達 60以上",
                      ok: summary.metrics.vulnerableReach >= 60,
                    },
                    {
                      label: "混乱度 35以下",
                      ok: summary.metrics.confusion <= 35,
                    },
                    {
                      label: "噂拡散 25以下",
                      ok: summary.metrics.rumorSpread <= 25,
                    },
                    {
                      label: "パニック 40以下",
                      ok: summary.metrics.panicIndex <= 40,
                    },
                    {
                      label: "公式信頼 60以上",
                      ok: summary.metrics.trustIndex >= 60,
                    },
                    {
                      label: "誤情報信念 25以下",
                      ok: summary.metrics.misinfoBelief <= 25,
                    },
                    {
                      label: "誤配分 35以下",
                      ok: summary.metrics.resourceMisallocation <= 35,
                    },
                  ].map((mission) => (
                    <div
                      key={mission.label}
                      className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2"
                    >
                      <span className="text-slate-300">{mission.label}</span>
                      <span
                        className={`text-xs font-semibold ${
                          mission.ok ? "text-emerald-200" : "text-slate-500"
                        }`}
                      >
                        {mission.ok ? "達成" : "未達"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  町のプロフィール
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2">
                    <span>地形</span>
                    <span className="text-slate-200">
                      {TERRAIN_LABELS[config.terrain]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2">
                    <span>災害</span>
                    <span className="text-slate-200">
                      {DISASTER_LABELS[summary.disaster]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2">
                    <span>住民気分</span>
                    <span className="text-slate-200">
                      {EMOTION_TONE_LABELS[config.emotionTone]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2">
                    <span>年齢層</span>
                    <span className="text-slate-200">
                      {AGE_PROFILE_LABELS[config.ageProfile]}
                    </span>
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
              label="公式到達"
              value={summary.metrics.officialReach}
              peak={summary.peaks.officialReach}
              history={history.officialReach}
              tone="text-emerald-300"
            />
            <MetricCard
              compact
              label="要支援到達"
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
              label="公式信頼"
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
              公式情報と支援が届き、噂と混乱が抑えられるほどスコアが高くなります。
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
                label="警報認知"
                segments={[
                  { label: "公式", value: alertStatus.OFFICIAL, color: "bg-emerald-400" },
                  { label: "噂", value: alertStatus.RUMOR, color: "bg-amber-400" },
                  { label: "未到達", value: alertStatus.NONE, color: "bg-slate-600" },
                ]}
              />
              <RatioBar
                label="避難状態"
                segments={[
                  { label: "避難中", value: evacStatus.EVACUATING, color: "bg-sky-400" },
                  { label: "避難所", value: evacStatus.SHELTERED, color: "bg-emerald-400" },
                  { label: "支援中", value: evacStatus.HELPING, color: "bg-indigo-400" },
                  { label: "待機", value: evacStatus.STAY, color: "bg-slate-600" },
                ]}
              />
            </div>
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                イベント集計
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                {Object.entries(summary.eventCounts).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span>{EVENT_LABELS[key] ?? key}</span>
                    <span className="text-slate-300">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

          {activeTab === "vector" ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="uppercase tracking-[0.2em]">Vector Insights</span>
              <span className="text-slate-500">
                {VECTOR_STATUS_LABELS[vectorStatus] ?? vectorStatus}
              </span>
            </div>
            {vectorInsights?.status === "ready" ? (
              <div className="mt-3 grid gap-3 text-[11px] text-slate-400">
                <div className="grid gap-2">
                  {vectorInsights.clusters.map((cluster) => (
                    <div
                      key={cluster.label}
                      className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200">{cluster.label}</span>
                        <span className="text-slate-500">{cluster.count}件</span>
                      </div>
                      <p className="mt-2 text-slate-300">{cluster.representative}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                        {cluster.topTypes.map((type) => (
                          <span
                            key={`${cluster.label}-${type.type}`}
                            className="rounded-full border border-slate-800/70 bg-slate-900/60 px-2 py-1"
                          >
                            {EVENT_LABELS[type.type] ?? type.type} {type.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300">噂の汚染度</span>
                    <span className="text-rose-300">
                      {rumorOverlap?.score ?? 0}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-2 bg-rose-400"
                      style={{ width: `${rumorOverlap?.score ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    噂サンプル {rumorOverlap?.rumorSamples ?? 0}件 /
                    近傍 {rumorOverlap?.neighborSamples ?? 0}件
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-slate-500">
                Vector Search の集計結果がまだありません。
              </p>
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
