/**
 * Core domain types for Panzer.
 *
 * Structure mirrors the GMT Data Card layout:
 *   - Offensive Information table (ammo, range, penetration, damage)
 *   - Defensive Information table (armor per facing × elevation)
 */

export type Nation = 'german' | 'soviet' | 'us' | 'british' | 'italian';

/** Target Size modifier — Defensive Information section */
export type TargetSize = -2 | -1 | 0 | 1 | 2;

/** Cover types, see 4.1.3 / Terrain Effects Table */
export type { CoverLevel as CoverType } from '../terrain/types';

/** AP Range Factors, see 4.4.3.2.1 */
export type RangeFactor = 'P' | 'S' | 'M' | 'L' | 'E';

/**
 * Field-of-Fire types, see 4.4.3.1.
 *   turret        — 360° rotating turret
 *   turretless360 — no turret but full 360° coverage
 *   frontFixed    — Non-Turreted, limited front arc (StuG, SU-76, etc.)
 *   rearFixed     — Non-Turreted, limited rear arc
 *
 * TODO: verify whether the rulebook draws a further distinction between a
 * completely fixed casemate (zero traverse) and a limited-traverse mount;
 * if so, 'nonTurreted' may need to be added as a separate value.
 */
export type FieldOfFire = 'turret' | 'turretless360' | 'frontFixed' | 'rearFixed';

/** Movement type: T=tracked, H=half-track, W=wheeled, L=leg */
export type MovementType = 'T' | 'H' | 'W' | 'L';

/** Rate of Fire: N=normal, S=slow, R=rapid, RR=very rapid */
export type RateOfFire = 'N' | 'S' | 'R' | 'RR';

/** Range breakpoints: hex distance at which each Range Factor ends */
export interface RangeThresholds {
  P: number;
  S: number;
  M: number;
  L: number;
  E: number;
}

/** A numeric value per Range Factor (penetration, firepower, etc.) */
export interface ByRange {
  P: number;
  S: number;
  M: number;
  L: number;
  E: number;
}

/**
 * AP Damage thresholds per ammo type — pen−armor delta bands, see 4.4.3.2.6.
 * delta < 0          → no penetration ('none')
 * delta <= ND        → penetrated but no effect ('none')
 * delta in DM range  → Damaged
 * delta in KO range  → Knocked Out
 * delta in BU range  → Brew-Up (values above BU[1] also count as BU)
 */
export interface APDamageThresholds {
  ND: number;
  DM: [number, number];
  KO: [number, number];
  BU: [number, number];
}

/** KE (Kinetic Energy) ammo: AP, HVAP, APCR, HEAT */
export interface KEAmmo {
  type: 'AP' | 'HVAP' | 'APCR' | 'HEAT';
  label: string;
  availability?: string; // scenario/date note, e.g. "A" = from early-43
  ranges: RangeThresholds;
  penetration: ByRange;
  damage: APDamageThresholds;
}

/** GP (General Purpose) ammo: HE, Smoke */
export interface GPAmmo {
  type: 'GP' | 'SMOKE';
  label: string;
  ranges: RangeThresholds;
  firepower: ByRange;
}

export type Ammo = KEAmmo | GPAmmo;

/**
 * Armor values for Front / Rear angles — no side columns.
 * Matches the left table on the Data Card.
 */
export interface ArmorValuesFR {
  TF: number;   // Tank Front
  TR: number;   // Tank Rear
  HF: number;   // Hull Front
  HR: number;   // Hull Rear
  Dk?: number;  // Deck (fall angle only)
}

/**
 * Armor values for Front+Side / Rear+Side angles — side columns required.
 * Matches the right table on the Data Card.
 */
export interface ArmorValuesFRS {
  TF: number;   // Tank Front
  TR: number;   // Tank Rear
  HF: number;   // Hull Front
  HR: number;   // Hull Rear
  TS: number;   // Tank Side
  HS: number;   // Hull Side
  Dk?: number;  // Deck (fall angle only)
}

export interface ArmorByElevation<T> {
  level: T;
  rise: T;
  fall: T;
}

/** Full Defensive Information table from the Data Card */
export interface VehicleArmor {
  GPD: string;                                             // GP Defense factor, e.g. "2P"
  frontOrRear: ArmorByElevation<ArmorValuesFR>;            // Front or Rear facing
  frontSideOrRearSide: ArmorByElevation<ArmorValuesFRS>;   // Front/Side or Rear/Side facing
}

/** Full vehicle blueprint — matches the Data Card layout */
export interface VehicleData {
  id: string;
  name: string;
  nation: Nation;
  size: TargetSize;

  // Gun / Offensive header
  gun: string;           // e.g. "76.2mm L/43"
  Tt: number;            // Turret traverse
  Sb: number;            // Stabilization
  St: string;            // Stabilizer type ("O" = open mount, etc.)
  RoF: RateOfFire;       // Rate of Fire
  ammoCard: string;      // Game Card reference, e.g. "A3"
  fieldOfFire: FieldOfFire;

  // Movement
  movementType: MovementType;
  /** Cross-Country speed allowance (first value on Data Card, e.g. "5T 6-10" → 5) */
  movementSlow: number;
  /** Path speed allowance (second value on Data Card, e.g. "5T 6-10" → 6). Defaults to movementSlow+1 when absent. */
  movementPath?: number;
  /** Road speed allowance (third value on Data Card, e.g. "5T 6-10" → 10) */
  movementFast: number;

  weight: number;        // tonnes
  buValue: number;       // Brew-Up threshold printed on game counter

  ammo: Ammo[];
  armor: VehicleArmor;

  spriteUrl?: string;
}
