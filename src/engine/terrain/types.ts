export type TerrainType =
  | 'clear' | 'rough' | 'scrub'
  | 'lightWoods' | 'woods' | 'heavyWoods'
  | 'building' | 'hill' | 'road' | 'path';

export type CoverLevel = 'none' | 'light' | 'medium' | 'heavy';

export interface TerrainProps {
  cover: CoverLevel;
  moveCost: number;
  /** Visual/LOS blocking height above ground level */
  height: number;
  blocksLOS: boolean;
  color: number;
}

export const TERRAIN_DATA: Record<TerrainType, TerrainProps> = {
  clear:      { cover: 'none',   moveCost: 1,   height: 0, blocksLOS: false, color: 0x7ab648 },
  rough:      { cover: 'none',   moveCost: 2,   height: 0, blocksLOS: false, color: 0xc4a35a },
  scrub:      { cover: 'light',  moveCost: 2,   height: 0, blocksLOS: false, color: 0x8a9a40 },
  lightWoods: { cover: 'light',  moveCost: 2,   height: 3, blocksLOS: true,  color: 0x5a7a30 },
  woods:      { cover: 'medium', moveCost: 3,   height: 3, blocksLOS: true,  color: 0x3a6020 },
  heavyWoods: { cover: 'heavy',  moveCost: 99,  height: 4, blocksLOS: true,  color: 0x1e3a10 },
  building:   { cover: 'heavy',  moveCost: 2,   height: 1, blocksLOS: true,  color: 0x8a7060 },
  hill:       { cover: 'none',   moveCost: 2,   height: 1, blocksLOS: true,  color: 0x9a7040 },
  road:       { cover: 'none',   moveCost: 0.5, height: 0, blocksLOS: false, color: 0xb0b0a0 },
  path:       { cover: 'none',   moveCost: 1,   height: 0, blocksLOS: false, color: 0xd4c890 },
};
