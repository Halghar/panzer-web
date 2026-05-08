/**
 * Terrain Effects Chart (Game Card A) — movement costs only.
 * Section 4.5.1.1.2
 *
 * T and H share the same column; W has its own column.
 * Costs are the BASE cost to ENTER a hex with that terrain, before
 * elevation-change modifiers are added.
 */

import type { TerrainType } from '../terrain/types';
import type { MovementType } from '../units/types';

/** Movement cost: movement points consumed, or 'P' = Prohibited. */
export type MoveCost = number | 'P';

interface TecEntry {
  th: MoveCost;  // Tracked / Half-track
  w: MoveCost;   // Wheeled
  turn: number;  // Rotation cost in this terrain (Turn column)
}

const MOVEMENT_TEC: Record<TerrainType, TecEntry> = {
  clear:          { th: 1,   w: 1,   turn: 1 },
  rough:          { th: 2,   w: 3,   turn: 2 },
  scrub:          { th: 2,   w: 2,   turn: 2 },
  lightWoods:     { th: 2,   w: 'P', turn: 2 },
  woods:          { th: 3,   w: 'P', turn: 3 },
  heavyWoods:     { th: 'P', w: 'P', turn: 0 },
  lightGrove:     { th: 2,   w: 'P', turn: 2 },
  mediumGrove:    { th: 2,   w: 'P', turn: 2 },
  building:       { th: 2,   w: 2,   turn: 2 },
  brickBuilding:  { th: 2,   w: 'P', turn: 2 },
  stoneBuilding:  { th: 2,   w: 'P', turn: 2 },
  woodBuilding:   { th: 2,   w: 2,   turn: 2 },
  desertBuilding: { th: 2,   w: 2,   turn: 2 },
  hill:           { th: 2,   w: 3,   turn: 2 },
  road:           { th: 1,   w: 1,   turn: 0 },
  path:           { th: 1,   w: 1,   turn: 1 },
  stream:         { th: 'P', w: 'P', turn: 0 },
  gully:          { th: 2,   w: 'P', turn: 2 },
  ford:           { th: 3,   w: 'P', turn: 0 },
};

/**
 * Base cost to enter a hex with this terrain for this traction type.
 * Does NOT include elevation-change modifiers.
 * T, H, and L all use the TH column; W uses its own column.
 */
export function baseMoveCost(terrain: TerrainType, traction: MovementType): MoveCost {
  const entry = MOVEMENT_TEC[terrain];
  return traction === 'W' ? entry.w : entry.th;
}

/** Cost to rotate in a hex with this terrain (Turn column). */
export function baseTurnCost(terrain: TerrainType): number {
  return MOVEMENT_TEC[terrain].turn;
}

/**
 * Additional cost from changing elevation (4.5.1.1.2).
 * +1 for 1-level change, +2 for 2-level change.
 * Returns 'P' if the change exceeds the traction limit (W: max 1 level, T/H: max 2).
 */
export function elevationChangeCost(
  fromElev: number,
  toElev: number,
  traction: MovementType,
): MoveCost {
  const delta = Math.abs(toElev - fromElev);
  if (delta === 0) return 0;
  const maxLevels = traction === 'W' ? 1 : 2;
  if (delta > maxLevels) return 'P';
  return delta; // +1 or +2
}
