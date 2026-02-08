"use client";

import { MapControls, OrthographicCamera } from "@react-three/drei";
import { useCallback, useEffect, useRef } from "react";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import * as THREE from "three";

const CAMERA_ZOOM_EVENT = "sim-camera-zoom";
const CAMERA_MIN_ZOOM = 14;
const CAMERA_MAX_ZOOM = 60;
const CAMERA_DEFAULT_ZOOM = 28;
const CAMERA_ZOOM_STEP = 3;

const IsoCamera = () => {
  const controlsRef = useRef<MapControlsImpl | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  const applyZoomDelta = useCallback((delta: number) => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.zoom = THREE.MathUtils.clamp(
      camera.zoom + delta,
      CAMERA_MIN_ZOOM,
      CAMERA_MAX_ZOOM
    );
    camera.updateProjectionMatrix();
    controlsRef.current?.update();
  }, []);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, []);

  useEffect(() => {
    const handleZoom = (event: Event) => {
      const customEvent = event as CustomEvent<{ direction?: "in" | "out" }>;
      const direction = customEvent.detail?.direction;
      if (!direction) return;
      applyZoomDelta(direction === "in" ? CAMERA_ZOOM_STEP : -CAMERA_ZOOM_STEP);
    };

    window.addEventListener(CAMERA_ZOOM_EVENT, handleZoom);
    return () => window.removeEventListener(CAMERA_ZOOM_EVENT, handleZoom);
  }, [applyZoomDelta]);

  return (
    <>
      <OrthographicCamera
        ref={cameraRef}
        makeDefault
        position={[26, 26, 26]}
        zoom={CAMERA_DEFAULT_ZOOM}
        near={-100}
        far={100}
      />
      <MapControls
        ref={controlsRef}
        enableRotate={false}
        enableDamping
        dampingFactor={0.12}
        screenSpacePanning
        minZoom={CAMERA_MIN_ZOOM}
        maxZoom={CAMERA_MAX_ZOOM}
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
