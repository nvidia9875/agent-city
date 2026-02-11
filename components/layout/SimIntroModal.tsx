"use client";

import { useState } from "react";

type SimIntroModalProps = {
  onClose: () => void;
};

type IntroSlide = {
  step: string;
  title: string;
  description: string;
  points: string[];
};

const INTRO_SLIDES: IntroSlide[] = [
  {
    step: "01 / Simulation",
    title: "どんなゲーム？",
    description:
      "あなたは災害対応の司令室です。介入カードを使って情報の混線を抑え、住民へ正しい行動を届ける情報伝播シミュレーションです。",
    points: [
      "災害・地形・住民傾向を設定して毎回ちがう状況を再現",
      "噂が広がる前に公式情報を届ける初動が重要",
      "カードの効果とクールダウンを見ながら介入を選択",
    ],
  },
  {
    step: "02 / Clear Condition",
    title: "何をすればクリア？",
    description:
      "ミッションは4つの指標のバランスで評価されます。到達率を上げつつ、混乱と噂を下げることがクリアの鍵です。",
    points: [
      "公式到達・要支援到達を上げる",
      "噂拡散・混乱度を下げる",
      "介入カードのタイミングを見極める",
    ],
  },
  {
    step: "03 / Learn Loop",
    title: "繰り返しで何を学ぶ？",
    description:
      "同じシナリオでも介入の順番とタイミングで結果は変わります。試行を重ねて、収束しやすい運用パターンを学習できます。",
    points: [
      "初動でどのカードを優先すると安定化しやすいか",
      "デマが強い時に効く打ち手の組み合わせ",
      "要支援者到達を落とさずに全体を収束させる判断",
    ],
  },
];

const SimIntroModal = ({ onClose }: SimIntroModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const lastIndex = INTRO_SLIDES.length - 1;
  const isLastPage = currentIndex === lastIndex;

  return (
    <section className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/95 text-slate-100 shadow-[0_40px_120px_rgba(4,8,16,0.65)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),_transparent_58%)]" />
      <div className="relative p-5 sm:p-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80">
              Mission Briefing
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">
              ミッションガイド
            </h2>
          </div>
          <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
            {currentIndex + 1} / {INTRO_SLIDES.length}
          </span>
        </header>

        <div className="mt-4 overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {INTRO_SLIDES.map((slide) => (
              <article key={slide.step} className="w-full shrink-0">
                <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-100/90 via-amber-50/85 to-yellow-50/80 p-4 text-slate-900 shadow-[0_20px_60px_rgba(250,204,21,0.18)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
                    {slide.step}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">{slide.title}</h3>
                  <p className="mt-2 text-sm text-slate-800">{slide.description}</p>
                  <ul className="mt-4 grid gap-2 text-xs text-slate-700">
                    {slide.points.map((point) => (
                      <li
                        key={point}
                        className="rounded-xl border border-amber-300/70 bg-white/75 px-3 py-2"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button
            className={`rounded-full border px-4 py-2 text-sm transition ${
              currentIndex === 0
                ? "cursor-not-allowed border-slate-800/70 bg-slate-900/40 text-slate-600"
                : "border-slate-600/80 bg-slate-900/70 text-slate-200 hover:border-slate-500"
            }`}
            type="button"
            onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            disabled={currentIndex === 0}
          >
            戻る
          </button>

          <div className="flex items-center gap-2">
            {INTRO_SLIDES.map((slide, index) => (
              <button
                key={slide.step}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  currentIndex === index ? "bg-amber-200" : "bg-slate-700"
                }`}
                aria-label={`${index + 1}ページ目へ`}
              />
            ))}
          </div>

          {isLastPage ? (
            <button
              className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300"
              type="button"
              onClick={onClose}
            >
              設定画面へ進む
            </button>
          ) : (
            <button
              className="rounded-full bg-amber-300 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-200"
              type="button"
              onClick={() =>
                setCurrentIndex((index) => Math.min(lastIndex, index + 1))
              }
            >
              次へ
            </button>
          )}
        </footer>
      </div>
    </section>
  );
};

export default SimIntroModal;
