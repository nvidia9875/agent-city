"use client";

import { useSimStore } from "@/store/useSimStore";

const clampValue = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const ringStyle = (value: number, accent: string) => {
  const clamped = clampValue(value);
  const track = "rgba(148, 163, 184, 0.2)";
  return {
    background: `conic-gradient(${accent} ${clamped}%, ${track} ${clamped}% 100%)`,
  };
};

const SimStatusDock = () => {
  const metrics = useSimStore((state) => state.metrics);
  const metricsTick = useSimStore((state) => state.metricsTick);
  const world = useSimStore((state) => state.world);
  const ui = useSimStore((state) => state.ui);
  const simEnded = useSimStore((state) => state.sim.ended);

  if (!world && metricsTick == null && !metrics) return null;

  const tick = metricsTick ?? world?.tick ?? 0;
  const stability = metrics?.stabilityScore ?? 0;
  const tickCycle = tick % 100;
  const tickProgress = tickCycle;

  const statusLabel = simEnded ? "終了" : ui.paused ? "一時停止" : "稼働中";
  const statusTone = simEnded
    ? "text-slate-400"
    : ui.paused
      ? "text-amber-200"
      : "text-emerald-200";
  const statusDot = simEnded
    ? "bg-slate-500"
    : ui.paused
      ? "bg-amber-400"
      : "bg-emerald-400";

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-30 select-none">
      <div className="flex items-center gap-4 rounded-3xl border border-slate-800/70 bg-slate-950/80 px-4 py-3 shadow-[0_24px_80px_rgba(8,12,18,0.65)] backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="relative h-[72px] w-[72px]">
            <div
              className="absolute inset-0 rounded-full"
              style={ringStyle(stability, "#34d399")}
            />
            <div className="absolute inset-[5px] flex items-center justify-center rounded-full border border-slate-800/60 bg-slate-950/90 text-lg font-semibold text-slate-100">
              {clampValue(stability)}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
              安定度
            </p>
            <p className="text-[11px] text-slate-500">Stability Score</p>
          </div>
        </div>
        <div className="h-12 w-px bg-slate-800/70" />
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12">
            <div
              className="absolute inset-0 rounded-full"
              style={ringStyle(tickProgress, "#38bdf8")}
            />
            <div className="absolute inset-[3px] flex items-center justify-center rounded-full border border-slate-800/60 bg-slate-950/90 text-[10px] font-semibold text-slate-200">
              {tickCycle}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
              ティック
            </p>
            <p className="text-xl font-semibold text-slate-100">{tick}</p>
            <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em]">
              <span className={`inline-flex h-1.5 w-1.5 rounded-full ${statusDot}`} />
              <span className={statusTone}>{statusLabel}</span>
              <span className="text-slate-500">×{ui.speed}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimStatusDock;
