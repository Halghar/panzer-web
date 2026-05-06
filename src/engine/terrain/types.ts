export type TerrainType =
  | 'clear' | 'rough' | 'scrub'
  | 'lightWoods' | 'woods' | 'heavyWoods'
  | 'lightGrove' | 'mediumGrove'
  | 'building' | 'brickBuilding' | 'stoneBuilding' | 'woodBuilding' | 'desertBuilding'
  | 'hill' | 'road' | 'path'
  | 'stream' | 'gully' | 'ford';

export type CoverLevel = 'none' | 'light' | 'medium' | 'heavy';

/** Alias used by the spotting module (4.1.3). */
export type CoverType = CoverLevel;

export interface TerrainProps {
  cover: CoverLevel;
  moveCost: number;
  /** LOS blocking height above the hex's ground level. 0 = transparent. -1 = below ground (stream/gully). */
  height: number;
  blocksLOS: boolean;
  color: number;
}

export const TERRAIN_DATA: Record<TerrainType, TerrainProps> = {
  clear:          { cover: 'none',   moveCost: 1,   height: 0,  blocksLOS: false, color: 0x7ab648 },
  rough:          { cover: 'none',   moveCost: 2,   height: 0,  blocksLOS: false, color: 0xc4a35a },
  scrub:          { cover: 'light',  moveCost: 2,   height: 0,  blocksLOS: false, color: 0x8a9a40 },
  lightWoods:     { cover: 'light',  moveCost: 2,   height: 3,  blocksLOS: true,  color: 0x5a7a30 },
  woods:          { cover: 'medium', moveCost: 3,   height: 3,  blocksLOS: true,  color: 0x3a6020 },
  heavyWoods:     { cover: 'heavy',  moveCost: 99,  height: 4,  blocksLOS: true,  color: 0x1e3a10 },
  lightGrove:     { cover: 'light',  moveCost: 2,   height: 2,  blocksLOS: true,  color: 0x4a6a28 },
  mediumGrove:    { cover: 'medium', moveCost: 2,   height: 2,  blocksLOS: true,  color: 0x3a5a20 },
  building:       { cover: 'heavy',  moveCost: 2,   height: 1,  blocksLOS: true,  color: 0x8a7060 },
  brickBuilding:  { cover: 'heavy',  moveCost: 2,   height: 2,  blocksLOS: true,  color: 0x9a7060 },
  stoneBuilding:  { cover: 'heavy',  moveCost: 2,   height: 2,  blocksLOS: true,  color: 0x8a8070 },
  woodBuilding:   { cover: 'heavy',  moveCost: 2,   height: 1,  blocksLOS: true,  color: 0x9a8060 },
  desertBuilding: { cover: 'heavy',  moveCost: 2,   height: 1,  blocksLOS: true,  color: 0xb09070 },
  hill:           { cover: 'none',   moveCost: 2,   height: 1,  blocksLOS: true,  color: 0x9a7040 },
  road:           { cover: 'none',   moveCost: 0.5, height: 0,  blocksLOS: false, color: 0xb0b0a0 },
  path:           { cover: 'none',   moveCost: 1,   height: 0,  blocksLOS: false, color: 0xd4c890 },
  stream:         { cover: 'none',   moveCost: 2,   height: -1, blocksLOS: false, color: 0x4080c0 },
  gully:          { cover: 'none',   moveCost: 2,   height: -1, blocksLOS: false, color: 0x806040 },
  ford:           { cover: 'none',   moveCost: 3,   height: -1, blocksLOS: false, color: 0x50a0d0 },
};

// ---------------------------------------------------------------------------
// HexTile — the spotting module's richer tile type (4.1.4)
// ---------------------------------------------------------------------------

export interface HexTile {
  q: number;
  r: number;
  terrain: TerrainType;
  /** Ground elevation above sea level (0 = flat, 1 = ridge/hill top, etc.) */
  hillLevel: number;
  hasRoad: boolean;
  hasPath: boolean;
  buildingStories?: number;
}

/** Keyed by `"${q},${r}"` — same format as hexKey in state/types. */
export type TerrainMap = Map<string, HexTile>;

export function getTile(map: TerrainMap, hex: { q: number; r: number }): HexTile | undefined {
  return map.get(`${hex.q},${hex.r}`);
}

/** Cover provided by this tile to a vehicle occupying it (4.1.3). */
export function terrainCover(tile: HexTile): CoverLevel {
  return TERRAIN_DATA[tile.terrain].cover;
}

/**
 * Height of a vehicle sitting on this hex (4.1.4.1.4 / 4.1.4.1.6).
 * Streams, gullies, and fords are 1 level below their hillLevel.
 */
export function vehicleGroundHeight(tile: HexTile): number {
  const t = tile.terrain;
  if (t === 'stream' || t === 'gully' || t === 'ford') return tile.hillLevel - 1;
  return tile.hillLevel;
}

/**
 * LOS blocking height contributed by a hex used as an intermediate obstacle.
 * Equal to terrain height + ground elevation. Values < 1 are transparent.
 */
export function intermediateBlockingHeight(tile: HexTile): number {
  return TERRAIN_DATA[tile.terrain].height + tile.hillLevel;
}

/** True if this tile's terrain blocks LOS for the 1-hex perimeter rule (4.1.4.2.5). */
export function isBlockingTerrain(tile: HexTile): boolean {
  return TERRAIN_DATA[tile.terrain].blocksLOS;
}
