"use client";

import { MapControls, OrthographicCamera } from "@react-three/drei";
import { useEffect, useRef } from "react";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import * as THREE from "three";

const IsoCamera = () => {
  const controlsRef = useRef<MapControlsImpl | null>(null);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, []);

  return (
    <>
      <OrthographicCamera
        makeDefault
        position={[26, 26, 26]}
        zoom={28}
        near={-100}
        far={100}
      />
      <MapControls
        ref={controlsRef}
        enableRotate={false}
        enableDamping
        dampingFactor={0.12}
        screenSpacePanning
        minZoom={14}
        maxZoom={60}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
        }}
      />
    </>
  );
};

export default IsoCamera;
