"use client";

import { useMemo } from "react";
import { useSimStore } from "@/store/useSimStore";
import type { TimelineEventType } from "@/types/sim";

const EVENT_TYPES: TimelineEventType[] = [
  "ALERT",
  "OFFICIAL",
  "RUMOR",
  "EVACUATE",
  "SUPPORT",
  "CHECKIN",
  "MOVE",
  "TALK",
  "INTERVENTION",
];

const EVENT_LABELS: Record<TimelineEventType, string> = {
  MOVE: "移動",
  TALK: "会話",
  RUMOR: "噂",
  OFFICIAL: "公式",
  ALERT: "警報",
  EVACUATE: "避難",
  SUPPORT: "支援",
  CHECKIN: "安否",
  INTERVENTION: "介入",
};

const LeftTimeline = () => {
  const timeline = useSimStore((state) => state.timeline);
  const filters = useSimStore((state) => state.ui.filters);
  const toggleFilter = useSimStore((state) => state.toggleFilter);
  const selectAgent = useSimStore((state) => state.selectAgent);

  const filtered = useMemo(
    () => timeline.filter((event) => filters.includes(event.type)),
    [filters, timeline]
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-4 text-slate-100 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
          タイムライン
        </h2>
        <span className="text-xs text-slate-500">最新順</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map((type) => (
          <button
            key={type}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              filters.includes(type)
                ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                : "border-slate-700/70 bg-slate-900/50 text-slate-400"
            }`}
            onClick={() => toggleFilter(type)}
          >
            {EVENT_LABELS[type]}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">イベントはまだありません。</p>
        ) : (
          filtered.map((event) => (
            <button
              key={event.id}
              onClick={() => {
                const firstActor = event.actors?.[0];
                if (firstActor) selectAgent(firstActor);
              }}
              className="w-full rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3 text-left text-sm text-slate-200 transition hover:border-emerald-400/40"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{EVENT_LABELS[event.type]}</span>
                <span>t{event.tick}</span>
              </div>
              <p className="mt-2 text-sm text-slate-100">
                {event.message ?? "移動が記録されました。"}
              </p>
              {event.actors?.length ? (
                <p className="mt-2 text-xs text-slate-400">
                  対象: {event.actors.join(", ")}
                </p>
              ) : null}
            </button>
          ))
        )}
      </div>
    </section>
  );
};

export default LeftTimeline;
