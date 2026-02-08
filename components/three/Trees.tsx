"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { useSimStore } from "@/store/useSimStore";
import { getRoadNeighbors, gridToWorld, isRoadTile, toIndex } from "@/utils/grid";
import type { TileType } from "@/types/sim";

type Vec3 = [number, number, number];

type Instance = {
  position: Vec3;
  scale: Vec3;
  rotY: number;
};

const seededRandom = (seed: number) => {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hash2d = (x: number, y: number, salt = 0) => {
  let seed = x * 374761393 + y * 668265263 + salt * 144269504;
  seed = (seed ^ (seed >> 13)) * 1274126177;
  seed ^= seed >> 16;
  return (seed >>> 0) / 4294967295;
};

const Trees = () => {
  const world = useSimStore((state) => state.world);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const shrubRef = useRef<THREE.InstancedMesh>(null);

  const trunkGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.5, 0.55, 1, 6),
    []
  );
  const canopyGeometry = useMemo(
    () => new THREE.SphereGeometry(0.5, 7, 5),
    []
  );
  const shrubGeometry = useMemo(
    () => new THREE.SphereGeometry(0.5, 6, 4),
    []
  );

  const data = useMemo(() => {
    if (!world) {
      return {
        trunks: [] as Instance[],
        trunkColors: [] as THREE.Color[],
        canopies: [] as Instance[],
        canopyColors: [] as THREE.Color[],
        shrubs: [] as Instance[],
        shrubColors: [] as THREE.Color[],
      };
    }

    const { width, height, tiles } = world;
    const buildingTiles = new Set(
      Object.values(world.buildings).map((building) => `${building.pos.x},${building.pos.y}`)
    );

    const trunks: Instance[] = [];
    const trunkColors: THREE.Color[] = [];
    const canopies: Instance[] = [];
    const canopyColors: THREE.Color[] = [];
    const shrubs: Instance[] = [];
    const shrubColors: THREE.Color[] = [];

    const trunkBase = new THREE.Color("#7a5b3a");
    const trunkTint = new THREE.Color("#5f3c24");
    const canopyBase = new THREE.Color("#62d97b");
    const canopyTint = new THREE.Color("#2db25d");
    const shrubBase = new THREE.Color("#7ade86");
    const shrubTint = new THREE.Color("#38b56b");

    const isPlantable = (tile: TileType) =>
      tile === "GRASS" || tile === "PARK";

    const isRoadNeighbor = (x: number, y: number) => {
      const north = y > 0 ? isRoadTile(tiles[toIndex(x, y - 1, width)]) : false;
      const south =
        y < height - 1 ? isRoadTile(tiles[toIndex(x, y + 1, width)]) : false;
      const west = x > 0 ? isRoadTile(tiles[toIndex(x - 1, y, width)]) : false;
      const east =
        x < width - 1 ? isRoadTile(tiles[toIndex(x + 1, y, width)]) : false;
      return north || south || west || east;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const tile = tiles[toIndex(x, y, width)];
        if (buildingTiles.has(`${x},${y}`)) continue;

        if (isRoadTile(tile)) {
          const neighbors = getRoadNeighbors(tiles, width, height, x, y);
          const neighborCount =
            (neighbors.north ? 1 : 0) +
            (neighbors.south ? 1 : 0) +
            (neighbors.west ? 1 : 0) +
            (neighbors.east ? 1 : 0);
          if (neighborCount >= 3) continue;

          const baseSeed = Math.floor(hash2d(x, y, 37) * 1_000_000);
          const density = neighborCount === 2 ? 0.34 : 0.22;
          if (seededRandom(baseSeed + 5) > density) continue;

          const sideOptions: Array<[number, number]> = [];
          if (!neighbors.north) sideOptions.push([0, -1]);
          if (!neighbors.south) sideOptions.push([0, 1]);
          if (!neighbors.west) sideOptions.push([-1, 0]);
          if (!neighbors.east) sideOptions.push([1, 0]);
          if (sideOptions.length === 0) continue;

          const pick = Math.floor(seededRandom(baseSeed + 11) * sideOptions.length);
          const [sideX, sideZ] = sideOptions[pick];
          const edgeOffset = 0.36;
          const alongJitter = (seededRandom(baseSeed + 13) - 0.5) * 0.16;
          const { x: wx, z: wz } = gridToWorld({ x, y }, width, height);
          const offsetX = sideX * edgeOffset + (sideZ !== 0 ? alongJitter : 0);
          const offsetZ = sideZ * edgeOffset + (sideX !== 0 ? alongJitter : 0);
          const heightScale = 0.14 + seededRandom(baseSeed + 17) * 0.2;
          const radiusScale = 0.045 + seededRandom(baseSeed + 19) * 0.03;
          const canopyScale = 0.2 + seededRandom(baseSeed + 23) * 0.22;

          trunks.push({
            position: [wx + offsetX, heightScale / 2, wz + offsetZ],
            scale: [radiusScale, heightScale, radiusScale],
            rotY: seededRandom(baseSeed + 29) * Math.PI * 2,
          });
          trunkColors.push(
            trunkBase.clone().lerp(trunkTint, seededRandom(baseSeed + 31) * 0.4)
          );

          canopies.push({
            position: [wx + offsetX, heightScale + canopyScale * 0.55, wz + offsetZ],
            scale: [canopyScale, canopyScale, canopyScale],
            rotY: 0,
          });
          canopyColors.push(
            canopyBase.clone().lerp(canopyTint, seededRandom(baseSeed + 37) * 0.45)
          );
          continue;
        }

        if (!isPlantable(tile)) continue;

        const isPark = tile === "PARK";
        const nearRoad = isRoadNeighbor(x, y);
        const baseSeed = Math.floor(hash2d(x, y, 11) * 1_000_000);
        const density = isPark ? 0.85 : nearRoad ? 0.4 : 0.2;
        const roll = seededRandom(baseSeed + 3);
        const count = isPark
          ? roll > 0.65
            ? 2
            : 1
          : roll > 1 - density
            ? 1
            : 0;

        if (count === 0) continue;

        for (let i = 0; i < count; i += 1) {
          const jitterX =
            (seededRandom(baseSeed + i * 17) - 0.5) * (isPark ? 0.7 : 0.5);
          const jitterZ =
            (seededRandom(baseSeed + i * 29) - 0.5) * (isPark ? 0.7 : 0.5);
          const heightScale = 0.22 + seededRandom(baseSeed + i * 41) * 0.28;
          const radiusScale = 0.06 + seededRandom(baseSeed + i * 53) * 0.05;
          const canopyScale = 0.26 + seededRandom(baseSeed + i * 61) * 0.26;
          const { x: wx, z: wz } = gridToWorld({ x, y }, width, height);

          trunks.push({
            position: [wx + jitterX, heightScale / 2, wz + jitterZ],
            scale: [radiusScale, heightScale, radiusScale],
            rotY: seededRandom(baseSeed + i * 71) * Math.PI * 2,
          });
          trunkColors.push(
            trunkBase.clone().lerp(trunkTint, seededRandom(baseSeed + i * 73) * 0.4)
          );

          canopies.push({
            position: [wx + jitterX, heightScale + canopyScale * 0.55, wz + jitterZ],
            scale: [canopyScale, canopyScale, canopyScale],
            rotY: 0,
          });
          canopyColors.push(
            canopyBase.clone().lerp(canopyTint, seededRandom(baseSeed + i * 79) * 0.45)
          );
        }

        if (isPark && seededRandom(baseSeed + 97) > 0.65) {
          const { x: wx, z: wz } = gridToWorld({ x, y }, width, height);
          const jitterX = (seededRandom(baseSeed + 101) - 0.5) * 0.6;
          const jitterZ = (seededRandom(baseSeed + 103) - 0.5) * 0.6;
          const scale = 0.22 + seededRandom(baseSeed + 107) * 0.2;
          shrubs.push({
            position: [wx + jitterX, scale * 0.45, wz + jitterZ],
            scale: [scale, scale, scale],
            rotY: 0,
          });
          shrubColors.push(
            shrubBase.clone().lerp(shrubTint, seededRandom(baseSeed + 109) * 0.4)
          );
        }
      }
    }

    return { trunks, trunkColors, canopies, canopyColors, shrubs, shrubColors };
  }, [world]);

  useLayoutEffect(() => {
    const updateInstances = (
      ref: RefObject<THREE.InstancedMesh | null>,
      items: Instance[],
      colors?: THREE.Color[]
    ) => {
      if (!ref.current) return;
      const temp = new THREE.Object3D();
      items.forEach((item, index) => {
        temp.position.set(item.position[0], item.position[1], item.position[2]);
        temp.rotation.set(0, item.rotY, 0);
        temp.scale.set(item.scale[0], item.scale[1], item.scale[2]);
        temp.updateMatrix();
        ref.current!.setMatrixAt(index, temp.matrix);
        if (colors) {
          ref.current!.setColorAt(index, colors[index]);
        }
      });
      ref.current.instanceMatrix.needsUpdate = true;
      if (colors && ref.current.instanceColor) {
        ref.current.instanceColor.needsUpdate = true;
      }
    };

    updateInstances(trunkRef, data.trunks, data.trunkColors);
    updateInstances(canopyRef, data.canopies, data.canopyColors);
    updateInstances(shrubRef, data.shrubs, data.shrubColors);
  }, [data]);

  if (!world) return null;

  return (
    <group>
      <instancedMesh
        ref={trunkRef}
        args={[trunkGeometry, undefined, data.trunks.length]}
        raycast={() => null}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          vertexColors
          color="#7a5b3a"
          roughness={0.85}
        />
      </instancedMesh>
      <instancedMesh
        ref={canopyRef}
        args={[canopyGeometry, undefined, data.canopies.length]}
        raycast={() => null}
        castShadow
      >
        <meshStandardMaterial
          vertexColors
          color="#62d97b"
          roughness={0.65}
          emissive="#2a6a44"
          emissiveIntensity={0.28}
        />
      </instancedMesh>
      {data.shrubs.length > 0 ? (
        <instancedMesh
          ref={shrubRef}
          args={[shrubGeometry, undefined, data.shrubs.length]}
          raycast={() => null}
          castShadow
        >
          <meshStandardMaterial
            vertexColors
            color="#7ade86"
            roughness={0.72}
            emissive="#2a6a44"
            emissiveIntensity={0.22}
          />
        </instancedMesh>
      ) : null}
    </group>
  );
};

export default Trees;
