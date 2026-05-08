/**
 * Basic greedy AI — one pure function per phase.
 *
 *   getAICommands()         — COMMAND phase: assign FIRE or MOVE
 *   getAIFireDeclarations() — COMBAT phase:  pick targets
 *   getAIMovementOrders()   — MOVEMENT phase: advance toward enemies
 *   computeAITurn()         — convenience wrapper for all three
 */

import type { GameState, Unit, Side, Command, HexData, HexDirection } from '../state/types';
import { hexKey } from '../state/types';
import type { VehicleData, KEAmmo } from '../units/types';
import type { FireDeclaration } from '../combat/phase';
import { canShooterReachTarget } from '../combat/phase';
import type { MovementOrder, MovementStep } from '../movement/types';
import { hexDistance, hexNeighbors } from '../hex/coords';
import type { Axial } from '../hex/coords';
import { getRangeFactor } from '../combat/apFire';
import { baseMoveCost, elevationChangeCost } from '../movement/terrain';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isEliminated(unit: Unit): boolean {
  return unit.damage === 'ko' || unit.damage === 'bu';
}

function maxAPRange(bp: VehicleData): number {
  for (const ammo of bp.ammo) {
    if (ammo.type === 'AP' || ammo.type === 'HVAP' || ammo.type === 'APCR' || ammo.type === 'HEAT') {
      return ammo.ranges.E;
    }
  }
  return 0;
}

function spotsOf(
  spotterId: string,
  spottingPairs: { spotter: string; target: string }[],
  units: Record<string, Unit>,
): Unit[] {
  return spottingPairs
    .filter(p => p.spotter === spotterId)
    .map(p => units[p.target])
    .filter((u): u is Unit => !!u && !isEliminated(u));
}

function closestTo(from: Axial, candidates: Unit[]): Unit {
  return candidates.reduce((best, u) =>
    hexDistance(from, { q: u.q, r: u.r }) < hexDistance(from, { q: best.q, r: best.r }) ? u : best,
  );
}

function aiAllowance(unit: Unit, bp: VehicleData): number {
  let base = bp.movementSlow;
  if (unit.damage === 'damaged') base = Math.max(1, Math.floor(base / 2));
  return Math.max(1, base);
}

function greedySteps(
  unit: Unit,
  bp: VehicleData,
  target: Axial,
  hexMap: Record<string, HexData>,
): MovementStep[] {
  const steps: MovementStep[] = [];
  let budget = aiAllowance(unit, bp);
  let cq = unit.q;
  let cr = unit.r;
  const visited = new Set<string>([hexKey(cq, cr)]);

  while (budget > 0) {
    const neighbors = hexNeighbors({ q: cq, r: cr });
    let bestDir: HexDirection | null = null;
    let bestDist = hexDistance({ q: cq, r: cr }, target); // never move farther away
    let bestCost = 1;

    for (let d = 0; d < 6; d++) {
      const nb = neighbors[d]!;
      const key = hexKey(nb.q, nb.r);
      if (visited.has(key)) continue;

      const destHex = hexMap[key];
      if (!destHex) continue;

      const tc = baseMoveCost(destHex.terrain, bp.movementType);
      if (tc === 'P') continue;

      const srcHex = hexMap[hexKey(cq, cr)];
      const ec = srcHex ? elevationChangeCost(srcHex.elevation, destHex.elevation, bp.movementType) : 0;
      if (ec === 'P') continue;

      const cost = (tc as number) + (ec as number);
      if (cost > budget) continue;

      const dist = hexDistance(nb, target);
      if (dist < bestDist) {
        bestDist = dist;
        bestDir = d as HexDirection;
        bestCost = cost;
      }
    }

    if (bestDir === null) break;

    const nb = neighbors[bestDir]!;
    visited.add(hexKey(nb.q, nb.r));
    steps.push({ type: 'move', direction: bestDir });
    budget -= bestCost;
    cq = nb.q;
    cr = nb.r;

    if (hexDistance({ q: cq, r: cr }, target) === 0) break;
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AITurnDecisions {
  commands: Array<{ unitId: string; command: Command }>;
  fireDeclarations: FireDeclaration[];
  movementOrders: MovementOrder[];
}

/**
 * Assign FIRE or MOVE to every active AI unit.
 * FIRE when a spotted enemy is within weapon range and field-of-fire; MOVE otherwise.
 */
export function getAICommands(
  state: GameState,
  blueprints: Record<string, VehicleData>,
  aiSide: Side,
): Array<{ unitId: string; command: Command }> {
  const { units, spottingPairs } = state;
  const result: Array<{ unitId: string; command: Command }> = [];

  for (const unit of Object.values(units)) {
    if (unit.side !== aiSide || isEliminated(unit)) continue;

    const bp = blueprints[unit.blueprintId];
    if (!bp) continue;

    const from: Axial = { q: unit.q, r: unit.r };
    const range = maxAPRange(bp);

    const canShoot = spotsOf(unit.instanceId, spottingPairs, units).some(e => {
      const dist = hexDistance(from, { q: e.q, r: e.r });
      return dist <= range && canShooterReachTarget(unit, bp, { q: e.q, r: e.r });
    });

    result.push({ unitId: unit.instanceId, command: canShoot ? 'FIRE' : 'MOVE' });
  }

  return result;
}

/**
 * Declare one shot per FIRE/SHORT_HALT unit.
 * Priority: already-damaged targets first, then closest.
 */
export function getAIFireDeclarations(
  state: GameState,
  blueprints: Record<string, VehicleData>,
  aiSide: Side,
): FireDeclaration[] {
  const { units, spottingPairs } = state;
  const declarations: FireDeclaration[] = [];

  for (const unit of Object.values(units)) {
    if (unit.side !== aiSide || isEliminated(unit)) continue;
    if (unit.command !== 'FIRE' && unit.command !== 'SHORT_HALT') continue;

    const bp = blueprints[unit.blueprintId];
    if (!bp) continue;

    const apAmmo = bp.ammo.find((a): a is KEAmmo => 'penetration' in a);
    if (!apAmmo) continue;

    const from: Axial = { q: unit.q, r: unit.r };

    const targets = spotsOf(unit.instanceId, spottingPairs, units)
      .filter(e => {
        const dist = hexDistance(from, { q: e.q, r: e.r });
        return getRangeFactor(dist, apAmmo) !== null
          && canShooterReachTarget(unit, bp, { q: e.q, r: e.r });
      })
      .sort((a, b) => {
        const aDmg = a.damage === 'damaged' ? 0 : 1;
        const bDmg = b.damage === 'damaged' ? 0 : 1;
        if (aDmg !== bDmg) return aDmg - bDmg;
        return hexDistance(from, { q: a.q, r: a.r }) - hexDistance(from, { q: b.q, r: b.r });
      });

    if (targets.length === 0) continue;

    declarations.push({
      shooterId: unit.instanceId,
      targetId: targets[0]!.instanceId,
      ammoType: apAmmo.type,
    });
  }

  return declarations;
}

/**
 * Generate greedy movement orders for every MOVE-command AI unit.
 * Advances toward the nearest spotted enemy; falls back to nearest living enemy.
 */
export function getAIMovementOrders(
  state: GameState,
  blueprints: Record<string, VehicleData>,
  aiSide: Side,
): MovementOrder[] {
  const { units, hexMap, spottingPairs } = state;
  const enemySide: Side = aiSide === 'allied' ? 'axis' : 'allied';
  const livingEnemies = Object.values(units).filter(u => u.side === enemySide && !isEliminated(u));
  const orders: MovementOrder[] = [];

  for (const unit of Object.values(units)) {
    if (unit.side !== aiSide || isEliminated(unit)) continue;
    if (unit.command !== 'MOVE') continue;

    const bp = blueprints[unit.blueprintId];
    if (!bp) continue;

    const from: Axial = { q: unit.q, r: unit.r };
    const visible = spotsOf(unit.instanceId, spottingPairs, units);

    const targetPool = visible.length > 0 ? visible : livingEnemies;
    if (targetPool.length === 0) continue;

    const nearest = closestTo(from, targetPool);
    const targetPos: Axial = { q: nearest.q, r: nearest.r };

    if (hexDistance(from, targetPos) === 0) continue;

    const steps = greedySteps(unit, bp, targetPos, hexMap);
    if (steps.length > 0) {
      orders.push({ vehicleId: unit.instanceId, steps });
    }
  }

  return orders;
}

/**
 * Convenience wrapper: returns all AI decisions for one turn.
 */
export function computeAITurn(
  state: GameState,
  blueprints: Record<string, VehicleData>,
  aiSide: Side,
): AITurnDecisions {
  return {
    commands: getAICommands(state, blueprints, aiSide),
    fireDeclarations: getAIFireDeclarations(state, blueprints, aiSide),
    movementOrders: getAIMovementOrders(state, blueprints, aiSide),
  };
}
