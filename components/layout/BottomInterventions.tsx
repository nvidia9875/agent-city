"use client";

type Intervention = {
  kind: string;
  label: string;
  description: string;
  message: string;
};

type BottomInterventionsProps = {
  onIntervention: (intervention: Intervention) => void;
};

const INTERVENTIONS: Intervention[] = [
  {
    kind: "official_alert",
    label: "公式警報一斉配信",
    description: "遅延中の警報を即時に全住民へ配信します。",
    message: "公式: 直ちに高台へ避難してください。",
  },
  {
    kind: "open_shelter",
    label: "避難所拡張",
    description: "臨時避難所を開放し混雑を緩和します。",
    message: "第二避難所を開放、誘導を開始。",
  },
  {
    kind: "fact_check",
    label: "ファクトチェック",
    description: "噂の誤情報を打ち消す訂正情報を発信します。",
    message: "確認済み: 橋は通行可能。",
  },
  {
    kind: "support_vulnerable",
    label: "要支援者支援",
    description: "高齢者や子ども連れの避難支援を強化します。",
    message: "支援班を派遣し移動支援を開始。",
  },
];

const BottomInterventions = ({ onIntervention }: BottomInterventionsProps) => {
  return (
    <section className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-4 text-slate-100 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
          介入パネル
        </h2>
        <span className="text-xs text-slate-500">シミュレーション操作</span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {INTERVENTIONS.map((intervention) => (
          <button
            key={intervention.kind}
            onClick={() => onIntervention(intervention)}
            className="flex h-full flex-col gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 text-left transition hover:border-emerald-400/40"
          >
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                {intervention.label}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {intervention.description}
              </p>
            </div>
            <span className="mt-auto text-xs text-emerald-300">
              {intervention.message}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default BottomInterventions;
