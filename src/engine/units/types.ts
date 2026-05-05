/**
 * Core domain types for Panzer.
 *
 * Modelled directly from the Consolidated Rules (May 2025).
 * Section references in comments point to the rulebook.
 */

export type Nation = 'german' | 'soviet' | 'us' | 'british' | 'italian';

/** Target Size modifier — see 4.4.3.2.2 / Defensive Information section */
export type TargetSize = -2 | -1 | 0 | 1 | 2;

/** Cover types, see 4.1.3 / Terrain Effects Table */
export type CoverType = 'none' | 'light' | 'medium' | 'heavy';

/** AP Range Factors, see 4.4.3.2.1 */
export type RangeFactor = 'P' | 'S' | 'M' | 'L' | 'E';

/** Field-of-Fire types, see 4.4.3.1 */
export type FieldOfFire = 'turret' | 'turretless360' | 'frontFixed' | 'rearFixed';

/** Ammo types — Basic Game uses AP only, more in Advanced Game */
export type AmmoType = 'AP' | 'APCR' | 'HEAT' | 'HE' | 'SMOKE';

/** Range thresholds: at what hex distance does each Range Factor end? */
export interface RangeThresholds {
  P: number; // Pointblank max range
  S: number; // Short max range
  M: number; // Medium max range
  L: number; // Long max range
  E: number; // Extreme max range (== max range overall)
}

/** Penetration values per Range Factor */
export interface PenetrationByRange {
  P: number;
  S: number;
  M: number;
  L: number;
  E: number;
}

export interface Ammo {
  type: AmmoType;
  ranges: RangeThresholds;
  penetration: PenetrationByRange;
}

export interface Weapon {
  name: string;
  caliber: string;
  fieldOfFire: FieldOfFire;
  /** Stabilization rating, see 4.4.3.2.2. 0 means -4 modifier on Short Halt */
  stabilization: number;
  ammo: Ammo[];
}

export interface VehicleArmor {
  /** Front armor factor, see 4.4.3.2.5 / Notes section */
  front: number;
  rear: number;
}

export interface VehicleData {
  id: string;
  name: string;
  nation: Nation;
  size: TargetSize;
  armor: VehicleArmor;
  weapons: Weapon[];
  /** Movement speed allowance, see 4.5.1 */
  movementSpeed: number;
  /** Optional sprite/icon path */
  spriteUrl?: string;
}
