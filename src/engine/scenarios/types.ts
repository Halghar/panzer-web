import type { Side, HexDirection } from '../state/types';
import type { TerrainType } from '../terrain/types';
import type { ForceGrade } from '../state/force';

// ---------------------------------------------------------------------------
// Scenario lifecycle
// ---------------------------------------------------------------------------

export type ScenarioPhase = 'SETUP' | 'PLAYING' | 'COMPLETE';

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

export interface DeploymentZone {
  side: Side;
  /** Exhaustive list of hexes where this side may place units during Setup. */
  allowedHexes: Array<{ q: number; r: number }>;
  /** When present, placed units must face one of these directions. */
  facingConstraints?: HexDirection[];
}

export interface ScenarioInitialUnit {
  blueprintId: string;
  side: Side;
  /**
   * Pre-placed position. If omitted the player places the unit freely inside
   * their DeploymentZone during the Setup phase.
   */
  suggestedHex?: { q: number; r: number };
  /** Initial facing direction (0-5). Defaults to 0 when omitted. */
  facing?: HexDirection;
}

// ---------------------------------------------------------------------------
// Objectives & victory
// ---------------------------------------------------------------------------

export interface ScenarioObjective {
  id: string;
  /** The hex(es) that constitute this objective (bridge = 1 hex, village = many). */
  hexes: Array<{ q: number; r: number }>;
  /** Victory points awarded to the side that controls this objective at scenario end. */
  vpValue: number;
  /**
   * §3.6: occupation rules.
   * turnsToCapture — full uncontested turns a vehicle must occupy to claim control.
   * capturableBySide — restricts capture to one side, or 'both'.
   */
  controlRequirement: {
    turnsToCapture: number;
    capturableBySide: Side | 'both';
  };
}

// ---------------------------------------------------------------------------
// Reinforcements
// ---------------------------------------------------------------------------

export interface Reinforcement {
  /** Turn number during which these units enter (Movement Phase, §7.44). */
  turn: number;
  /**
   * Map edge from which the units enter. Mutually exclusive with entryHexes.
   * Use entryHexes for scenarios that designate specific entry points.
   */
  entryEdge?: 'north' | 'south' | 'east' | 'west';
  /** Explicit entry hexes (overrides entryEdge). */
  entryHexes?: Array<{ q: number; r: number }>;
  side: Side;
  blueprintId: string;
  /** Number of vehicles of this blueprint that arrive. Defaults to 1. */
  count?: number;
}

// ---------------------------------------------------------------------------
// Forces
// ---------------------------------------------------------------------------

export interface ScenarioForce {
  side: Side;
  grade: ForceGrade;
  /** Narrative designation, e.g. "3rd Company, 5th Guards Tank Brigade". */
  name?: string;
}

// ---------------------------------------------------------------------------
// Map configuration
// ---------------------------------------------------------------------------

export interface HexOverride {
  q: number;
  r: number;
  terrain: TerrainType;
  elevation?: number;
}

/**
 * Declarative map layout for a scenario.
 * The store's loadScenario fills a (width × height) grid with defaultTerrain,
 * then applies hexOverrides in order.
 */
export interface ScenarioMapConfig {
  width: number;
  height: number;
  /** Terrain for every hex not listed in hexOverrides. Defaults to 'clear'. */
  defaultTerrain?: TerrainType;
  hexOverrides: HexOverride[];
}

// ---------------------------------------------------------------------------
// Special conditions
// ---------------------------------------------------------------------------

/**
 * Free-form scenario rule flags keyed by camelCase name.
 * Boolean flags disable/enable a rule; null means not applicable.
 * E.g. { hiddenUnitsAllowed: false, sunBlinding: null, frozenRiverWeightLimit: 25 }
 */
export type SpecialConditions = Record<string, boolean | number | string | null>;

// ---------------------------------------------------------------------------
// Runtime objective tracking (lives in the store, defined here to avoid cycles)
// ---------------------------------------------------------------------------

export interface ObjectiveControlState {
  objectiveId: string;
  /** Which side currently has uncontested occupation. null = nobody. */
  controlledBy: Side | null;
  /** Consecutive full turns of uncontested occupation by controlledBy. */
  occupationTurns: number;
}

// ---------------------------------------------------------------------------
// Root scenario descriptor
// ---------------------------------------------------------------------------

export interface Scenario {
  id: string;
  name: string;
  /** Narrative briefing text shown to players before setup. */
  description: string;
  /** Total number of game turns. */
  turnCount: number;
  /** Always [allied, axis]. */
  forces: [ScenarioForce, ScenarioForce];
  deploymentZones: DeploymentZone[];
  /** Units available for the scenario — pre-placed or player-placed at setup. */
  initialUnits: ScenarioInitialUnit[];
  reinforcements: Reinforcement[];
  objectives: ScenarioObjective[];
  specialConditions: SpecialConditions;
  mapConfig: ScenarioMapConfig;
}
