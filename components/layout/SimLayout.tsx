"use client";

import { useState } from "react";
import CityCanvas from "@/components/three/CityCanvas";
import SimConfigModal from "@/components/layout/SimConfigModal";
import TopHud from "@/components/layout/TopHud";
import LeftTimeline from "@/components/layout/LeftTimeline";
import BottomInterventions from "@/components/layout/BottomInterventions";
import SimResultsModal from "@/components/layout/SimResultsModal";
import { useSimWebSocket } from "@/hooks/useSimWebSocket";
import { useSimStore } from "@/store/useSimStore";
import type { WsClientMsg } from "@/types/ws";
import type { SimConfig } from "@/types/sim";
import { DEFAULT_INTERVENTION_BUDGET, DEFAULT_SIM_CONFIG } from "@/utils/simConfig";

const SimLayout = () => {
  const { send, ready } = useSimWebSocket();
  const world = useSimStore((state) => state.world);
  const ui = useSimStore((state) => state.ui);
  const sim = useSimStore((state) => state.sim);
  const metricsTick = useSimStore((state) => state.metricsTick);
  const metricsHistory = useSimStore((state) => state.metricsHistory);
  const setSpeed = useSimStore((state) => state.setSpeed);
  const togglePause = useSimStore((state) => state.togglePause);
  const resetSim = useSimStore((state) => state.resetSim);
  const [config, setConfig] = useState<SimConfig>(DEFAULT_SIM_CONFIG);
  const [started, setStarted] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hideResults, setHideResults] = useState(false);
  const [budget, setBudget] = useState(DEFAULT_INTERVENTION_BUDGET);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const showResults = sim.ended && !hideResults;

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
    setBudget(DEFAULT_INTERVENTION_BUDGET);
    setCooldowns({});
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
      {!started || showConfig ? (
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
        <div className="lg:col-span-2">
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
        <div className="min-h-0 lg:row-start-2 lg:col-start-1">
          <LeftTimeline />
        </div>
        <div className="relative min-h-0 overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-950/60 shadow-[0_30px_80px_rgba(8,12,18,0.6)] lg:row-start-2 lg:col-start-2">
          <CityCanvas />
          {!world ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
              ミッションを初期化中...
            </div>
          ) : null}
        </div>
        <div className="lg:col-span-2">
          <BottomInterventions
            disabled={sim.ended}
            disaster={config.disaster}
            budget={budget}
            currentTick={metricsTick ?? world?.tick ?? 0}
            cooldowns={cooldowns}
            onIntervention={(intervention) => {
              const tick = metricsTick ?? world?.tick ?? 0;
              const nextAvailable = cooldowns[intervention.kind] ?? 0;
              if (tick < nextAvailable) return;
              if (budget < intervention.cost) return;
              setBudget((current) => Math.max(0, current - intervention.cost));
              setCooldowns((current) => ({
                ...current,
                [intervention.kind]: tick + intervention.cooldown,
              }));
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
