"use client";

import { useSimStore } from "@/store/useSimStore";
import type { Metrics } from "@/types/sim";

const MetricBar = ({ label, value }: { label: string; value: number }) => {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-xs uppercase tracking-wide text-slate-300">
        {label}
      </span>
      <div className="h-2 flex-1 rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-400"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs text-slate-300">{value}</span>
    </div>
  );
};

type TopHudProps = {
  onPauseToggle: () => void;
  onSpeedChange: (speed: 1 | 5 | 20 | 60) => void;
};

const TopHud = ({ onPauseToggle, onSpeedChange }: TopHudProps) => {
  const metrics = useSimStore((state) => state.metrics);
  const metricsTick = useSimStore((state) => state.metricsTick);
  const ui = useSimStore((state) => state.ui);

  const metricList: Array<[keyof Metrics, string]> = [
    ["confusion", "混乱度"],
    ["rumorSpread", "噂拡散"],
    ["officialReach", "公式到達"],
    ["vulnerableReach", "要支援到達"],
  ];

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 px-6 py-4 shadow-[0_20px_60px_rgba(8,12,18,0.5)] backdrop-blur">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            AgentTown
          </p>
          <h1 className="text-lg font-semibold text-slate-100">
            災害対応リハーサル・コンソール
          </h1>
          <p className="mt-1 text-[10px] text-slate-500">
            シナリオ: 沿岸・夕刻 / 公式警報: 15分遅延
          </p>
        </div>
        <div className="rounded-full border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-xs text-slate-200">
          {ui.paused ? "一時停止中" : "稼働中"}
          <span className="ml-2 text-slate-500">ティック {metricsTick ?? 0}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
        {[1, 5, 20, 60].map((speed) => (
          <button
            key={speed}
            onClick={() => onSpeedChange(speed as 1 | 5 | 20 | 60)}
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
          onClick={onPauseToggle}
          className="rounded-full border border-slate-700/80 bg-slate-900/60 px-4 py-1 text-slate-200 hover:border-slate-500"
        >
          {ui.paused ? "再開" : "一時停止"}
        </button>
      </div>
      <div className="flex min-w-[260px] flex-col gap-2">
        {metricList.map(([key, label]) => (
          <MetricBar key={key} label={label} value={metrics?.[key] ?? 0} />
        ))}
      </div>
    </section>
  );
};

export default TopHud;
