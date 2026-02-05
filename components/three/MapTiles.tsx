"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { useSimStore } from "@/store/useSimStore";
import { gridToWorld, getRoadNeighbors, getRoadRotation } from "@/utils/grid";
import type { TileType } from "@/types/sim";

const tileNoise = (x: number, y: number) => {
  let seed = x * 374761393 + y * 668265263;
  seed = (seed ^ (seed >> 13)) * 1274126177;
  seed ^= seed >> 16;
  return (seed >>> 0) / 4294967295;
};

const LAND_HEIGHT = 0.12;
const WATER_HEIGHT = 0.04;
const WATER_SURFACE_Y = -0.05;
const MOUNTAIN_BASE_HEIGHT = 0.28;
const MOUNTAIN_PEAK_HEIGHT = 1;

const makeShapeGeometry = (points: Array<[number, number]>) => {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
};

const createRoadGeometries = (roadWidth: number) => {
  const half = 0.5;
  const w = roadWidth / 2;

  const straight = makeShapeGeometry([
    [-w, -half],
    [w, -half],
    [w, half],
    [-w, half],
  ]);

  const corner = makeShapeGeometry([
    [-w, 0],
    [-w, half],
    [w, half],
    [w, w],
    [half, w],
    [half, -w],
    [0, -w],
    [0, 0],
  ]);

  const tee = makeShapeGeometry([
    [-half, -w],
    [half, -w],
    [half, w],
    [w, w],
    [w, half],
    [-w, half],
    [-w, w],
    [-half, w],
  ]);

  const cross = makeShapeGeometry([
    [-w, -half],
    [w, -half],
    [w, -w],
    [half, -w],
    [half, w],
    [w, w],
    [w, half],
    [-w, half],
    [-w, w],
    [-half, w],
    [-half, -w],
    [-w, -w],
  ]);

  return { straight, corner, tee, cross };
};

const MapTiles = () => {
  const world = useSimStore((state) => state.world);
  const clearFocus = useSimStore((state) => state.clearFocus);
  const landRef = useRef<THREE.InstancedMesh>(null);
  const waterRef = useRef<THREE.InstancedMesh>(null);
  const mountainBaseRef = useRef<THREE.InstancedMesh>(null);
  const mountainPeakRef = useRef<THREE.InstancedMesh>(null);
  const straightRef = useRef<THREE.InstancedMesh>(null);
  const cornerRef = useRef<THREE.InstancedMesh>(null);
  const teeRef = useRef<THREE.InstancedMesh>(null);
  const crossRef = useRef<THREE.InstancedMesh>(null);

  const geometries = useMemo(() => createRoadGeometries(0.42), []);
  const landGeometry = useMemo(
    () => new THREE.BoxGeometry(1, LAND_HEIGHT, 1),
    []
  );
  const waterGeometry = useMemo(
    () => new THREE.BoxGeometry(1, WATER_HEIGHT, 1),
    []
  );
  const mountainBaseGeometry = useMemo(
    () => new THREE.BoxGeometry(1, MOUNTAIN_BASE_HEIGHT, 1),
    []
  );
  const mountainPeakGeometry = useMemo(
    () => new THREE.ConeGeometry(0.65, MOUNTAIN_PEAK_HEIGHT, 5),
    []
  );

  const data = useMemo(() => {
    if (!world) {
      return {
        land: [],
        landColors: [],
        water: [],
        waterColors: [],
        mountainBase: [],
        mountainBaseColors: [],
        mountainPeaks: [],
        mountainPeakColors: [],
        straight: [],
        corner: [],
        tee: [],
        cross: [],
      };
    }

    const { width, height, tiles } = world;
    const land: Array<{ x: number; z: number }> = [];
    const landColors: THREE.Color[] = [];
    const water: Array<{ x: number; z: number; y: number }> = [];
    const waterColors: THREE.Color[] = [];
    const mountainBase: Array<{ x: number; z: number }> = [];
    const mountainBaseColors: THREE.Color[] = [];
    const mountainPeaks: Array<{
      x: number;
      z: number;
      y: number;
      rot: number;
      scale: number;
      scaleY: number;
    }> = [];
    const mountainPeakColors: THREE.Color[] = [];
    const straight: Array<{ x: number; z: number; rot: number }> = [];
    const corner: Array<{ x: number; z: number; rot: number }> = [];
    const tee: Array<{ x: number; z: number; rot: number }> = [];
    const cross: Array<{ x: number; z: number; rot: number }> = [];

    const landPalette = (tile: TileType) => {
      if (tile === "PARK") {
        return { base: new THREE.Color("#5fbf7a"), tint: new THREE.Color("#3a9a61") };
      }
      return { base: new THREE.Color("#4fa96b"), tint: new THREE.Color("#2f7b4f") };
    };

    const waterPalette = {
      base: new THREE.Color("#8bd9ff"),
      tint: new THREE.Color("#4db6ff"),
    };

    const mountainPalette = {
      base: new THREE.Color("#5fb469"),
      tint: new THREE.Color("#2f7b3d"),
    };

    const mountainPeakPalette = {
      base: new THREE.Color("#bde9b6"),
      tint: new THREE.Color("#88d395"),
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const tile = tiles[y * width + x];
        const { x: wx, z: wz } = gridToWorld({ x, y }, width, height);
        const shade = tileNoise(x, y);
        if (tile === "WATER") {
          const wave = (shade - 0.5) * 0.04;
          const surfaceY = WATER_SURFACE_Y + wave;
          water.push({ x: wx, z: wz, y: surfaceY - WATER_HEIGHT / 2 });
          waterColors.push(waterPalette.base.clone().lerp(waterPalette.tint, shade * 0.4));
          continue;
        }

        if (tile === "MOUNTAIN") {
          mountainBase.push({ x: wx, z: wz });
          mountainBaseColors.push(
            mountainPalette.base.clone().lerp(mountainPalette.tint, shade * 0.35)
          );
          const scale = 0.75 + shade * 0.6;
          const scaleY = 0.9 + shade * 1.3;
          const peakCenterY =
            MOUNTAIN_BASE_HEIGHT + (MOUNTAIN_PEAK_HEIGHT * scaleY) / 2;
          mountainPeaks.push({
            x: wx,
            z: wz,
            y: peakCenterY,
            rot: shade * Math.PI * 2,
            scale,
            scaleY,
          });
          mountainPeakColors.push(
            mountainPeakPalette.base.clone().lerp(
              mountainPeakPalette.tint,
              shade * 0.3
            )
          );
          continue;
        }

        const { base, tint } = landPalette(tile);
        land.push({ x: wx, z: wz });
        landColors.push(base.lerp(tint, shade * 0.35));

        if (!tile.startsWith("ROAD")) continue;

        const neighbors = getRoadNeighbors(tiles, width, height, x, y);
        const rotation = (getRoadRotation(tile, neighbors) * Math.PI) / 180;
        const target = tile === "ROAD_STRAIGHT"
          ? straight
          : tile === "ROAD_CORNER"
            ? corner
            : tile === "ROAD_T"
              ? tee
              : cross;
        target.push({ x: wx, z: wz, rot: rotation });
      }
    }

    return {
      land,
      landColors,
      water,
      waterColors,
      mountainBase,
      mountainBaseColors,
      mountainPeaks,
      mountainPeakColors,
      straight,
      corner,
      tee,
      cross,
    };
  }, [world]);

  useLayoutEffect(() => {
    if (!world) return;
    const updateInstances = (
      ref: RefObject<THREE.InstancedMesh>,
      items: Array<{
        x: number;
        z: number;
        rot?: number;
        y?: number;
        scale?: number;
        scaleY?: number;
      }>,
      y: number,
      colors?: THREE.Color[]
    ) => {
      if (!ref.current) return;
      const temp = new THREE.Object3D();
      items.forEach((item, index) => {
        const scale = item.scale ?? 1;
        const scaleY = item.scaleY ?? scale;
        temp.position.set(item.x, item.y ?? y, item.z);
        temp.rotation.set(0, item.rot ?? 0, 0);
        temp.scale.set(scale, scaleY, scale);
        temp.updateMatrix();
        ref.current!.setMatrixAt(index, temp.matrix);
        if (colors) {
          ref.current!.setColorAt(index, colors[index]);
        }
      });
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) {
        ref.current.instanceColor.needsUpdate = true;
      }
    };

    updateInstances(
      landRef,
      data.land,
      -LAND_HEIGHT / 2,
      data.landColors
    );
    updateInstances(waterRef, data.water, WATER_SURFACE_Y, data.waterColors);
    updateInstances(
      mountainBaseRef,
      data.mountainBase,
      MOUNTAIN_BASE_HEIGHT / 2,
      data.mountainBaseColors
    );
    updateInstances(
      mountainPeakRef,
      data.mountainPeaks,
      MOUNTAIN_BASE_HEIGHT + MOUNTAIN_PEAK_HEIGHT / 2,
      data.mountainPeakColors
    );
    updateInstances(straightRef, data.straight, 0.02);
    updateInstances(cornerRef, data.corner, 0.02);
    updateInstances(teeRef, data.tee, 0.02);
    updateInstances(crossRef, data.cross, 0.02);
  }, [data, world]);

  if (!world) return null;

  return (
    <group>
      <instancedMesh
        ref={waterRef}
        args={[waterGeometry, undefined, data.water.length]}
        onPointerDown={() => clearFocus()}
      >
        <meshStandardMaterial
          vertexColors
          color="#8bd9ff"
          roughness={0.15}
          metalness={0.05}
          emissive="#3aa6ff"
          emissiveIntensity={0.45}
        />
      </instancedMesh>
      <instancedMesh
        ref={landRef}
        args={[landGeometry, undefined, data.land.length]}
        receiveShadow
        onPointerDown={() => clearFocus()}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.9}
          color="#4fa96b"
          emissive="#1e3c2a"
          emissiveIntensity={0.12}
        />
      </instancedMesh>
      <instancedMesh
        ref={mountainBaseRef}
        args={[mountainBaseGeometry, undefined, data.mountainBase.length]}
        onPointerDown={() => clearFocus()}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.85}
          color="#5fb469"
          emissive="#2a5b36"
          emissiveIntensity={0.2}
        />
      </instancedMesh>
      <instancedMesh
        ref={mountainPeakRef}
        args={[mountainPeakGeometry, undefined, data.mountainPeaks.length]}
        onPointerDown={() => clearFocus()}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.75}
          color="#bde9b6"
          emissive="#7acb86"
          emissiveIntensity={0.28}
        />
      </instancedMesh>
      <instancedMesh
        ref={straightRef}
        args={[geometries.straight, undefined, data.straight.length]}
        onPointerDown={() => clearFocus()}
      >
        <meshStandardMaterial color="#2b2f36" roughness={0.6} />
      </instancedMesh>
      <instancedMesh
        ref={cornerRef}
        args={[geometries.corner, undefined, data.corner.length]}
        onPointerDown={() => clearFocus()}
      >
        <meshStandardMaterial color="#2b2f36" roughness={0.6} />
      </instancedMesh>
      <instancedMesh
        ref={teeRef}
        args={[geometries.tee, undefined, data.tee.length]}
        onPointerDown={() => clearFocus()}
      >
        <meshStandardMaterial color="#2b2f36" roughness={0.6} />
      </instancedMesh>
      <instancedMesh
        ref={crossRef}
        args={[geometries.cross, undefined, data.cross.length]}
        onPointerDown={() => clearFocus()}
      >
        <meshStandardMaterial color="#2b2f36" roughness={0.6} />
      </instancedMesh>
    </group>
  );
};

export default MapTiles;
