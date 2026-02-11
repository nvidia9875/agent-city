"use client";

import { useEffect, useRef, useState } from "react";
import type { DisasterType } from "@/types/sim";

type Intervention = {
  kind: string;
  label: string;
  description: string;
  message: string;
  cost: number;
  cooldown: number;
};

type BottomInterventionsProps = {
  onIntervention: (intervention: Intervention) => void;
  disabled?: boolean;
  disaster?: DisasterType;
  points?: number;
  maxPoints?: number;
  currentTick?: number;
  cooldowns?: Record<string, number>;
  interventionUseLimit?: number;
  interventionsRemaining?: number;
  pointRecovery?: {
    active: boolean;
    amountPerCycle: number;
    cycleTicks: number;
    ticksUntilNext: number;
    progressPercent: number;
  };
};

const INTERVENTION_BALANCE: Record<
  Intervention["kind"],
  Pick<Intervention, "cost" | "cooldown">
> = {
  official_alert: { cost: 32, cooldown: 10 },
  open_shelter: { cost: 28, cooldown: 12 },
  fact_check: { cost: 18, cooldown: 6 },
  support_vulnerable: { cost: 36, cooldown: 12 },
  multilingual_broadcast: { cost: 24, cooldown: 7 },
  route_guidance: { cost: 20, cooldown: 5 },
  rumor_monitoring: { cost: 16, cooldown: 5 },
  volunteer_mobilization: { cost: 30, cooldown: 11 },
};

const INTERVENTION_SETS: Record<DisasterType, Intervention[]> = {
  TSUNAMI: [
    {
      kind: "official_alert",
      label: "津波警報一斉配信",
      description: "沿岸部の全住民へ津波避難を即時通知します。",
      message: "公式: 津波到達に備え、高台へ避難してください。",
      ...INTERVENTION_BALANCE.official_alert,
    },
    {
      kind: "open_shelter",
      label: "高台避難所開放",
      description: "高台の避難所を追加で開放します。",
      message: "高台の避難所を開放、誘導を開始。",
      ...INTERVENTION_BALANCE.open_shelter,
    },
    {
      kind: "fact_check",
      label: "避難ルート訂正",
      description: "誤った通行止め情報を訂正します。",
      message: "確認済み: 山側のルートは通行可能。",
      ...INTERVENTION_BALANCE.fact_check,
    },
    {
      kind: "support_vulnerable",
      label: "沿岸部支援",
      description: "沿岸部の要支援者を優先的に誘導します。",
      message: "支援班が沿岸部の搬送を開始。",
      ...INTERVENTION_BALANCE.support_vulnerable,
    },
    {
      kind: "multilingual_broadcast",
      label: "多言語一斉アラート",
      description: "多言語で避難指示を一斉配信します。",
      message: "多言語で避難指示を配信。",
      ...INTERVENTION_BALANCE.multilingual_broadcast,
    },
    {
      kind: "route_guidance",
      label: "避難ルート誘導",
      description: "渋滞の少ない高台ルートを誘導します。",
      message: "高台への最短ルートを案内。",
      ...INTERVENTION_BALANCE.route_guidance,
    },
    {
      kind: "rumor_monitoring",
      label: "SNSデマ監視",
      description: "SNS上の津波デマを監視・訂正します。",
      message: "デマを検知し訂正を開始。",
      ...INTERVENTION_BALANCE.rumor_monitoring,
    },
    {
      kind: "volunteer_mobilization",
      label: "沿岸ボランティア招集",
      description: "沿岸支援のボランティアを招集します。",
      message: "沿岸支援の人員を追加動員。",
      ...INTERVENTION_BALANCE.volunteer_mobilization,
    },
  ],
  EARTHQUAKE: [
    {
      kind: "official_alert",
      label: "余震警戒アラート",
      description: "余震発生に備え公式警報を強化します。",
      message: "公式: 余震に備えて落下物に注意してください。",
      ...INTERVENTION_BALANCE.official_alert,
    },
    {
      kind: "open_shelter",
      label: "救護所開設",
      description: "臨時救護所を開設して混雑を緩和します。",
      message: "臨時救護所を開設、負傷者誘導を開始。",
      ...INTERVENTION_BALANCE.open_shelter,
    },
    {
      kind: "fact_check",
      label: "倒壊デマ訂正",
      description: "建物倒壊の誤情報を訂正します。",
      message: "確認済み: 主要道路は通行可能。",
      ...INTERVENTION_BALANCE.fact_check,
    },
    {
      kind: "support_vulnerable",
      label: "要支援者救出",
      description: "移動困難者の避難支援を強化します。",
      message: "支援班が要支援者の搬送を開始。",
      ...INTERVENTION_BALANCE.support_vulnerable,
    },
    {
      kind: "multilingual_broadcast",
      label: "多言語安全情報",
      description: "多言語で余震対策を一斉配信します。",
      message: "多言語で安全情報を配信。",
      ...INTERVENTION_BALANCE.multilingual_broadcast,
    },
    {
      kind: "route_guidance",
      label: "通行ルート案内",
      description: "通行可能な迂回ルートを案内します。",
      message: "安全ルートの案内を開始。",
      ...INTERVENTION_BALANCE.route_guidance,
    },
    {
      kind: "rumor_monitoring",
      label: "余震デマ監視",
      description: "余震関連の誤情報を監視・訂正します。",
      message: "余震デマの訂正を開始。",
      ...INTERVENTION_BALANCE.rumor_monitoring,
    },
    {
      kind: "volunteer_mobilization",
      label: "地域救助隊招集",
      description: "救助ボランティアを追加動員します。",
      message: "救助隊を追加動員。",
      ...INTERVENTION_BALANCE.volunteer_mobilization,
    },
  ],
  FLOOD: [
    {
      kind: "official_alert",
      label: "氾濫警戒アラート",
      description: "河川の氾濫情報を一斉配信します。",
      message: "公式: 浸水地域から高い場所へ避難してください。",
      ...INTERVENTION_BALANCE.official_alert,
    },
    {
      kind: "open_shelter",
      label: "浸水避難所開放",
      description: "浸水対応の避難所を追加で開放します。",
      message: "浸水避難所を開放、誘導を開始。",
      ...INTERVENTION_BALANCE.open_shelter,
    },
    {
      kind: "fact_check",
      label: "決壊情報訂正",
      description: "堤防決壊の誤情報を訂正します。",
      message: "確認済み: 堤防は持ちこたえています。",
      ...INTERVENTION_BALANCE.fact_check,
    },
    {
      kind: "support_vulnerable",
      label: "浸水地域支援",
      description: "浸水地域の要支援者を支援します。",
      message: "支援班が浸水地域へ向かっています。",
      ...INTERVENTION_BALANCE.support_vulnerable,
    },
    {
      kind: "multilingual_broadcast",
      label: "多言語避難指示",
      description: "多言語で高台避難を周知します。",
      message: "多言語で避難指示を配信。",
      ...INTERVENTION_BALANCE.multilingual_broadcast,
    },
    {
      kind: "route_guidance",
      label: "高台ルート誘導",
      description: "浸水を避けるルートを誘導します。",
      message: "高台へのルートを案内。",
      ...INTERVENTION_BALANCE.route_guidance,
    },
    {
      kind: "rumor_monitoring",
      label: "決壊デマ監視",
      description: "堤防決壊の誤情報を監視・訂正します。",
      message: "決壊デマの訂正を開始。",
      ...INTERVENTION_BALANCE.rumor_monitoring,
    },
    {
      kind: "volunteer_mobilization",
      label: "浸水支援隊招集",
      description: "浸水地域の支援人員を追加動員します。",
      message: "浸水支援隊を追加動員。",
      ...INTERVENTION_BALANCE.volunteer_mobilization,
    },
  ],
  METEOR: [
    {
      kind: "official_alert",
      label: "落下予測アラート",
      description: "隕石落下の予測情報を更新します。",
      message: "公式: 落下予測を更新、地下施設へ避難。",
      ...INTERVENTION_BALANCE.official_alert,
    },
    {
      kind: "open_shelter",
      label: "地下避難所開放",
      description: "地下避難所を開放し誘導します。",
      message: "地下避難所を開放、誘導を開始。",
      ...INTERVENTION_BALANCE.open_shelter,
    },
    {
      kind: "fact_check",
      label: "通信断デマ訂正",
      description: "通信断の誤情報を訂正します。",
      message: "確認済み: 通信は維持されています。",
      ...INTERVENTION_BALANCE.fact_check,
    },
    {
      kind: "support_vulnerable",
      label: "地下搬送支援",
      description: "移動困難者の地下搬送を支援します。",
      message: "支援班が地下施設への搬送を開始。",
      ...INTERVENTION_BALANCE.support_vulnerable,
    },
    {
      kind: "multilingual_broadcast",
      label: "多言語地下避難",
      description: "多言語で地下避難を周知します。",
      message: "多言語で地下避難指示を配信。",
      ...INTERVENTION_BALANCE.multilingual_broadcast,
    },
    {
      kind: "route_guidance",
      label: "地下ルート案内",
      description: "地下施設への導線を案内します。",
      message: "地下施設ルートの案内を開始。",
      ...INTERVENTION_BALANCE.route_guidance,
    },
    {
      kind: "rumor_monitoring",
      label: "落下デマ監視",
      description: "落下予測の誤情報を監視・訂正します。",
      message: "落下デマの訂正を開始。",
      ...INTERVENTION_BALANCE.rumor_monitoring,
    },
    {
      kind: "volunteer_mobilization",
      label: "地下誘導班招集",
      description: "地下誘導の人員を追加動員します。",
      message: "地下誘導班を追加動員。",
      ...INTERVENTION_BALANCE.volunteer_mobilization,
    },
  ],
};

const BottomInterventions = ({
  onIntervention,
  disabled = false,
  disaster = "EARTHQUAKE",
  points = 0,
  maxPoints,
  currentTick = 0,
  cooldowns = {},
  interventionUseLimit = 10,
  interventionsRemaining = 0,
  pointRecovery = {
    active: false,
    amountPerCycle: 0,
    cycleTicks: 0,
    ticksUntilNext: 0,
    progressPercent: 0,
  },
}: BottomInterventionsProps) => {
  const interventions = INTERVENTION_SETS[disaster];
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const gaugeMax =
    typeof maxPoints === "number" && maxPoints > 0
      ? maxPoints
      : Math.max(points, 1);
  const pointRatio = Math.max(0, Math.min(points / gaugeMax, 1));
  const pointPercent = Math.round(pointRatio * 100);
  const pointValueToneClass =
    pointRatio <= 0.25
      ? "text-rose-200"
      : pointRatio <= 0.55
      ? "text-amber-200"
      : "text-emerald-200";
  const pointGaugeToneClass =
    pointRatio <= 0.25
      ? "from-rose-400 to-rose-500"
      : pointRatio <= 0.55
      ? "from-amber-300 to-amber-400"
      : "from-emerald-300 to-emerald-400";
  const useRatio =
    interventionUseLimit > 0
      ? Math.max(0, Math.min(interventionsRemaining / interventionUseLimit, 1))
      : 0;
  const usePercent = Math.round(useRatio * 100);
  const useGaugeToneClass =
    useRatio <= 0.25
      ? "from-rose-400 to-rose-500"
      : useRatio <= 0.55
      ? "from-amber-300 to-amber-400"
      : "from-emerald-300 to-emerald-400";
  const recoveryPercent = Math.max(0, Math.min(pointRecovery.progressPercent, 100));

  const updateScrollState = () => {
    const container = scrollRef.current;
    if (!container) return;
    const left = container.scrollLeft;
    const right = left + container.clientWidth;
    setCanScrollLeft(left > 4);
    setCanScrollRight(right < container.scrollWidth - 4);
  };

  const scrollByAmount = (direction: -1 | 1) => {
    const container = scrollRef.current;
    if (!container) return;
    const amount = Math.max(240, container.clientWidth * 0.7);
    container.scrollBy({ left: direction * amount, behavior: "smooth" });
  };

  useEffect(() => {
    updateScrollState();
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ left: 0 });
    const handle = () => updateScrollState();
    container.addEventListener("scroll", handle);
    window.addEventListener("resize", handle);
    return () => {
      container.removeEventListener("scroll", handle);
      window.removeEventListener("resize", handle);
    };
  }, [disaster, interventions.length]);

  return (
    <section className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-4 text-slate-100 backdrop-blur">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
          介入パネル
        </h2>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-400">残り介入ポイント</span>
            <span className={`font-semibold tabular-nums ${pointValueToneClass}`}>
              {points}/{gaugeMax}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-950/70">
            <div
              className={`h-full rounded-full bg-gradient-to-r transition-all duration-300 ${pointGaugeToneClass}`}
              style={{ width: `${pointPercent}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-400">ポイント回復</span>
            <span
              className={`font-semibold tabular-nums ${
                pointRecovery.active ? "text-cyan-200" : "text-slate-500"
              }`}
            >
              {pointRecovery.active
                ? `${pointRecovery.cycleTicks}秒ごとに +${pointRecovery.amountPerCycle}pt`
                : "満タン"}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-950/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all duration-300"
              style={{ width: `${recoveryPercent}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            {pointRecovery.active
              ? `次回回復まで ${pointRecovery.ticksUntilNext}秒`
              : "ポイント最大値"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-400">残り介入回数</span>
            <span
              className={`font-semibold tabular-nums ${
                interventionsRemaining > 0 ? "text-emerald-200" : "text-rose-200"
              }`}
            >
              {interventionsRemaining}/{interventionUseLimit}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-950/70">
            <div
              className={`h-full rounded-full bg-gradient-to-r transition-all duration-300 ${useGaugeToneClass}`}
              style={{ width: `${usePercent}%` }}
            />
          </div>
        </div>
      </div>
      <div className="relative mt-3">
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-slate-950/80 to-transparent transition ${
            canScrollLeft ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden="true"
        />
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-slate-950/80 to-transparent transition ${
            canScrollRight ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden="true"
        />
        <div
          ref={scrollRef}
          className="fancy-scroll flex gap-4 overflow-x-auto px-10 pb-2"
        >
          {interventions.map((intervention) => {
            const nextAvailable = cooldowns[intervention.kind] ?? 0;
            const remaining = Math.max(0, nextAvailable - currentTick);
            const onCooldown = remaining > 0;
            const pointsShort = points < intervention.cost;
            const noUsesRemaining = interventionsRemaining <= 0;
            const blocked = disabled || onCooldown || pointsShort || noUsesRemaining;

            return (
              <button
                key={intervention.kind}
                onClick={() => onIntervention(intervention)}
                disabled={blocked}
                className={`flex w-[224px] flex-none flex-col gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 text-left transition ${
                  blocked
                    ? "cursor-not-allowed opacity-40"
                    : "hover:border-emerald-400/40"
                }`}
              >
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    {intervention.label}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {intervention.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                    <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-1">
                      コスト {intervention.cost}pt
                    </span>
                    <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-1">
                      CD {intervention.cooldown}t
                    </span>
                    {onCooldown ? (
                      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">
                        残り {remaining}t
                      </span>
                    ) : null}
                    {pointsShort ? (
                      <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-2 py-1 text-rose-200">
                        ポイント不足
                      </span>
                    ) : null}
                    {noUsesRemaining ? (
                      <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-2 py-1 text-rose-200">
                        使用回数上限
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="mt-auto text-xs text-emerald-300">
                  {intervention.message}
                </span>
              </button>
            );
          })}
        </div>
        <div className="absolute inset-y-0 left-2 z-20 flex items-center">
          <button
            type="button"
            onClick={() => scrollByAmount(-1)}
            disabled={!canScrollLeft}
            className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/80 text-slate-200 shadow transition ${
              canScrollLeft
                ? "hover:border-emerald-400/60 hover:text-emerald-200"
                : "cursor-not-allowed opacity-30"
            }`}
            aria-label="左へスクロール"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="absolute inset-y-0 right-2 z-20 flex items-center">
          <button
            type="button"
            onClick={() => scrollByAmount(1)}
            disabled={!canScrollRight}
            className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/80 text-slate-200 shadow transition ${
              canScrollRight
                ? "hover:border-emerald-400/60 hover:text-emerald-200"
                : "cursor-not-allowed opacity-30"
            }`}
            aria-label="右へスクロール"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
};

export default BottomInterventions;
