/**
 * Scenario 1 — "The Crossings" (Ukraine, late 1943)
 * Basic Game rules only: vehicles, no infantry, no OR.
 *
 * Map: 22 × 34 hexes (q: 0–21, r: 0–33).
 * River runs east–west at r = 16.
 * Crossings: ford at q=4, road-bridge at q=10, path-bridge at q=16.
 *
 * Allied (south, r ≥ 19): 3 × T-34/76 M43
 * Axis   (north, r ≤ 13): 3 × PzKpfw IVH
 */

import type { Scenario, HexOverride, DeploymentZone } from './types';

// ---------------------------------------------------------------------------
// Map dimensions (mirrored from store constants — no import cycle)
// ---------------------------------------------------------------------------

const W = 22;   // MAP_WIDTH
const H = 34;   // MAP_HEIGHT

const RIVER_ROW   = 16;
const FORD_Q      = 4;
const BRIDGE_ROAD = 10;  // connects to north-south road at q=10
const BRIDGE_PATH = 16;  // connects to north-south path at q=16

const AXIS_MAX_R   = RIVER_ROW - 3;  // r ≤ 13
const ALLIED_MIN_R = RIVER_ROW + 3;  // r ≥ 19

// ---------------------------------------------------------------------------
// Hex override helpers
// ---------------------------------------------------------------------------

function patch(
  q0: number, q1: number,
  r0: number, r1: number,
  terrain: HexOverride['terrain'],
  elevation = 0,
): HexOverride[] {
  const out: HexOverride[] = [];
  for (let r = r0; r <= r1; r++)
    for (let q = q0; q <= q1; q++)
      out.push({ q, r, terrain, elevation });
  return out;
}

function vLine(q: number, r0: number, r1: number, terrain: HexOverride['terrain'], elevation = 0): HexOverride[] {
  const out: HexOverride[] = [];
  for (let r = r0; r <= r1; r++) out.push({ q, r, terrain, elevation });
  return out;
}

// ---------------------------------------------------------------------------
// Deployment zone helpers
// ---------------------------------------------------------------------------

function zoneHexes(predicate: (q: number, r: number) => boolean): Array<{ q: number; r: number }> {
  const hexes: Array<{ q: number; r: number }> = [];
  for (let r = 0; r < H; r++)
    for (let q = 0; q < W; q++)
      if (predicate(q, r)) hexes.push({ q, r });
  return hexes;
}

// Exclude hexes that are impassable or adjacent to the river.
function isPassableDeployHex(q: number, r: number, _riverRow: number, side: 'allied' | 'axis'): boolean {
  if (side === 'axis'   && r > AXIS_MAX_R)   return false;
  if (side === 'allied' && r < ALLIED_MIN_R) return false;
  // Crossing point hexes are allowed but bridge/ford hexes themselves can receive units
  const terrain = hexTerrainAt(q, r);
  return terrain !== 'river' && terrain !== 'heavyWoods';
}

// ---------------------------------------------------------------------------
// Terrain lookup for the scenario map (mirrors mapConfig overrides)
// ---------------------------------------------------------------------------

// Build a lookup map from the overrides so we can query it.
function buildTerrainLookup(overrides: HexOverride[]): Map<string, HexOverride['terrain']> {
  const m = new Map<string, HexOverride['terrain']>();
  for (const o of overrides) m.set(`${o.q},${o.r}`, o.terrain);
  return m;
}

// Populated after hexOverrides is built below — forward reference resolved via closure.
let _terrainLookup: Map<string, HexOverride['terrain']> | null = null;

function hexTerrainAt(q: number, r: number): HexOverride['terrain'] {
  return _terrainLookup?.get(`${q},${r}`) ?? 'clear';
}

// ---------------------------------------------------------------------------
// Map overrides
// ---------------------------------------------------------------------------

const hexOverrides: HexOverride[] = [
  // ── River ──────────────────────────────────────────────────────────────────
  // Full river row except crossing hexes
  ...Array.from({ length: W }, (_, q) => q)
    .filter(q => q !== FORD_Q && q !== BRIDGE_ROAD && q !== BRIDGE_PATH)
    .map(q => ({ q, r: RIVER_ROW, terrain: 'river' as const })),
  { q: FORD_Q,      r: RIVER_ROW, terrain: 'ford'   },
  { q: BRIDGE_ROAD, r: RIVER_ROW, terrain: 'bridge' },
  { q: BRIDGE_PATH, r: RIVER_ROW, terrain: 'bridge' },

  // ── Roads & paths ──────────────────────────────────────────────────────────
  // North–south road through q=10 (skips river row — bridge hex covers it)
  ...vLine(10,  0, RIVER_ROW - 1, 'road'),
  ...vLine(10, RIVER_ROW + 1, H - 1, 'road'),
  // North–south path through q=16
  ...vLine(16,  0, RIVER_ROW - 1, 'path'),
  ...vLine(16, RIVER_ROW + 1, H - 1, 'path'),

  // ── Axis side terrain (north, r 0–15) ──────────────────────────────────────
  ...patch(0,  3,  0,  9, 'lightWoods'),
  ...patch(18, 21,  0, 10, 'hill', 1),
  ...patch(13, 18,  5, 12, 'scrub'),
  ...patch(5,  9,  7, 14, 'lightWoods'),

  // ── Allied side terrain (south, r 17–33) ───────────────────────────────────
  ...patch(8,  13, 20, 28, 'woods'),
  ...patch(0,   5, 23, 33, 'rough'),
  ...patch(17,  21, 22, 30, 'hill', 1),
  ...patch(2,   7, 17, 20, 'scrub'),
];

// Initialise the terrain lookup now that overrides are ready.
_terrainLookup = buildTerrainLookup(hexOverrides);

// ---------------------------------------------------------------------------
// Deployment zones
// ---------------------------------------------------------------------------

const deploymentZones: DeploymentZone[] = [
  {
    side: 'allied',
    allowedHexes: zoneHexes((q, r) => isPassableDeployHex(q, r, RIVER_ROW, 'allied')),
  },
  {
    side: 'axis',
    allowedHexes: zoneHexes((q, r) => isPassableDeployHex(q, r, RIVER_ROW, 'axis')),
  },
];

// ---------------------------------------------------------------------------
// Scenario constant
// ---------------------------------------------------------------------------

export const THE_CROSSINGS: Scenario = {
  id: 'the-crossings',
  name: 'The Crossings',
  description:
    'Ukraine, late 1943. A Soviet armoured company races to seize three crossing ' +
    'points over an impassable river before the Germans can consolidate their hold. ' +
    'Both sides converge on the ford and two bridges — the only passages across.',

  turnCount: 8,

  forces: [
    { side: 'allied', grade: 'Seasoned', name: '3rd Company, 5th Guards Tank Brigade' },
    { side: 'axis',   grade: 'Seasoned', name: '7. Kompanie, Panzer-Regiment 15'      },
  ],

  deploymentZones,

  // All units player-placed (no suggestedHex) — both sides choose their own positions.
  initialUnits: [
    { blueprintId: 't34_76_m43',  side: 'allied' },
    { blueprintId: 't34_76_m43',  side: 'allied' },
    { blueprintId: 't34_76_m43',  side: 'allied' },
    { blueprintId: 'pzkpfw_ivh',  side: 'axis'   },
    { blueprintId: 'pzkpfw_ivh',  side: 'axis'   },
    { blueprintId: 'pzkpfw_ivh',  side: 'axis'   },
  ],

  // The Crossings uses no reinforcements — concept modelled for completeness.
  reinforcements: [],

  // Objectives: the three crossing hexes.
  // One full uncontested turn of occupation captures a crossing (§3.6).
  objectives: [
    {
      id: 'ford',
      hexes: [{ q: FORD_Q, r: RIVER_ROW }],
      vpValue: 2,
      controlRequirement: { turnsToCapture: 1, capturableBySide: 'both' },
    },
    {
      id: 'bridge-road',
      hexes: [{ q: BRIDGE_ROAD, r: RIVER_ROW }],
      vpValue: 3,
      controlRequirement: { turnsToCapture: 1, capturableBySide: 'both' },
    },
    {
      id: 'bridge-path',
      hexes: [{ q: BRIDGE_PATH, r: RIVER_ROW }],
      vpValue: 3,
      controlRequirement: { turnsToCapture: 1, capturableBySide: 'both' },
    },
  ],

  specialConditions: {
    hiddenUnitsAllowed: false,
    sunBlinding: null,
  },

  mapConfig: {
    width:  W,
    height: H,
    defaultTerrain: 'clear',
    hexOverrides,
  },
};

// Exports
export { RIVER_ROW, FORD_Q, BRIDGE_ROAD, BRIDGE_PATH, ALLIED_MIN_R, AXIS_MAX_R };
