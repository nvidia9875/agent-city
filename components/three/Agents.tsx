"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useSimStore } from "@/store/useSimStore";
import { gridToWorld } from "@/utils/grid";

const createAgentTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = "#f8e2c7";
  ctx.beginPath();
  ctx.arc(16, 14, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4b5a76";
  ctx.fillRect(11, 18, 10, 9);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(13, 20, 6, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
};

const Agents = () => {
  const world = useSimStore((state) => state.world);
  const selectedAgentId = useSimStore((state) => state.selected.agentId);
  const selectAgent = useSimStore((state) => state.selectAgent);
  const setHoveredAgent = useSimStore((state) => state.setHoveredAgent);

  const spriteTexture = useMemo(() => createAgentTexture(), []);
  const spriteMaterial = useMemo(() => {
    if (!spriteTexture) return undefined;
    return new THREE.SpriteMaterial({ map: spriteTexture });
  }, [spriteTexture]);

  const spriteRefs = useRef<Record<string, THREE.Sprite>>({});
  const positionRefs = useRef<Record<string, THREE.Vector3>>({});
  const timeRef = useRef(0);

  const agents = useMemo(() => {
    if (!world) return [] as Array<{ id: string; x: number; z: number }>;
    return Object.values(world.agents).map((agent) => {
      const { x, z } = gridToWorld(agent.pos, world.width, world.height);
      return { id: agent.id, x, z };
    });
  }, [world]);

  useFrame((state, delta) => {
    timeRef.current += delta;
    agents.forEach((agent, index) => {
      const sprite = spriteRefs.current[agent.id];
      if (!sprite) return;
      const target = new THREE.Vector3(agent.x, 0.2, agent.z);
      const current = positionRefs.current[agent.id] ?? target.clone();
      current.lerp(target, 0.12);
      positionRefs.current[agent.id] = current;
      const bob = Math.sin(timeRef.current * 4 + index) * 0.04;
      sprite.position.set(current.x, 0.26 + bob, current.z);
      const scale = selectedAgentId === agent.id ? 0.68 : 0.56;
      sprite.scale.set(scale, scale, scale);
    });
  });

  if (!world || !spriteMaterial) return null;

  return (
    <group>
      {agents.map((agent) => (
        <sprite
          key={agent.id}
          material={spriteMaterial}
          onClick={(event) => {
            event.stopPropagation();
            selectAgent(agent.id);
          }}
          onPointerOver={() => setHoveredAgent(agent.id)}
          onPointerOut={() => setHoveredAgent(undefined)}
          ref={(node) => {
            if (!node) {
              delete spriteRefs.current[agent.id];
              return;
            }
            spriteRefs.current[agent.id] = node;
          }}
        />
      ))}
    </group>
  );
};

export default Agents;
