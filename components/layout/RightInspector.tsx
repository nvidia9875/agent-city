"use client";

import { useMemo } from "react";
import { useSimStore } from "@/store/useSimStore";
import type { BuildingType } from "@/types/sim";

const MOOD_LABELS: Record<string, string> = {
  calm: "落ち着き",
  anxious: "不安",
  panic: "パニック",
  helpful: "協力的",
};

const BUILDING_LABELS: Record<BuildingType, string> = {
  HOUSE_SMALL: "小さな家",
  HOUSE_MED: "家",
  APARTMENT: "アパート",
  OFFICE: "オフィス",
  CAFE: "カフェ",
  HOSPITAL: "病院",
  SCHOOL: "学校",
  SHELTER: "避難所",
  BULLETIN_BOARD: "掲示板",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "稼働中",
  CLOSED: "閉鎖中",
};

const RightInspector = () => {
  const world = useSimStore((state) => state.world);
  const selected = useSimStore((state) => state.selected);
  const reasoning = useSimStore((state) => state.reasoning);

  const agent = useMemo(() => {
    if (!world || !selected.agentId) return undefined;
    return world.agents[selected.agentId];
  }, [selected.agentId, world]);

  const building = useMemo(() => {
    if (!world || !selected.buildingId) return undefined;
    return world.buildings[selected.buildingId];
  }, [selected.buildingId, world]);

  const agentReasoning = agent ? reasoning[agent.id] : undefined;

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto rounded-3xl border border-slate-800/60 bg-slate-950/80 p-4 text-slate-100 backdrop-blur">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
          インスペクター
        </h2>
        <p className="text-xs text-slate-500">住人または建物の詳細</p>
      </div>

      {!agent && !building ? (
        <div className="rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/40 p-6 text-sm text-slate-400">
          住人または建物を選択してください。
        </div>
      ) : null}

      {agent ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
            <h3 className="text-lg font-semibold text-slate-100">{agent.name}</h3>
            <p className="text-sm text-slate-400">{agent.job}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {agent.personalityTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 text-sm">
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                現在の状態
              </p>
              <div className="mt-2 flex flex-col gap-1 text-slate-200">
                <span>気分: {MOOD_LABELS[agent.state.mood] ?? agent.state.mood}</span>
                <span>ストレス: {agent.state.stress}</span>
                <span>エネルギー: {agent.state.energy}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                目的 / 発話
              </p>
              <p className="mt-2 text-slate-200">
                {agent.goal ?? "周囲の状況を確認中"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                “{agent.bubble ?? "最新情報を確認しています…"}”
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              理由
            </p>
            <p className="mt-2 text-sm text-slate-200">
              {agentReasoning?.why ??
                "最新の案内に従い、周辺の状況を確認しています。"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              記憶参照
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {(agentReasoning?.memoryRefs ?? []).length > 0 ? (
                agentReasoning?.memoryRefs.map((ref) => (
                  <div key={ref.title}>
                    <p className="font-semibold text-slate-200">{ref.title}</p>
                    <p className="text-xs text-slate-400">{ref.text}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">
                  参照できる記憶がありません。
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {building ? (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 text-sm">
          <h3 className="text-lg font-semibold text-slate-100">
            {BUILDING_LABELS[building.type] ?? building.type}
          </h3>
          <p className="mt-2 text-slate-400">
            状態: {STATUS_LABELS[building.status ?? "OPEN"] ?? "稼働中"}
          </p>
          <p className="mt-2 text-slate-400">
            角度: {building.rotation ?? 0}°
          </p>
        </div>
      ) : null}
    </section>
  );
};

export default RightInspector;
