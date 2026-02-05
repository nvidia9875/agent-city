"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Vec2 } from "@/types/sim";
import { useSimStore } from "@/store/useSimStore";
import { gridToWorld, isRoadTile, toIndex } from "@/utils/grid";

type CarState = {
  id: string;
  from: Vec2;
  to: Vec2;
  prev?: Vec2;
  progress: number;
  speed: number;
  color: string;
};

const CAR_SPEED_MIN = 0.22;
const CAR_SPEED_MAX = 0.38;
const CAR_MIN_COUNT = 4;
const CAR_MAX_COUNT = 12;
const CAR_BODY_SIZE: [number, number, number] = [0.28, 0.16, 0.42];

const CAR_COLORS = [
  "#f97316",
  "#22c55e",
  "#38bdf8",
  "#facc15",
  "#a855f7",
  "#f43f5e",
  "#e2e8f0",
];

const randomPick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

const seededRandom = (seed: number) => {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pickBySeed = <T,>(list: T[], seed: number) => {
  if (list.length === 0) return list[0];
  const index = Math.floor(seededRandom(seed) * list.length);
  return list[Math.min(index, list.length - 1)];
};

const Cars = () => {
  const world = useSimStore((state) => state.world);
  const simEnded = useSimStore((state) => state.sim.ended);

  const carsRef = useRef<CarState[]>([]);

  const roadData = useMemo(() => {
    const tiles = world?.tiles;
    const width = world?.width ?? 0;
    const height = world?.height ?? 0;
    if (!tiles || width === 0 || height === 0) {
      return { positions: [] as Vec2[], neighbors: new Map<string, Vec2[]>() };
    }
    const positions: Vec2[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const tile = tiles[toIndex(x, y, width)];
        if (isRoadTile(tile)) {
          positions.push({ x, y });
        }
      }
    }
    const neighbors = new Map<string, Vec2[]>();
    positions.forEach((pos) => {
      const options: Vec2[] = [];
      if (pos.y > 0 && isRoadTile(tiles[toIndex(pos.x, pos.y - 1, width)])) {
        options.push({ x: pos.x, y: pos.y - 1 });
      }
      if (
        pos.y < height - 1 &&
        isRoadTile(tiles[toIndex(pos.x, pos.y + 1, width)])
      ) {
        options.push({ x: pos.x, y: pos.y + 1 });
      }
      if (pos.x > 0 && isRoadTile(tiles[toIndex(pos.x - 1, pos.y, width)])) {
        options.push({ x: pos.x - 1, y: pos.y });
      }
      if (
        pos.x < width - 1 &&
        isRoadTile(tiles[toIndex(pos.x + 1, pos.y, width)])
      ) {
        options.push({ x: pos.x + 1, y: pos.y });
      }
      neighbors.set(`${pos.x},${pos.y}`, options);
    });
    return { positions, neighbors };
  }, [world?.tiles, world?.width, world?.height]);

  const worldWidth = world?.width ?? 0;
  const worldHeight = world?.height ?? 0;

  const carSeed = useMemo(() => {
    if (worldWidth === 0 || worldHeight === 0 || roadData.positions.length === 0) {
      return { cars: [] as CarState[], list: [] as Array<{ id: string; color: string }> };
    }

    const baseCount = Math.round((worldWidth + worldHeight) / 8);
    const minCars = Math.max(CAR_MIN_COUNT, Math.floor(baseCount * 0.6));
    const maxCars = Math.max(minCars, Math.min(CAR_MAX_COUNT, baseCount + 4));
    const seedBase =
      (worldWidth * 73856093) ^
      (worldHeight * 19349663) ^
      (roadData.positions.length * 83492791);
    const count = Math.min(
      roadData.positions.length,
      minCars + Math.floor(seededRandom(seedBase) * (maxCars - minCars + 1))
    );

    const nextCars: CarState[] = [];
    for (let i = 0; i < count; i += 1) {
      const from = pickBySeed(roadData.positions, seedBase + i * 97);
      const options = roadData.neighbors.get(`${from.x},${from.y}`) ?? [];
      const to = options.length > 0 ? pickBySeed(options, seedBase + i * 131) : from;
      nextCars.push({
        id: `car-${i}`,
        from,
        to,
        progress: seededRandom(seedBase + i * 173),
        speed:
          CAR_SPEED_MIN +
          seededRandom(seedBase + i * 197) * (CAR_SPEED_MAX - CAR_SPEED_MIN),
        color: CAR_COLORS[i % CAR_COLORS.length],
      });
    }

    return {
      cars: nextCars,
      list: nextCars.map((car) => ({ id: car.id, color: car.color })),
    };
  }, [roadData, worldHeight, worldWidth]);

  useEffect(() => {
    carsRef.current = carSeed.cars;
  }, [carSeed.cars]);

  const meshRefs = useRef<Record<string, THREE.Mesh>>({});
  const geometry = useMemo(
    () => new THREE.BoxGeometry(CAR_BODY_SIZE[0], CAR_BODY_SIZE[1], CAR_BODY_SIZE[2]),
    []
  );

  useFrame((_, delta) => {
    if (!world || simEnded) return;
    const cars = carsRef.current;
    cars.forEach((car) => {
      const mesh = meshRefs.current[car.id];
      if (!mesh) return;
      car.progress += delta * car.speed;
      if (car.progress >= 1) {
        car.progress -= 1;
        car.prev = car.from;
        car.from = car.to;
        const options = roadData.neighbors.get(`${car.from.x},${car.from.y}`) ?? [];
        let next = car.from;
        if (options.length > 0) {
          const filtered = car.prev
            ? options.filter((opt) => !(opt.x === car.prev?.x && opt.y === car.prev?.y))
            : options;
          next = randomPick(filtered.length > 0 ? filtered : options);
        }
        car.to = next;
      }

      const fromWorld = gridToWorld(car.from, world.width, world.height);
      const toWorld = gridToWorld(car.to, world.width, world.height);
      const x = fromWorld.x + (toWorld.x - fromWorld.x) * car.progress;
      const z = fromWorld.z + (toWorld.z - fromWorld.z) * car.progress;
      mesh.position.set(x, 0.1, z);

      const dx = car.to.x - car.from.x;
      const dz = car.to.y - car.from.y;
      const angle = Math.atan2(dx, dz);
      mesh.rotation.y = angle;
    });
  });

  if (!world || carSeed.list.length === 0) return null;

  return (
    <group>
      {carSeed.list.map((car) => (
        <mesh
          key={car.id}
          geometry={geometry}
          ref={(node) => {
            if (!node) {
              delete meshRefs.current[car.id];
              return;
            }
            meshRefs.current[car.id] = node;
          }}
        >
          <meshStandardMaterial color={car.color} />
        </mesh>
      ))}
    </group>
  );
};

export default Cars;
