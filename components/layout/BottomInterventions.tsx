"use client";

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
  budget?: number;
  currentTick?: number;
  cooldowns?: Record<string, number>;
};

const INTERVENTION_SETS: Record<DisasterType, Intervention[]> = {
  TSUNAMI: [
    {
      kind: "official_alert",
      label: "津波警報一斉配信",
      description: "沿岸部の全住民へ津波避難を即時通知します。",
      message: "公式: 津波到達に備え、高台へ避難してください。",
      cost: 30,
      cooldown: 8,
    },
    {
      kind: "open_shelter",
      label: "高台避難所開放",
      description: "高台の避難所を追加で開放します。",
      message: "高台の避難所を開放、誘導を開始。",
      cost: 25,
      cooldown: 10,
    },
    {
      kind: "fact_check",
      label: "避難ルート訂正",
      description: "誤った通行止め情報を訂正します。",
      message: "確認済み: 山側のルートは通行可能。",
      cost: 20,
      cooldown: 6,
    },
    {
      kind: "support_vulnerable",
      label: "沿岸部支援",
      description: "沿岸部の要支援者を優先的に誘導します。",
      message: "支援班が沿岸部の搬送を開始。",
      cost: 35,
      cooldown: 12,
    },
  ],
  EARTHQUAKE: [
    {
      kind: "official_alert",
      label: "余震警戒アラート",
      description: "余震発生に備え公式警報を強化します。",
      message: "公式: 余震に備えて落下物に注意してください。",
      cost: 28,
      cooldown: 8,
    },
    {
      kind: "open_shelter",
      label: "救護所開設",
      description: "臨時救護所を開設して混雑を緩和します。",
      message: "臨時救護所を開設、負傷者誘導を開始。",
      cost: 24,
      cooldown: 10,
    },
    {
      kind: "fact_check",
      label: "倒壊デマ訂正",
      description: "建物倒壊の誤情報を訂正します。",
      message: "確認済み: 主要道路は通行可能。",
      cost: 20,
      cooldown: 6,
    },
    {
      kind: "support_vulnerable",
      label: "要支援者救出",
      description: "移動困難者の避難支援を強化します。",
      message: "支援班が要支援者の搬送を開始。",
      cost: 34,
      cooldown: 12,
    },
  ],
  FLOOD: [
    {
      kind: "official_alert",
      label: "氾濫警戒アラート",
      description: "河川の氾濫情報を一斉配信します。",
      message: "公式: 浸水地域から高い場所へ避難してください。",
      cost: 28,
      cooldown: 8,
    },
    {
      kind: "open_shelter",
      label: "浸水避難所開放",
      description: "浸水対応の避難所を追加で開放します。",
      message: "浸水避難所を開放、誘導を開始。",
      cost: 26,
      cooldown: 10,
    },
    {
      kind: "fact_check",
      label: "決壊情報訂正",
      description: "堤防決壊の誤情報を訂正します。",
      message: "確認済み: 堤防は持ちこたえています。",
      cost: 20,
      cooldown: 6,
    },
    {
      kind: "support_vulnerable",
      label: "浸水地域支援",
      description: "浸水地域の要支援者を支援します。",
      message: "支援班が浸水地域へ向かっています。",
      cost: 34,
      cooldown: 12,
    },
  ],
  METEOR: [
    {
      kind: "official_alert",
      label: "落下予測アラート",
      description: "隕石落下の予測情報を更新します。",
      message: "公式: 落下予測を更新、地下施設へ避難。",
      cost: 30,
      cooldown: 9,
    },
    {
      kind: "open_shelter",
      label: "地下避難所開放",
      description: "地下避難所を開放し誘導します。",
      message: "地下避難所を開放、誘導を開始。",
      cost: 26,
      cooldown: 10,
    },
    {
      kind: "fact_check",
      label: "通信断デマ訂正",
      description: "通信断の誤情報を訂正します。",
      message: "確認済み: 通信は維持されています。",
      cost: 20,
      cooldown: 6,
    },
    {
      kind: "support_vulnerable",
      label: "地下搬送支援",
      description: "移動困難者の地下搬送を支援します。",
      message: "支援班が地下施設への搬送を開始。",
      cost: 34,
      cooldown: 12,
    },
  ],
};

const BottomInterventions = ({
  onIntervention,
  disabled = false,
  disaster = "EARTHQUAKE",
  budget = 0,
  currentTick = 0,
  cooldowns = {},
}: BottomInterventionsProps) => {
  const interventions = INTERVENTION_SETS[disaster];
  return (
    <section className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-4 text-slate-100 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
          介入パネル
        </h2>
        <span className="text-xs text-slate-400">
          予算 {budget} / クールダウン管理
        </span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {interventions.map((intervention) => {
          const nextAvailable = cooldowns[intervention.kind] ?? 0;
          const remaining = Math.max(0, nextAvailable - currentTick);
          const onCooldown = remaining > 0;
          const budgetShort = budget < intervention.cost;
          const blocked = disabled || onCooldown || budgetShort;
          return (
            <button
              key={intervention.kind}
              onClick={() => onIntervention(intervention)}
              disabled={blocked}
              className={`flex h-full flex-col gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 text-left transition ${
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
                    コスト {intervention.cost}
                  </span>
                  <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-1">
                    CD {intervention.cooldown}t
                  </span>
                  {onCooldown ? (
                    <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">
                      残り {remaining}t
                    </span>
                  ) : null}
                  {budgetShort ? (
                    <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-2 py-1 text-rose-200">
                      予算不足
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
    </section>
  );
};

export default BottomInterventions;
