"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectMockWs } from "@/mocks/mockWs";
import { useSimStore } from "@/store/useSimStore";
import type { WsClientMsg, WsServerMsg } from "@/types/ws";

const logLevel = process.env.NEXT_PUBLIC_SIM_LOG_LEVEL ?? "info";
const allowInfo = logLevel === "info" || logLevel === "debug";
const allowDebug = logLevel === "debug";
const logInfo = (...args: unknown[]) => {
  if (allowInfo) {
    console.log("[sim-ui]", ...args);
  }
};
const logDebug = (...args: unknown[]) => {
  if (allowDebug) {
    console.log("[sim-ui:debug]", ...args);
  }
};

const connectBrowserWs = (
  url: string,
  onMessage: (msg: WsServerMsg) => void,
  onReady: () => void,
  onClose: () => void
) => {
  const socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    logInfo("ws open", url);
    onReady();
  });
  socket.addEventListener("close", () => {
    logInfo("ws close");
    onClose();
  });

  socket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data) as WsServerMsg;
      logDebug("ws message", data.type);
      onMessage(data);
    } catch {
      return;
    }
  });

  const send = (msg: WsClientMsg) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  };

  const close = () => {
    socket.close();
  };

  return { send, close };
};

export const useSimWebSocket = () => {
  const setWorld = useSimStore((state) => state.setWorld);
  const applyWorldDiff = useSimStore((state) => state.applyWorldDiff);
  const addEvent = useSimStore((state) => state.addEvent);
  const setMetrics = useSimStore((state) => state.setMetrics);
  const setReasoning = useSimStore((state) => state.setReasoning);
  const setSimEnd = useSimStore((state) => state.setSimEnd);
  const selectedAgentId = useSimStore((state) => state.selected.agentId);
  const selectedBuildingId = useSimStore((state) => state.selected.buildingId);

  const sendRef = useRef<(msg: WsClientMsg) => void>(() => undefined);
  const pendingRef = useRef<WsClientMsg[]>([]);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    const markReady = () => {
      if (readyRef.current) return;
      readyRef.current = true;
      setReady(true);
      pendingRef.current.forEach((msg) => sendRef.current?.(msg));
      pendingRef.current = [];
    };
    const markClosed = () => {
      readyRef.current = false;
      setReady(false);
      pendingRef.current = [];
    };
    const connection = wsUrl
      ? connectBrowserWs(
          wsUrl,
          (msg: WsServerMsg) => {
            if (msg.type === "WORLD_INIT") {
              setWorld(msg.world);
              return;
            }
            if (msg.type === "WORLD_DIFF") {
              applyWorldDiff(msg);
              return;
            }
            if (msg.type === "EVENT_LOG" || msg.type === "EVENT") {
              addEvent(msg.event);
              return;
            }
            if (msg.type === "METRICS") {
              setMetrics(msg.metrics, msg.tick);
              return;
            }
            if (msg.type === "SIM_END") {
              setSimEnd(msg.summary);
              return;
            }
            if (msg.type === "AGENT_REASONING") {
              setReasoning(msg.payload);
            }
          },
          markReady,
          markClosed
        )
      : (() => {
          logInfo("mock ws connected");
          return connectMockWs((msg: WsServerMsg) => {
            if (msg.type === "WORLD_INIT") {
              setWorld(msg.world);
              return;
            }
            if (msg.type === "WORLD_DIFF") {
              applyWorldDiff(msg);
              return;
            }
            if (msg.type === "EVENT_LOG" || msg.type === "EVENT") {
              addEvent(msg.event);
              return;
            }
            if (msg.type === "METRICS") {
              setMetrics(msg.metrics, msg.tick);
              return;
            }
            if (msg.type === "SIM_END") {
              setSimEnd(msg.summary);
              return;
            }
            if (msg.type === "AGENT_REASONING") {
              setReasoning(msg.payload);
            }
          });
        })();

    sendRef.current = connection.send;
    if (!wsUrl) {
      markReady();
    }

    return () => {
      connection.close();
      markClosed();
    };
  }, [addEvent, applyWorldDiff, setMetrics, setReasoning, setSimEnd, setWorld]);

  useEffect(() => {
    if (!selectedAgentId) return;
    sendRef.current?.({ type: "SELECT_AGENT", agentId: selectedAgentId });
  }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedBuildingId) return;
    sendRef.current?.({ type: "SELECT_BUILDING", buildingId: selectedBuildingId });
  }, [selectedBuildingId]);

  const send = useCallback((msg: WsClientMsg) => {
    if (!readyRef.current) {
      pendingRef.current.push(msg);
      return;
    }
    logDebug("ws send", msg.type);
    sendRef.current?.(msg);
  }, []);

  return { send, ready };
};
