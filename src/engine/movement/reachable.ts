import { hexNeighbors } from '../hex/coords';
import type { Unit, HexData } from '../state/types';
import { hexKey } from '../state/types';
import type { VehicleData } from '../units/types';
import { baseMoveCost, elevationChangeCost } from './terrain';

/**
 * BFS flood fill returning hex keys reachable by the unit this turn.
 * Uses cross-country movement costs only (no road bonus — good enough for UI highlight).
 * Respects the "always move at least 1 hex" exception.
 */
export function computeReachableHexes(
  unit: Unit,
  bp: VehicleData,
  hexMap: Record<string, HexData>,
): Set<string> {
  let allowance = bp.movementSlow;
  if (unit.command === 'SHORT_HALT' && unit.damage === 'damaged') {
    allowance = Math.floor(allowance / 4);
  } else if (unit.command === 'SHORT_HALT' || unit.damage === 'damaged') {
    allowance = Math.floor(allowance / 2);
  }
  allowance = Math.max(1, allowance);

  const reachable = new Set<string>();
  // best[key] = highest remaining MP after reaching that hex
  const best = new Map<string, number>();
  best.set(hexKey(unit.q, unit.r), allowance);

  const queue: Array<{ q: number; r: number; remaining: number; distFromStart: number }> = [
    { q: unit.q, r: unit.r, remaining: allowance, distFromStart: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const curData = hexMap[hexKey(current.q, current.r)];
    const curElev = curData?.elevation ?? 0;
    const atStart = current.distFromStart === 0;

    for (const nb of hexNeighbors({ q: current.q, r: current.r })) {
      const nKey = hexKey(nb.q, nb.r);
      const nData = hexMap[nKey];
      if (!nData) continue;

      const tCost = baseMoveCost(nData.terrain, bp.movementType);
      if (tCost === 'P') continue;

      const eCost = elevationChangeCost(curElev, nData.elevation ?? 0, bp.movementType);
      if (eCost === 'P') continue;

      const moveCost = (tCost as number) + (eCost as number);
      const newRemaining = current.remaining - moveCost;

      // The "always move at least 1 hex" exception applies only from start hex
      if (newRemaining < 0 && !atStart) continue;

      const actualRemaining = Math.max(0, newRemaining);
      const prev = best.get(nKey) ?? -1;
      if (actualRemaining > prev) {
        best.set(nKey, actualRemaining);
        reachable.add(nKey);
        if (actualRemaining > 0) {
          queue.push({ q: nb.q, r: nb.r, remaining: actualRemaining, distFromStart: current.distFromStart + 1 });
        }
      }
    }
  }

  return reachable;
}
