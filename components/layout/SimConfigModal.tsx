"use client";

import type { SimConfig, TownSize, TerrainType } from "@/types/sim";
import {
  SIZE_DIMENSIONS,
  POPULATION_PRESETS,
  BUILDING_PRESETS,
  TERRAIN_LABELS,
} from "@/utils/simConfig";

type SimConfigModalProps = {
  config: SimConfig;
  ready: boolean;
  onChange: (config: SimConfig) => void;
  onStart: () => void;
};

const formatNumber = (value: number) => value.toLocaleString("ja-JP");

const SimConfigModal = ({
  config,
  ready,
  onChange,
  onStart,
}: SimConfigModalProps) => {
  const setField = <K extends keyof SimConfig>(key: K, value: SimConfig[K]) =>
    onChange({ ...config, [key]: value });

  const sizeOptions: Array<{ value: TownSize; label: string; detail: string }> = [
    {
      value: "SMALL",
      label: "小",
      detail: `${SIZE_DIMENSIONS.SMALL} × ${SIZE_DIMENSIONS.SMALL}`,
    },
    {
      value: "MEDIUM",
      label: "中",
      detail: `${SIZE_DIMENSIONS.MEDIUM} × ${SIZE_DIMENSIONS.MEDIUM}`,
    },
    {
      value: "LARGE",
      label: "大",
      detail: `${SIZE_DIMENSIONS.LARGE} × ${SIZE_DIMENSIONS.LARGE}`,
    },
  ];

  const populationOptions = [
    POPULATION_PRESETS.SMALL,
    POPULATION_PRESETS.MEDIUM,
    POPULATION_PRESETS.LARGE,
  ];

  const buildingOptions = [
    BUILDING_PRESETS.SMALL,
    BUILDING_PRESETS.MEDIUM,
    BUILDING_PRESETS.LARGE,
  ];

  const terrainOptions: Array<{ value: TerrainType; label: string }> = [
    { value: "COASTAL", label: TERRAIN_LABELS.COASTAL },
    { value: "MOUNTAIN", label: TERRAIN_LABELS.MOUNTAIN },
    { value: "URBAN", label: TERRAIN_LABELS.URBAN },
  ];

  const optionClass = (active: boolean) =>
    `rounded-xl border px-3 py-2 text-sm transition ${
      active
        ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
        : "border-slate-800/70 bg-slate-900/40 text-slate-200 hover:border-slate-600/70"
    }`;

  return (
    <section className="w-full max-w-[760px] rounded-3xl border border-slate-800/80 bg-slate-950/90 p-6 text-slate-100 shadow-[0_40px_120px_rgba(4,8,16,0.65)]">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Simulation Setup
        </p>
        <h2 className="text-xl font-semibold text-slate-100">
          シミュレーション設定
        </h2>
        <p className="text-sm text-slate-400">
          人数と建物は研究規模をWeb向けに縮小したプリセットです。
        </p>
      </header>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            町のサイズ
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {sizeOptions.map((option) => (
              <button
                key={option.value}
                className={optionClass(config.size === option.value)}
                onClick={() => setField("size", option.value)}
                type="button"
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-[11px] text-slate-400">
                  {option.detail}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            地形
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {terrainOptions.map((option) => (
              <button
                key={option.value}
                className={optionClass(config.terrain === option.value)}
                onClick={() => setField("terrain", option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            人数
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {populationOptions.map((value) => (
              <button
                key={value}
                className={optionClass(config.population === value)}
                onClick={() => setField("population", value)}
                type="button"
              >
                {formatNumber(value)}人
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            建物数
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {buildingOptions.map((value) => (
              <button
                key={value}
                className={optionClass(config.buildings === value)}
                onClick={() => setField("buildings", value)}
                type="button"
              >
                {formatNumber(value)}棟
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Start を押すとシミュレーションが開始します。
        </p>
        <button
          className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
            ready
              ? "bg-emerald-400 text-slate-900 hover:bg-emerald-300"
              : "cursor-not-allowed bg-slate-700 text-slate-300"
          }`}
          onClick={onStart}
          type="button"
          disabled={!ready}
        >
          {ready ? "スタート" : "接続中..."}
        </button>
      </div>
    </section>
  );
};

export default SimConfigModal;
