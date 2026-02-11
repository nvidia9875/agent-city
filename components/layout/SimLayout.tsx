"use client";

import { useEffect, useRef, useState } from "react";
import CityCanvas from "@/components/three/CityCanvas";
import SimConfigModal from "@/components/layout/SimConfigModal";
import SimIntroModal from "@/components/layout/SimIntroModal";
import SimStatusDock from "@/components/layout/SimStatusDock";
import TopHud from "@/components/layout/TopHud";
import LeftTimeline from "@/components/layout/LeftTimeline";
import BottomInterventions from "@/components/layout/BottomInterventions";
import SimResultsModal from "@/components/layout/SimResultsModal";
import { useSimWebSocket } from "@/hooks/useSimWebSocket";
import { useSimStore } from "@/store/useSimStore";
import type { WsClientMsg } from "@/types/ws";
import type { SimConfig } from "@/types/sim";
import { DEFAULT_INTERVENTION_POINTS, DEFAULT_SIM_CONFIG } from "@/utils/simConfig";

const INTERVENTION_USE_LIMIT = 10;
const POINT_RECOVERY_INTERVAL_TICKS = 5;
const POINT_RECOVERY_AMOUNT = 10;

type PointState = {
  value: number;
  recoveryTick: number;
};

const settlePointState = (
  pointState: PointState,
  currentTick: number,
  maxPoints: number
) => {
  if (currentTick <= pointState.recoveryTick) return pointState;
  const elapsedTicks = currentTick - pointState.recoveryTick;
  const intervals = Math.floor(elapsedTicks / POINT_RECOVERY_INTERVAL_TICKS);
  if (intervals <= 0) return pointState;

  return {
    value: Math.min(maxPoints, pointState.value + intervals * POINT_RECOVERY_AMOUNT),
    recoveryTick:
      pointState.recoveryTick + intervals * POINT_RECOVERY_INTERVAL_TICKS,
  };
};

const SimLayout = () => {
  const { send, ready } = useSimWebSocket();
  const world = useSimStore((state) => state.world);
  const ui = useSimStore((state) => state.ui);
  const sim = useSimStore((state) => state.sim);
  const metricsTick = useSimStore((state) => state.metricsTick);
  const metricsHistory = useSimStore((state) => state.metricsHistory);
  const timeline = useSimStore((state) => state.timeline);
  const setSpeed = useSimStore((state) => state.setSpeed);
  const togglePause = useSimStore((state) => state.togglePause);
  const resetSim = useSimStore((state) => state.resetSim);
  const [config, setConfig] = useState<SimConfig>(DEFAULT_SIM_CONFIG);
  const [started, setStarted] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hideResults, setHideResults] = useState(false);
  const [pointState, setPointState] = useState<PointState>({
    value: DEFAULT_INTERVENTION_POINTS,
    recoveryTick: 0,
  });
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [interventionsRemaining, setInterventionsRemaining] = useState(
    INTERVENTION_USE_LIMIT
  );
  const interventionsRemainingRef = useRef(INTERVENTION_USE_LIMIT);
  const showResults = sim.ended && !hideResults;
  const hasBlockingOverlay = showConfirm || showResults || !started || showConfig;
  const isGameActive = started && !sim.ended;
  const maxPoints = config.interventionPoints ?? DEFAULT_INTERVENTION_POINTS;
  const currentTick = metricsTick ?? world?.tick ?? 0;
  const settledPointState = settlePointState(pointState, currentTick, maxPoints);
  const points = settledPointState.value;
  const isRecoveryActive = started && !sim.ended && points < maxPoints;
  const recoveryTicksIntoCycle = Math.max(
    0,
    currentTick - settledPointState.recoveryTick
  );
  const ticksUntilNextRecovery = isRecoveryActive
    ? POINT_RECOVERY_INTERVAL_TICKS - recoveryTicksIntoCycle
    : 0;
  const recoveryProgressPercent = isRecoveryActive
    ? Math.round(
        (recoveryTicksIntoCycle /
          POINT_RECOVERY_INTERVAL_TICKS) *
          100
      )
    : 0;

  const handleSpeed = (speed: 1 | 5 | 20 | 60) => {
    setSpeed(speed);
    send({ type: "SET_SPEED", speed });
  };

  const handlePause = () => {
    const msg: WsClientMsg = { type: ui.paused ? "RESUME" : "PAUSE" };
    togglePause();
    send(msg);
  };

  const handleStart = () => {
    resetSim();
    setStarted(true);
    setHideResults(false);
    setShowConfig(false);
    setShowConfirm(false);
    setPointState({
      value: config.interventionPoints ?? DEFAULT_INTERVENTION_POINTS,
      recoveryTick: 0,
    });
    setCooldowns({});
    interventionsRemainingRef.current = INTERVENTION_USE_LIMIT;
    setInterventionsRemaining(INTERVENTION_USE_LIMIT);
    send({ type: "INIT_SIM", config });
  };

  const handleOpenConfig = () => {
    if (!started) return;
    setShowConfirm(true);
  };

  const handleConfirmRestart = () => {
    setShowConfirm(false);
    setShowConfig(true);
  };

  const handleZoomControl = (direction: "in" | "out") => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("sim-camera-zoom", {
        detail: { direction },
      })
    );
  };

  useEffect(() => {
    if (!isGameActive) return;

    const guardState = { simGuard: true };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handlePopState = () => {
      window.alert(
        "シミュレーション中です。終了前にこのページから離れることはできません。"
      );
      window.history.pushState(guardState, "", window.location.href);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.history.pushState(guardState, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isGameActive]);

  return (
    <div className="relative h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#1f2a44,_#0a0f18_55%,_#070a10)] pb-6 pt-5 text-slate-100">
      {sim.ended && sim.summary && showResults ? (
        <div className="fancy-scroll absolute inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <SimResultsModal
            summary={sim.summary}
            metricsHistory={metricsHistory}
            config={config}
            onRestart={() => {
              setHideResults(true);
              setShowConfig(true);
            }}
          />
        </div>
      ) : null}
      {!started && showIntro ? (
        <div className="fancy-scroll absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <SimIntroModal onClose={() => setShowIntro(false)} />
        </div>
      ) : null}
      {(!started && !showIntro) || showConfig ? (
        <div className="fancy-scroll absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <SimConfigModal
            config={config}
            ready={ready}
            onChange={setConfig}
            onStart={handleStart}
          />
        </div>
      ) : null}
      {showConfirm ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-800/80 bg-slate-950/90 p-6 text-slate-100 shadow-[0_40px_120px_rgba(4,8,16,0.65)]">
            <h2 className="text-lg font-semibold">最初から始めますか？</h2>
            <p className="mt-2 text-sm text-slate-400">
              現在のシミュレーションはリセットされます。
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                className="rounded-full border border-slate-700/80 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
                onClick={() => setShowConfirm(false)}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300"
                onClick={handleConfirmRestart}
                type="button"
              >
                最初から
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="relative z-30 lg:col-span-2">
          <TopHud
            onPauseToggle={handlePause}
            onSpeedChange={handleSpeed}
            officialDelayMinutes={config.officialDelayMinutes}
            ambiguityLevel={config.ambiguityLevel}
            misinformationLevel={config.misinformationLevel}
            multilingualCoverage={config.multilingualCoverage}
            factCheckSpeed={config.factCheckSpeed}
            terrain={config.terrain}
            disaster={config.disaster}
            emotionTone={config.emotionTone}
            ageProfile={config.ageProfile}
            onOpenConfig={handleOpenConfig}
          />
        </div>
        <div className="min-h-0 lg:row-start-2 lg:row-span-2 lg:col-start-1">
          <LeftTimeline />
        </div>
        <div className="relative min-h-0 overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-950/60 shadow-[0_30px_80px_rgba(8,12,18,0.6)] lg:row-start-2 lg:col-start-2">
          <div className="absolute left-3 top-3 z-30 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleZoomControl("in")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-100 shadow transition hover:border-emerald-400/70 hover:text-emerald-200"
              aria-label="拡大"
              title="拡大"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M11 8v6" />
                <path d="M8 11h6" />
                <path d="M16 16l4 4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => handleZoomControl("out")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-100 shadow transition hover:border-emerald-400/70 hover:text-emerald-200"
              aria-label="縮小"
              title="縮小"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M8 11h6" />
                <path d="M16 16l4 4" />
              </svg>
            </button>
          </div>
          <CityCanvas suppressOverlays={hasBlockingOverlay} />
          <SimStatusDock />
          {!world ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
              ミッションを初期化中...
            </div>
          ) : null}
        </div>
        <div className="min-h-0 lg:row-start-3 lg:col-start-2">
          <BottomInterventions
            disabled={sim.ended}
            disaster={config.disaster}
            timeline={timeline}
            points={points}
            maxPoints={maxPoints}
            currentTick={currentTick}
            cooldowns={cooldowns}
            pointRecovery={{
              active: isRecoveryActive,
              amountPerCycle: POINT_RECOVERY_AMOUNT,
              cycleTicks: POINT_RECOVERY_INTERVAL_TICKS,
              ticksUntilNext: ticksUntilNextRecovery,
              progressPercent: recoveryProgressPercent,
            }}
            interventionUseLimit={INTERVENTION_USE_LIMIT}
            interventionsRemaining={interventionsRemaining}
            onIntervention={(intervention) => {
              const tick = currentTick;
              const nextAvailable = cooldowns[intervention.kind] ?? 0;
              if (tick < nextAvailable) return;
              if (points < intervention.cost) return;
              if (interventionsRemainingRef.current <= 0) return;
              const nextPoints = Math.max(
                0,
                settledPointState.value - intervention.cost
              );
              const cooldownEndTick = tick + intervention.cooldown;
              setPointState({
                value: nextPoints,
                recoveryTick: settledPointState.recoveryTick,
              });
              setCooldowns((current) => ({
                ...current,
                [intervention.kind]: cooldownEndTick,
              }));
              interventionsRemainingRef.current = Math.max(
                0,
                interventionsRemainingRef.current - 1
              );
              setInterventionsRemaining(interventionsRemainingRef.current);
              send({
                type: "INTERVENTION",
                payload: {
                  kind: intervention.kind,
                  message: intervention.message,
                },
              });
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default SimLayout;
