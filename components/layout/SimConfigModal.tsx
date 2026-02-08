"use client";

import { useState, type ReactNode } from "react";
import type {
  SimConfig,
  TownSize,
  TerrainType,
  DisasterType,
  EmotionTone,
  AgeProfile,
} from "@/types/sim";
import {
  SIZE_DIMENSIONS,
  POPULATION_PRESETS,
  BUILDING_PRESETS,
  TERRAIN_LABELS,
  DISASTER_LABELS,
  OFFICIAL_DELAY_PRESETS,
  AMBIGUITY_PRESETS,
  MISINFORMATION_PRESETS,
  MULTILINGUAL_COVERAGE_PRESETS,
  FACT_CHECK_SPEED_PRESETS,
  INTERVENTION_POINT_PRESETS,
  EMOTION_TONE_LABELS,
  AGE_PROFILE_LABELS,
} from "@/utils/simConfig";

type SimConfigModalProps = {
  config: SimConfig;
  ready: boolean;
  onChange: (config: SimConfig) => void;
  onStart: () => void;
};

type SliderOption<T> = {
  value: T;
  label: string;
  detail?: string;
  badge?: string;
  shortLabel?: string;
};

type SliderRowProps<T> = {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  options: SliderOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

type TileOption<T> = {
  value: T;
  label: string;
  detail?: string;
  icon: ReactNode;
  disabled?: boolean;
  disabledHint?: string;
};

type IconProps = {
  className?: string;
};

const formatNumber = (value: number) => value.toLocaleString("ja-JP");

const sliderInputClass =
  "h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800/80 accent-emerald-400";

type DifficultyLevel = "easy" | "middle" | "high";

const getDifficulty = (config: SimConfig): DifficultyLevel => {
  const sizeScore =
    config.size === "SMALL" ? 0 : config.size === "MEDIUM" ? 8 : 16;
  const populationScore =
    config.population <= POPULATION_PRESETS.SMALL
      ? 0
      : config.population <= POPULATION_PRESETS.MEDIUM
      ? 6
      : 12;
  const buildingScore =
    config.buildings <= BUILDING_PRESETS.SMALL
      ? 0
      : config.buildings <= BUILDING_PRESETS.MEDIUM
      ? 4
      : 8;
  const terrainScore =
    config.terrain === "MOUNTAIN" ? 4 : config.terrain === "COASTAL" ? 3 : 2;
  const disasterScore =
    config.disaster === "METEOR"
      ? 10
      : config.disaster === "TSUNAMI"
      ? 8
      : config.disaster === "FLOOD"
      ? 7
      : 6;
  const delayScore =
    config.officialDelayMinutes <= 5
      ? 0
      : config.officialDelayMinutes <= 15
      ? 4
      : 8;
  const ambiguityScore =
    config.ambiguityLevel <= 30 ? 0 : config.ambiguityLevel <= 60 ? 6 : 12;
  const misinfoScore =
    config.misinformationLevel <= 30
      ? 0
      : config.misinformationLevel <= 60
      ? 6
      : 12;
  const multilingualScore =
    config.multilingualCoverage <= 40
      ? 6
      : config.multilingualCoverage <= 70
      ? 3
      : 0;
  const factCheckScore =
    config.factCheckSpeed <= 40 ? 6 : config.factCheckSpeed <= 70 ? 3 : 0;
  const interventionScore =
    config.interventionPoints <= 100
      ? 8
      : config.interventionPoints <= 140
      ? 5
      : config.interventionPoints <= 180
      ? 2
      : 0;
  const emotionScore =
    config.emotionTone === "WARM"
      ? 0
      : config.emotionTone === "NEUTRAL"
      ? 2
      : 4;
  const ageScore =
    config.ageProfile === "SENIOR"
      ? 4
      : config.ageProfile === "YOUTH"
      ? 2
      : 1;

  const total =
    sizeScore +
    populationScore +
    buildingScore +
    terrainScore +
    disasterScore +
    delayScore +
    ambiguityScore +
    misinfoScore +
    multilingualScore +
    factCheckScore +
    interventionScore +
    emotionScore +
    ageScore;

  if (total <= 35) return "easy";
  if (total <= 65) return "middle";
  return "high";
};

const SliderRow = <T extends string | number>({
  title,
  subtitle,
  icon,
  options,
  value,
  onChange,
}: SliderRowProps<T>) => {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const current = options[index] ?? options[0];

  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-900/60 text-emerald-200">
            {icon}
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-200">{title}</p>
            {subtitle ? (
              <p className="text-[11px] text-slate-400">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
          {current.badge ?? current.label}
        </span>
      </div>
      <div className="mt-2">
        <input
          className={sliderInputClass}
          type="range"
          min={0}
          max={Math.max(options.length - 1, 0)}
          step={1}
          value={index}
          onChange={(event) => {
            const nextIndex = Number(event.target.value);
            const next = options[nextIndex];
            if (!next) return;
            onChange(next.value);
          }}
        />
        <div className="mt-2 flex justify-between text-[10px] text-slate-500">
          {options.map((option) => (
            <span
              key={String(option.value)}
              className={
                option.value === current.value ? "text-emerald-200" : undefined
              }
            >
              {option.shortLabel ?? option.label}
            </span>
          ))}
        </div>
      </div>
      {current.detail ? (
        <p className="mt-1 text-[11px] text-slate-400">{current.detail}</p>
      ) : null}
    </div>
  );
};

const OptionTile = <T extends string>({
  option,
  active,
  onSelect,
}: {
  option: TileOption<T>;
  active: boolean;
  onSelect: (value: T) => void;
}) => {
  const disabled = option.disabled;
  return (
    <button
      className={`group rounded-2xl border px-3 py-3 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-900/60 bg-slate-950/30 text-slate-600"
          : active
          ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.2)]"
          : "border-slate-800/70 bg-slate-950/50 text-slate-200 hover:border-slate-600/70 hover:bg-slate-900/60"
      }`}
      onClick={() => {
        if (disabled) return;
        onSelect(option.value);
      }}
      type="button"
      disabled={disabled}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-900/60 text-emerald-200">
          {option.icon}
        </span>
        <div>
          <p className="text-sm font-semibold">{option.label}</p>
          {option.detail ? (
            <p className="text-[11px] text-slate-400">{option.detail}</p>
          ) : null}
          {option.disabled ? (
            <p className="text-[10px] text-slate-600">
              {option.disabledHint ?? "選択不可"}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
};

const IconGrid = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const IconUsers = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="8" cy="8" r="3" />
    <circle cx="16" cy="9" r="3" />
    <path d="M3 20c0-2.5 3-4 5-4" />
    <path d="M12 20c0-2.5 3-4 5-4" />
  </svg>
);

const IconBuilding = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 20V6l6-2v16" />
    <path d="M10 20V9l10-3v14" />
    <path d="M6.5 10h1" />
    <path d="M6.5 13h1" />
    <path d="M6.5 16h1" />
    <path d="M13 12h1" />
    <path d="M13 15h1" />
    <path d="M13 18h1" />
  </svg>
);

const IconLandscape = ({ className = "h-5 w-5" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 18l6-8 4 5 3-4 5 7H3z" />
    <path d="M3 18h18" />
  </svg>
);

const IconHazard = ({ className = "h-5 w-5" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l9 16H3z" />
    <path d="M12 9v5" />
    <path d="M12 18h.01" />
  </svg>
);

const IconClock = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const IconFog = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 9h16" />
    <path d="M6 13h12" />
    <path d="M4 17h16" />
  </svg>
);

const IconAlert = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 4l8 14H4z" />
    <path d="M12 9v5" />
    <path d="M12 17h.01" />
  </svg>
);

const IconLanguage = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 5h9a4 4 0 0 1 0 8H8l-4 3V5z" />
    <path d="M14 13h6v6l-3-2h-3z" />
  </svg>
);

const IconCheck = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="8" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
);

const IconHeart = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 8.5c0 5-8 10-8 10s-8-5-8-10a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 20 8.5z" />
  </svg>
);

const IconAge = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="8" r="3" />
    <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    <path d="M16 4h5" />
    <path d="M18.5 1.5v5" />
  </svg>
);

const IconWave = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 15c2.5-2 5-2 7.5 0s5 2 7.5 0" />
    <path d="M3 19c2.5-2 5-2 7.5 0s5 2 7.5 0" />
  </svg>
);

const IconMountain = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 19l7-10 4 6 3-4 4 8H3z" />
  </svg>
);

const IconCity = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 20V7l5-2v15" />
    <path d="M9 20V9l6-3v14" />
    <path d="M15 20v-6l5-2v8" />
  </svg>
);

const IconQuake = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12h5l2-5 3 10 2-6 2 4h4" />
  </svg>
);

const IconFlood = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3c3 4 4 6 4 8a4 4 0 1 1-8 0c0-2 1-4 4-8z" />
    <path d="M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
  </svg>
);

const IconMeteor = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 5l4 1-3 3" />
    <path d="M9 3l4 1-3 3" />
    <circle cx="16.5" cy="16.5" r="3.5" />
  </svg>
);

const IconTarget = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 8v4l2 2" />
  </svg>
);

const IconShield = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const IconTiming = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 7v5" />
    <path d="M12 12l3 2" />
    <circle cx="12" cy="12" r="8" />
  </svg>
);

const IconChevronDown = ({ className = "h-4 w-4" }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const SimConfigModal = ({
  config,
  ready,
  onChange,
  onStart,
}: SimConfigModalProps) => {
  const setField = <K extends keyof SimConfig>(key: K, value: SimConfig[K]) =>
    onChange({ ...config, [key]: value });
  const setTerrain = (value: TerrainType) => {
    const next = { ...config, terrain: value };
    if (value !== "COASTAL" && config.disaster === "TSUNAMI") {
      next.disaster = "EARTHQUAKE";
    }
    onChange(next);
  };

  const sizeOptions: SliderOption<TownSize>[] = [
    {
      value: "SMALL",
      label: "小",
      shortLabel: "小",
      badge: `${SIZE_DIMENSIONS.SMALL}×${SIZE_DIMENSIONS.SMALL}`,
      detail: `マップ: ${SIZE_DIMENSIONS.SMALL}×${SIZE_DIMENSIONS.SMALL}`,
    },
    {
      value: "MEDIUM",
      label: "中",
      shortLabel: "中",
      badge: `${SIZE_DIMENSIONS.MEDIUM}×${SIZE_DIMENSIONS.MEDIUM}`,
      detail: `マップ: ${SIZE_DIMENSIONS.MEDIUM}×${SIZE_DIMENSIONS.MEDIUM}`,
    },
    {
      value: "LARGE",
      label: "大",
      shortLabel: "大",
      badge: `${SIZE_DIMENSIONS.LARGE}×${SIZE_DIMENSIONS.LARGE}`,
      detail: `マップ: ${SIZE_DIMENSIONS.LARGE}×${SIZE_DIMENSIONS.LARGE}`,
    },
  ];

  const populationOptions: SliderOption<number>[] = [
    {
      value: POPULATION_PRESETS.SMALL,
      label: "少",
      shortLabel: "少",
      badge: `${formatNumber(POPULATION_PRESETS.SMALL)}人`,
      detail: `人口規模: ${formatNumber(POPULATION_PRESETS.SMALL)}人`,
    },
    {
      value: POPULATION_PRESETS.MEDIUM,
      label: "中",
      shortLabel: "中",
      badge: `${formatNumber(POPULATION_PRESETS.MEDIUM)}人`,
      detail: `人口規模: ${formatNumber(POPULATION_PRESETS.MEDIUM)}人`,
    },
    {
      value: POPULATION_PRESETS.LARGE,
      label: "多",
      shortLabel: "多",
      badge: `${formatNumber(POPULATION_PRESETS.LARGE)}人`,
      detail: `人口規模: ${formatNumber(POPULATION_PRESETS.LARGE)}人`,
    },
  ];

  const buildingOptions: SliderOption<number>[] = [
    {
      value: BUILDING_PRESETS.SMALL,
      label: "少",
      shortLabel: "少",
      badge: `${formatNumber(BUILDING_PRESETS.SMALL)}棟`,
      detail: `建物数: ${formatNumber(BUILDING_PRESETS.SMALL)}棟`,
    },
    {
      value: BUILDING_PRESETS.MEDIUM,
      label: "中",
      shortLabel: "中",
      badge: `${formatNumber(BUILDING_PRESETS.MEDIUM)}棟`,
      detail: `建物数: ${formatNumber(BUILDING_PRESETS.MEDIUM)}棟`,
    },
    {
      value: BUILDING_PRESETS.LARGE,
      label: "多",
      shortLabel: "多",
      badge: `${formatNumber(BUILDING_PRESETS.LARGE)}棟`,
      detail: `建物数: ${formatNumber(BUILDING_PRESETS.LARGE)}棟`,
    },
  ];

  const delayOptions: SliderOption<number>[] = OFFICIAL_DELAY_PRESETS.map(
    (value) => ({
      value,
      label: value <= 5 ? "速い" : value <= 15 ? "標準" : "遅い",
      shortLabel: `${value}分`,
      badge: `${value}分`,
      detail: `公式警報が出るまで${value}分`,
    })
  );

  const ambiguityOptions: SliderOption<number>[] = AMBIGUITY_PRESETS.map(
    (value) => ({
      value,
      label: value <= 30 ? "低" : value <= 60 ? "中" : "高",
      shortLabel: value <= 30 ? "低" : value <= 60 ? "中" : "高",
      badge: `${value}%`,
      detail:
        value <= 30
          ? "情報が比較的明確"
          : value <= 60
          ? "不確実さが混在"
          : "断片情報が多い",
    })
  );

  const misinfoOptions: SliderOption<number>[] = MISINFORMATION_PRESETS.map(
    (value) => ({
      value,
      label: value <= 30 ? "弱" : value <= 60 ? "中" : "強",
      shortLabel: value <= 30 ? "弱" : value <= 60 ? "中" : "強",
      badge: `${value}%`,
      detail:
        value <= 30
          ? "デマの勢いは弱め"
          : value <= 60
          ? "デマが拡散しやすい"
          : "偽情報が大量に流入",
    })
  );

  const multilingualOptions: SliderOption<number>[] =
    MULTILINGUAL_COVERAGE_PRESETS.map((value) => ({
      value,
      label: value <= 40 ? "低" : value <= 70 ? "中" : "高",
      shortLabel: value <= 40 ? "低" : value <= 70 ? "中" : "高",
      badge: `${value}%`,
      detail:
        value <= 40
          ? "翻訳が不足"
          : value <= 70
          ? "主要言語は対応"
          : "多言語対応が充実",
    }));

  const factCheckOptions: SliderOption<number>[] = FACT_CHECK_SPEED_PRESETS.map(
    (value) => ({
      value,
      label: value <= 40 ? "遅い" : value <= 70 ? "標準" : "速い",
      shortLabel: value <= 40 ? "遅" : value <= 70 ? "標" : "速",
      badge: `${value}%`,
      detail:
        value <= 40
          ? "検証に時間がかかる"
          : value <= 70
          ? "通常の検証速度"
          : "迅速に訂正が出る",
    })
  );

  const interventionPointOptions: SliderOption<number>[] =
    INTERVENTION_POINT_PRESETS.map((value) => ({
      value,
      label: value <= 100 ? "少" : value <= 160 ? "標準" : "多",
      shortLabel: `${value}`,
      badge: `${value}pt`,
      detail:
        value <= 100
          ? "介入回数が限られる"
          : value <= 160
          ? "標準的な介入回数"
          : "介入を多めに使える",
    }));

  const emotionOptions: SliderOption<EmotionTone>[] = [
    {
      value: "WARM",
      label: EMOTION_TONE_LABELS.WARM,
      shortLabel: "温",
      badge: EMOTION_TONE_LABELS.WARM,
      detail: "協力的・共感多め",
    },
    {
      value: "NEUTRAL",
      label: EMOTION_TONE_LABELS.NEUTRAL,
      shortLabel: "中",
      badge: EMOTION_TONE_LABELS.NEUTRAL,
      detail: "標準的な反応",
    },
    {
      value: "COOL",
      label: EMOTION_TONE_LABELS.COOL,
      shortLabel: "冷",
      badge: EMOTION_TONE_LABELS.COOL,
      detail: "警戒強め・慎重寄り",
    },
  ];

  const ageOptions: SliderOption<AgeProfile>[] = [
    {
      value: "YOUTH",
      label: AGE_PROFILE_LABELS.YOUTH,
      shortLabel: "若",
      badge: AGE_PROFILE_LABELS.YOUTH,
      detail: "若者・子どもが多い",
    },
    {
      value: "BALANCED",
      label: AGE_PROFILE_LABELS.BALANCED,
      shortLabel: "均",
      badge: AGE_PROFILE_LABELS.BALANCED,
      detail: "平均的な構成",
    },
    {
      value: "SENIOR",
      label: AGE_PROFILE_LABELS.SENIOR,
      shortLabel: "高",
      badge: AGE_PROFILE_LABELS.SENIOR,
      detail: "高齢者が多い",
    },
  ];

  const terrainOptions: TileOption<TerrainType>[] = [
    {
      value: "COASTAL",
      label: TERRAIN_LABELS.COASTAL,
      detail: "港と砂浜が多い",
      icon: <IconWave className="h-5 w-5" />,
    },
    {
      value: "MOUNTAIN",
      label: TERRAIN_LABELS.MOUNTAIN,
      detail: "起伏が多い",
      icon: <IconMountain className="h-5 w-5" />,
    },
    {
      value: "URBAN",
      label: TERRAIN_LABELS.URBAN,
      detail: "街区が密集",
      icon: <IconCity className="h-5 w-5" />,
    },
  ];

  const disasterOptions: TileOption<DisasterType>[] = [
    {
      value: "TSUNAMI",
      label: DISASTER_LABELS.TSUNAMI,
      detail: "海沿いの避難が鍵",
      icon: <IconWave className="h-5 w-5" />,
      disabled: config.terrain !== "COASTAL",
      disabledHint: "海沿い限定",
    },
    {
      value: "EARTHQUAKE",
      label: DISASTER_LABELS.EARTHQUAKE,
      detail: "揺れと停電に備える",
      icon: <IconQuake className="h-5 w-5" />,
    },
    {
      value: "FLOOD",
      label: DISASTER_LABELS.FLOOD,
      detail: "水位上昇が早い",
      icon: <IconFlood className="h-5 w-5" />,
    },
    {
      value: "METEOR",
      label: DISASTER_LABELS.METEOR,
      detail: "衝突地点が予測困難",
      icon: <IconMeteor className="h-5 w-5" />,
    },
  ];

  const difficulty = getDifficulty(config);
  const difficultyLevels: DifficultyLevel[] = ["easy", "middle", "high"];
  const difficultyStyles: Record<DifficultyLevel, string> = {
    easy: "border-emerald-400/70 bg-emerald-400/10 text-emerald-200",
    middle: "border-amber-300/70 bg-amber-300/10 text-amber-100",
    high: "border-rose-400/70 bg-rose-500/10 text-rose-200",
  };
  const difficultyInactive =
    "border-slate-800/70 bg-slate-950/60 text-slate-500";
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <section className="relative w-full max-w-none overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/90 text-slate-100 shadow-[0_40px_120px_rgba(4,8,16,0.65)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.08),_transparent_55%)]" />
      <div className="relative p-5 sm:p-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Mission Setup
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-100">
                ミッション設定
              </h2>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
                ロードアウトを選択
              </span>
            </div>
            <p className="text-sm text-slate-400">
              災害時の情報伝播と避難判断をゲーム感覚で体験する街づくりシムです。
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <p className="text-xs text-slate-500">
              Start を押すとミッションが開始します。
            </p>
            <button
              className={`start-cta rounded-full px-6 py-3 text-sm font-semibold transition ${
                ready
                  ? "bg-emerald-400 text-slate-900 hover:bg-emerald-300"
                  : "cursor-not-allowed bg-slate-700 text-slate-300"
              }`}
              onClick={onStart}
              type="button"
              disabled={!ready}
            >
              <span>{ready ? "スタート" : "接続中..."}</span>
            </button>
          </div>
        </header>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/50 text-emerald-200">
              <IconTarget className="h-4 w-4" />
            </span>
            難易度
          </div>
          <div className="flex items-center rounded-full border border-slate-800/70 bg-slate-950/60 p-1">
            {difficultyLevels.map((level) => (
              <span
                key={level}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase transition ${
                  level === difficulty
                    ? difficultyStyles[level]
                    : difficultyInactive
                }`}
              >
                {level}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            パラメータから自動判定
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-200/90 via-amber-100/90 to-yellow-50/80 p-4 text-slate-900 shadow-[0_20px_60px_rgba(250,204,21,0.2)]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-300/70 bg-white/70 text-amber-700">
              <IconTarget className="h-4 w-4" />
            </span>
            ミッションの目的
          </div>
          <p className="mt-2 text-sm text-slate-800">
            司令室として介入カードを使い、噂と混乱を抑えつつ公式情報と支援を行き渡らせます。
          </p>
          <div className="mt-3 grid gap-2 text-xs text-slate-700 md:grid-cols-3">
            <div className="rounded-xl border border-amber-300/70 bg-white/70 p-3">
              <div className="flex items-center gap-2 text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-300/70 bg-white/70 text-amber-700">
                  <IconShield className="h-3.5 w-3.5" />
                </span>
                公式到達・要支援到達を上げる
              </div>
            </div>
            <div className="rounded-xl border border-amber-300/70 bg-white/70 p-3">
              <div className="flex items-center gap-2 text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-300/70 bg-white/70 text-amber-700">
                  <IconAlert className="h-3.5 w-3.5" />
                </span>
                噂拡散と混乱度を下げる
              </div>
            </div>
            <div className="rounded-xl border border-amber-300/70 bg-white/70 p-3">
              <div className="flex items-center gap-2 text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-300/70 bg-white/70 text-amber-700">
                  <IconTiming className="h-3.5 w-3.5" />
                </span>
                介入のタイミングを見極める
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-700">
            人数と建物は研究規模をWeb向けに縮小したプリセットです。
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/50 text-emerald-200">
                <IconGrid className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  World Scale
                </p>
                <h3 className="text-sm font-semibold text-slate-100">町のスケール</h3>
                <p className="text-[11px] text-slate-400">
                  街の大きさをシンプルに調整
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3">
              <SliderRow
                title="町のサイズ"
                subtitle="マップの縦横サイズ"
                icon={<IconGrid className="h-4 w-4" />}
                options={sizeOptions}
                value={config.size}
                onChange={(value) => setField("size", value)}
              />
              <SliderRow
                title="人数"
                subtitle="街に住む人口規模"
                icon={<IconUsers className="h-4 w-4" />}
                options={populationOptions}
                value={config.population}
                onChange={(value) => setField("population", value)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/50 text-emerald-200">
                <IconLandscape className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Scenario Deck
                </p>
                <h3 className="text-sm font-semibold text-slate-100">地形と災害</h3>
                <p className="text-[11px] text-slate-400">
                  ステージとシナリオを選択
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  地形
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {terrainOptions.map((option) => (
                    <OptionTile
                      key={option.value}
                      option={option}
                      active={config.terrain === option.value}
                      onSelect={setTerrain}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700/60 bg-slate-950/40 text-emerald-200">
                    <IconHazard className="h-3.5 w-3.5" />
                  </span>
                  災害シナリオ
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {disasterOptions.map((option) => (
                    <OptionTile
                      key={option.value}
                      option={option}
                      active={config.disaster === option.value}
                      onSelect={(value) => setField("disaster", value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-900/30 p-2">
          <button
            className="flex w-full items-center justify-between rounded-xl border border-slate-700/70 bg-slate-950/50 px-3 py-3 text-left transition hover:border-slate-500/70 hover:bg-slate-900/60"
            onClick={() => setShowAdvanced((current) => !current)}
            type="button"
            aria-expanded={showAdvanced}
            aria-controls="advanced-settings-panel"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-900/70 text-emerald-200">
                <IconTarget className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Advanced Settings
                </p>
                <h3 className="text-sm font-semibold text-slate-100">高度な設定</h3>
                <p className="text-[11px] text-slate-400">
                  公式遅延・デマ・住民傾向などの詳細パラメータ
                </p>
              </div>
            </div>
            <span className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
              {showAdvanced ? "閉じる" : "開く"}
              <IconChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  showAdvanced ? "rotate-180" : ""
                }`}
              />
            </span>
          </button>
        </div>

        {showAdvanced ? (
          <div id="advanced-settings-panel" className="mt-4">
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/50 text-emerald-200">
                  <IconBuilding className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Urban Density
                  </p>
                  <h3 className="text-sm font-semibold text-slate-100">建物密度</h3>
                  <p className="text-[11px] text-slate-400">
                    施設・住宅の総量を調整
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3">
                <SliderRow
                  title="建物数"
                  subtitle="施設・住宅の総数"
                  icon={<IconBuilding className="h-4 w-4" />}
                  options={buildingOptions}
                  value={config.buildings}
                  onChange={(value) => setField("buildings", value)}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/50 text-emerald-200">
                  <IconFog className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Signal Field
                  </p>
                  <h3 className="text-sm font-semibold text-slate-100">情報環境</h3>
                  <p className="text-[11px] text-slate-400">
                    公式情報の遅れや噂の濃さを調整
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3">
                <SliderRow
                  title="公式警報遅延"
                  subtitle="公式情報が出るまでの時間"
                  icon={<IconClock className="h-4 w-4" />}
                  options={delayOptions}
                  value={config.officialDelayMinutes}
                  onChange={(value) => setField("officialDelayMinutes", value)}
                />
                <SliderRow
                  title="情報の曖昧さ"
                  subtitle="噂と公式情報の明瞭さ"
                  icon={<IconFog className="h-4 w-4" />}
                  options={ambiguityOptions}
                  value={config.ambiguityLevel}
                  onChange={(value) => setField("ambiguityLevel", value)}
                />
                <SliderRow
                  title="デマ強度"
                  subtitle="誤情報が広がる勢い"
                  icon={<IconAlert className="h-4 w-4" />}
                  options={misinfoOptions}
                  value={config.misinformationLevel}
                  onChange={(value) => setField("misinformationLevel", value)}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/50 text-emerald-200">
                  <IconLanguage className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Comms Power
                  </p>
                  <h3 className="text-sm font-semibold text-slate-100">伝達力</h3>
                  <p className="text-[11px] text-slate-400">
                    多言語対応と検証のスピード
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3">
                <SliderRow
                  title="多言語対応"
                  subtitle="翻訳の行き渡り度"
                  icon={<IconLanguage className="h-4 w-4" />}
                  options={multilingualOptions}
                  value={config.multilingualCoverage}
                  onChange={(value) => setField("multilingualCoverage", value)}
                />
                <SliderRow
                  title="検証速度"
                  subtitle="ファクトチェックの速さ"
                  icon={<IconCheck className="h-4 w-4" />}
                  options={factCheckOptions}
                  value={config.factCheckSpeed}
                  onChange={(value) => setField("factCheckSpeed", value)}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/50 text-emerald-200">
                  <IconTarget className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Intervention Budget
                  </p>
                  <h3 className="text-sm font-semibold text-slate-100">
                    介入ポイント
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    介入カードで使える総量
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3">
                <SliderRow
                  title="介入ポイント"
                  subtitle="介入に使えるポイント量"
                  icon={<IconTarget className="h-4 w-4" />}
                  options={interventionPointOptions}
                  value={config.interventionPoints}
                  onChange={(value) => setField("interventionPoints", value)}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-3 lg:col-span-3 xl:col-span-2">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/50 text-emerald-200">
                  <IconHeart className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Community Profile
                  </p>
                  <h3 className="text-sm font-semibold text-slate-100">住民プロフィール</h3>
                  <p className="text-[11px] text-slate-400">
                    感情と年齢の傾向を選ぶ
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SliderRow
                  title="住民の気分"
                  subtitle="感情のトーン"
                  icon={<IconHeart className="h-4 w-4" />}
                  options={emotionOptions}
                  value={config.emotionTone}
                  onChange={(value) => setField("emotionTone", value)}
                />
                <SliderRow
                  title="年齢層"
                  subtitle="人口構成の傾向"
                  icon={<IconAge className="h-4 w-4" />}
                  options={ageOptions}
                  value={config.ageProfile}
                  onChange={(value) => setField("ageProfile", value)}
                />
              </div>
            </div>
            </div>
          </div>
        ) : null}

      </div>
    </section>
  );
};

export default SimConfigModal;
