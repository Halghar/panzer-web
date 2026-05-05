import { describe, it, expect } from 'vitest';
import {
  computeNetModifier,
  getRangeFactor,
  resolveAPDamage,
  resolveAPFire,
} from './apFire';
import type { Ammo, Weapon } from '../units/types';

/**
 * These tests reproduce the example of play from Section 4.4.3.2.6
 * of the Consolidated Rules (May 2025), p.27.
 *
 * Scenario: T-34/76 M43 (Soviet) vs PzKpfw IVH (German), range 3.
 * - T-34 in Clear (no cover), with SHORT_HALT
 * - PzKpfw IVH in Woods (medium cover), with FIRE
 * - Both are SB:0
 */
describe('AP Combat — Rulebook example p.27', () => {
  describe('T-34/76 M43 fires first (First Player)', () => {
    it('computes Range Factor P at range 3', () => {
      const ammo: Ammo = {
        type: 'AP',
        ranges: { P: 3, S: 8, M: 13, L: 19, E: 26 },
        penetration: { P: 19, S: 17, M: 14, L: 11, E: 8 },
      };
      expect(getRangeFactor(3, ammo)).toBe('P');
    });

    it('computes Net Modifier of -7 (medium cover -3, short halt -4)', () => {
      const net = computeNetModifier({
        range: 3,
        targetSize: 0, // PzKpfw IVH
        targetCover: 'medium', // Woods
        targetIsMoving: false, // FIRE command, not moving
        shooterCommand: 'SHORT_HALT',
        shooterStabilization: 0,
        shooterDamaged: false,
        isOverwatch: false,
        overwatchAdjust: false,
        brewUpSmokeCount: 0,
      });
      expect(net).toBe(-7);
    });

    it('penetration 19 vs armor 18 produces Damaged result', () => {
      // Penetration exceeds armor by 1, which is in [1,3] range → Damaged
      expect(resolveAPDamage(19, 18)).toBe('damaged');
    });
  });

  describe('PzKpfw IVH fires back (Second Player, now damaged target)', () => {
    it('computes Net Modifier of -5 (target moving -2, shooter damaged -3)', () => {
      const net = computeNetModifier({
        range: 3,
        targetSize: 0, // T-34/76 M43
        targetCover: 'none', // Clear
        targetIsMoving: true, // T-34 had SHORT_HALT, counts as moving
        shooterCommand: 'FIRE',
        shooterStabilization: 0,
        shooterDamaged: true, // just took a Damaged hit
        isOverwatch: false,
        overwatchAdjust: false,
        brewUpSmokeCount: 0,
      });
      expect(net).toBe(-5);
    });

    it('penetration 25 vs armor 18 produces KO (delta = 7, in [4,9])', () => {
      expect(resolveAPDamage(25, 18)).toBe('ko');
    });
  });
});

describe('AP Combat — boundary cases', () => {
  it('caps net modifier at +2', () => {
    const net = computeNetModifier({
      range: 1,
      targetSize: 2, // big target, +2
      targetCover: 'none',
      targetIsMoving: false,
      shooterCommand: 'FIRE',
      shooterStabilization: 0,
      shooterDamaged: false,
      isOverwatch: false,
      overwatchAdjust: false,
      brewUpSmokeCount: 0,
    });
    expect(net).toBe(2);
  });

  it('caps net modifier at -10', () => {
    const net = computeNetModifier({
      range: 20,
      targetSize: -2,
      targetCover: 'heavy', // -5
      targetIsMoving: true, // -2
      shooterCommand: 'SHORT_HALT', // -4
      shooterStabilization: 0,
      shooterDamaged: true, // -3
      isOverwatch: true,
      overwatchAdjust: true, // -3
      brewUpSmokeCount: 1, // -2
    });
    // Sum = -2 -5 -2 -4 -3 -3 -2 = -21, capped to -10
    expect(net).toBe(-10);
  });

  it('returns null for out-of-range shots', () => {
    const ammo: Ammo = {
      type: 'AP',
      ranges: { P: 3, S: 8, M: 13, L: 19, E: 26 },
      penetration: { P: 19, S: 17, M: 14, L: 11, E: 8 },
    };
    expect(getRangeFactor(27, ammo)).toBeNull();
  });

  it('damage delta of 0 is "damaged" (1-3 range)', () => {
    expect(resolveAPDamage(15, 15)).toBe('damaged');
  });

  it('damage delta of 4 is "ko"', () => {
    expect(resolveAPDamage(19, 15)).toBe('ko');
  });

  it('damage delta of 10 is "bu"', () => {
    expect(resolveAPDamage(25, 15)).toBe('bu');
  });

  it('damage delta of -1 is "none"', () => {
    expect(resolveAPDamage(14, 15)).toBe('none');
  });
});

describe('Full resolveAPFire pipeline', () => {
  const t34Weapon: Weapon = {
    name: '76.2mm F-34',
    caliber: '76.2mm',
    fieldOfFire: 'turret',
    stabilization: 0,
    ammo: [
      {
        type: 'AP',
        ranges: { P: 3, S: 8, M: 13, L: 19, E: 26 },
        penetration: { P: 19, S: 17, M: 14, L: 11, E: 8 },
      },
    ],
  };

  it('hits when roll <= hit number', () => {
    const result = resolveAPFire({
      weapon: t34Weapon,
      ammoType: 'AP',
      range: 3,
      targetArmor: 18,
      roll: 12,
      context: {
        range: 3,
        targetSize: 0,
        targetCover: 'medium',
        targetIsMoving: false,
        shooterCommand: 'SHORT_HALT',
        shooterStabilization: 0,
        shooterDamaged: false,
        isOverwatch: false,
        overwatchAdjust: false,
        brewUpSmokeCount: 0,
      },
    });
    expect(result.outOfRange).toBe(false);
    expect(result.hit?.hit).toBe(true);
    expect(result.damage).toBe('damaged');
  });
});
