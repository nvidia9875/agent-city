"use client";

import IsoCamera from "@/components/three/IsoCamera";
import MapTiles from "@/components/three/MapTiles";
import Buildings from "@/components/three/Buildings";
import Trees from "@/components/three/Trees";
import Agents from "@/components/three/Agents";
import AgentBubbles from "@/components/three/AgentBubbles";
import EntityTooltip from "@/components/three/EntityTooltip";
import Cars from "@/components/three/Cars";

const SceneRoot = () => {
  return (
    <>
      <IsoCamera />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 18, 12]} intensity={0.9} />
      <directionalLight position={[-12, 14, -8]} intensity={0.4} />
      <MapTiles />
      <Trees />
      <Buildings />
      <Cars />
      <Agents />
      <AgentBubbles />
      <EntityTooltip />
    </>
  );
};

export default SceneRoot;
