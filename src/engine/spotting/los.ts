/**
 * Line-of-Sight, see Consolidated Rules 4.1.4.
 *
 * The procedure:
 *  1. Trace the hex line between spotter and target (4.1.4 — center
 *     dot to center dot).
 *  2. For each intermediate hex, compute its blocking height
 *     (terrain + hill).
 *  3. Apply the four LOS cases (4.1.4.2.1 → 4.1.4.2.4):
 *     - Obstacle higher than both → blocked at any range.
 *     - Obstacle equal to one and higher than the other → blocked.
 *     - Obstacle equal or lower than both → not blocked by that hex.
 *     - Obstacle lower than one and higher than the other → blind zone.
 *  4. Special cases:
 *     - Spotting INTO/FROM blocking terrain: 1 hex (4.1.4.2.5).
 *     - Stream/Gully/Ford to a Height-1-above target: only adjacent
 *       hexes can be spotted (4.1.4.1.6).
 *     - Roads/Paths through Building/Woods/Grove negate the blocking
 *       effect when spotting along a straight line (4.1.4.1.3 / 4.1.4.1.7).
 *     - Exact-along-hexside LOS is blocked if either hex blocks (4.1.4.2.6).
 */

import type { Axial } from '../hex/coords';
import { hexDistance, hexLine, hexLineWithHexsides } from '../hex/coords';
import type { HexTile, TerrainMap } from '../terrain/types';
import {
  getTile,
  intermediateBlockingHeight,
  isBlockingTerrain,
  vehicleGroundHeight,
} from '../terrain/types';

export type LOSResult =
  | { hasLOS: true; reason?: string }
  | { hasLOS: false; reason: string };

export interface LOSInput {
  spotter: Axial;
  target: Axial;
  map: TerrainMap;
}

/** Vehicles have height 0 (they don't add to the hex height). */
const VEHICLE_HEIGHT = 0;

/**
 * Determine whether the spotter has LOS to the target.
 *
 * Vehicles never block LOS (rule 4.1.4.1: "Vehicles ... have no Height
 * and never block line-of-sight"). So we only consult terrain.
 */
export function checkLOS(input: LOSInput): LOSResult {
  const { spotter, target, map } = input;
  const dist = hexDistance(spotter, target);

  if (dist === 0) return { hasLOS: true };

  const sTile = getTile(map, spotter);
  const tTile = getTile(map, target);
  if (!sTile || !tTile) return { hasLOS: false, reason: 'off-map' };

  // Effective vehicle heights (4.1.4 / 4.1.4.1.4 / 4.1.4.1.6).
  const sH = vehicleGroundHeight(sTile) + VEHICLE_HEIGHT;
  const tH = vehicleGroundHeight(tTile) + VEHICLE_HEIGHT;

  // Special rule for spotting into/from blocking terrain (4.1.4.2.5).
  // Vehicles may spot up to 1 hex into or from any blocking terrain.
  // This applies to BOTH endpoints (we check sTile and tTile).
  const spotterInBlocking = isBlockingTerrain(sTile);
  const targetInBlocking = isBlockingTerrain(tTile);

  // Stream/Gully/Ford special rule (4.1.4.1.6): when spotting to a
  // hex 1 Height level above their height, only adjacent hexes may
  // be spotted (and along a straight line in the same Stream/Gully).
  const sLowTerrain = isStreamGullyFord(sTile);
  const tLowTerrain = isStreamGullyFord(tTile);
  if (sLowTerrain && !tLowTerrain && tH >= sH + 1 && dist > 1) {
    return { hasLOS: false, reason: 'gully/stream restricted to adjacent' };
  }
  if (tLowTerrain && !sLowTerrain && sH >= tH + 1 && dist > 1) {
    return { hasLOS: false, reason: 'gully/stream restricted to adjacent' };
  }

  if ((spotterInBlocking || targetInBlocking) && dist > 1) {
    // We're inside (or shooting into) blocking terrain. Allowed only
    // if the LOS is along a Road/Path through THAT terrain (4.1.4.1.3,
    // 4.1.4.1.7). We check this in the road-negation pass below.
    if (!isLineAlongRoadThrough(spotter, target, map, sTile, tTile)) {
      // 1-hex perimeter only.
      return { hasLOS: false, reason: 'spotting beyond 1 hex into/from blocking terrain' };
    }
  }

  // Walk the LOS line. Endpoints excluded per 4.1.4: "not including
  // the two vehicles themselves or any intervening vehicles".
  const line = hexLine(spotter, target);
  const intermediates = line.slice(1, -1);

  // Detect exact-along-hexside (4.1.4.2.6): if hexLineWithHexsides
  // touches MORE hexes than the standard line, we have a hexside grazing.
  const fullSet = hexLineWithHexsides(spotter, target);
  const exactAlongHexside = fullSet.length > line.length;

  // Track the closest blocking obstacle and its height (for blind zone
  // calculation per 4.1.4.2.4).
  let blockedNoBlindZone = false;
  let blockingObstacles: { hex: Axial; height: number; rangeFromHigher: number }[] = [];

  const checkHex = (h: Axial) => {
    const tile = getTile(map, h);
    if (!tile) return; // off-map intermediate — treated as clear
    const obsH = intermediateBlockingHeight(tile);
    if (obsH < 1) return; // non-blocking (Height 0 or -1)

    // Roads/Paths in this hex negate blocking when LOS is straight
    // through Buildings/Woods/Grove (4.1.4.1.3 & 4.1.4.1.7).
    if (negatedByRoad(tile, spotter, target)) return;

    // Apply the four cases from 4.1.4.2.
    const higher = Math.max(sH, tH);
    const lower = Math.min(sH, tH);

    if (obsH > higher) {
      // Higher than both → blocked at any range (4.1.4.2.1).
      blockedNoBlindZone = true;
      return;
    }
    if (obsH === higher && obsH > lower) {
      // Equal to one, higher than the other → blocked at any range
      // behind it (4.1.4.2.2). Since we're an intermediate, we ARE
      // behind it from the lower vehicle's perspective.
      blockedNoBlindZone = true;
      return;
    }
    if (obsH <= lower) {
      // Equal or lower than both → not blocked (4.1.4.2.3).
      return;
    }
    // Otherwise: obsH is strictly between lower and higher (4.1.4.2.4).
    // Compute blind zone using distance from the HIGHER vehicle to the
    // obstacle.
    const higherIsSpotter = sH >= tH;
    const higherHex = higherIsSpotter ? spotter : target;
    const rangeFromHigher = hexDistance(higherHex, h);
    blockingObstacles.push({ hex: h, height: obsH, rangeFromHigher });
  };

  for (const h of intermediates) checkHex(h);

  // 4.1.4.2.6: if LOS runs along a hexside, also check the hexes that
  // touch the hexside.
  if (exactAlongHexside) {
    const linedSet = new Set(line.map((h) => `${h.q},${h.r}`));
    const touchedExtras = fullSet.filter((h) => !linedSet.has(`${h.q},${h.r}`));
    for (const h of touchedExtras) checkHex(h);
  }

  if (blockedNoBlindZone) return { hasLOS: false, reason: 'blocking terrain' };

  // Resolve blind zones. The closest obstacle to the higher vehicle
  // dominates (it creates the deepest blind zone). The blind zone
  // extends BEHIND the obstacle, away from the higher vehicle.
  if (blockingObstacles.length > 0) {
    const higherIsSpotter = sH >= tH;
    const higherH = Math.max(sH, tH);
    const lowerH = Math.min(sH, tH);
    const lowerHex = higherIsSpotter ? target : spotter;

    for (const obs of blockingObstacles) {
      const heightDelta = higherH - obs.height;
      // Divisor by case (4.1.4.2.4):
      // Lower by 1 → /2, by 2 → /4, by 3 → /8, by 4+ → "1 hex behind".
      let divisor: number;
      if (heightDelta === 1) divisor = 2;
      else if (heightDelta === 2) divisor = 4;
      else if (heightDelta === 3) divisor = 8;
      else divisor = Infinity; // 4+: blind zone is just 1 hex behind

      // 4.1.4.2.4.1: lower unit above Height 0 adds its height to the
      // divisor; lower at Height -1 subtracts 1 (min 2).
      if (divisor !== Infinity) {
        if (lowerH > 0) divisor += lowerH;
        else if (lowerH === -1) divisor = Math.max(2, divisor - 1);
      }

      const blindZone =
        divisor === Infinity ? 1 : Math.max(1, Math.floor(obs.rangeFromHigher / divisor));

      const distHigherToLower = hexDistance(
        higherIsSpotter ? spotter : target,
        lowerHex,
      );
      // The lower vehicle is in the blind zone if its distance from the
      // higher vehicle is in [obstacleRange + 1, obstacleRange + blindZone].
      // Actually per the worked examples: if blind zone is 7 and obstacle
      // at range 14, hexes at range 15-21 are blind.
      const blindStart = obs.rangeFromHigher + 1;
      const blindEnd = obs.rangeFromHigher + blindZone;
      if (distHigherToLower >= blindStart && distHigherToLower <= blindEnd) {
        return { hasLOS: false, reason: 'blind zone' };
      }
    }
  }

  return { hasLOS: true };
}

function isStreamGullyFord(t: HexTile): boolean {
  return t.terrain === 'stream' || t.terrain === 'gully' || t.terrain === 'ford';
}

/**
 * 4.1.4.1.3 / 4.1.4.1.7: Roads and Paths in a Building/Woods/Grove hex
 * negate blocking if the LOS is along a straight line through them.
 *
 * "Along a straight line" is interpreted as: the LOS passes along one
 * of the 6 hex axes. We also require that the hex itself has a
 * road/path AND that the spotter/target hex are aligned with it.
 *
 * For correctness we also require that the FULL chain of intermediate
 * hexes through the blocking terrain has road/path — otherwise a single
 * road tile in the middle of woods wouldn't actually clear the LOS.
 */
function negatedByRoad(
  tile: HexTile,
  spotter: Axial,
  target: Axial,
): boolean {
  if (!(tile.hasRoad || tile.hasPath)) return false;
  if (!isBuildingOrWoods(tile)) return false;
  return isStraightLine(spotter, target);
}

function isBuildingOrWoods(t: HexTile): boolean {
  return (
    t.terrain === 'lightWoods' ||
    t.terrain === 'woods' ||
    t.terrain === 'heavyWoods' ||
    t.terrain === 'lightGrove' ||
    t.terrain === 'mediumGrove' ||
    t.terrain === 'brickBuilding' ||
    t.terrain === 'stoneBuilding' ||
    t.terrain === 'woodBuilding' ||
    t.terrain === 'desertBuilding'
  );
}

/** Hex line is "straight" iff it lies along one of the 6 hex axes. */
export function isStraightLine(a: Axial, b: Axial): boolean {
  if (a.q === b.q && a.r === b.r) return true;
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  // Three axes in axial: q==const, r==const, q+r==const (the diagonal).
  return dq === 0 || dr === 0 || dq + dr === 0;
}

/**
 * Variant of 4.1.4.2.5: when spotter or target is INSIDE blocking
 * terrain, the "1 hex into/from" rule is bypassed if the LOS runs
 * along a Road/Path straight line and every intermediate blocking
 * hex (and the endpoints if they're blocking) has road/path.
 */
function isLineAlongRoadThrough(
  spotter: Axial,
  target: Axial,
  map: TerrainMap,
  sTile: HexTile,
  tTile: HexTile,
): boolean {
  if (!isStraightLine(spotter, target)) return false;
  const checks: HexTile[] = [];
  if (isBlockingTerrain(sTile)) checks.push(sTile);
  if (isBlockingTerrain(tTile)) checks.push(tTile);
  const line = hexLine(spotter, target).slice(1, -1);
  for (const h of line) {
    const t = getTile(map, h);
    if (!t) continue;
    if (isBuildingOrWoods(t)) checks.push(t);
  }
  return checks.every((t) => t.hasRoad || t.hasPath);
}
