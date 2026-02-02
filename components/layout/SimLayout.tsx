"use client";

import { useState } from "react";
import CityCanvas from "@/components/three/CityCanvas";
import SimConfigModal from "@/components/layout/SimConfigModal";
import TopHud from "@/components/layout/TopHud";
import LeftTimeline from "@/components/layout/LeftTimeline";
import BottomInterventions from "@/components/layout/BottomInterventions";
import { useSimWebSocket } from "@/hooks/useSimWebSocket";
import { useSimStore } from "@/store/useSimStore";
import type { WsClientMsg } from "@/types/ws";
import type { SimConfig } from "@/types/sim";
import { DEFAULT_SIM_CONFIG } from "@/utils/simConfig";

const SimLayout = () => {
  const { send, ready } = useSimWebSocket();
  const world = useSimStore((state) => state.world);
  const ui = useSimStore((state) => state.ui);
  const setSpeed = useSimStore((state) => state.setSpeed);
  const togglePause = useSimStore((state) => state.togglePause);
  const [config, setConfig] = useState<SimConfig>(DEFAULT_SIM_CONFIG);
  const [started, setStarted] = useState(false);

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
    setStarted(true);
    send({ type: "INIT_SIM", config });
  };

  return (
    <div className="relative h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#1f2a44,_#0a0f18_55%,_#070a10)] px-4 pb-6 pt-5 text-slate-100">
      {!started ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm">
          <SimConfigModal
            config={config}
            ready={ready}
            onChange={setConfig}
            onStart={handleStart}
          />
        </div>
      ) : null}
      <div className="mx-auto grid h-full min-h-0 max-w-[1400px] grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="lg:col-span-2">
          <TopHud onPauseToggle={handlePause} onSpeedChange={handleSpeed} />
        </div>
        <div className="min-h-0 lg:row-start-2 lg:col-start-1">
          <LeftTimeline />
        </div>
        <div className="relative min-h-0 overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-950/60 shadow-[0_30px_80px_rgba(8,12,18,0.6)] lg:row-start-2 lg:col-start-2">
          <CityCanvas />
          {started && !world ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
              シミュレーションを初期化中...
            </div>
          ) : null}
        </div>
        <div className="lg:col-span-2">
          <BottomInterventions
            onIntervention={(intervention) => {
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
