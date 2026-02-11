"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DisasterType,
  InterventionComboKey,
  InterventionKind,
  TimelineEvent,
} from "@/types/sim";

type Intervention = {
  kind: InterventionKind;
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
  timeline?: TimelineEvent[];
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
  operations_rebalance: { cost: 26, cooldown: 8 },
  triage_dispatch: { cost: 34, cooldown: 13 },
};

const INTERVENTION_ICON_TONE: Record<InterventionKind, string> = {
  official_alert:
    "border-rose-400/50 bg-rose-400/15 text-rose-200 shadow-[0_0_18px_rgba(251,113,133,0.25)]",
  open_shelter:
    "border-emerald-400/50 bg-emerald-400/15 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.25)]",
  fact_check:
    "border-cyan-400/50 bg-cyan-400/15 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.25)]",
  support_vulnerable:
    "border-indigo-400/50 bg-indigo-400/15 text-indigo-200 shadow-[0_0_18px_rgba(129,140,248,0.25)]",
  multilingual_broadcast:
    "border-sky-400/50 bg-sky-400/15 text-sky-200 shadow-[0_0_18px_rgba(56,189,248,0.25)]",
  route_guidance:
    "border-amber-400/50 bg-amber-400/15 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.25)]",
  rumor_monitoring:
    "border-fuchsia-400/50 bg-fuchsia-400/15 text-fuchsia-200 shadow-[0_0_18px_rgba(232,121,249,0.25)]",
  volunteer_mobilization:
    "border-lime-400/50 bg-lime-400/15 text-lime-200 shadow-[0_0_18px_rgba(163,230,53,0.25)]",
  operations_rebalance:
    "border-violet-400/50 bg-violet-400/15 text-violet-200 shadow-[0_0_18px_rgba(167,139,250,0.25)]",
  triage_dispatch:
    "border-orange-400/50 bg-orange-400/15 text-orange-200 shadow-[0_0_18px_rgba(251,146,60,0.25)]",
};

const INTERVENTION_COMBO_WINDOW_TICKS = 8;

const INTERVENTION_COMBOS: Array<{
  key: InterventionComboKey;
  label: string;
  sequence: [InterventionKind, InterventionKind];
}> = [
  {
    key: "TRUTH_CASCADE",
    label: "Truth Cascade",
    sequence: ["rumor_monitoring", "official_alert"],
  },
  {
    key: "EVAC_EXPRESS",
    label: "Evac Express",
    sequence: ["multilingual_broadcast", "route_guidance"],
  },
  {
    key: "CARE_CHAIN",
    label: "Care Chain",
    sequence: ["support_vulnerable", "operations_rebalance"],
  },
];

const InterventionIcon = ({ kind }: { kind: InterventionKind }) => {
  const tone = INTERVENTION_ICON_TONE[kind];
  return (
    <span
      className={`inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl border ${tone}`}
      aria-hidden="true"
    >
      {kind === "official_alert" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 4l8 14H4z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 9v4" strokeLinecap="round" />
          <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
        </svg>
      ) : null}
      {kind === "open_shelter" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 11l8-6 8 6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 10v9h12v-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 19v-4h4v4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {kind === "fact_check" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.5 12.5l2.2 2.2L15.5 10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {kind === "support_vulnerable" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="10" r="4" />
          <path d="M4 20c1.2-2.8 4-4.5 8-4.5s6.8 1.7 8 4.5" strokeLinecap="round" />
          <path d="M18 7v4M16 9h4" strokeLinecap="round" />
        </svg>
      ) : null}
      {kind === "multilingual_broadcast" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.8 2.8 2.8 15.2 0 18M12 3c-2.8 2.8-2.8 15.2 0 18" strokeLinecap="round" />
        </svg>
      ) : null}
      {kind === "route_guidance" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 21s6-5 6-10a6 6 0 10-12 0c0 5 6 10 6 10z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="11" r="2" />
        </svg>
      ) : null}
      {kind === "rumor_monitoring" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      ) : null}
      {kind === "volunteer_mobilization" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="8" cy="9" r="3" />
          <circle cx="16" cy="9" r="3" />
          <path d="M3 20c.7-2.4 2.8-4 5-4M21 20c-.7-2.4-2.8-4-5-4" strokeLinecap="round" />
          <path d="M9 20c.8-2.6 2.4-4 3-4s2.2 1.4 3 4" strokeLinecap="round" />
        </svg>
      ) : null}
      {kind === "operations_rebalance" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 4v15M7 8h10" strokeLinecap="round" />
          <path d="M5 8l-2 4h4zM19 8l-2 4h4z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 19h4" strokeLinecap="round" />
        </svg>
      ) : null}
      {kind === "triage_dispatch" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 5h12M6 19h12M8 5v14M16 5v14" strokeLinecap="round" />
          <path d="M10 11h4M12 9v4" strokeLinecap="round" />
        </svg>
      ) : null}
    </span>
  );
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
      kind: "operations_rebalance",
      label: "支援優先度リバランス",
      description: "要支援者向け導線を最優先に再編し、不要な出動を抑えます。",
      message: "要支援者優先で現場運用を再配分。",
      ...INTERVENTION_BALANCE.operations_rebalance,
    },
    {
      kind: "triage_dispatch",
      label: "誤配分是正トリアージ",
      description: "不要出動を停止し、重複要請を整理して支援の誤配分を抑えます。",
      message: "誤配分是正トリアージを開始。",
      ...INTERVENTION_BALANCE.triage_dispatch,
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
      kind: "operations_rebalance",
      label: "救助優先度リバランス",
      description: "要支援者搬送を優先し、不要な移動と出動を抑制します。",
      message: "救助運用を要支援者優先へ再編。",
      ...INTERVENTION_BALANCE.operations_rebalance,
    },
    {
      kind: "triage_dispatch",
      label: "現場トリアージ指令",
      description: "不要出動を止めて誤情報起点の要請を精査し、資源配分を正します。",
      message: "現場トリアージ指令を発令。",
      ...INTERVENTION_BALANCE.triage_dispatch,
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
      kind: "operations_rebalance",
      label: "浸水支援リバランス",
      description: "要支援者搬送を優先し、現場の支援配分を再調整します。",
      message: "浸水支援の優先度を再配分。",
      ...INTERVENTION_BALANCE.operations_rebalance,
    },
    {
      kind: "triage_dispatch",
      label: "浸水対応トリアージ",
      description: "不要な出動を抑制し、重複した救助導線を再編して誤配分を減らします。",
      message: "浸水対応トリアージを開始。",
      ...INTERVENTION_BALANCE.triage_dispatch,
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
      kind: "operations_rebalance",
      label: "地下誘導リバランス",
      description: "要支援者の地下搬送を優先し、誘導要員を再配分します。",
      message: "地下誘導の運用を要支援者優先へ再編。",
      ...INTERVENTION_BALANCE.operations_rebalance,
    },
    {
      kind: "triage_dispatch",
      label: "地下誘導トリアージ",
      description: "不要な地下誘導を停止し、誤要請を整理して資源配分を最適化します。",
      message: "地下誘導トリアージを開始。",
      ...INTERVENTION_BALANCE.triage_dispatch,
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
  timeline = [],
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
  const interventionEvents = timeline
    .filter(
      (event): event is TimelineEvent & { meta: { interventionKind: InterventionKind } } =>
        event.type === "INTERVENTION" && Boolean(event.meta?.interventionKind)
    )
    .map((event) => ({
      tick: event.tick,
      kind: event.meta.interventionKind,
    }));
  const latestIntervention = interventionEvents[0];
  const comboStatuses = INTERVENTION_COMBOS.map((combo) => {
    const [starterKind, finisherKind] = combo.sequence;
    const starter = interventions.find((item) => item.kind === starterKind);
    const finisher = interventions.find((item) => item.kind === finisherKind);
    const activeWindow =
      latestIntervention?.kind === starterKind
        ? currentTick - latestIntervention.tick
        : undefined;
    const armed =
      typeof activeWindow === "number" &&
      activeWindow >= 0 &&
      activeWindow <= INTERVENTION_COMBO_WINDOW_TICKS;
    const remainingTicks = armed
      ? INTERVENTION_COMBO_WINDOW_TICKS - activeWindow
      : undefined;
    const finisherNextTick = finisher ? cooldowns[finisher.kind] ?? 0 : 0;
    const finisherOnCooldown = finisherNextTick > currentTick;
    const finisherPointShort = finisher ? points < finisher.cost : true;
    const finisherBlocked =
      disabled || finisherOnCooldown || finisherPointShort || interventionsRemaining <= 0;

    const starterNextTick = starter ? cooldowns[starter.kind] ?? 0 : 0;
    const starterReady =
      Boolean(starter) &&
      starterNextTick <= currentTick &&
      points >= (starter?.cost ?? 0) &&
      interventionsRemaining > 0 &&
      !disabled;

    return {
      ...combo,
      starter,
      finisher,
      starterReady,
      armed,
      remainingTicks,
      finisherBlocked,
    };
  });
  const activeComboStatuses = comboStatuses.filter((combo) => combo.armed);
  const comboTargetByKind = new Map<
    InterventionKind,
    { mode: "finisher"; remainingTicks: number } | { mode: "starter" }
  >();
  activeComboStatuses.forEach((combo) => {
    if (
      !combo.finisher ||
      typeof combo.remainingTicks !== "number" ||
      combo.finisherBlocked
    ) {
      return;
    }
    comboTargetByKind.set(combo.finisher.kind, {
      mode: "finisher",
      remainingTicks: combo.remainingTicks,
    });
  });
  if (activeComboStatuses.length === 0) {
    comboStatuses.forEach((combo) => {
      if (!combo.starter || !combo.starterReady) return;
      comboTargetByKind.set(combo.starter.kind, { mode: "starter" });
    });
  }

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
            const comboTarget = comboTargetByKind.get(intervention.kind);
            const comboMode = comboTarget?.mode;
            const comboTargeted = Boolean(comboTarget);
            const comboHintLabel =
              comboMode === "finisher"
                ? `COMBO完成 残り ${
                    comboTarget?.mode === "finisher" ? comboTarget.remainingTicks : 0
                  }秒`
                : comboMode === "starter"
                  ? "COMBO起点"
                  : null;
            const comboHighlightActive = Boolean(comboMode && !blocked);
            const comboCardToneClass =
              comboMode === "finisher" && !blocked
                ? "border-rose-400/80 bg-rose-950/30 shadow-[0_0_0_1px_rgba(251,113,133,0.42),0_0_28px_rgba(251,113,133,0.38)]"
                : comboMode === "starter" && !blocked
                  ? "border-cyan-300/80 bg-cyan-950/25 shadow-[0_0_0_1px_rgba(34,211,238,0.38),0_0_24px_rgba(34,211,238,0.35)]"
                  : "";
            const comboHintToneClass =
              comboMode === "finisher"
                ? "border-rose-300/70 bg-rose-500/20 text-rose-50 shadow-[0_0_16px_rgba(251,113,133,0.35)]"
                : comboMode === "starter"
                  ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-50 shadow-[0_0_16px_rgba(34,211,238,0.3)]"
                  : "border-emerald-300/45 bg-emerald-500/12 text-emerald-100";

            return (
              <button
                key={intervention.kind}
                onClick={() => onIntervention(intervention)}
                disabled={blocked}
                className={`relative isolate flex w-[224px] flex-none flex-col gap-3 overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 text-left transition ${
                  blocked ? "cursor-not-allowed opacity-40" : "hover:border-emerald-400/40"
                } ${comboCardToneClass} ${
                  comboMode === "finisher" && !blocked
                    ? "combo-highlight combo-highlight-finisher"
                    : comboMode === "starter" && !blocked
                      ? "combo-highlight combo-highlight-starter"
                      : ""
                }`}
              >
                {comboHighlightActive ? (
                  <span
                    aria-hidden="true"
                    className={`combo-sweep ${
                      comboMode === "finisher"
                        ? "combo-sweep-finisher"
                        : "combo-sweep-starter"
                    }`}
                  />
                ) : null}
                <div className="relative z-[1]">
                  <div className="flex items-start gap-3">
                    <InterventionIcon kind={intervention.kind} />
                    <div className="min-w-0">
                      <h3
                        className={`text-sm font-semibold ${
                          comboMode === "finisher" && !blocked
                            ? "text-rose-50"
                            : comboMode === "starter" && !blocked
                              ? "text-cyan-50"
                              : "text-slate-100"
                        }`}
                      >
                        {intervention.label}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        {intervention.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                    <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-1">
                      コスト {intervention.cost}pt
                    </span>
                    <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-1">
                      待機時間 {intervention.cooldown}秒
                    </span>
                    {onCooldown ? (
                      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">
                        再使用まで {remaining}秒
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
                    {comboTargeted ? (
                      <span
                        className={`rounded-full border px-2 py-1 ${comboHintToneClass}`}
                      >
                        {comboHintLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="relative z-[1] mt-auto text-xs text-emerald-300">
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
