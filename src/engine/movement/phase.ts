/**
 * Movement Phase — Section 4.5 (Basic Game).
 *
 * Pure functions only: no state mutation, no rendering, no I/O.
 *
 * Entry point: movementPhase()
 *
 * Execution order (4.5):
 *   1. Second Player announces and resolves all MOVE / SHORT_HALT vehicles.
 *      First Player may trigger Overwatch Fire on each hex entry / rotation.
 *   2. First Player does the same; Second Player may trigger OW.
 */

import { hexNeighbors } from '../hex/coords';
import type { Axial } from '../hex/coords';
import type { Unit, HexData, HexDirection, Side } from '../state/types';
import { hexKey } from '../state/types';
import type { VehicleData } from '../units/types';
import { canShooterReachTarget, resolveOverwatchFire } from '../combat/phase';
import type { ShotResult } from '../combat/phase';
import { baseMoveCost, baseTurnCost, elevationChangeCost } from './terrain';
import type {
  MovementOrder,
  MovementStep,
  MovementMode,
  OverwatchDeclaration,
  OverwatchEvent,
  PathStep,
  VehicleMovementResult,
  MovementPhaseInput,
  MovementPhaseResult,
} from './types';

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Minimum hexsides between two facings (0 = same, 3 = opposite). */
function hexsideDiff(a: HexDirection, b: HexDirection): number {
  const d = Math.abs(a - b) % 6;
  return Math.min(d, 6 - d);
}

function isEliminated(u: Unit): boolean {
  return u.damage === 'ko' || u.damage === 'bu';
}

// ---------------------------------------------------------------------------
// Allowance computation (4.5.1.1.1)
// ---------------------------------------------------------------------------

/**
 * Effective movement allowance, after SHORT_HALT / Damaged reductions.
 *
 *   Neither         → base
 *   SHORT_HALT only → floor(base / 2)
 *   Damaged only    → floor(base / 2)
 *   Both            → floor(base / 4)
 *   Minimum: 1
 */
function computeAllowance(unit: Unit, bp: VehicleData, mode: MovementMode): number {
  let base: number;
  if (mode === 'road') {
    base = bp.movementFast;
  } else if (mode === 'path') {
    base = bp.movementPath ?? bp.movementSlow + 1;
  } else {
    base = bp.movementSlow;
  }

  const shortHalt = unit.command === 'SHORT_HALT';
  const damaged   = unit.damage === 'damaged';

  let reduced: number;
  if (shortHalt && damaged) {
    reduced = Math.floor(base / 4);
  } else if (shortHalt || damaged) {
    reduced = Math.floor(base / 2);
  } else {
    reduced = base;
  }

  return Math.max(1, reduced);
}

// ---------------------------------------------------------------------------
// Movement mode pre-validation (4.5.1.1.5)
// ---------------------------------------------------------------------------

/**
 * Determine whether the planned order qualifies for road / path movement.
 *
 * Requirements:
 *   - Start on road or path terrain.
 *   - Every destination hex is road, path, or ford (ford → CC factor for that hex).
 *   - End on road or path (ford alone does not qualify as end).
 *   - No rotate steps (rotation is illegal on road; steps are silently skipped in processing).
 *
 * Falls back to 'cross_country' whenever the conditions are not fully met.
 */
function determineMovementMode(
  unit: Unit,
  steps: MovementStep[],
  hexMap: Record<string, HexData>,
): MovementMode {
  const startData = hexMap[hexKey(unit.q, unit.r)];
  if (!startData) return 'cross_country';

  const startTerrain = startData.terrain;
  if (startTerrain !== 'road' && startTerrain !== 'path') return 'cross_country';

  let cq = unit.q;
  let cr = unit.r;

  for (const step of steps) {
    if (step.type === 'rotate') continue;

    const dest     = hexNeighbors({ q: cq, r: cr })[step.direction]!;
    const destData = hexMap[hexKey(dest.q, dest.r)];

    if (!destData) return 'cross_country'; // off-map exit

    const t = destData.terrain;
    if (t !== 'road' && t !== 'path' && t !== 'ford') return 'cross_country';

    cq = dest.q;
    cr = dest.r;
  }

  const endData = hexMap[hexKey(cq, cr)];
  if (!endData) return 'cross_country';
  if (endData.terrain !== 'road' && endData.terrain !== 'path') return 'cross_country';

  return startTerrain === 'road' ? 'road' : 'path';
}

// ---------------------------------------------------------------------------
// Rotation cost (4.5.1.1.4)
// ---------------------------------------------------------------------------

/**
 * Cost for one rotation step in the current hex.
 *
 *   - 1 hexside, free rotation not yet used → free (freeRotUsed becomes true).
 *   - 2-3 hexsides, OR 1 hexside with free rotation already used → pay Turn cost.
 *   - A vehicle may never exceed its allowance by rotating (caller must check).
 *
 * Returns { cost, newFreeRotUsed }. When diff === 0 returns { cost: 0, newFreeRotUsed }.
 */
function computeRotationCost(
  oldFacing: HexDirection,
  newFacing: HexDirection,
  hexTerrain: Parameters<typeof baseTurnCost>[0],
  freeRotUsed: boolean,
): { cost: number; newFreeRotUsed: boolean } {
  const diff = hexsideDiff(oldFacing, newFacing);
  if (diff === 0) return { cost: 0, newFreeRotUsed: freeRotUsed };

  if (diff === 1 && !freeRotUsed) {
    return { cost: 0, newFreeRotUsed: true };
  }

  return { cost: baseTurnCost(hexTerrain), newFreeRotUsed: freeRotUsed };
}

// ---------------------------------------------------------------------------
// Overwatch trigger (4.5)
// ---------------------------------------------------------------------------

/**
 * Resolve all pending OW declarations against the current mover position.
 * Each eligible OW unit fires once and is marked hasActed.
 * Mutates liveUnits in-place (OW unit's hasActed; mover's damage if hit).
 */
function checkOWTriggers(
  moverId: string,
  atHex: Axial,
  trigger: OverwatchEvent['trigger'],
  liveUnits: Record<string, Unit>,
  blueprints: Record<string, VehicleData>,
  hexMap: Record<string, HexData>,
  owDeclarations: OverwatchDeclaration[],
  nextRoll: () => number,
): OverwatchEvent[] {
  const events: OverwatchEvent[] = [];
  const mover = liveUnits[moverId];
  if (!mover || isEliminated(mover)) return events;

  for (const decl of owDeclarations) {
    if (decl.targetId !== moverId) continue;

    const shooter   = liveUnits[decl.shooterId];
    const shooterBP = shooter ? blueprints[shooter.blueprintId] : undefined;

    if (!shooter || !shooterBP)             continue;
    if (shooter.command !== 'OVERWATCH')    continue;
    if (shooter.side === mover.side)        continue;
    if (isEliminated(shooter))             continue;
    if (shooter.hasActed)                  continue;
    if (!canShooterReachTarget(shooter, shooterBP, atHex)) continue;

    const roll: number = nextRoll();
    // resolveOverwatchFire mutates liveUnits (damage on hit)
    const shot: ShotResult = resolveOverwatchFire({
      shooterId: decl.shooterId,
      targetId:  moverId,
      units:     liveUnits,
      blueprints,
      hexMap,
      roll,
      ammoType:  decl.ammoType,
    });

    // Reveal and expend the OW counter
    liveUnits[decl.shooterId] = { ...liveUnits[decl.shooterId]!, hasActed: true, fired: true };

    events.push({ trigger, atHex, shooterId: decl.shooterId, targetId: moverId, shot });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Single-vehicle movement processor
// ---------------------------------------------------------------------------

function processVehicleMovement(
  order: MovementOrder,
  liveUnits: Record<string, Unit>,
  blueprints: Record<string, VehicleData>,
  hexMap: Record<string, HexData>,
  owDeclarations: OverwatchDeclaration[],
  nextRoll: () => number,
): VehicleMovementResult {
  const unit = liveUnits[order.vehicleId]!;
  const bp   = blueprints[unit.blueprintId]!;

  const fromHex: Axial = { q: unit.q, r: unit.r };
  const facingBefore   = unit.facing;

  const movementMode   = determineMovementMode(unit, order.steps, hexMap);
  const allowanceTotal = computeAllowance(unit, bp, movementMode);

  let cq           = unit.q;
  let cr           = unit.r;
  let curFacing    = unit.facing;
  let spent        = 0;
  let freeRotUsed  = false;   // reset when entering each new hex
  let rotCostSpent = false;   // guards the "always 1 hex" exception
  let hexMoveCount = 0;
  let allReverse   = true;    // stays true only if every move step is reverse
  let offMap       = false;
  let abortReason: VehicleMovementResult['abortReason'];

  const pathTaken:   PathStep[]       = [];
  const triggeredOW: OverwatchEvent[] = [];

  for (const step of order.steps) {
    if (isEliminated(liveUnits[order.vehicleId]!)) {
      abortReason = 'eliminated_by_overwatch';
      break;
    }

    // ── ROTATE ──────────────────────────────────────────────────────────────
    if (step.type === 'rotate') {
      if (movementMode === 'road' || movementMode === 'path') continue; // not allowed

      const curTerrain = hexMap[hexKey(cq, cr)]?.terrain ?? 'clear';
      const { cost, newFreeRotUsed } = computeRotationCost(
        curFacing, step.newFacing, curTerrain, freeRotUsed,
      );

      if (hexsideDiff(curFacing, step.newFacing) === 0) continue;

      // Can never exceed allowance by rotating
      if (cost > 0 && spent + cost > allowanceTotal) continue;

      if (cost > 0) { spent += cost; rotCostSpent = true; }
      freeRotUsed = newFreeRotUsed;

      const owEvts = checkOWTriggers(
        order.vehicleId, { q: cq, r: cr }, 'rotation',
        liveUnits, blueprints, hexMap, owDeclarations, nextRoll,
      );
      triggeredOW.push(...owEvts);

      pathTaken.push({ hex: { q: cq, r: cr }, costPaid: cost, stepType: 'rotate', facingAfter: step.newFacing });
      curFacing = step.newFacing;
    }

    // ── MOVE ────────────────────────────────────────────────────────────────
    else if (step.type === 'move') {
      const isReverse = step.reverse ?? false;
      if (!isReverse) allReverse = false;

      const dest     = hexNeighbors({ q: cq, r: cr })[step.direction]!;
      const destKey  = hexKey(dest.q, dest.r);
      const destData = hexMap[destKey];

      // ── Off-map exit (4.5.1.1.9) ─────────────────────────────────────────
      if (!destData) {
        const srcTerrain = hexMap[hexKey(cq, cr)]?.terrain ?? 'clear';
        const rawCost    = baseMoveCost(srcTerrain, bp.movementType);
        const exitCost   = rawCost === 'P' ? 0
          : isReverse ? (rawCost as number) * 2
          : (rawCost as number);

        const exitFacing: HexDirection = isReverse ? curFacing : step.direction;
        pathTaken.push({ hex: dest, costPaid: exitCost, stepType: 'exit', facingAfter: exitFacing });

        const owEvts = checkOWTriggers(
          order.vehicleId, dest, 'hex_entry',
          liveUnits, blueprints, hexMap, owDeclarations, nextRoll,
        );
        triggeredOW.push(...owEvts);

        spent += exitCost;
        hexMoveCount++;
        cq = dest.q; cr = dest.r;
        curFacing = exitFacing;
        offMap = true;
        break;
      }

      // ── Terrain cost ──────────────────────────────────────────────────────
      let moveCost = 0;
      let prohibited = false;

      if (movementMode === 'road' || movementMode === 'path') {
        if (destData.terrain === 'ford') {
          // Ford exception: revert to CC factor (4.5.1.1.5)
          const fc = baseMoveCost('ford', bp.movementType);
          if (fc === 'P') { prohibited = true; }
          else moveCost = isReverse ? (fc as number) * 2 : (fc as number);
        } else {
          moveCost = isReverse ? 2 : 1;
        }
      } else {
        // Cross-country
        const srcData = hexMap[hexKey(cq, cr)]!;
        const tCost   = baseMoveCost(destData.terrain, bp.movementType);
        if (tCost === 'P') {
          prohibited = true;
        } else {
          const eCost = elevationChangeCost(srcData.elevation, destData.elevation, bp.movementType);
          if (eCost === 'P') {
            prohibited = true;
          } else {
            moveCost = (tCost as number) + (eCost as number);
            if (isReverse) moveCost *= 2;
          }
        }
      }

      if (prohibited) { abortReason = 'terrain_prohibited'; break; }

      // ── Allowance check (+ exception 4.5.1.1.3) ──────────────────────────
      if (spent + moveCost > allowanceTotal) {
        // Exception: may always move at least 1 hex if:
        //   • no previous hex entry has occurred (hexMoveCount === 0)
        //   • no allowance was spent on rotation beforehand
        if (hexMoveCount === 0 && !rotCostSpent) {
          spent = allowanceTotal; // consume all remaining
        } else {
          abortReason = 'allowance_exceeded';
          break;
        }
      } else {
        spent += moveCost;
      }

      // ── Commit hex entry ──────────────────────────────────────────────────
      freeRotUsed = false; // fresh free rotation in the newly entered hex
      hexMoveCount++;
      cq = dest.q; cr = dest.r;

      if (!isReverse && (movementMode === 'road' || movementMode === 'path')) {
        curFacing = step.direction; // road/path: always face direction of travel
      }

      pathTaken.push({
        hex:        { q: cq, r: cr },
        costPaid:   moveCost,
        stepType:   isReverse ? 'reverse' : 'move',
        facingAfter: curFacing,
      });

      const owEvts = checkOWTriggers(
        order.vehicleId, { q: cq, r: cr }, 'hex_entry',
        liveUnits, blueprints, hexMap, owDeclarations, nextRoll,
      );
      triggeredOW.push(...owEvts);
    }
  }

  // ── Classify final mode ───────────────────────────────────────────────────
  let finalMode: MovementMode = movementMode;
  if (hexMoveCount === 0) {
    finalMode = 'no_move';
  } else if (movementMode === 'cross_country' && allReverse) {
    finalMode = 'reverse';
  }

  const toHex: Axial = { q: cq, r: cr };

  // Use the live unit (may have received OW damage), then overwrite position/facing.
  const liveUnit = liveUnits[order.vehicleId]!;
  const updatedUnit: Unit = {
    ...liveUnit,
    // Off-map vehicles are flagged but kept at their last valid in-map position
    q:        offMap ? unit.q : cq,
    r:        offMap ? unit.r : cr,
    facing:   curFacing,
    moved:    true,
    fired:    false,  // SHORT_HALT SPOT/FIRE replaced by SPOT/MOVE (4.5)
    hasActed: true,
  };
  liveUnits[order.vehicleId] = updatedUnit;

  return {
    vehicleId:          order.vehicleId,
    fromHex,
    toHex,
    facingBefore,
    facingAfter:        curFacing,
    pathTaken,
    movementMode:       finalMode,
    allowanceTotal,
    allowanceUsed:      Math.min(spent, allowanceTotal),
    allowanceRemaining: Math.max(0, allowanceTotal - spent),
    triggeredOverwatch: triggeredOW,
    offMap,
    updatedUnit,
    abortReason,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Execute the Movement Phase (4.5).
 *
 * All mutations are to internal working copies of unit state.
 * Returns the final unit map and per-vehicle movement results.
 */
export function movementPhase(input: MovementPhaseInput): MovementPhaseResult {
  const { firstPlayer, units, blueprints, hexMap, orders, owDeclarations, owRolls } = input;
  const secondPlayer: Side = firstPlayer === 'allied' ? 'axis' : 'allied';

  const liveUnits: Record<string, Unit> = Object.fromEntries(
    Object.entries(units).map(([k, v]) => [k, { ...v }]),
  );

  let rollIdx = 0;
  const nextRoll = (): number =>
    owRolls[rollIdx++] ?? (Math.floor(Math.random() * 100) + 1);

  // ── Reveal MOVE / SHORT_HALT counters — all become SPOT/MOVE (4.5) ───────
  for (const [id, unit] of Object.entries(liveUnits)) {
    if (unit.command === 'MOVE' || unit.command === 'SHORT_HALT') {
      liveUnits[id] = { ...unit, moved: true, fired: false };
    }
  }

  const allResults: VehicleMovementResult[] = [];
  const ordersByVehicle = new Map<string, MovementOrder>(
    orders.map((o) => [o.vehicleId, o]),
  );

  // ── Process: second player first, then first player ───────────────────────
  for (const movingSide of [secondPlayer, firstPlayer] as Side[]) {
    for (const [id, unit] of Object.entries(liveUnits)) {
      if (unit.side !== movingSide) continue;
      if (unit.command !== 'MOVE' && unit.command !== 'SHORT_HALT') continue;
      if (isEliminated(unit)) continue;

      const order = ordersByVehicle.get(id);

      // NO MOVE (4.5.1.1.8): declared MOVE/SHORT_HALT but no steps declared
      if (!order || order.steps.length === 0) {
        const noMoveBP       = blueprints[unit.blueprintId]!;
        const noMoveAllowance = computeAllowance(unit, noMoveBP, 'cross_country');
        const updatedUnit: Unit = {
          ...liveUnits[id]!,
          moved: true, fired: false, hasActed: true,
        };
        liveUnits[id] = updatedUnit;
        allResults.push({
          vehicleId:          id,
          fromHex:            { q: unit.q, r: unit.r },
          toHex:              { q: unit.q, r: unit.r },
          facingBefore:       unit.facing,
          facingAfter:        unit.facing,
          pathTaken:          [],
          movementMode:       'no_move',
          allowanceTotal:     noMoveAllowance,
          allowanceUsed:      0,
          allowanceRemaining: noMoveAllowance,
          triggeredOverwatch: [],
          offMap:             false,
          updatedUnit,
        });
        continue;
      }

      const result = processVehicleMovement(
        order, liveUnits, blueprints, hexMap, owDeclarations, nextRoll,
      );
      allResults.push(result);
      // liveUnits is updated inside processVehicleMovement
    }
  }

  return { vehicleResults: allResults, updatedUnits: { ...liveUnits } };
}
