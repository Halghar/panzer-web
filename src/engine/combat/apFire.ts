/**
 * AP Combat resolution, see Section 4.4.3 of the Consolidated Rules.
 *
 * These are PURE functions — no rendering, no state mutation, no I/O.
 * That's what makes them trivially testable and reusable for the AI later.
 */

import type {
  Weapon,
  Ammo,
  RangeFactor,
  CoverType,
  TargetSize,
} from '../units/types';
import type { Command } from '../state/types';

/** Hit result outcomes */
export type HitOutcome = {
  hit: boolean;
  hitNumber: number;
  rangeFactor: RangeFactor;
  netModifier: number;
  roll: number;
};

export type DamageOutcome = 'none' | 'damaged' | 'ko' | 'bu';

/** Inputs needed to compute a Net Modifier, see 4.4.3.2.2 */
export interface APHitContext {
  range: number;
  targetSize: TargetSize;
  targetCover: CoverType;
  targetIsMoving: boolean;
  shooterCommand: Command;
  shooterStabilization: number;
  shooterDamaged: boolean;
  isOverwatch: boolean;
  /** True if Overwatch fire is at a target outside the FoF, see 4.4.3.2.2 */
  overwatchAdjust: boolean;
  brewUpSmokeCount: number;
}

/**
 * Determine the AP Range Factor for a given range and ammo, see 4.4.3.2.1.
 * Returns null if range exceeds the weapon's max range.
 */
export function getRangeFactor(range: number, ammo: Ammo): RangeFactor | null {
  if (range <= ammo.ranges.P) return 'P';
  if (range <= ammo.ranges.S) return 'S';
  if (range <= ammo.ranges.M) return 'M';
  if (range <= ammo.ranges.L) return 'L';
  if (range <= ammo.ranges.E) return 'E';
  return null; // out of range
}

/**
 * Compute the Net Modifier (sum of all AP Hit Modifiers), see 4.4.3.2.2.
 * Capped at +2 / -10 per the rules.
 */
export function computeNetModifier(ctx: APHitContext): number {
  let net = 0;

  // Target Size modifier (always applies)
  net += ctx.targetSize;

  // Target Moving: -2
  if (ctx.targetIsMoving) net -= 2;

  // Target Cover: 0 / -1 / -3 / -5
  switch (ctx.targetCover) {
    case 'light':
      net -= 1;
      break;
    case 'medium':
      net -= 3;
      break;
    case 'heavy':
      net -= 5;
      break;
    case 'none':
      break;
  }

  // Short Halt with SB: 0 (and most WW2 vehicles are SB: 0): -4
  if (ctx.shooterCommand === 'SHORT_HALT' && ctx.shooterStabilization === 0) {
    net -= 4;
  }

  // Shooter Damaged: -3
  if (ctx.shooterDamaged) net -= 3;

  // Brew-Up Smoke: -2 per occurrence, cumulative
  net -= 2 * ctx.brewUpSmokeCount;

  // Overwatch fire modifiers
  if (ctx.isOverwatch) {
    net -= ctx.overwatchAdjust ? 3 : 1;
  }

  // Cap per rules: > +5 treated as +5, < -10 treated as -10
  if (net > 5) net = 5;
  if (net < -10) net = -10;

  return net;
}

/**
 * AP Hit Number table, see 4.4.3.2.3 / Game Card A.
 *
 * Rows: Net Modifier from +5 down to -10
 * Columns: Range Factor P / S / M / L / E
 *
 * 0 = impossible to hit (table shows "00" or "—")
 */
const AP_HIT_TABLE: Record<number, Record<RangeFactor, number>> = {
  5:  { P:  0, S:  0, M: 75, L: 45, E: 15 },
  4:  { P:  0, S: 98, M: 70, L: 42, E: 14 },
  3:  { P:  0, S: 91, M: 65, L: 39, E: 13 },
  2:  { P:  0, S: 84, M: 60, L: 36, E: 12 },
  1:  { P:  99, S:  77, M: 55, L: 33, E: 11 },
  0:  { P:  90, S:  70, M: 50, L: 30, E: 10 },
  '-1':  { P: 81, S: 63, M: 45, L: 27, E:  9 },
  '-2':  { P: 72, S: 56, M: 40, L: 24, E:  8 },
  '-3':  { P: 63, S: 49, M: 35, L: 21, E:  7 },
  '-4':  { P: 54, S: 42, M: 30, L: 18, E:  6 },
  '-5':  { P: 45, S: 35, M: 25, L: 15, E:  5 },
  '-6':  { P: 36, S: 28, M: 20, L: 12, E:  4 },
  '-7':  { P: 27, S: 21, M: 15, L:  9, E:  3 },
  '-8':  { P: 18, S: 14, M: 10, L:  6, E:  2 },
  '-9':  { P:  9, S:  7, M:  5, L:  3, E:  1 },
  '-10': { P:  1, S:  1, M:  1, L:  1, E:  0 },
};

export function getAPHitNumber(
  rangeFactor: RangeFactor,
  netModifier: number,
): number {
  const clamped = Math.max(-10, Math.min(5, netModifier));
  return AP_HIT_TABLE[clamped]![rangeFactor];
}

/**
 * Determine penetration result vs target armor, see 4.4.3.2.5–6.
 * Compares penetration to armor and returns the damage outcome.
 */
export function resolveAPDamage(
  penetration: number,
  armor: number,
): DamageOutcome {
  const delta = penetration - armor;
  if (delta < 0) return 'none';
  if (delta <= 3) return 'damaged';
  if (delta <= 9) return 'ko';
  return 'bu';
}

/**
 * Get penetration value for a given range factor.
 * Per 4.4.3.2.5, penetration is read from the P-Penetration sub-row.
 */
export function getPenetration(ammo: Ammo, rangeFactor: RangeFactor): number {
  return ammo.penetration[rangeFactor];
}

/**
 * Full AP fire resolution. Roll is injected for testability and reproducibility.
 * In production, pass a seeded PRNG; in tests, pass a fixed value.
 */
export interface ResolveAPFireInput {
  weapon: Weapon;
  ammoType: 'AP' | 'APCR' | 'HEAT';
  range: number;
  targetArmor: number; // already-selected facing's armor factor
  context: APHitContext;
  /** Roll 1-100 */
  roll: number;
}

export interface ResolveAPFireOutput {
  outOfRange: boolean;
  hit: HitOutcome | null;
  damage: DamageOutcome;
}

export function resolveAPFire(input: ResolveAPFireInput): ResolveAPFireOutput {
  const ammo = input.weapon.ammo.find((a) => a.type === input.ammoType);
  if (!ammo) throw new Error(`Weapon has no ${input.ammoType} ammo`);

  const rangeFactor = getRangeFactor(input.range, ammo);
  if (rangeFactor === null) {
    return { outOfRange: true, hit: null, damage: 'none' };
  }

  const netModifier = computeNetModifier(input.context);
  const hitNumber = getAPHitNumber(rangeFactor, netModifier);
  const isHit = input.roll <= hitNumber;

  const hit: HitOutcome = {
    hit: isHit,
    hitNumber,
    rangeFactor,
    netModifier,
    roll: input.roll,
  };

  if (!isHit) {
    return { outOfRange: false, hit, damage: 'none' };
  }

  const penetration = getPenetration(ammo, rangeFactor);
  const damage = resolveAPDamage(penetration, input.targetArmor);

  return { outOfRange: false, hit, damage };
}
