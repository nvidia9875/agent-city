"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useSimStore } from "@/store/useSimStore";
import { gridToWorld } from "@/utils/grid";
import type { Building, BuildingType } from "@/types/sim";

type BuildingWindowConfig = {
  rows: number;
  cols: number;
  inset: number;
  yOffset: number;
  widthScale: number;
  heightScale: number;
  depth: number;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  sides?: Array<"front" | "back" | "left" | "right">;
};

const BUILDING_STYLES: Record<
  BuildingType,
  {
    base: { size: [number, number, number]; color: string };
    roof?: { size: [number, number, number]; color: string };
    windows?: BuildingWindowConfig;
  }
> = {
  HOUSE_SMALL: {
    base: { size: [0.58, 0.36, 0.58], color: "#f2b6a0" },
    roof: { size: [0.7, 0.18, 0.7], color: "#c96b62" },
  },
  HOUSE_MED: {
    base: { size: [0.7, 0.5, 0.7], color: "#f0c68a" },
    roof: { size: [0.82, 0.2, 0.82], color: "#c58f4b" },
  },
  APARTMENT: {
    base: { size: [0.9, 1.1, 0.9], color: "#d7ddeb" },
    roof: { size: [0.96, 0.14, 0.96], color: "#9aa3b5" },
    windows: {
      rows: 3,
      cols: 3,
      inset: 0.08,
      yOffset: 0.18,
      widthScale: 0.7,
      heightScale: 0.55,
      depth: 0.04,
      color: "#e3efff",
      emissive: "#6f9ed6",
      emissiveIntensity: 0.3,
    },
  },
  OFFICE: {
    base: { size: [1.0, 1.6, 1.0], color: "#b5d0e0" },
    roof: { size: [1.02, 0.1, 1.02], color: "#6d8aa0" },
    windows: {
      rows: 4,
      cols: 3,
      inset: 0.08,
      yOffset: 0.2,
      widthScale: 0.7,
      heightScale: 0.6,
      depth: 0.045,
      color: "#cfe6ff",
      emissive: "#7fb9ff",
      emissiveIntensity: 0.4,
    },
  },
  CAFE: {
    base: { size: [0.72, 0.42, 0.72], color: "#f1a7b2" },
    roof: { size: [0.86, 0.18, 0.86], color: "#b45a6e" },
  },
  HOSPITAL: {
    base: { size: [1.0, 0.8, 1.0], color: "#cfe9e3" },
    roof: { size: [1.05, 0.2, 1.05], color: "#74a5a1" },
  },
  SCHOOL: {
    base: { size: [0.95, 0.75, 0.95], color: "#f0d7b2" },
    roof: { size: [1.0, 0.2, 1.0], color: "#c19a6b" },
  },
  SHELTER: {
    base: { size: [0.9, 0.6, 0.9], color: "#f2e7b8" },
    roof: { size: [0.96, 0.18, 0.96], color: "#bca46b" },
  },
  BULLETIN_BOARD: {
    base: { size: [0.5, 0.5, 0.35], color: "#c8b08b" },
    roof: { size: [0.56, 0.12, 0.42], color: "#8b6f4e" },
  },
};

const hashScale = (id: string, base = 1) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 97;
  }
  return base * (0.94 + (hash % 9) * 0.01);
};

type BuildingInstancesProps = {
  type: BuildingType;
  buildings: Building[];
  width: number;
  height: number;
};

const BuildingInstances = ({ type, buildings, width, height }: BuildingInstancesProps) => {
  const style = BUILDING_STYLES[type];
  const baseRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const windowRef = useRef<THREE.InstancedMesh>(null);
  const selectBuilding = useSimStore((state) => state.selectBuilding);
  const setHoveredBuilding = useSimStore((state) => state.setHoveredBuilding);

  const ids = useMemo(() => buildings.map((building) => building.id), [buildings]);
  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const windowCount = useMemo(() => {
    if (!style.windows) return 0;
    const sides = style.windows.sides ?? ["front", "back", "left", "right"];
    return buildings.length * style.windows.rows * style.windows.cols * sides.length;
  }, [buildings.length, style.windows]);

  useLayoutEffect(() => {
    const temp = new THREE.Object3D();
    const buildingTransform = new THREE.Object3D();
    const windowTransform = new THREE.Object3D();
    let windowIndex = 0;
    buildings.forEach((building, index) => {
      const { x, z } = gridToWorld(building.pos, width, height);
      const scaleY = hashScale(building.id, 1);
      const baseSize = style.base.size;
      const buildingHeight = baseSize[1] * scaleY;
      const rotation = ((building.rotation ?? 0) * Math.PI) / 180;
      temp.position.set(x, baseSize[1] * 0.5 * scaleY, z);
      temp.rotation.set(0, rotation, 0);
      temp.scale.set(baseSize[0], baseSize[1] * scaleY, baseSize[2]);
      temp.updateMatrix();
      baseRef.current?.setMatrixAt(index, temp.matrix);

      if (style.roof && roofRef.current) {
        const roofSize = style.roof.size;
        temp.position.set(x, baseSize[1] * scaleY + roofSize[1] * 0.5, z);
        temp.scale.set(roofSize[0], roofSize[1], roofSize[2]);
        temp.updateMatrix();
        roofRef.current.setMatrixAt(index, temp.matrix);
      }

      if (style.windows && windowRef.current) {
        const {
          rows,
          cols,
          inset,
          yOffset,
          widthScale,
          heightScale,
          depth,
          sides = ["front", "back", "left", "right"],
        } = style.windows;
        const widthSize = baseSize[0];
        const depthSize = baseSize[2];
        const availableWidth = widthSize - inset * 2;
        const availableDepth = depthSize - inset * 2;
        const availableHeight = buildingHeight - yOffset - inset;
        if (availableWidth > 0 && availableDepth > 0 && availableHeight > 0) {
          const cellWidth = availableWidth / cols;
          const cellDepth = availableDepth / cols;
          const cellHeight = availableHeight / rows;
          const windowWidth = cellWidth * widthScale;
          const windowDepth = cellDepth * widthScale;
          const windowHeight = cellHeight * heightScale;
          const baseY = -buildingHeight / 2 + yOffset;

          buildingTransform.position.set(x, buildingHeight / 2, z);
          buildingTransform.rotation.set(0, rotation, 0);
          buildingTransform.updateMatrix();

          const placeWindow = (
            localX: number,
            localY: number,
            localZ: number,
            scaleX: number,
            scaleY: number,
            scaleZ: number,
            rotY: number
          ) => {
            windowTransform.position.set(localX, localY, localZ);
            windowTransform.rotation.set(0, rotY, 0);
            windowTransform.scale.set(scaleX, scaleY, scaleZ);
            windowTransform.updateMatrix();
            temp.matrix.multiplyMatrices(buildingTransform.matrix, windowTransform.matrix);
            windowRef.current?.setMatrixAt(windowIndex, temp.matrix);
            windowIndex += 1;
          };

          for (const side of sides) {
            for (let row = 0; row < rows; row += 1) {
              const localY = baseY + cellHeight / 2 + row * cellHeight;
              for (let col = 0; col < cols; col += 1) {
                if (side === "front") {
                  const localX = -widthSize / 2 + inset + cellWidth / 2 + col * cellWidth;
                  const localZ = depthSize / 2 + depth / 2 + 0.01;
                  placeWindow(localX, localY, localZ, windowWidth, windowHeight, depth, 0);
                } else if (side === "back") {
                  const localX = -widthSize / 2 + inset + cellWidth / 2 + col * cellWidth;
                  const localZ = -depthSize / 2 - depth / 2 - 0.01;
                  placeWindow(localX, localY, localZ, windowWidth, windowHeight, depth, Math.PI);
                } else if (side === "left") {
                  const localZ = -depthSize / 2 + inset + cellDepth / 2 + col * cellDepth;
                  const localX = -widthSize / 2 - depth / 2 - 0.01;
                  placeWindow(localX, localY, localZ, depth, windowHeight, windowDepth, Math.PI / 2);
                } else if (side === "right") {
                  const localZ = -depthSize / 2 + inset + cellDepth / 2 + col * cellDepth;
                  const localX = widthSize / 2 + depth / 2 + 0.01;
                  placeWindow(localX, localY, localZ, depth, windowHeight, windowDepth, -Math.PI / 2);
                }
              }
            }
          }
        }
      }
    });

    if (baseRef.current) baseRef.current.instanceMatrix.needsUpdate = true;
    if (roofRef.current) roofRef.current.instanceMatrix.needsUpdate = true;
    if (windowRef.current) windowRef.current.instanceMatrix.needsUpdate = true;
  }, [buildings, height, style.base.size, style.roof, style.windows, width]);

  const resolveInstanceId = (event: ThreeEvent<MouseEvent>) => {
    const instanceId = event.instanceId;
    if (instanceId === undefined) return undefined;
    return ids[instanceId];
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const id = resolveInstanceId(event);
    if (id) selectBuilding(id);
  };

  const handlePointerOver = (event: ThreeEvent<MouseEvent>) => {
    const id = resolveInstanceId(event);
    if (id) setHoveredBuilding(id);
  };

  const handlePointerOut = () => {
    setHoveredBuilding(undefined);
  };

  if (buildings.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={baseRef}
        args={[unitBox, undefined, buildings.length]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={style.base.color} roughness={0.7} />
      </instancedMesh>
      {style.roof ? (
        <instancedMesh
          ref={roofRef}
          args={[unitBox, undefined, buildings.length]}
          onClick={handleClick}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
          castShadow
        >
          <meshStandardMaterial color={style.roof.color} roughness={0.6} />
        </instancedMesh>
      ) : null}
      {style.windows && windowCount > 0 ? (
        <instancedMesh
          ref={windowRef}
          args={[unitBox, undefined, windowCount]}
          raycast={() => null}
        >
          <meshStandardMaterial
            color={style.windows.color}
            emissive={style.windows.emissive}
            emissiveIntensity={style.windows.emissiveIntensity}
            roughness={0.25}
            metalness={0.1}
          />
        </instancedMesh>
      ) : null}
    </group>
  );
};

const Buildings = () => {
  const world = useSimStore((state) => state.world);

  const grouped = useMemo(() => {
    if (!world) return [] as Array<[BuildingType, Building[]]>;
    const buckets: Record<BuildingType, Building[]> = {
      HOUSE_SMALL: [],
      HOUSE_MED: [],
      APARTMENT: [],
      OFFICE: [],
      CAFE: [],
      HOSPITAL: [],
      SCHOOL: [],
      SHELTER: [],
      BULLETIN_BOARD: [],
    };
    Object.values(world.buildings).forEach((building) => {
      buckets[building.type].push(building);
    });
    return Object.entries(buckets) as Array<[BuildingType, Building[]]>;
  }, [world]);

  if (!world) return null;

  return (
    <group>
      {grouped.map(([type, buildings]) => (
        <BuildingInstances
          key={type}
          type={type}
          buildings={buildings}
          width={world.width}
          height={world.height}
        />
      ))}
    </group>
  );
};

export default Buildings;
