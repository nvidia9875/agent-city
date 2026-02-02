"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useSimStore } from "@/store/useSimStore";
import { gridToWorld } from "@/utils/grid";
import type { Building, BuildingType } from "@/types/sim";

const BUILDING_STYLES: Record<
  BuildingType,
  {
    base: { size: [number, number, number]; color: string };
    roof?: { size: [number, number, number]; color: string };
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
    base: { size: [0.8, 0.9, 0.8], color: "#d7ddeb" },
    roof: { size: [0.86, 0.16, 0.86], color: "#9aa3b5" },
  },
  OFFICE: {
    base: { size: [0.86, 1.1, 0.86], color: "#b5d0e0" },
    roof: { size: [0.9, 0.18, 0.9], color: "#6d8aa0" },
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
  const selectBuilding = useSimStore((state) => state.selectBuilding);
  const setHoveredBuilding = useSimStore((state) => state.setHoveredBuilding);

  const ids = useMemo(() => buildings.map((building) => building.id), [buildings]);
  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useLayoutEffect(() => {
    const temp = new THREE.Object3D();
    buildings.forEach((building, index) => {
      const { x, z } = gridToWorld(building.pos, width, height);
      const scaleY = hashScale(building.id, 1);
      const baseSize = style.base.size;
      temp.position.set(x, baseSize[1] * 0.5 * scaleY, z);
      temp.rotation.set(0, ((building.rotation ?? 0) * Math.PI) / 180, 0);
      temp.scale.set(baseSize[0], baseSize[1] * scaleY, baseSize[2]);
      temp.updateMatrix();
      baseRef.current?.setMatrixAt(index, temp.matrix);

      if (style.roof && roofRef.current) {
        const roofSize = style.roof.size;
        temp.position.set(
          x,
          baseSize[1] * scaleY + roofSize[1] * 0.5,
          z
        );
        temp.scale.set(roofSize[0], roofSize[1], roofSize[2]);
        temp.updateMatrix();
        roofRef.current.setMatrixAt(index, temp.matrix);
      }
    });

    if (baseRef.current) baseRef.current.instanceMatrix.needsUpdate = true;
    if (roofRef.current) roofRef.current.instanceMatrix.needsUpdate = true;
  }, [buildings, height, style.base.size, style.roof, width]);

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
