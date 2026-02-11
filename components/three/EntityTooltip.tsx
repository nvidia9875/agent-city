"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { useSimStore } from "@/store/useSimStore";
import { gridToWorld } from "@/utils/grid";
import { ACTIVITY_LABELS } from "@/utils/activity";
import type { Agent, BuildingType } from "@/types/sim";
import * as THREE from "three";

const BUILDING_LABELS: Record<
  BuildingType,
  { name: string; description: string }
> = {
  HOUSE_SMALL: { name: "小さな家", description: "木造住宅 / 近隣の拠点" },
  HOUSE_MED: { name: "家", description: "家族向け住宅" },
  APARTMENT: { name: "アパート", description: "集合住宅" },
  OFFICE: { name: "オフィス", description: "業務拠点 / 連絡拠点" },
  CAFE: { name: "カフェ", description: "一時待機の場" },
  HOSPITAL: { name: "病院", description: "医療拠点 / トリアージ" },
  SCHOOL: { name: "学校", description: "一時避難 / 集合拠点" },
  SHELTER: { name: "避難所", description: "避難・支援の拠点" },
  BULLETIN_BOARD: { name: "掲示板", description: "公式情報の掲示" },
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "稼働中",
  CLOSED: "閉鎖中",
  CROWDED: "混雑",
};

const MOOD_LABELS: Record<string, string> = {
  calm: "落ち着き",
  anxious: "不安",
  panic: "パニック",
  helpful: "協力的",
};

const AGE_LABELS: Record<Agent["profile"]["ageGroup"], string> = {
  child: "子ども",
  adult: "成人",
  senior: "高齢",
};

const MOBILITY_LABELS: Record<Agent["profile"]["mobility"], string> = {
  normal: "通常",
  limited: "制限あり",
  needs_assist: "要介助",
};

const LANGUAGE_LABELS: Record<Agent["profile"]["language"], string> = {
  ja: "日本語",
  en: "英語",
  zh: "中国語",
  ko: "韓国語",
  other: "その他",
};

const HOUSEHOLD_LABELS: Record<Agent["profile"]["household"], string> = {
  alone: "独居",
  family: "家族",
  group: "同居",
};

const ROLE_LABELS: Record<Agent["profile"]["role"], string> = {
  resident: "住民",
  medical: "医療",
  leader: "地域リーダー",
  staff: "運営",
  volunteer: "支援",
  visitor: "訪問者",
};

const ALERT_LABELS: Record<NonNullable<Agent["alertStatus"]>, string> = {
  NONE: "未達",
  RUMOR: "噂経由",
  OFFICIAL: "公式到達",
};

const EVAC_LABELS: Record<NonNullable<Agent["evacStatus"]>, string> = {
  STAY: "様子見",
  EVACUATING: "避難中",
  SHELTERED: "避難完了",
  HELPING: "支援中",
};

const fallbackWhy = (agent: Agent) =>
  `${agent.name}は「${agent.goal ?? "状況確認"}」を優先しています。`;

const truncate = (text: string, max = 48) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

type EntityTooltipProps = {
  hidden?: boolean;
};

const EntityTooltip = ({ hidden = false }: EntityTooltipProps) => {
  const world = useSimStore((state) => state.world);
  const simEnded = useSimStore((state) => state.sim.ended);
  const hoveredAgentId = useSimStore((state) => state.hovered.agentId);
  const hoveredBuildingId = useSimStore((state) => state.hovered.buildingId);
  const selected = useSimStore((state) => state.selected);
  const reasoning = useSimStore((state) => state.reasoning);
  const timeline = useSimStore((state) => state.timeline);
  const setReasoning = useSimStore((state) => state.setReasoning);
  const groupRef = useRef<THREE.Group>(null);
  const targetRef = useRef(new THREE.Vector3());
  const activeKindRef = useRef<"agent" | "building" | null>(null);

  const data = useMemo(() => {
    if (hidden || !world) return null;

    const activeAgentId = selected.agentId ?? hoveredAgentId;
    const activeBuildingId = selected.buildingId ?? hoveredBuildingId;

    if (activeAgentId) {
      const agent = world.agents[activeAgentId];
      if (!agent) return null;
      const { x, z } = gridToWorld(agent.pos, world.width, world.height);
      return {
        kind: "agent" as const,
        agent,
        x,
        z,
      };
    }

    if (activeBuildingId) {
      const building = world.buildings[activeBuildingId];
      if (!building) return null;
      const label = BUILDING_LABELS[building.type];
      const status = building.status ? STATUS_LABELS[building.status] : "稼働中";
      const { x, z } = gridToWorld(building.pos, world.width, world.height);
      return {
        kind: "building" as const,
        building,
        label,
        status,
        x,
        z,
      };
    }

    return null;
  }, [hidden, hoveredAgentId, hoveredBuildingId, selected.agentId, selected.buildingId, world]);

  useEffect(() => {
    if (!data) {
      activeKindRef.current = null;
      return;
    }
    activeKindRef.current = data.kind;
    if (data.kind === "agent") {
      targetRef.current.set(data.x, 1.05, data.z);
      if (groupRef.current) {
        groupRef.current.position.set(data.x, 1.05, data.z);
      }
      return;
    }
    if (groupRef.current) {
      groupRef.current.position.set(data.x, 0.9, data.z);
    }
  }, [data]);

  useFrame(() => {
    if (hidden || simEnded) return;
    if (!groupRef.current) return;
    if (activeKindRef.current === "agent") {
      groupRef.current.position.lerp(targetRef.current, 0.18);
    }
  });

  useEffect(() => {
    if (!world || !selected.agentId) return;
    const selectedAgentId = selected.agentId;

    if (reasoning[selectedAgentId]) return;
    if (process.env.NEXT_PUBLIC_AI_ENABLED !== "true") return;
    if (process.env.NEXT_PUBLIC_WS_URL) return;

    const agent = world.agents[selectedAgentId];
    if (!agent) return;
    if (!agent.isAI) return;

    const recentEvents = timeline
      .filter((event) => event.actors?.includes(selectedAgentId))
      .slice(0, 3)
      .map((event) => event.message ?? event.type);

    const controller = new AbortController();

    fetch("/api/ai/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent,
        tick: world.tick,
        recentEvents,
      }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.reasoning) setReasoning(data.reasoning);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [reasoning, selected.agentId, setReasoning, timeline, world]);

  if (hidden || !data) return null;

  if (data.kind === "agent") {
    const agent = data.agent;
    const agentReasoning = reasoning[agent.id];
    const memories = agentReasoning?.memoryRefs ?? [];
    const vulnerabilityTags = agent.profile.vulnerabilityTags ?? [];

    return (
      <group ref={groupRef}>
        <Html center style={{ pointerEvents: "none" }}>
          <div className="w-[260px] max-w-[260px] rounded-2xl border border-slate-700/70 bg-slate-950/90 px-3 py-2 text-left text-[11px] leading-snug text-slate-100 shadow-[0_12px_24px_rgba(0,0,0,0.45)] break-words whitespace-normal">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-emerald-200">
                {agent.name}
              </p>
              <span className="text-[10px] text-slate-400">
                {ROLE_LABELS[agent.profile.role]} / {agent.job}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {agent.personalityTags.slice(0, 3).map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200"
                >
                  {tag}
                </span>
              ))}
            </div>
            {vulnerabilityTags.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {vulnerabilityTags.slice(0, 3).map((tag, index) => (
                  <span
                    key={`${tag}-${index}`}
                    className="rounded-full border border-rose-400/40 bg-rose-400/10 px-2 py-0.5 text-[10px] text-rose-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-300">
              <span>属性: {AGE_LABELS[agent.profile.ageGroup]}</span>
              <span>同居: {HOUSEHOLD_LABELS[agent.profile.household]}</span>
              <span>言語: {LANGUAGE_LABELS[agent.profile.language]}</span>
              <span>移動: {MOBILITY_LABELS[agent.profile.mobility]}</span>
              <span>
                警報:{" "}
                {ALERT_LABELS[agent.alertStatus ?? "NONE"] ?? "未達"}
              </span>
              <span>
                避難:{" "}
                {EVAC_LABELS[agent.evacStatus ?? "STAY"] ?? "様子見"}
              </span>
              <span>信頼: {agent.profile.trustLevel}</span>
              <span>噂感受: {agent.profile.rumorSusceptibility}</span>
              <span>気分: {MOOD_LABELS[agent.state.mood] ?? agent.state.mood}</span>
              <span>ストレス: {agent.state.stress}</span>
              <span>エネルギー: {agent.state.energy}</span>
              <span>目標: {agent.goal ?? "周辺確認"}</span>
              <span>
                行動: {agent.activity ? ACTIVITY_LABELS[agent.activity] : "不明"}
              </span>
              <span>AI: {agent.isAI ? "LLM" : "ルール"}</span>
            </div>
            <p className="mt-2 text-[10px] text-slate-300">
              発話: {agent.bubble ?? "最新情報を確認中…"}
            </p>
            <p className="mt-2 text-[10px] text-slate-400">
              理由: {truncate(agentReasoning?.why ?? fallbackWhy(agent), 60)}
            </p>
            <div className="mt-2 text-[10px] text-slate-400">
              記憶:
              {memories.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {memories.slice(0, 2).map((memory, index) => (
                    <div
                      key={`${memory.title}-${index}`}
                      className="text-slate-300"
                    >
                      <span className="text-emerald-200">{memory.title}</span>
                      <span> / {truncate(memory.text, 48)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-slate-500">参照情報なし</div>
              )}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              クリックで固定 / 空白クリックで解除
            </p>
          </div>
        </Html>
      </group>
    );
  }

  const capacity = data.building.capacity ?? 0;
  const occupancy = Math.max(0, data.building.occupancy ?? 0);
  const occupancyRatio =
    capacity > 0 ? Math.max(0, Math.min(occupancy / capacity, 1)) : 0;
  const occupancyPercent = Math.round(occupancyRatio * 100);
  const isShelterFocus =
    data.building.type === "SHELTER" || data.building.type === "SCHOOL";
  const gaugeClass =
    occupancyRatio >= 0.9
      ? "bg-rose-400"
      : occupancyRatio >= 0.7
      ? "bg-amber-300"
      : "bg-emerald-300";

  return (
    <group ref={groupRef} position={[data.x, 0.9, data.z]}>
      <Html center style={{ pointerEvents: "none" }}>
        <div className="w-[220px] max-w-[220px] rounded-2xl border border-slate-700/70 bg-slate-950/90 px-3 py-2 text-left text-[11px] leading-snug text-slate-100 shadow-[0_12px_24px_rgba(0,0,0,0.45)] break-words whitespace-normal">
          <p className="text-xs font-semibold text-emerald-200">
            {data.label.name}
          </p>
          <p className="mt-1 text-slate-300">{data.label.description}</p>
          <p className="mt-2 text-slate-400">状態: {data.status}</p>
          {capacity > 0 ? (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-slate-300">
                <span>{isShelterFocus ? "避難受け入れ" : "収容率"}</span>
                <span>
                  {occupancy}/{capacity} ({occupancyPercent}%)
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${gaugeClass}`}
                  style={{ width: `${occupancyPercent}%` }}
                />
              </div>
              {isShelterFocus ? (
                <p className="mt-1 text-[10px] text-slate-400">
                  避難所利用率: {occupancyPercent}%
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="mt-1 text-[10px] text-slate-500">
            クリックで固定 / 空白クリックで解除
          </p>
        </div>
      </Html>
    </group>
  );
};

export default EntityTooltip;
