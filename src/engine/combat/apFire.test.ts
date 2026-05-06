import { describe, it, expect } from 'vitest';
import {
  computeNetModifier,
  getRangeFactor,
  resolveAPDamage,
  resolveAPFire,
} from './apFire';
import type { KEAmmo, APDamageThresholds } from '../units/types';

/**
 * These tests reproduce the example of play from Section 4.4.3.2.6
 * of the Consolidated Rules (May 2025), p.27.
 *
 * Scenario: T-34/76 M43 (Soviet) vs PzKpfw IVH (German), range 3.
 * - T-34 in Clear (no cover), with SHORT_HALT
 * - PzKpfw IVH in Woods (medium cover), with FIRE
 * - Both are SB:0
 */

const T34_AP: KEAmmo = {
  type: 'AP',
  label: '76.2mm-KE',
  ranges:      { P: 3,  S: 8,  M: 13, L: 19, E: 26 },
  penetration: { P: 19, S: 17, M: 14, L: 11, E: 8  },
  damage: { ND: 0, DM: [1, 3], KO: [4, 9], BU: [10, 10] },
};

const PZIV_AP: KEAmmo = {
  type: 'AP',
  label: '75mm-KE',
  ranges:      { P: 3,  S: 9,  M: 14, L: 20, E: 27 },
  penetration: { P: 25, S: 22, M: 18, L: 15, E: 11 },
  damage: { ND: 0, DM: [1, 3], KO: [4, 9], BU: [10, 10] },
};

describe('AP Combat — Rulebook example p.27', () => {
  describe('T-34/76 M43 fires first (First Player)', () => {
    it('computes Range Factor P at range 3', () => {
      expect(getRangeFactor(3, T34_AP)).toBe('P');
    });

    it('computes Net Modifier of -7 (medium cover -3, short halt -4)', () => {
      const net = computeNetModifier({
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
      });
      expect(net).toBe(-7);
    });

    it('penetration 19 vs armor 18 (delta 1) → Damaged', () => {
      expect(resolveAPDamage(19, 18, T34_AP.damage)).toBe('damaged');
    });
  });

  describe('PzKpfw IVH fires back (Second Player, now damaged target)', () => {
    it('computes Net Modifier of -5 (target moving -2, shooter damaged -3)', () => {
      const net = computeNetModifier({
        range: 3,
        targetSize: 0,
        targetCover: 'none',
        targetIsMoving: true,
        shooterCommand: 'FIRE',
        shooterStabilization: 0,
        shooterDamaged: true,
        isOverwatch: false,
        overwatchAdjust: false,
        brewUpSmokeCount: 0,
      });
      expect(net).toBe(-5);
    });

    it('penetration 25 vs armor 18 (delta 7) → KO', () => {
      expect(resolveAPDamage(25, 18, PZIV_AP.damage)).toBe('ko');
    });
  });
});

describe('AP Combat — boundary cases', () => {
  it('caps net modifier at +5', () => {
    const net = computeNetModifier({
      range: 1,
      targetSize: 2,
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
      targetCover: 'heavy',
      targetIsMoving: true,
      shooterCommand: 'SHORT_HALT',
      shooterStabilization: 0,
      shooterDamaged: true,
      isOverwatch: true,
      overwatchAdjust: true,
      brewUpSmokeCount: 1,
    });
    expect(net).toBe(-10);
  });

  it('returns null for out-of-range shots', () => {
    expect(getRangeFactor(27, T34_AP)).toBeNull();
  });

  const thresholds: APDamageThresholds = { ND: 0, DM: [1, 3], KO: [4, 9], BU: [10, 10] };

  it('delta 0 is "none" (≤ ND)', () => {
    expect(resolveAPDamage(15, 15, thresholds)).toBe('none');
  });

  it('delta 1 is "damaged"', () => {
    expect(resolveAPDamage(16, 15, thresholds)).toBe('damaged');
  });

  it('delta 4 is "ko"', () => {
    expect(resolveAPDamage(19, 15, thresholds)).toBe('ko');
  });

  it('delta 10 is "bu"', () => {
    expect(resolveAPDamage(25, 15, thresholds)).toBe('bu');
  });

  it('delta -1 is "none" (no penetration)', () => {
    expect(resolveAPDamage(14, 15, thresholds)).toBe('none');
  });
});

describe('Full resolveAPFire pipeline', () => {
  it('hits when roll <= hit number', () => {
    const result = resolveAPFire({
      ammo: [T34_AP],
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
