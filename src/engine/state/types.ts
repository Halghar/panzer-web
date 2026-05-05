import type { VehicleData } from '../units/types';
import type { TerrainType } from '../terrain/types';

export interface HexData {
  terrain: TerrainType;
  /** Ground elevation level (0 = flat, 1 = ridge/hill top, etc.) */
  elevation: number;
}

/** Key format used in hexMap: `${q},${r}` */
export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Sequence of Play phases, see 4.0 */
export type Phase =
  | 'SPOTTING'
  | 'COMMAND'
  | 'INITIATIVE'
  | 'COMBAT'
  | 'MOVEMENT'
  | 'ADJUSTMENT';

/** Unit Orders / Command counters, see 4.2 */
export type Command =
  | 'FIRE'
  | 'MOVE'
  | 'SHORT_HALT'
  | 'OVERWATCH'
  | 'NO_COMMAND';

/** Hex direction (1-6 in flat-top; we use 0-5 internally for arrays) */
export type HexDirection = 0 | 1 | 2 | 3 | 4 | 5;

/** Damage state of a vehicle, see 4.4.3.2.6 */
export type DamageState = 'ok' | 'damaged' | 'ko' | 'bu';

/** Spot status of a unit, see 4.1 */
export type SpotStatus = 'unspotted' | 'spottedByMove' | 'spottedByFire';

/** Player side */
export type Side = 'allied' | 'axis';

/** A unit instance on the board (links to its VehicleData blueprint) */
export interface Unit {
  /** Unique id for this instance, e.g. "t34_1" */
  instanceId: string;
  /** Reference to the VehicleData blueprint */
  blueprintId: string;
  side: Side;
  /** Axial coordinates */
  q: number;
  r: number;
  /** Facing direction 0-5 (0 = north for flat-top, conventions per honeycomb-grid) */
  facing: HexDirection;
  command: Command;
  damage: DamageState;
  spotStatus: SpotStatus;
  /** Has this unit already executed its command this turn? */
  hasActed: boolean;
}

export interface GameState {
  turn: number;
  currentPhase: Phase;
  firstPlayer: Side | null; // determined in Initiative Phase
  units: Record<string, Unit>; // keyed by instanceId
  blueprints: Record<string, VehicleData>; // keyed by blueprintId
  selectedUnitId: string | null;
  hexMap: Record<string, HexData>; // keyed by hexKey(q, r)
}
