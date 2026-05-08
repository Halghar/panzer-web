/**
 * Combat Phase orchestration — Section 4.4 of the Consolidated Rules.
 *
 * Pure functions only: no state mutation, no rendering, no I/O.
 *
 * Entry points:
 *   combatPhase()           — Direct Fire Step (4.4.1)
 *   resolveOverwatchFire()  — Overwatch Fire hook for Movement Phase (4.4.2)
 */

import { hexDistance } from '../hex/coords';
import type { Axial } from '../hex/coords';
import type { Unit, HexData, Side, HexDirection } from '../state/types';
import { coverForUnit } from '../state/types';
import type { VehicleData, RangeFactor, KEAmmo } from '../units/types';
import {
  getRangeFactor,
  computeNetModifier,
  getAPHitNumber,
  getPenetration,
  resolveAPDamage,
} from './apFire';
import type { APHitContext } from './apFire';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ShotResultType =
  | 'miss'
  | 'out_of_range'
  | 'no_penetration'
  | 'no_effect'
  | 'damaged'
  | 'ko'
  | 'bu';

export type HitAngle = 'front' | 'rear';

/** Player's fire declaration: who shoots at whom, with what ammo. */
export interface FireDeclaration {
  shooterId: string;
  targetId: string;
  /** Defaults to 'AP' when omitted. */
  ammoType?: 'AP' | 'HVAP' | 'APCR' | 'HEAT';
}

/** Full record of a single AP shot resolution — one per FireDeclaration. */
export interface ShotResult {
  shooterId: string;
  targetId: string;
  /** Step A — range in hexes */
  rangeHexes: number;
  rangeFactor: RangeFactor | null;
  /** Step B — clamped net modifier (-10 to +5) */
  netModifier: number;
  /** Step C — AP Hit Table threshold */
  hitNumber: number;
  diceRoll: number;
  hit: boolean;
  /** Step D — Basic Game: FRONT or REAR only */
  hitAngle: HitAngle | null;
  /** Step E — armor value selected for this hit */
  armorFactor: number | null;
  penetrationFactor: number | null;
  difference: number | null;
  /** Step F — final damage result */
  result: ShotResultType;
}

export interface CombatPhaseInput {
  /** Ordered list of declared shots. Processed First Player first, then Second. */
  declarations: FireDeclaration[];
  units: Record<string, Unit>;
  blueprints: Record<string, VehicleData>;
  hexMap: Record<string, HexData>;
  firstPlayer: Side;
  /**
   * Pre-rolled d100 values (1-100), one per declaration.
   * If the list is shorter than `declarations`, missing rolls are generated at
   * random — supply the full list for deterministic tests.
   */
  rolls: number[];
}

export interface CombatPhaseResult {
  shots: ShotResult[];
  /** Unit states after all damage is applied. */
  updatedUnits: Record<string, Unit>;
}

export interface OverwatchInput {
  shooterId: string;
  targetId: string;
  /** Shared unit state; mutated in-place with any damage applied. */
  units: Record<string, Unit>;
  blueprints: Record<string, VehicleData>;
  hexMap: Record<string, HexData>;
  roll: number;
  ammoType?: 'AP' | 'HVAP' | 'APCR' | 'HEAT';
}

// ---------------------------------------------------------------------------
// Hex geometry helpers
// ---------------------------------------------------------------------------

/**
 * The 6 cube-coordinate unit direction vectors, indexed 0-5
 * (same ordering as hexNeighbors).
 */
const CUBE_DIRS = [
  [1, 0, -1], [1, -1, 0], [0, -1, 1],
  [-1, 0, 1], [-1, 1, 0], [0, 1, -1],
] as const;

/**
 * Returns the 0-5 direction index that best represents the direction
 * from `from` to `to`. Uses the maximum dot-product with cube-direction
 * unit vectors — robust for non-adjacent hexes.
 */
export function primaryDirection(from: Axial, to: Axial): number {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  const ds = -dq - dr;

  let bestDir = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < 6; i++) {
    const [cq, cr, cs] = CUBE_DIRS[i]!;
    const dot = cq * dq + cr * dr + cs * ds;
    if (dot > bestDot) { bestDot = dot; bestDir = i; }
  }
  return bestDir;
}

/** Front arc of a unit: the 3 directions centred on its facing. */
function frontArcOf(facing: HexDirection): Set<number> {
  return new Set([(facing + 5) % 6, facing, (facing + 1) % 6]);
}

/**
 * Basic Game hit-angle determination (4.4.3.2.4).
 * Returns 'front' if the shot comes from the target's front arc, 'rear' otherwise.
 *
 * When the line of fire grazes exactly the front/rear boundary hexside the
 * caller (player controlling the target) should choose; this function defaults
 * to 'front' for that edge case (dot products are equal).
 */
export function determineHitAngle(
  target: { q: number; r: number; facing: HexDirection },
  shooterPos: Axial,
): HitAngle {
  const dir = primaryDirection(target, shooterPos);
  return frontArcOf(target.facing).has(dir) ? 'front' : 'rear';
}

/**
 * Basic Game armor value (4.4.3.2.5).
 * Uses the frontOrRear.level row (elevation simplified away for Basic Game).
 * Front = HF (Hull Front), Rear = HR (Hull Rear), matching the Notes-section
 * "Armor Front Factor / Rear Factor" format on the Data Card.
 */
export function getBasicArmorValue(blueprint: VehicleData, angle: HitAngle): number {
  const row = blueprint.armor.frontOrRear.level;
  return angle === 'front' ? row.HF : row.HR;
}

/** True if `targetPos` falls inside the shooter's front Field-of-Fire arc. */
export function isInFrontArc(
  shooter: { q: number; r: number; facing: HexDirection },
  targetPos: Axial,
): boolean {
  return frontArcOf(shooter.facing).has(primaryDirection(shooter, targetPos));
}

/**
 * True if the shooter's weapon can reach `targetPos` given its Field-of-Fire type.
 *   turret / turretless360 → any direction
 *   frontFixed → front arc only
 *   rearFixed  → rear arc only
 */
export function canShooterReachTarget(
  shooter: Unit,
  blueprint: VehicleData,
  targetPos: Axial,
): boolean {
  const fof = blueprint.fieldOfFire;
  if (fof === 'turret' || fof === 'turretless360') return true;
  if (fof === 'frontFixed') return isInFrontArc(shooter, targetPos);
  if (fof === 'rearFixed') {
    const dir = primaryDirection(shooter, targetPos);
    const f = shooter.facing;
    return new Set([(f + 2) % 6, (f + 3) % 6, (f + 4) % 6]).has(dir);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function keAmmoOf(
  blueprint: VehicleData,
  type: 'AP' | 'HVAP' | 'APCR' | 'HEAT',
): KEAmmo | undefined {
  return blueprint.ammo.find((a): a is KEAmmo => a.type === type);
}

function isEliminated(damage: Unit['damage']): boolean {
  return damage === 'ko' || damage === 'bu';
}

function applyDamageResult(
  current: Unit['damage'],
  result: 'damaged' | 'ko' | 'bu',
): Unit['damage'] {
  if (result === 'bu') return 'bu';
  if (result === 'ko') return 'ko';
  // Damaged + already damaged → KO (4.4.3.2.6)
  return current === 'damaged' ? 'ko' : 'damaged';
}

// ---------------------------------------------------------------------------
// Core single-shot resolver
// ---------------------------------------------------------------------------

export interface ResolveShotOptions {
  declaration: FireDeclaration;
  /**
   * Shared mutable unit map. Damage is applied in-place so that subsequent
   * shots within the same phase see updated unit states.
   */
  liveUnits: Record<string, Unit>;
  blueprints: Record<string, VehicleData>;
  hexMap: Record<string, HexData>;
  roll: number;
  isOverwatch?: boolean;
}

/**
 * Resolve a single AP shot (steps A-F, 4.4.3.2.1-6).
 *
 * SIDE EFFECT: mutates `options.liveUnits[declaration.targetId].damage` on a hit.
 * This is intentional — sequential resolution within a phase must see updated state.
 */
export function resolveSingleShot(options: ResolveShotOptions): ShotResult {
  const { declaration: decl, liveUnits, blueprints, hexMap, roll } = options;
  const isOverwatch = options.isOverwatch ?? false;
  const ammoType = decl.ammoType ?? 'AP';

  const shooter = liveUnits[decl.shooterId]!;
  const target = liveUnits[decl.targetId]!;
  const shooterBP = blueprints[shooter.blueprintId]!;
  const targetBP = blueprints[target.blueprintId]!;
  const ammoEntry = keAmmoOf(shooterBP, ammoType);

  const targetPos: Axial = { q: target.q, r: target.r };
  const rangeHexes = hexDistance({ q: shooter.q, r: shooter.r }, targetPos);

  // Step B — net modifier
  const overwatchAdjust =
    isOverwatch &&
    (shooterBP.fieldOfFire === 'turret' || shooterBP.fieldOfFire === 'turretless360') &&
    !isInFrontArc(shooter, targetPos);

  const context: APHitContext = {
    range: rangeHexes,
    targetSize: targetBP.size,
    targetCover: coverForUnit(target, hexMap),
    targetIsMoving: target.command === 'MOVE' || target.command === 'SHORT_HALT',
    shooterCommand: shooter.command,
    shooterStabilization: shooterBP.Sb,
    shooterDamaged: shooter.damage === 'damaged',
    isOverwatch,
    overwatchAdjust,
    brewUpSmokeCount: 0,
  };
  const netModifier = computeNetModifier(context);

  const base = {
    shooterId: decl.shooterId,
    targetId: decl.targetId,
    rangeHexes,
    netModifier,
  };

  // Step A — range factor
  if (!ammoEntry) {
    return { ...base, rangeFactor: null, hitNumber: 0, diceRoll: roll, hit: false, hitAngle: null, armorFactor: null, penetrationFactor: null, difference: null, result: 'out_of_range' };
  }
  const rangeFactor = getRangeFactor(rangeHexes, ammoEntry);
  if (rangeFactor === null) {
    return { ...base, rangeFactor: null, hitNumber: 0, diceRoll: roll, hit: false, hitAngle: null, armorFactor: null, penetrationFactor: null, difference: null, result: 'out_of_range' };
  }

  // Step C — hit roll
  const hitNumber = getAPHitNumber(rangeFactor, netModifier);
  const hit = roll <= hitNumber;

  if (!hit) {
    return { ...base, rangeFactor, hitNumber, diceRoll: roll, hit: false, hitAngle: null, armorFactor: null, penetrationFactor: null, difference: null, result: 'miss' };
  }

  // Step D — hit angle
  const hitAngle = determineHitAngle(target, { q: shooter.q, r: shooter.r });

  // Step E — armor vs penetration
  const armorFactor = getBasicArmorValue(targetBP, hitAngle);
  const penetrationFactor = getPenetration(ammoEntry, rangeFactor);
  const difference = penetrationFactor - armorFactor;

  // Step F — damage result
  const dmgOutcome = resolveAPDamage(penetrationFactor, armorFactor, ammoEntry.damage);
  let result: ShotResultType;
  if (difference < 0) {
    result = 'no_penetration';
  } else if (dmgOutcome === 'none') {
    result = 'no_effect';
  } else {
    result = dmgOutcome; // 'damaged' | 'ko' | 'bu'
  }

  // Apply damage to unit in the shared map
  if (result === 'damaged' || result === 'ko' || result === 'bu') {
    const currentTarget = liveUnits[decl.targetId]!;
    liveUnits[decl.targetId] = {
      ...currentTarget,
      damage: applyDamageResult(currentTarget.damage, result),
    };
  }

  return { ...base, rangeFactor, hitNumber, diceRoll: roll, hit: true, hitAngle, armorFactor, penetrationFactor, difference, result };
}

// ---------------------------------------------------------------------------
// Direct Fire Step (4.4.1)
// ---------------------------------------------------------------------------

/**
 * Execute the Direct Fire Step of the Combat Phase.
 *
 * Fire order:
 *   1. First Player's units (FIRE or SHORT_HALT command) in declaration order.
 *   2. Second Player's units — any unit KO'd/BU'd in step 1 is skipped.
 *
 * All shots are declared in advance via `input.declarations`; targets cannot
 * be changed mid-resolution even if the target is already eliminated (4.4.1).
 */
export function combatPhase(input: CombatPhaseInput): CombatPhaseResult {
  const { declarations, units, blueprints, hexMap, firstPlayer, rolls } = input;
  const secondPlayer: Side = firstPlayer === 'allied' ? 'axis' : 'allied';

  // Working copy — mutated as damage is applied
  const liveUnits: Record<string, Unit> = Object.fromEntries(
    Object.entries(units).map(([k, v]) => [k, { ...v }]),
  );

  const shots: ShotResult[] = [];
  let rollIdx = 0;

  function nextRoll(): number {
    const r = rolls[rollIdx] ?? (Math.floor(Math.random() * 100) + 1);
    rollIdx++;
    return r;
  }

  function processGroup(side: Side): void {
    const group = declarations.filter((d) => liveUnits[d.shooterId]?.side === side);

    for (const decl of group) {
      const shooter = liveUnits[decl.shooterId];
      // Skip if shooter is gone, eliminated, ineligible, or already acted
      if (!shooter) continue;
      if (isEliminated(shooter.damage)) continue;
      if (shooter.command !== 'FIRE' && shooter.command !== 'SHORT_HALT') continue;
      if (shooter.hasActed) continue;
      // Skip if target doesn't exist (shouldn't happen in normal play)
      if (!liveUnits[decl.targetId]) continue;

      const roll = nextRoll();
      const shot = resolveSingleShot({ declaration: decl, liveUnits, blueprints, hexMap, roll, isOverwatch: false });
      shots.push(shot);

      // Mark shooter as having acted this turn (place SPOT/FIRE counter)
      liveUnits[decl.shooterId] = { ...liveUnits[decl.shooterId]!, hasActed: true, fired: true };
    }
  }

  processGroup(firstPlayer);
  processGroup(secondPlayer);

  return { shots, updatedUnits: liveUnits };
}

// ---------------------------------------------------------------------------
// Overwatch Fire (4.4.2) — hook for Movement Phase
// ---------------------------------------------------------------------------

/**
 * Resolve a single Overwatch shot triggered during the Movement Phase.
 *
 * The -1 (in-FoF) or -3 (OW Adjust, out-of-FoF) modifier is applied
 * automatically based on the shooter's Field-of-Fire and target position.
 *
 * SIDE EFFECT: mutates `input.units` with any damage applied.
 */
export function resolveOverwatchFire(input: OverwatchInput): ShotResult {
  return resolveSingleShot({
    declaration: {
      shooterId: input.shooterId,
      targetId: input.targetId,
      ammoType: input.ammoType ?? 'AP',
    },
    liveUnits: input.units,
    blueprints: input.blueprints,
    hexMap: input.hexMap,
    roll: input.roll,
    isOverwatch: true,
  });
}
