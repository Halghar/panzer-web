import { describe, it, expect } from 'vitest';
import {
  combatPhase,
  determineHitAngle,
  primaryDirection,
  getBasicArmorValue,
  canShooterReachTarget,
  isInFrontArc,
  resolveOverwatchFire,
} from './phase';
import { T34_76_M43, PZKPFW_IVH, SU76M_M43 } from '../units/blueprints';
import type { Unit, HexData } from '../state/types';
import type { CombatPhaseInput } from './phase';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeUnit(overrides: Partial<Unit> & Pick<Unit, 'instanceId' | 'blueprintId' | 'side'>): Unit {
  return {
    q: 0,
    r: 0,
    facing: 0,
    command: 'FIRE',
    lastCommand: 'NO_COMMAND',
    damage: 'ok',
    spotStatus: 'spottedByFire',
    hasActed: false,
    canSpot: true,
    moved: false,
    fired: false,
    ...overrides,
  };
}

const BLUEPRINTS = {
  [T34_76_M43.id]: T34_76_M43,
  [PZKPFW_IVH.id]: PZKPFW_IVH,
  [SU76M_M43.id]:  SU76M_M43,
};

const CLEAR_MAP: Record<string, HexData> = {};

// ---------------------------------------------------------------------------
// primaryDirection
// ---------------------------------------------------------------------------

describe('primaryDirection', () => {
  it('returns 0 (east) for a target directly east', () => {
    expect(primaryDirection({ q: 0, r: 0 }, { q: 5, r: 0 })).toBe(0);
  });

  it('returns 3 (west) for a target directly west', () => {
    expect(primaryDirection({ q: 0, r: 0 }, { q: -5, r: 0 })).toBe(3);
  });

  it('returns 1 (NE) for a target to the NE', () => {
    expect(primaryDirection({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(1);
  });

  it('returns 4 (SW) for a target to the SW', () => {
    expect(primaryDirection({ q: 0, r: 0 }, { q: -3, r: 3 })).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// determineHitAngle
// ---------------------------------------------------------------------------

describe('determineHitAngle — Basic Game front/rear', () => {
  it('FRONT: unit facing 0 (east), shooter to the east', () => {
    // Unit faces east (dir 0). Shooter at q+5 is directly east = in front arc.
    const target = { q: 0, r: 0, facing: 0 as const };
    expect(determineHitAngle(target, { q: 5, r: 0 })).toBe('front');
  });

  it('REAR: unit facing 0 (east), shooter to the west', () => {
    const target = { q: 0, r: 0, facing: 0 as const };
    expect(determineHitAngle(target, { q: -5, r: 0 })).toBe('rear');
  });

  it('FRONT: unit facing 3 (west), shooter to the west', () => {
    const target = { q: 0, r: 0, facing: 3 as const };
    expect(determineHitAngle(target, { q: -5, r: 0 })).toBe('front');
  });

  it('REAR: unit facing 3 (west), shooter to the east', () => {
    const target = { q: 0, r: 0, facing: 3 as const };
    expect(determineHitAngle(target, { q: 5, r: 0 })).toBe('rear');
  });

  it('FRONT: shooter in adjacent front-left hex (facing ±1 arc)', () => {
    // Facing 0 → front arc = {5, 0, 1}. Dir 1 = NE.
    const target = { q: 0, r: 0, facing: 0 as const };
    expect(determineHitAngle(target, { q: 3, r: -3 })).toBe('front'); // NE = dir 1
  });
});

// ---------------------------------------------------------------------------
// getBasicArmorValue
// ---------------------------------------------------------------------------

describe('getBasicArmorValue', () => {
  it('T-34/76 M43 front armor = HF = 18', () => {
    expect(getBasicArmorValue(T34_76_M43, 'front')).toBe(18);
  });

  it('T-34/76 M43 rear armor = HR = 9', () => {
    expect(getBasicArmorValue(T34_76_M43, 'rear')).toBe(9);
  });

  it('PzKpfw IVH front armor = HF = 18', () => {
    expect(getBasicArmorValue(PZKPFW_IVH, 'front')).toBe(18);
  });

  it('PzKpfw IVH rear armor = HR = 8', () => {
    expect(getBasicArmorValue(PZKPFW_IVH, 'rear')).toBe(8);
  });

  it('SU-76M M43 front armor = HF = 14', () => {
    expect(getBasicArmorValue(SU76M_M43, 'front')).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Field-of-Fire helpers
// ---------------------------------------------------------------------------

describe('canShooterReachTarget / isInFrontArc', () => {
  const turreted = makeUnit({ instanceId: 't34', blueprintId: 't34_76_m43', side: 'allied', q: 0, r: 0, facing: 0 });
  const frontFixed = makeUnit({ instanceId: 'su76', blueprintId: 'su76m_m43', side: 'allied', q: 0, r: 0, facing: 0 });

  it('turreted vehicle can fire in any direction', () => {
    expect(canShooterReachTarget(turreted, T34_76_M43, { q: -5, r: 0 })).toBe(true); // rear
    expect(canShooterReachTarget(turreted, T34_76_M43, { q: 5, r: 0 })).toBe(true);  // front
  });

  it('frontFixed vehicle can only fire into front arc', () => {
    expect(canShooterReachTarget(frontFixed, SU76M_M43, { q: 5, r: 0 })).toBe(true);  // directly ahead (dir 0)
    expect(canShooterReachTarget(frontFixed, SU76M_M43, { q: -5, r: 0 })).toBe(false); // directly behind (dir 3)
  });

  it('isInFrontArc correctly partitions the six directions', () => {
    // Facing 0 → front arc = {5, 0, 1}
    expect(isInFrontArc({ q: 0, r: 0, facing: 0 }, { q: 5, r: 0 })).toBe(true);    // dir 0 (E)
    expect(isInFrontArc({ q: 0, r: 0, facing: 0 }, { q: 3, r: -3 })).toBe(true);  // dir 1 (NE)
    expect(isInFrontArc({ q: 0, r: 0, facing: 0 }, { q: 0, r: 5 })).toBe(true);   // dir 5 (S)
    expect(isInFrontArc({ q: 0, r: 0, facing: 0 }, { q: -5, r: 0 })).toBe(false); // dir 3 (W) — rear
  });
});

// ---------------------------------------------------------------------------
// Rulebook example — Section 4.4.3.2.6 p.27
// (T-34/76 M43 vs PzKpfw IVH at range 3, clear/woods, first player T-34)
// ---------------------------------------------------------------------------

describe('combatPhase — rulebook example p.27', () => {
  /*
   * Setup:
   *   t34_1  (allied, SHORT_HALT) at q=0,r=0, facing 0 (east)
   *   pziv_1 (axis,  FIRE)        at q=3,r=0, facing 3 (west, i.e. facing the T-34)
   *
   * T-34 is in clear (no cover), Pz.IV is in woods (medium cover).
   * First player = allied.
   *
   * Shot 1 (T-34 → Pz.IV):
   *   Range 3 → factor P
   *   netMod = size 0 + medium cover -3 + SHORT_HALT -4 = -7
   *   hitNumber at P/-7 = 27
   *   We force roll=12 → HIT
   *   Shooter at q=0 is to the WEST of Pz.IV at q=3; Pz.IV facing=3 (west) → front arc hits west → FRONT
   *   Armor HF=18, pen P=19, diff=1 → Damaged
   *
   * Shot 2 (Pz.IV → T-34) — Pz.IV is now Damaged:
   *   Range 3 → factor P
   *   netMod = size 0 + no cover + target moving (SHORT_HALT counts as moving) -2 + shooter damaged -3 = -5
   *   hitNumber at P/-5 = 45
   *   We force roll=40 → HIT
   *   Shooter (Pz.IV at q=3) is to EAST of T-34 (q=0); T-34 facing=0 (east) → front arc includes east → FRONT
   *   Armor HF=18, pen P=25, diff=7 → KO
   */
  const woodsMap: Record<string, HexData> = {
    '3,0': { terrain: 'woods', elevation: 0 },
  };

  const t34 = makeUnit({
    instanceId: 't34_1',
    blueprintId: 't34_76_m43',
    side: 'allied',
    q: 0, r: 0, facing: 0,
    command: 'SHORT_HALT',
  });

  const pziv = makeUnit({
    instanceId: 'pziv_1',
    blueprintId: 'pzkpfw_ivh',
    side: 'axis',
    q: 3, r: 0, facing: 3, // facing west = facing toward T-34
    command: 'FIRE',
  });

  const input: CombatPhaseInput = {
    declarations: [
      { shooterId: 't34_1',  targetId: 'pziv_1', ammoType: 'AP' },
      { shooterId: 'pziv_1', targetId: 't34_1',  ammoType: 'AP' },
    ],
    units: { t34_1: t34, pziv_1: pziv },
    blueprints: BLUEPRINTS,
    hexMap: woodsMap,
    firstPlayer: 'allied',
    rolls: [12, 40], // shot 1: hit; shot 2: hit
  };

  it('resolves both shots correctly', () => {
    const { shots, updatedUnits } = combatPhase(input);
    expect(shots).toHaveLength(2);

    const s1 = shots[0]!;
    expect(s1.shooterId).toBe('t34_1');
    expect(s1.rangeHexes).toBe(3);
    expect(s1.rangeFactor).toBe('P');
    expect(s1.netModifier).toBe(-7);
    expect(s1.hitNumber).toBe(27);
    expect(s1.diceRoll).toBe(12);
    expect(s1.hit).toBe(true);
    expect(s1.hitAngle).toBe('front'); // T-34 to west, Pz.IV faces west → front hit
    expect(s1.armorFactor).toBe(18);
    expect(s1.penetrationFactor).toBe(19);
    expect(s1.difference).toBe(1);
    expect(s1.result).toBe('damaged');

    const s2 = shots[1]!;
    expect(s2.shooterId).toBe('pziv_1');
    expect(s2.rangeFactor).toBe('P');
    expect(s2.netModifier).toBe(-5); // moving -2, shooter damaged -3
    expect(s2.hitNumber).toBe(45);
    expect(s2.hit).toBe(true);
    expect(s2.hitAngle).toBe('front'); // Pz.IV to east, T-34 faces east → front hit
    expect(s2.armorFactor).toBe(18);
    expect(s2.penetrationFactor).toBe(25);
    expect(s2.difference).toBe(7);
    expect(s2.result).toBe('ko');

    // Unit states after combat
    expect(updatedUnits['pziv_1']!.damage).toBe('damaged');
    expect(updatedUnits['t34_1']!.damage).toBe('ko');
  });

  it('marks shooters as hasActed and fired', () => {
    const { updatedUnits } = combatPhase(input);
    expect(updatedUnits['t34_1']!.hasActed).toBe(true);
    expect(updatedUnits['t34_1']!.fired).toBe(true);
    expect(updatedUnits['pziv_1']!.hasActed).toBe(true);
    expect(updatedUnits['pziv_1']!.fired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Second Player unit KO'd before its turn cannot fire
// ---------------------------------------------------------------------------

describe('combatPhase — KO unit cannot fire back', () => {
  const shooter = makeUnit({
    instanceId: 'allied_1',
    blueprintId: 'pzkpfw_ivh',
    side: 'allied',
    q: 0, r: 0, facing: 0,
    command: 'FIRE',
  });

  const victim = makeUnit({
    instanceId: 'axis_1',
    blueprintId: 't34_76_m43',
    side: 'axis',
    q: 3, r: 0, facing: 3,
    command: 'FIRE',
  });

  // Pz.IV (allied) fires at T-34 (axis). Pen=25 vs armor=18 → diff=7 → KO.
  // T-34 (axis) would fire back, but is already KO → skip.
  const input: CombatPhaseInput = {
    declarations: [
      { shooterId: 'allied_1', targetId: 'axis_1',  ammoType: 'AP' },
      { shooterId: 'axis_1',   targetId: 'allied_1', ammoType: 'AP' },
    ],
    units: { allied_1: shooter, axis_1: victim },
    blueprints: BLUEPRINTS,
    hexMap: CLEAR_MAP,
    firstPlayer: 'allied',
    rolls: [10, 50], // roll 10 guarantees a hit at P range; roll 50 would be used if T-34 fires
  };

  it('only one shot is resolved — victim skipped after being KO-ed', () => {
    const { shots, updatedUnits } = combatPhase(input);
    // T-34 becomes KO after shot 1, so it is skipped in the axis turn
    expect(shots).toHaveLength(1);
    expect(shots[0]!.result).toBe('ko');
    expect(updatedUnits['axis_1']!.damage).toBe('ko');
    // Pz.IV should be unharmed
    expect(updatedUnits['allied_1']!.damage).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Already-Damaged unit hit again → KO
// ---------------------------------------------------------------------------

describe('combatPhase — damaged unit hit again becomes KO', () => {
  const shooter = makeUnit({
    instanceId: 'allied_1',
    blueprintId: 'pzkpfw_ivh',
    side: 'allied',
    q: 0, r: 0, facing: 0,
    command: 'FIRE',
  });

  const predam = makeUnit({
    instanceId: 'axis_1',
    blueprintId: 't34_76_m43',
    side: 'axis',
    q: 3, r: 0, facing: 3,
    command: 'NO_COMMAND',
    damage: 'damaged', // already hit
  });

  const input: CombatPhaseInput = {
    declarations: [{ shooterId: 'allied_1', targetId: 'axis_1', ammoType: 'AP' }],
    units: { allied_1: shooter, axis_1: predam },
    blueprints: BLUEPRINTS,
    hexMap: CLEAR_MAP,
    firstPlayer: 'allied',
    rolls: [10], // guaranteed hit, pen 25 vs armor 18, diff 7 → 'ko' result from resolveAPDamage
                 // but target was already 'damaged', so applyDamageResult escalates 'damaged'→'ko'
  };

  it('escalates damaged + damaged hit → KO', () => {
    const { shots, updatedUnits } = combatPhase(input);
    // The ammo result is 'ko' (diff=7) regardless; unit was already damaged → ko
    expect(shots[0]!.result).toBe('ko');
    expect(updatedUnits['axis_1']!.damage).toBe('ko');
  });
});

// ---------------------------------------------------------------------------
// Out-of-range shot
// ---------------------------------------------------------------------------

describe('combatPhase — out-of-range shot', () => {
  const shooter = makeUnit({
    instanceId: 'allied_1',
    blueprintId: 't34_76_m43',
    side: 'allied',
    q: 0, r: 0, facing: 0,
    command: 'FIRE',
  });

  const farTarget = makeUnit({
    instanceId: 'axis_1',
    blueprintId: 'pzkpfw_ivh',
    side: 'axis',
    q: 30, r: 0, facing: 3, // 30 hexes > T-34 AP extreme range 26
  });

  const input: CombatPhaseInput = {
    declarations: [{ shooterId: 'allied_1', targetId: 'axis_1', ammoType: 'AP' }],
    units: { allied_1: shooter, axis_1: farTarget },
    blueprints: BLUEPRINTS,
    hexMap: CLEAR_MAP,
    firstPlayer: 'allied',
    rolls: [1],
  };

  it('returns out_of_range result', () => {
    const { shots } = combatPhase(input);
    expect(shots[0]!.result).toBe('out_of_range');
    expect(shots[0]!.rangeFactor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No-penetration shot
// ---------------------------------------------------------------------------

describe('combatPhase — no penetration', () => {
  // SU-76 (pen P=19) fires at T-34 rear armor (HR=9): diff=10 → BU
  // But let's use front armor (HF=18) at extreme range: pen E=12 vs armor 18, diff=-6 → no_penetration
  const shooter = makeUnit({
    instanceId: 'su76_1',
    blueprintId: 'su76m_m43',
    side: 'allied',
    q: 0, r: 0, facing: 0,
    command: 'FIRE',
  });

  const target = makeUnit({
    instanceId: 'pziv_1',
    blueprintId: 'pzkpfw_ivh',
    side: 'axis',
    q: 17, r: 0, facing: 3, // range 17 = Extreme for SU-76 AP (E≤17), pen E=12 vs HF=18
    command: 'NO_COMMAND',
  });

  const input: CombatPhaseInput = {
    declarations: [{ shooterId: 'su76_1', targetId: 'pziv_1', ammoType: 'AP' }],
    units: { su76_1: shooter, pziv_1: target },
    blueprints: BLUEPRINTS,
    hexMap: CLEAR_MAP,
    firstPlayer: 'allied',
    rolls: [1], // force hit
  };

  it('reports no_penetration when pen < armor', () => {
    const { shots, updatedUnits } = combatPhase(input);
    expect(shots[0]!.rangeFactor).toBe('E');
    expect(shots[0]!.penetrationFactor).toBe(12);
    expect(shots[0]!.armorFactor).toBe(18);
    expect(shots[0]!.difference).toBe(-6);
    expect(shots[0]!.result).toBe('no_penetration');
    // No damage applied
    expect(updatedUnits['pziv_1']!.damage).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Overwatch Fire — modifiers applied correctly
// ---------------------------------------------------------------------------

describe('resolveOverwatchFire', () => {
  const shooter = makeUnit({
    instanceId: 't34_1',
    blueprintId: 't34_76_m43',
    side: 'allied',
    q: 0, r: 0, facing: 0,
    command: 'OVERWATCH',
  });

  const targetInFoF = makeUnit({
    instanceId: 'pziv_1',
    blueprintId: 'pzkpfw_ivh',
    side: 'axis',
    q: 5, r: 0, facing: 3, // directly east = in front arc of T-34
    command: 'MOVE',
  });

  const targetOutFoF = makeUnit({
    instanceId: 'pziv_2',
    blueprintId: 'pzkpfw_ivh',
    side: 'axis',
    q: -5, r: 0, facing: 0, // directly west = outside front arc
    command: 'MOVE',
  });

  it('applies OW modifier -1 when target is in front FoF', () => {
    const units = { t34_1: shooter, pziv_1: targetInFoF };
    const result = resolveOverwatchFire({
      shooterId: 't34_1',
      targetId: 'pziv_1',
      units,
      blueprints: BLUEPRINTS,
      hexMap: CLEAR_MAP,
      roll: 99, // miss; we only care about modifiers
    });
    // netMod = targetSize 0 + targetMoving -2 + OW -1 = -3
    expect(result.netModifier).toBe(-3);
  });

  it('applies OW Adjust modifier -3 when target is outside front FoF (turreted)', () => {
    const units = { t34_1: shooter, pziv_2: targetOutFoF };
    const result = resolveOverwatchFire({
      shooterId: 't34_1',
      targetId: 'pziv_2',
      units,
      blueprints: BLUEPRINTS,
      hexMap: CLEAR_MAP,
      roll: 99,
    });
    // netMod = targetSize 0 + targetMoving -2 + OW Adjust -3 = -5
    expect(result.netModifier).toBe(-5);
  });

  it('non-turreted frontFixed vehicle cannot do OW Adjust (uses -1 only)', () => {
    // SU-76 fires OW at a target outside its front arc — but since it's
    // frontFixed it cannot reach, so we place the target inside the FoF.
    const su76 = makeUnit({
      instanceId: 'su76_1',
      blueprintId: 'su76m_m43',
      side: 'allied',
      q: 0, r: 0, facing: 0,
      command: 'OVERWATCH',
    });
    const axisUnit = makeUnit({
      instanceId: 'axis_1',
      blueprintId: 'pzkpfw_ivh',
      side: 'axis',
      q: 5, r: 0, facing: 3, // in front arc of SU-76
      command: 'MOVE',
    });
    const units = { su76_1: su76, axis_1: axisUnit };
    const result = resolveOverwatchFire({
      shooterId: 'su76_1',
      targetId: 'axis_1',
      units,
      blueprints: BLUEPRINTS,
      hexMap: CLEAR_MAP,
      roll: 99,
    });
    // frontFixed → overwatchAdjust cannot apply → only -1
    // netMod = 0 + targetMoving -2 + OW -1 = -3
    expect(result.netModifier).toBe(-3);
  });
});
