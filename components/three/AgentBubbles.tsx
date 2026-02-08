"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";
import { useSimStore } from "@/store/useSimStore";
import { gridToWorld } from "@/utils/grid";

const BUBBLE_HEIGHT = 1.08;
const BUBBLE_BOB = 0.02;
const BUBBLE_MAX_CHARS = 160;
const BUBBLE_WINDOW_SECONDS = 10;
const BUBBLE_MIN_VISIBLE_SECONDS = 5;
const BUBBLE_START_OFFSET_MAX = 5;
const BUBBLE_POPULATION_RATIO = 0.03;
const BUBBLE_MAX_VISIBLE = 5;

const clampStyle: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 4,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const formatBubble = (text: string) =>
  text.length > BUBBLE_MAX_CHARS ? `${text.slice(0, BUBBLE_MAX_CHARS)}…` : text;

const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
};

type BubbleAgent = {
  id: string;
  x: number;
  z: number;
  bubble: string;
};

type AgentBubblesProps = {
  hidden?: boolean;
};

const AgentBubbles = ({ hidden = false }: AgentBubblesProps) => {
  const world = useSimStore((state) => state.world);
  const simEnded = useSimStore((state) => state.sim.ended);
  const connectionReady = useSimStore((state) => state.connectionReady);
  const [, forceRender] = useState(0);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [visibleText, setVisibleText] = useState<Record<string, string>>({});
  const visibleIdsRef = useRef<string[]>([]);
  const visibleTextRef = useRef<Record<string, string>>({});

  const bubbleAgents = useMemo(() => {
    if (!world) return [] as BubbleAgent[];
    return Object.values(world.agents)
      .map((agent) => {
        const bubble = agent.bubble?.trim();
        if (!bubble) return null;
        const { x, z } = gridToWorld(agent.pos, world.width, world.height);
        return {
          id: agent.id,
          x,
          z,
          bubble: formatBubble(bubble),
        };
      })
      .filter((agent): agent is BubbleAgent => Boolean(agent));
  }, [world]);

  const bubbleById = useMemo(() => {
    const map = new Map<string, BubbleAgent>();
    bubbleAgents.forEach((agent) => {
      map.set(agent.id, agent);
    });
    return map;
  }, [bubbleAgents]);

  const bubbleTextById = useMemo(() => {
    const map = new Map<string, string>();
    bubbleAgents.forEach((agent) => {
      map.set(agent.id, agent.bubble);
    });
    return map;
  }, [bubbleAgents]);

  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  const groupRefs = useRef<Record<string, THREE.Group>>({});
  const positionRefs = useRef<Record<string, THREE.Vector3>>({});
  const offsetRefs = useRef<Record<string, number>>({});
  const visibilityRefs = useRef<Record<string, boolean>>({});
  const visibleSinceRefs = useRef<Record<string, number>>({});
  const windowRefs = useRef<Record<string, number>>({});
  const textRefs = useRef<Record<string, string>>({});
  const timeRef = useRef(0);

  useEffect(() => {
    const ids = new Set(bubbleAgents.map((agent) => agent.id));
    Object.keys(groupRefs.current).forEach((id) => {
      if (!ids.has(id)) {
        delete groupRefs.current[id];
        delete positionRefs.current[id];
        delete offsetRefs.current[id];
        delete visibilityRefs.current[id];
        delete visibleSinceRefs.current[id];
        delete windowRefs.current[id];
        delete textRefs.current[id];
      }
    });
    const filteredVisible = visibleIdsRef.current.filter((id) => ids.has(id));
    if (filteredVisible.length !== visibleIdsRef.current.length) {
      visibleIdsRef.current = filteredVisible;
      setVisibleIds(filteredVisible);
    }
  }, [bubbleAgents]);

  useFrame((state, delta) => {
    if (hidden || simEnded || !connectionReady) return;
    timeRef.current += delta;
    const elapsed = state.clock.getElapsedTime();
    let updated = false;
    const nextCandidates: Array<{ id: string; score: number }> = [];
    const visibleCandidates: Array<{ id: string; score: number }> = [];
    let visibleCount = 0;
    bubbleAgents.forEach((agent) => {
      if (offsetRefs.current[agent.id] === undefined) {
        offsetRefs.current[agent.id] = Math.random() * BUBBLE_START_OFFSET_MAX;
      }
      const offset = offsetRefs.current[agent.id] ?? 0;

      const windowIndex = Math.floor((elapsed + offset) / BUBBLE_WINDOW_SECONDS);
      const lastWindow = windowRefs.current[agent.id];
      const wasVisible = visibilityRefs.current[agent.id] ?? false;
      if (lastWindow !== windowIndex) {
        windowRefs.current[agent.id] = windowIndex;
        if (wasVisible) {
          const visibleSince = visibleSinceRefs.current[agent.id] ?? elapsed;
          if (elapsed - visibleSince >= BUBBLE_MIN_VISIBLE_SECONDS) {
            visibilityRefs.current[agent.id] = false;
            delete visibleSinceRefs.current[agent.id];
          }
        } else {
          const score = hashSeed(`${agent.id}:${windowIndex}`);
          const eligible = score / 2 ** 32 < BUBBLE_POPULATION_RATIO;
          if (eligible) {
            nextCandidates.push({ id: agent.id, score });
          }
        }
      }

      if (visibilityRefs.current[agent.id]) {
        visibleCount += 1;
        visibleCandidates.push({
          id: agent.id,
          score: hashSeed(`${agent.id}:${windowIndex}:keep`),
        });
      }
    });

    if (nextCandidates.length > 0 && visibleCount < BUBBLE_MAX_VISIBLE) {
      nextCandidates.sort((a, b) => a.score - b.score);
      const slots = Math.min(BUBBLE_MAX_VISIBLE - visibleCount, nextCandidates.length);
      for (let i = 0; i < slots; i += 1) {
        const id = nextCandidates[i].id;
        visibilityRefs.current[id] = true;
        visibleSinceRefs.current[id] = elapsed;
        const nextText = bubbleTextById.get(id) ?? "";
        if (textRefs.current[id] !== nextText) {
          textRefs.current[id] = nextText;
          updated = true;
        }
      }
    }

    if (visibleCandidates.length > BUBBLE_MAX_VISIBLE) {
      visibleCandidates.sort((a, b) => a.score - b.score);
      const protectedIds = new Set(
        visibleCandidates
          .filter((entry) => {
            const visibleSince = visibleSinceRefs.current[entry.id] ?? elapsed;
            return elapsed - visibleSince < BUBBLE_MIN_VISIBLE_SECONDS;
          })
          .map((entry) => entry.id)
      );
      const allowed = new Set<string>(protectedIds);
      visibleCandidates.forEach((entry) => {
        if (allowed.size >= BUBBLE_MAX_VISIBLE) return;
        if (!protectedIds.has(entry.id)) {
          allowed.add(entry.id);
        }
      });
      visibleCandidates.forEach((entry) => {
        if (!allowed.has(entry.id)) {
          visibilityRefs.current[entry.id] = false;
          delete visibleSinceRefs.current[entry.id];
        }
      });
      if (allowed.size !== visibleCandidates.length) {
        updated = true;
      }
    }

    const visibleNow = bubbleAgents
      .filter((agent) => visibilityRefs.current[agent.id])
      .map((agent) => agent.id)
      .sort();
    const prevVisible = visibleIdsRef.current;
    const changed =
      visibleNow.length !== prevVisible.length ||
      visibleNow.some((id, idx) => id !== prevVisible[idx]);
    if (changed) {
      visibleIdsRef.current = visibleNow;
      setVisibleIds(visibleNow);
    }

    const nextVisibleText: Record<string, string> = {};
    visibleNow.forEach((id, index) => {
      const group = groupRefs.current[id];
      const agent = bubbleById.get(id);
      if (!group || !agent) return;
      if (textRefs.current[id] === undefined) {
        const nextText = bubbleTextById.get(id) ?? "";
        textRefs.current[id] = nextText;
        updated = true;
      }
      nextVisibleText[id] = textRefs.current[id] ?? agent.bubble;
      const target = new THREE.Vector3(agent.x, BUBBLE_HEIGHT, agent.z);
      const current = positionRefs.current[id] ?? target.clone();
      current.lerp(target, 0.12);
      positionRefs.current[id] = current;
      const bob = Math.sin(timeRef.current * 4 + index) * BUBBLE_BOB;
      group.position.set(current.x, BUBBLE_HEIGHT + bob, current.z);
    });
    if (updated) {
      forceRender((value) => (value + 1) % 100000);
    }

    const prevText = visibleTextRef.current;
    const textKeys = Object.keys(nextVisibleText);
    const prevKeys = Object.keys(prevText);
    const textChanged =
      textKeys.length !== prevKeys.length ||
      textKeys.some((key) => prevText[key] !== nextVisibleText[key]);
    if (textChanged) {
      visibleTextRef.current = nextVisibleText;
      setVisibleText(nextVisibleText);
    }
  });

  if (hidden || !world || bubbleAgents.length === 0 || simEnded || !connectionReady) {
    return null;
  }

  return (
    <group>
      {bubbleAgents.filter((agent) => visibleIdSet.has(agent.id)).map((agent) => (
        <group
          key={agent.id}
          position={[agent.x, BUBBLE_HEIGHT, agent.z]}
          ref={(node) => {
            if (!node) {
              delete groupRefs.current[agent.id];
              delete positionRefs.current[agent.id];
              return;
            }
            groupRefs.current[agent.id] = node;
          }}
        >
          <Html center style={{ pointerEvents: "none" }}>
            <div className="relative w-[420px] max-w-[480px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[12px] leading-snug text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.26)]">
              <span className="block whitespace-normal break-words" style={clampStyle}>
                {visibleText[agent.id] ?? agent.bubble}
              </span>
              <span className="absolute left-6 -bottom-2 h-3 w-3 rotate-45 border-b border-r border-slate-200 bg-white" />
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
};

export default AgentBubbles;
