"use client";

import { useSimStore } from "@/store/useSimStore";
import type { Metrics } from "@/types/sim";
import {
  DISASTER_LABELS,
  TERRAIN_LABELS,
  EMOTION_TONE_LABELS,
  AGE_PROFILE_LABELS,
} from "@/utils/simConfig";

const clampValue = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const MetricGauge = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) => {
  const clamped = clampValue(value);
  const track = "rgba(148, 163, 184, 0.25)";

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/40 px-3 py-2 shadow-[0_10px_30px_rgba(8,12,18,0.35)] backdrop-blur transition hover:border-slate-600/70">
      <div className="relative h-12 w-12">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(${accent} ${clamped}%, ${track} ${clamped}% 100%)`,
          }}
        />
        <div className="absolute inset-[3px] flex items-center justify-center rounded-full border border-slate-800/60 bg-slate-950/90 text-[11px] font-semibold text-slate-100">
          {clamped}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">
          {label}
        </p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800/70">
          <div
            className="h-full rounded-full"
            style={{ width: `${clamped}%`, background: accent }}
          />
        </div>
      </div>
    </div>
  );
};

type TopHudProps = {
  onPauseToggle: () => void;
  onSpeedChange: (speed: 1 | 5 | 20 | 60) => void;
  officialDelayMinutes?: number;
  ambiguityLevel?: number;
  misinformationLevel?: number;
  multilingualCoverage?: number;
  factCheckSpeed?: number;
  terrain?: keyof typeof TERRAIN_LABELS;
  disaster?: keyof typeof DISASTER_LABELS;
  emotionTone?: keyof typeof EMOTION_TONE_LABELS;
  ageProfile?: keyof typeof AGE_PROFILE_LABELS;
  onOpenConfig?: () => void;
};

const TopHud = ({
  onPauseToggle,
  onSpeedChange,
  officialDelayMinutes = 15,
  ambiguityLevel = 50,
  misinformationLevel = 50,
  multilingualCoverage = 60,
  factCheckSpeed = 60,
  terrain = "URBAN",
  disaster = "EARTHQUAKE",
  emotionTone = "NEUTRAL",
  ageProfile = "BALANCED",
  onOpenConfig,
}: TopHudProps) => {
  const metrics = useSimStore((state) => state.metrics);
  const ui = useSimStore((state) => state.ui);
  const simEnded = useSimStore((state) => state.sim.ended);

  const metricList: Array<{
    key: keyof Metrics;
    label: string;
    accent: string;
  }> = [
    { key: "confusion", label: "混雑度", accent: "#f97316" },
    { key: "rumorSpread", label: "噂拡散", accent: "#f59e0b" },
    { key: "officialReach", label: "公式到達", accent: "#38bdf8" },
    { key: "vulnerableReach", label: "要支援到達", accent: "#a3e635" },
    { key: "panicIndex", label: "パニック", accent: "#fb7185" },
    { key: "trustIndex", label: "信頼度", accent: "#22d3ee" },
    { key: "misinfoBelief", label: "誤情報信念", accent: "#f472b6" },
    { key: "resourceMisallocation", label: "誤配分", accent: "#facc15" },
  ];

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 px-6 py-4 shadow-[0_20px_60px_rgba(8,12,18,0.5)] backdrop-blur">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            AgentTown
          </p>
          <h1 className="text-lg font-semibold text-slate-100">
            災害対応ミッション・コンソール
          </h1>
          <p className="mt-1 text-[10px] text-slate-500">
            シナリオ: {TERRAIN_LABELS[terrain]}・{DISASTER_LABELS[disaster]} / 公式警報:{" "}
            {officialDelayMinutes}分遅延 / 住民気分: {EMOTION_TONE_LABELS[emotionTone]} /
            年齢層: {AGE_PROFILE_LABELS[ageProfile]}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            曖昧さ {ambiguityLevel}% / デマ強度 {misinformationLevel}% / 多言語対応{" "}
            {multilingualCoverage}% / 検証速度 {factCheckSpeed}%
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            目標: 公式到達・要支援到達を上げ、噂拡散・混雑度を下げる。
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
        {[1, 5, 20, 60].map((speed) => (
          <button
            key={speed}
            onClick={() => onSpeedChange(speed as 1 | 5 | 20 | 60)}
            disabled={simEnded}
            className={`rounded-full border px-3 py-1 transition ${
              ui.speed === speed
                ? "border-emerald-400 bg-emerald-400/20 text-emerald-200"
                : "border-slate-700/80 bg-slate-900/60 text-slate-300 hover:border-slate-500"
            }`}
          >
            ×{speed}
          </button>
        ))}
        <button
          onClick={onOpenConfig}
          className="rounded-full border border-slate-700/80 bg-slate-900/60 px-4 py-1 text-slate-200 hover:border-slate-500"
        >
          設定
        </button>
        <button
          onClick={onPauseToggle}
          disabled={simEnded}
          className="rounded-full border border-slate-700/80 bg-slate-900/60 px-4 py-1 text-slate-200 hover:border-slate-500"
        >
          {ui.paused ? "再開" : "一時停止"}
        </button>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {metricList.map(({ key, label, accent }) => (
          <MetricGauge
            key={key}
            label={label}
            value={metrics?.[key] ?? 0}
            accent={accent}
          />
        ))}
      </div>
    </section>
  );
};

export default TopHud;
