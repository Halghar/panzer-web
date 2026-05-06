/**
 * Spotting Phase orchestration, see Consolidated Rules 4.1.
 *
 * For each opposing pair (spotter, target) where the spotter is a
 * combat-capable vehicle, determine if the spotter sees the target by:
 *   1. Computing the spotting range based on target cover + last-turn
 *      activity (moved/fired).
 *   2. Checking that hex distance ≤ that range.
 *   3. Checking that LOS is unblocked.
 *
 * Output: a per-target SpotStatus and the set of (spotter, target)
 * pairs that established the spot. Caller updates `Unit.spotStatus`
 * and (optionally) places SPOT/FIRE or SPOT/MOVE counters.
 *
 * Continuity rule (4.1): "Once an opposing vehicle is spotted, it
 * remains so as long as at least one friendly vehicle meets the range
 * and line-of-sight requirements." This is naturally enforced by
 * recomputing every Spotting Phase. If a target was previously
 * spotted but no current spotter can see it, the spot is lost
 * ("If a spot is lost, it must be reacquired through the normal
 * spotting and line-of-sight rules" — 4.1.1).
 */

import type { Axial } from '../hex/coords';
import { hexDistance } from '../hex/coords';
import type { TerrainMap } from '../terrain/types';
import { getTile, terrainCover } from '../terrain/types';
import { spottingRange } from './range';
import { checkLOS } from './los';

export type SpotStatus = 'unspotted' | 'spottedByMove' | 'spottedByFire';
export type Side = 'allied' | 'axis';

/**
 * Minimal unit shape this module needs. Designed to be a structural
 * subset of your game's full Unit type so you can pass it directly.
 */
export interface SpottableUnit {
  instanceId: string;
  side: Side;
  q: number;
  r: number;
  /** True if this unit can spot (combat unit; not unarmed). 4.1.1 */
  canSpot: boolean;
  /** True if the unit moved during this turn. */
  moved: boolean;
  /** True if the unit fired during this turn. */
  fired: boolean;
}

export interface SpottingPair {
  spotter: string; // instanceId
  target: string;
  range: number;
  distance: number;
  reason: 'baseRange' | 'spotMove' | 'spotFire';
}

export interface SpottingPhaseResult {
  /** New spot status per target instanceId. */
  statusByUnit: Map<string, SpotStatus>;
  /** All (spotter,target) pairs that successfully spotted. */
  pairs: SpottingPair[];
}

/**
 * Determine if a target hex is over-stacked (6+ vehicle counters in it).
 * Wrecks don't count (3.8). Caller passes a map of hex → unit count.
 */
function isOverStacked(tile: Axial, vehicleCountByHex: Map<string, number>): boolean {
  return (vehicleCountByHex.get(`${tile.q},${tile.r}`) ?? 0) >= 6;
}

/**
 * Run the full Spotting Phase computation for all units.
 *
 * Pure function — does not mutate inputs. Caller is responsible for
 * applying the result to the game state (updating `spotStatus` on
 * each unit and adding/removing SPOT counters per 4.1.5).
 */
export function runSpottingPhase(
  units: readonly SpottableUnit[],
  map: TerrainMap,
): SpottingPhaseResult {
  const status = new Map<string, SpotStatus>();
  const pairs: SpottingPair[] = [];

  // Initialize all units to unspotted; we'll upgrade them as we find spots.
  for (const u of units) status.set(u.instanceId, 'unspotted');

  // Pre-compute over-stack counts per hex.
  const vehicleCountByHex = new Map<string, number>();
  for (const u of units) {
    const k = `${u.q},${u.r}`;
    vehicleCountByHex.set(k, (vehicleCountByHex.get(k) ?? 0) + 1);
  }

  for (const target of units) {
    const tTile = getTile(map, { q: target.q, r: target.r });
    if (!tTile) continue;

    const overStacked = isOverStacked(target, vehicleCountByHex);
    const cover = terrainCover(tTile);

    const range = spottingRange({
      targetCover: cover,
      targetMoved: target.moved,
      targetFired: target.fired,
      targetOverStacked: overStacked,
    });

    let bestStatus: SpotStatus = 'unspotted';

    for (const spotter of units) {
      if (spotter.side === target.side) continue;
      if (!spotter.canSpot) continue;
      if (spotter.instanceId === target.instanceId) continue;

      const dist = hexDistance(
        { q: spotter.q, r: spotter.r },
        { q: target.q, r: target.r },
      );
      if (dist > range.range) continue;

      const los = checkLOS({
        spotter: { q: spotter.q, r: spotter.r },
        target: { q: target.q, r: target.r },
        map,
      });
      if (!los.hasLOS) continue;

      // 4.1.5: a SPOT counter is placed only when the target moved or
      // fired. Targets spotted via base range alone are still "spotted"
      // for game purposes but get no counter (keeps the board tidy).
      const reason: SpottingPair['reason'] = target.fired
        ? 'spotFire'
        : target.moved
          ? 'spotMove'
          : 'baseRange';

      pairs.push({
        spotter: spotter.instanceId,
        target: target.instanceId,
        range: range.range,
        distance: dist,
        reason,
      });

      // The unit is now spotted. The flavor of the spot reflects the
      // target's own last action:
      //   - fired → SPOT/FIRE (per 4.1.5 a counter is placed)
      //   - moved → SPOT/MOVE (counter)
      //   - neither → spotted via base range, no counter (4.1.5)
      // We collapse "spotted via base range" into spottedByMove for
      // simplicity — callers who care about counter placement should
      // check `target.fired`/`target.moved` directly.
      if (target.fired) bestStatus = 'spottedByFire';
      else if (bestStatus !== 'spottedByFire') bestStatus = 'spottedByMove';
    }

    if (bestStatus !== 'unspotted') status.set(target.instanceId, bestStatus);
  }

  return { statusByUnit: status, pairs };
}

/**
 * Convenience: get all targets visible to a single spotter. Useful for
 * checking spot before allowing a FIRE command (4.4).
 */
export function targetsVisibleTo(
  spotterId: string,
  units: readonly SpottableUnit[],
  map: TerrainMap,
): string[] {
  const result = runSpottingPhase(units, map);
  return result.pairs
    .filter((p) => p.spotter === spotterId)
    .map((p) => p.target);
}

/**
 * Check whether a spotter has a specific target in its spotted list.
 * Works on pre-computed pairs (from the store) — no re-computation.
 * Use this to gate FIRE and SHORT_HALT commands (4.4).
 */
export function canFireAt(
  spotterId: string,
  targetId: string,
  pairs: ReadonlyArray<{ spotter: string; target: string }>,
): boolean {
  return pairs.some((p) => p.spotter === spotterId && p.target === targetId);
}
