"use client";

import { Canvas } from "@react-three/fiber";
import SceneRoot from "@/components/three/SceneRoot";
import { useSimStore } from "@/store/useSimStore";

type CityCanvasProps = {
  suppressOverlays?: boolean;
};

const CityCanvas = ({ suppressOverlays = false }: CityCanvasProps) => {
  const clearFocus = useSimStore((state) => state.clearFocus);

  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      gl={{ antialias: false, alpha: false }}
      onPointerMissed={() => clearFocus()}
    >
      <color attach="background" args={["#10151c"]} />
      <SceneRoot suppressOverlays={suppressOverlays} />
    </Canvas>
  );
};

export default CityCanvas;
