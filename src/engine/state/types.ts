import type { VehicleData } from '../units/types';
import { TERRAIN_DATA, type TerrainType, type CoverLevel } from '../terrain/types';
import type { Force, StaggeredFormationOrder } from './force';
export type { Force, StaggeredFormationOrder };
export type { ForceGrade } from './force';
export { FORCE_GRADE_MODIFIER } from './force';

export interface HexData {
  terrain: TerrainType;
  /** Ground elevation level (0 = flat, 1 = ridge/hill top, etc.) */
  elevation: number;
}

/** Key format used in hexMap: `${q},${r}` */
export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function coverForUnit(
  unit: Pick<Unit, 'q' | 'r'>,
  hexMap: Record<string, HexData>
): CoverLevel {
  const hex = hexMap[hexKey(unit.q, unit.r)];
  return hex ? TERRAIN_DATA[hex.terrain].cover : 'none';
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
  lastCommand: Command;
  damage: DamageState;
  spotStatus: SpotStatus;
  /** Has this unit already executed its command this turn? */
  hasActed: boolean;
  /** False for unarmed vehicles (trucks, prime movers) — 4.1.1 */
  canSpot: boolean;
  /** Set to true when the unit moved this turn; used for SPOT/MOVE counter — 4.1.3 */
  moved: boolean;
  /** Set to true when the unit fired this turn; used for SPOT/FIRE counter — 4.1.3 */
  fired: boolean;
}

export interface GameState {
  turn: number;
  currentPhase: Phase;
  firstPlayer: Side | null;
  /** The two opposing forces (always [allied, axis]) */
  forces: [Force, Force];
  units: Record<string, Unit>;
  blueprints: Record<string, VehicleData>;
  selectedUnitId: string | null;
  hexMap: Record<string, HexData>;
  spottingPairs: { spotter: string; target: string }[];
  /** Direct fire order from last Staggered Initiative; inverted for Movement Phase */
  formationFireOrder: StaggeredFormationOrder[];
}
