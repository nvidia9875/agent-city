import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#22314e,_#0b1018_58%,_#070a10)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-16">
        <header className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-300">
          <p className="uppercase tracking-[0.4em]">AgentTown</p>
          <span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-4 py-1 text-xs">
            災害対応リハーサル・デモ
          </span>
        </header>

        <main className="mt-16 grid flex-1 gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <h1 className="text-4xl font-semibold leading-tight text-slate-100 md:text-5xl">
              災害前の「もしも」を、先に体験する。
            </h1>
            <p className="max-w-xl text-lg text-slate-300">
              AgentTownは、噂・公式情報・避難行動の広がりを
              アイソメ視点で可視化する災害訓練シミュレーションです。
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/sim"
                className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300"
              >
                デモを開始
              </Link>
              <div className="rounded-full border border-slate-700/70 bg-slate-900/60 px-6 py-3 text-sm text-slate-300">
                R3F + Next.js + Vertex AI
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800/60 bg-slate-950/70 p-6 shadow-[0_25px_60px_rgba(8,12,18,0.6)] backdrop-blur">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
              災害リハーサルの概要
            </h2>
            <div className="mt-6 space-y-5 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  街のビュー
                </p>
                <p className="mt-2 text-slate-200">
                  アイソメ格子、道路インスタンス、避難拠点を描画。
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  住人の動き
                </p>
                <p className="mt-2 text-slate-200">
                  10〜30人の住民が噂・公式情報で行動を変えます。
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  運用UI
                </p>
                <p className="mt-2 text-slate-200">
                  タイムライン、メトリクス、介入を集約。
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
