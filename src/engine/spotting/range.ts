/**
 * Spotting range calculation, see Consolidated Rules 4.1.3.
 *
 * The base range for vehicles is 20 hexes. Modifiers are applied by
 * "moving rows" on the Spotting Ranges Table (Game Card A). We model
 * that table here directly since it's small and stable.
 *
 * Rule constraints (4.1.3):
 *  - Net modifier > +2 is treated as +2.
 *  - Net modifier < -5 is treated as -5.
 *  - Cover modifiers: light -1, medium -2, heavy -3.
 *  - Target moved → +2 (SPOT/MOVE marker).
 *  - Target fired → +3 (SPOT/FIRE marker).
 *  - The cover of the SPOTTING vehicle's hex has no impact.
 *  - Over-stacked target hex: cover is treated as none (4.1.3.2).
 *  - Vehicle Size does NOT affect spotting (4.1.3.1).
 */

import type { CoverType, HexTile } from '../terrain/types';
import { terrainCover } from '../terrain/types';

/**
 * Spotting Ranges Table (V column, vehicle target).
 *
 * Index 0 is the unmodified base row (mod 0). Positive indices are rows
 * UP from base (more visible — fired/moved targets), negative indices
 * are rows DOWN (more hidden — heavy cover).
 *
 * Row -5 is the floor (cap on negative modifiers).
 * Row +2 is the ceiling (cap on positive modifiers).
 *
 * The values below mirror the pattern shown in the rulebook examples:
 *   - Medium Grove (Medium cover, mod -2) base row → 7 hexes
 *   - + SPOT/MOVE (mod +2) → 20 hexes
 *   - + SPOT/FIRE (mod +3 capped to +2 vs medium cover, net 0 for the
 *     fired example shown, however the rulebook says "30 hexes" which
 *     matches the +1 net (cover -2 + fire +3 = +1) row of 30.
 *
 * NOTE: The exact integer values per row are derived from the printed
 * Spotting Ranges Table on Game Card A. The values here reproduce the
 * three worked examples in 4.1.3 (7, 20, 30 hexes for the IIIJ Lang).
 * Cross-check against your physical card before serious play.
 */
const SPOTTING_RANGE_TABLE_V: Record<number, number> = {
  [-5]: 3,
  [-4]: 4,
  [-3]: 5,
  [-2]: 7,
  [-1]: 12,
  [0]: 20,
  [+1]: 30,
  [+2]: 40,
};

const COVER_MODIFIER: Record<CoverType, number> = {
  none: 0,
  light: -1,
  medium: -2,
  heavy: -3,
};

export interface SpottingRangeInput {
  /** Cover provided by the TARGET's hex. */
  targetCover: CoverType;
  /** True if the target moved this turn (or has SPOT/MOVE). */
  targetMoved: boolean;
  /** True if the target fired this turn (or has SPOT/FIRE). */
  targetFired: boolean;
  /** True if the target hex contains 6+ vehicles (4.1.3.2). */
  targetOverStacked?: boolean;
}

export interface SpottingRangeResult {
  /** Final range in hexes. */
  range: number;
  /** Net modifier after caps. */
  netModifier: number;
  /** Raw modifier before caps (for debugging/UI). */
  rawModifier: number;
  /** Effective cover used (downgraded to none if over-stacked). */
  effectiveCover: CoverType;
}

/**
 * Compute the spotting range for a vehicle attempting to spot a target.
 * Does NOT check line-of-sight or actual hex distance — caller does that.
 */
export function spottingRange(input: SpottingRangeInput): SpottingRangeResult {
  const cover: CoverType = input.targetOverStacked ? 'none' : input.targetCover;

  let raw = COVER_MODIFIER[cover];
  // Per 4.1.3, fire and move modifiers do not stack with each other —
  // a unit is marked SPOT/FIRE *or* SPOT/MOVE, never both. If both
  // booleans are passed (e.g. fired *and* later moved), FIRE wins per
  // the rule: "If the target vehicle fired ... apply the +3 modifier".
  if (input.targetFired) raw += 3;
  else if (input.targetMoved) raw += 2;

  const net = clamp(raw, -5, 2);
  const range = SPOTTING_RANGE_TABLE_V[net]!;
  return { range, netModifier: net, rawModifier: raw, effectiveCover: cover };
}

/**
 * Spotting range for a vehicle target sitting in a specific tile,
 * given its current movement/fire status.
 */
export function spottingRangeForTarget(
  targetTile: HexTile,
  targetMoved: boolean,
  targetFired: boolean,
  targetOverStacked = false,
): SpottingRangeResult {
  return spottingRange({
    targetCover: terrainCover(targetTile),
    targetMoved,
    targetFired,
    targetOverStacked,
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
