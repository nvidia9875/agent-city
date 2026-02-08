"use client";

import { useEffect, useRef, useState } from "react";
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
  const track = "rgba(148, 163, 184, 0.22)";

  return (
    <div className="group rounded-xl border border-slate-800/60 bg-slate-900/40 px-2.5 py-2 shadow-[0_8px_20px_rgba(8,12,18,0.3)] backdrop-blur transition hover:border-slate-600/70">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] uppercase tracking-[0.2em] text-slate-400">
          {label}
        </p>
        <span className="text-xs font-semibold text-slate-100">{clamped}</span>
      </div>
      <div className="mt-1.5 h-1 w-full rounded-full" style={{ background: track }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${clamped}%`, background: accent }}
        />
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
  const [showInfo, setShowInfo] = useState(false);
  const infoPanelRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!showInfo) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!infoPanelRef.current?.contains(target)) {
        setShowInfo(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowInfo(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showInfo]);

  return (
    <section className="relative z-30 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-800/60 bg-slate-950/80 px-5 py-3 shadow-[0_20px_60px_rgba(8,12,18,0.5)] backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="relative" ref={infoPanelRef}>
          <p className="text-[10px] tracking-[0.06em] text-slate-400">
            災害対応ミッション・コンソール
          </p>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold uppercase tracking-[0.22em] text-slate-100">
              AGENT TOWN
            </h1>
            <button
              type="button"
              onClick={() => setShowInfo((current) => !current)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/60 text-[11px] font-semibold text-slate-200 transition hover:border-emerald-400/70 hover:text-emerald-200"
              aria-label="シナリオ情報を表示"
              aria-expanded={showInfo}
            >
              i
            </button>
          </div>
          {showInfo ? (
            <div className="absolute left-0 top-full z-[90] mt-2 w-[min(86vw,620px)] rounded-2xl border border-slate-700/80 bg-slate-950/95 px-4 py-3 text-[11px] leading-relaxed text-slate-200 shadow-[0_18px_36px_rgba(2,6,16,0.6)]">
              <span className="absolute -top-1 left-10 h-2 w-2 rotate-45 border-l border-t border-slate-700/80 bg-slate-950/95" />
              <p>
                シナリオ: {TERRAIN_LABELS[terrain]}・{DISASTER_LABELS[disaster]} / 公式警報:{" "}
                {officialDelayMinutes}分遅延 / 住民気分: {EMOTION_TONE_LABELS[emotionTone]} /
                年齢層: {AGE_PROFILE_LABELS[ageProfile]}
              </p>
              <p className="mt-2">
                曖昧さ {ambiguityLevel}% / デマ強度 {misinformationLevel}% / 多言語対応{" "}
                {multilingualCoverage}% / 検証速度 {factCheckSpeed}%
              </p>
              <p className="mt-2">
                目標: 公式到達・要支援到達を上げ、噂拡散・混雑度を下げる。
              </p>
            </div>
          ) : null}
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
      <div className="grid w-full gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
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
