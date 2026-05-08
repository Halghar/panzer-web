/**
 * Movement Phase types — Section 4.5.
 *
 * Pure data; no game logic here.
 */

import type { Axial } from '../hex/coords';
import type { HexDirection, Unit, HexData, Side } from '../state/types';
import type { VehicleData } from '../units/types';
import type { ShotResult } from '../combat/phase';

// ---------------------------------------------------------------------------
// Input: movement orders and overwatch declarations
// ---------------------------------------------------------------------------

/**
 * A single step in a vehicle's movement order.
 *   move   — enter the adjacent hex in the given direction (optionally reverse)
 *   rotate — change facing to the given direction; costs allowance if >1 hexside
 */
export type MovementStep =
  | { type: 'move'; direction: HexDirection; reverse?: boolean }
  | { type: 'rotate'; newFacing: HexDirection };

/** Planned movement for one vehicle. Vehicle must have MOVE or SHORT_HALT command. */
export interface MovementOrder {
  vehicleId: string;
  steps: MovementStep[];
}

/**
 * Pre-declaration that this OW unit will fire when the specified mover
 * enters its Field-of-Fire (hex entry or rotation). Resolved automatically
 * in declaration order; each OW unit fires at most once.
 */
export interface OverwatchDeclaration {
  shooterId: string;
  targetId: string;
  ammoType?: 'AP' | 'HVAP' | 'APCR' | 'HEAT';
}

// ---------------------------------------------------------------------------
// Output: per-vehicle results and overwatch events
// ---------------------------------------------------------------------------

/**
 * Which speed allowance was used for this vehicle's movement.
 * 'no_move'  — command was MOVE/SHORT_HALT but vehicle stayed in place
 * 'reverse'  — all hex entries were reverse movement
 */
export type MovementMode = 'cross_country' | 'path' | 'road' | 'reverse' | 'no_move';

/** One recorded step in the path taken (move, rotate, reverse, or off-map exit). */
export interface PathStep {
  hex: Axial;
  costPaid: number;
  stepType: 'move' | 'rotate' | 'reverse' | 'exit';
  facingAfter: HexDirection;
}

/** An Overwatch fire event resolved during this vehicle's movement. */
export interface OverwatchEvent {
  /** What triggered the OW check. */
  trigger: 'hex_entry' | 'rotation';
  /** Hex where the mover was when OW was triggered. */
  atHex: Axial;
  shooterId: string;
  targetId: string;
  shot: ShotResult;
}

/** Full movement result for a single vehicle. */
export interface VehicleMovementResult {
  vehicleId: string;
  fromHex: Axial;
  /** Final hex (last hex reached before abort/exit). */
  toHex: Axial;
  facingBefore: HexDirection;
  facingAfter: HexDirection;
  pathTaken: PathStep[];
  movementMode: MovementMode;
  allowanceTotal: number;
  allowanceUsed: number;
  allowanceRemaining: number;
  triggeredOverwatch: OverwatchEvent[];
  /** True if the vehicle exited the map boundary (4.5.1.1.9). */
  offMap: boolean;
  /** Unit state after movement (position, facing, moved/fired flags updated). */
  updatedUnit: Unit;
  /** Set when movement was cut short. */
  abortReason?: 'eliminated_by_overwatch' | 'terrain_prohibited' | 'allowance_exceeded';
}

// ---------------------------------------------------------------------------
// Phase-level input / output
// ---------------------------------------------------------------------------

export interface MovementPhaseInput {
  firstPlayer: Side;
  units: Record<string, Unit>;
  blueprints: Record<string, VehicleData>;
  hexMap: Record<string, HexData>;
  /** One entry per vehicle that has a declared movement. MOVE and SHORT_HALT only. */
  orders: MovementOrder[];
  /**
   * Overwatch declarations from both sides.
   * Each OW unit fires when its declared target moves, if it hasn't acted yet.
   */
  owDeclarations: OverwatchDeclaration[];
  /**
   * Pre-rolled d100 values for OW shots (consumed in trigger order).
   * Rolls beyond the list are randomised — supply all rolls for deterministic tests.
   */
  owRolls: number[];
}

export interface MovementPhaseResult {
  /** Results in processing order (second player's vehicles first, then first player's). */
  vehicleResults: VehicleMovementResult[];
  /** Complete unit map after all movement and OW damage. */
  updatedUnits: Record<string, Unit>;
}
