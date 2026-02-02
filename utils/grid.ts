import type { TileType, Vec2 } from "@/types/sim";

export const TILE_SIZE = 1;

export const toIndex = (x: number, y: number, width: number) => y * width + x;

export const fromIndex = (index: number, width: number): Vec2 => ({
  x: index % width,
  y: Math.floor(index / width),
});

export const gridToWorld = (pos: Vec2, width: number, height: number) => {
  const x = (pos.x - width / 2 + 0.5) * TILE_SIZE;
  const z = (pos.y - height / 2 + 0.5) * TILE_SIZE;
  return { x, z };
};

export const isRoadTile = (tile?: TileType) =>
  tile === "ROAD_STRAIGHT" ||
  tile === "ROAD_CORNER" ||
  tile === "ROAD_T" ||
  tile === "ROAD_CROSS";

export const getRoadNeighbors = (
  tiles: TileType[],
  width: number,
  height: number,
  x: number,
  y: number
) => {
  const north = y > 0 ? isRoadTile(tiles[toIndex(x, y - 1, width)]) : false;
  const south = y < height - 1 ? isRoadTile(tiles[toIndex(x, y + 1, width)]) : false;
  const west = x > 0 ? isRoadTile(tiles[toIndex(x - 1, y, width)]) : false;
  const east = x < width - 1 ? isRoadTile(tiles[toIndex(x + 1, y, width)]) : false;
  return { north, south, west, east };
};

export const getRoadRotation = (
  tile: TileType,
  neighbors: { north: boolean; south: boolean; west: boolean; east: boolean }
) => {
  const { north, south, west, east } = neighbors;
  if (tile === "ROAD_STRAIGHT") {
    return north && south ? 0 : 90;
  }
  if (tile === "ROAD_CORNER") {
    if (north && east) return 0;
    if (east && south) return 90;
    if (south && west) return 180;
    return 270;
  }
  if (tile === "ROAD_T") {
    if (!south) return 0;
    if (!west) return 90;
    if (!north) return 180;
    return 270;
  }
  return 0;
};
