"use client";

import { Canvas } from "@react-three/fiber";
import SceneRoot from "@/components/three/SceneRoot";
import { useSimStore } from "@/store/useSimStore";

const CityCanvas = () => {
  const clearFocus = useSimStore((state) => state.clearFocus);

  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      gl={{ antialias: false, alpha: false }}
      onPointerMissed={() => clearFocus()}
    >
      <color attach="background" args={["#10151c"]} />
      <SceneRoot />
    </Canvas>
  );
};

export default CityCanvas;
