import { create } from 'zustand';
import type { GameState, Unit, Phase, Command, HexData, Force, StaggeredFormationOrder, Side, HexDirection } from './types';
import { hexKey } from './types';
import { VEHICLE_BLUEPRINTS } from '../units/blueprints';
import type { TerrainType, TerrainMap, HexTile } from '../terrain/types';
import { TERRAIN_DATA } from '../terrain/types';
import { runSpottingPhase } from '../spotting/phase';
import type { BasicInitiativeResult, AdvancedInitiativeResult, StaggeredInitiativeResult } from '../initiative/types';
import { resolveBasicInitiative, resolveAdvancedInitiative, resolveStaggeredInitiative } from '../initiative/phase';
import type { StaggeredRoundInput } from '../initiative/phase';
import { combatPhase } from '../combat/phase';
import type { FireDeclaration, CombatPhaseResult } from '../combat/phase';
import { SCENARIOS } from '../scenarios/index';
import type { Scenario, ScenarioPhase, ObjectiveControlState } from '../scenarios/types';

export const MAP_WIDTH = 22;
export const MAP_HEIGHT = 34;

interface RollInitiativeOptions {
  mode: 'basic' | 'advanced';
}

interface RollStaggeredInitiativeOptions {
  rounds: Array<{ alliedFormationId: string; axisFormationId: string }>;
}

interface GameStore extends GameState {
  // --- Combat phase state ---
  fireDeclarations: FireDeclaration[];
  combatPhaseResult: CombatPhaseResult | null;

  // --- Scenario state ---
  currentScenario: Scenario | null;
  scenarioPhase: ScenarioPhase;
  deploymentConfirmed: { allied: boolean; axis: boolean };
  objectiveState: Record<string, ObjectiveControlState>;

  // Actions — gameplay
  selectUnit: (instanceId: string | null) => void;
  assignCommand: (instanceId: string, command: Command) => void;
  advancePhase: () => void;
  resetGame: () => void;
  rollInitiative: (options: RollInitiativeOptions) => BasicInitiativeResult | AdvancedInitiativeResult;
  rollStaggeredInitiative: (options: RollStaggeredInitiativeOptions) => StaggeredInitiativeResult;
  addFireDeclaration: (decl: FireDeclaration) => void;
  clearFireDeclarations: () => void;
  executeCombatPhase: () => CombatPhaseResult;

  // Actions — scenario lifecycle
  /** Load a scenario by id. Builds the map, resets state, enters SETUP phase. */
  loadScenario: (scenarioId: string) => void;
  /**
   * Place a unit during SETUP. Returns { ok: true } or { ok: false, error }.
   * Creates a new Unit instance with a generated instanceId.
   */
  placeUnitInDeployment: (blueprintId: string, side: Side, q: number, r: number, facing: HexDirection) => { ok: boolean; error?: string };
  /** Remove a unit placed during SETUP so the player can re-position it. */
  removeUnitFromDeployment: (instanceId: string) => void;
  /**
   * Lock in one side's deployment.
   * When both sides confirm, scenarioPhase → 'PLAYING' and turn 1 starts.
   */
  confirmDeployment: (side: Side) => void;
  /** Enter any reinforcements due on the current turn (call at Movement Phase start). */
  processReinforcements: () => void;
}

const PHASE_ORDER: Phase[] = [
  'SPOTTING',
  'COMMAND',
  'INITIATIVE',
  'COMBAT',
  'MOVEMENT',
  'ADJUSTMENT',
];

function nextPhase(current: Phase): Phase {
  const idx = PHASE_ORDER.indexOf(current);
  return PHASE_ORDER[(idx + 1) % PHASE_ORDER.length]!;
}

function toTerrainMap(hexMap: Record<string, HexData>): TerrainMap {
  const map: TerrainMap = new Map();
  for (const [key, data] of Object.entries(hexMap)) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    const tile: HexTile = {
      q,
      r,
      terrain: data.terrain,
      hillLevel: data.elevation,
      hasRoad: data.terrain === 'road',
      hasPath: data.terrain === 'path',
    };
    map.set(key, tile);
  }
  return map;
}

function patch(
  map: Record<string, HexData>,
  q0: number, q1: number,
  r0: number, r1: number,
  terrain: TerrainType,
  elevation: number,
): void {
  for (let r = r0; r <= r1; r++)
    for (let q = q0; q <= q1; q++)
      map[hexKey(q, r)] = { terrain, elevation };
}

function generateMap(): Record<string, HexData> {
  const map: Record<string, HexData> = {};
  for (let r = 0; r < MAP_HEIGHT; r++)
    for (let q = 0; q < MAP_WIDTH; q++)
      map[hexKey(q, r)] = { terrain: 'clear', elevation: 0 };

  // Heavy woods: top-left corner
  patch(map, 0, 4,  0,  7, 'heavyWoods', 0);
  // Hill ridge: upper-right with elevation
  patch(map, 15, 21,  4, 14, 'hill', 1);
  patch(map, 17, 21, 15, 20, 'hill', 1);
  // Light woods: left flank
  patch(map,  2,  6, 10, 16, 'lightWoods', 0);
  // Dense woods: center-left
  patch(map,  4,  9, 13, 21, 'woods', 0);
  // Scrub: center-right
  patch(map, 13, 19, 16, 24, 'scrub', 0);
  // Rough: lower middle
  patch(map,  7, 16, 26, 32, 'rough', 0);
  // Village: center
  patch(map,  9, 13, 14, 18, 'building', 0);
  // Path leading to village
  for (let r = 10; r <= 18; r++) map[hexKey(8, r)]  = { terrain: 'path', elevation: 0 };
  for (let q = 9; q <= 13; q++) map[hexKey(q, 19)]  = { terrain: 'path', elevation: 0 };
  // Road: north-south spine, slight jog at midpoint
  for (let r = 0; r < MAP_HEIGHT; r++) {
    const q = r < 17 ? 10 : 11;
    const elev = map[hexKey(q, r)]!.elevation;
    map[hexKey(q, r)] = { terrain: 'road', elevation: elev };
  }

  return map;
}

function rollD100(): number {
  return Math.floor(Math.random() * 100) + 1;
}

/** Generate enough roll pairs to virtually guarantee a non-tie outcome. */
function generateRollPairs(count = 10): [number, number][] {
  return Array.from({ length: count }, () => [rollD100(), rollD100()]);
}

function makeInitialForces(): [Force, Force] {
  return [
    { side: 'allied', grade: 'Seasoned', unitIds: ['t34_1'], pointCost: 0 },
    { side: 'axis',   grade: 'Seasoned', unitIds: ['pziv_1'], pointCost: 0 },
  ];
}

function makeInitialUnits(): Record<string, Unit> {
  return {
    t34_1: {
      instanceId: 't34_1',
      blueprintId: 't34_76_m43',
      side: 'allied',
      q: 2,
      r: 4,
      facing: 0,
      command: 'NO_COMMAND',
      lastCommand: 'NO_COMMAND',
      damage: 'ok',
      spotStatus: 'unspotted',
      hasActed: false,
      canSpot: true,
      moved: false,
      fired: false,
    },
    pziv_1: {
      instanceId: 'pziv_1',
      blueprintId: 'pzkpfw_ivh',
      side: 'axis',
      q: 8,
      r: 5,
      facing: 3,
      command: 'NO_COMMAND',
      lastCommand: 'NO_COMMAND',
      damage: 'ok',
      spotStatus: 'unspotted',
      hasActed: false,
      canSpot: true,
      moved: false,
      fired: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

function buildScenarioMap(scenario: Scenario): Record<string, HexData> {
  const { width, height, defaultTerrain = 'clear', hexOverrides } = scenario.mapConfig;
  const map: Record<string, HexData> = {};
  for (let r = 0; r < height; r++)
    for (let q = 0; q < width; q++)
      map[hexKey(q, r)] = { terrain: defaultTerrain as TerrainType, elevation: 0 };
  for (const o of hexOverrides)
    map[hexKey(o.q, o.r)] = { terrain: o.terrain as TerrainType, elevation: o.elevation ?? 0 };
  return map;
}

function makeUnit(
  instanceId: string,
  blueprintId: string,
  side: Side,
  q: number,
  r: number,
  facing: HexDirection,
): Unit {
  return {
    instanceId, blueprintId, side, q, r, facing,
    command: 'NO_COMMAND', lastCommand: 'NO_COMMAND',
    damage: 'ok', spotStatus: 'unspotted',
    hasActed: false, canSpot: true, moved: false, fired: false,
  };
}

let _unitCounter = 0;
function nextUnitId(blueprintId: string): string {
  return `${blueprintId}_${++_unitCounter}`;
}

function initObjectiveState(scenario: Scenario): Record<string, ObjectiveControlState> {
  const out: Record<string, ObjectiveControlState> = {};
  for (const obj of scenario.objectives)
    out[obj.id] = { objectiveId: obj.id, controlledBy: null, occupationTurns: 0 };
  return out;
}

/** Update objective control at turn end: check occupancy, advance counters. */
function updateObjectiveState(
  scenario: Scenario,
  units: Record<string, Unit>,
  prev: Record<string, ObjectiveControlState>,
): Record<string, ObjectiveControlState> {
  const next = { ...prev };
  for (const obj of scenario.objectives) {
    const occupants = Object.values(units).filter((u) =>
      u.damage !== 'ko' && u.damage !== 'bu' &&
      obj.hexes.some((h) => h.q === u.q && h.r === u.r),
    );
    const alliedCount = occupants.filter((u) => u.side === 'allied').length;
    const axisCount   = occupants.filter((u) => u.side === 'axis').length;
    const contested   = alliedCount > 0 && axisCount > 0;
    const cur = prev[obj.id]!;

    if (contested || (alliedCount === 0 && axisCount === 0)) {
      // Contested or empty: freeze counter (don't reset — occupation already earned persists)
      next[obj.id] = cur;
    } else {
      const occupyingSide: Side = alliedCount > 0 ? 'allied' : 'axis';
      if (cur.controlledBy === occupyingSide) {
        next[obj.id] = { ...cur, occupationTurns: cur.occupationTurns + 1 };
      } else {
        // New side takes over — restart counter
        next[obj.id] = { objectiveId: obj.id, controlledBy: occupyingSide, occupationTurns: 1 };
      }
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGameStore = create<GameStore>((set, get) => ({
  turn: 1,
  currentPhase: 'SPOTTING',
  firstPlayer: null,
  forces: makeInitialForces(),
  units: makeInitialUnits(),
  blueprints: VEHICLE_BLUEPRINTS,
  selectedUnitId: null,
  hexMap: generateMap(),
  spottingPairs: [],
  formationFireOrder: [],
  fireDeclarations: [],
  combatPhaseResult: null,
  currentScenario: null,
  scenarioPhase: 'PLAYING',
  deploymentConfirmed: { allied: false, axis: false },
  objectiveState: {},

  selectUnit: (instanceId) => set({ selectedUnitId: instanceId }),

  assignCommand: (instanceId, command) =>
    set((state) => {
      const unit = state.units[instanceId];
      if (!unit) return state;
      return {
        units: {
          ...state.units,
          [instanceId]: { ...unit, lastCommand: unit.command, command },
        },
      };
    }),

  advancePhase: () =>
    set((state) => {
      const next = nextPhase(state.currentPhase);
      const isTurnEnd = state.currentPhase === 'ADJUSTMENT';

      if (next !== 'SPOTTING') {
        return { currentPhase: next, turn: isTurnEnd ? state.turn + 1 : state.turn };
      }

      // Entering SPOTTING: compute spots using last turn's moved/fired, then reset them.
      const terrainMap = toTerrainMap(state.hexMap);
      const unitList = Object.values(state.units);
      const result = runSpottingPhase(unitList, terrainMap);

      const updatedUnits: Record<string, Unit> = {};
      for (const unit of unitList) {
        updatedUnits[unit.instanceId] = {
          ...unit,
          spotStatus: result.statusByUnit.get(unit.instanceId) ?? unit.spotStatus,
          moved: false,
          fired: false,
        };
      }

      // At turn end, update objective occupation counters before incrementing turn.
      const nextObjectiveState =
        isTurnEnd && state.currentScenario
          ? updateObjectiveState(state.currentScenario, updatedUnits, state.objectiveState)
          : state.objectiveState;

      return {
        currentPhase: next,
        turn: isTurnEnd ? state.turn + 1 : state.turn,
        units: updatedUnits,
        spottingPairs: result.pairs.map((p) => ({ spotter: p.spotter, target: p.target })),
        objectiveState: nextObjectiveState,
      };
    }),

  rollInitiative: ({ mode }) => {
    const { forces } = get();
    const allied = forces[0];
    const axis = forces[1];
    const pairs = generateRollPairs();

    if (mode === 'basic') {
      const result = resolveBasicInitiative(pairs);
      set({ firstPlayer: result.firstPlayer });
      return result;
    }

    const result = resolveAdvancedInitiative(pairs, allied.grade, axis.grade);
    set({ firstPlayer: result.firstPlayer });
    return result;
  },

  rollStaggeredInitiative: ({ rounds }) => {
    const { forces } = get();
    const allied = forces[0];
    const axis = forces[1];

    const roundInputs: StaggeredRoundInput[] = rounds.map((r) => ({
      alliedFormationId: r.alliedFormationId,
      axisFormationId: r.axisFormationId,
      rollPairs: generateRollPairs(),
    }));

    const result = resolveStaggeredInitiative(roundInputs, allied.grade, axis.grade);

    const formationFireOrder: StaggeredFormationOrder[] = result.rounds.map((r) => ({
      alliedFormationId: r.alliedFormationId,
      axisFormationId: r.axisFormationId,
      winner: r.winner,
    }));

    set({ firstPlayer: result.firstPlayer, formationFireOrder });
    return result;
  },

  addFireDeclaration: (decl) =>
    set((state) => ({ fireDeclarations: [...state.fireDeclarations, decl] })),

  clearFireDeclarations: () => set({ fireDeclarations: [], combatPhaseResult: null }),

  executeCombatPhase: () => {
    const { units, blueprints, hexMap, firstPlayer, fireDeclarations } = get();
    if (!firstPlayer) throw new Error('Initiative not resolved — firstPlayer is null');
    const rolls = fireDeclarations.map(() => rollD100());
    const result = combatPhase({ declarations: fireDeclarations, units, blueprints, hexMap, firstPlayer, rolls });
    set({ units: result.updatedUnits, combatPhaseResult: result });
    return result;
  },

  // ---------------------------------------------------------------------------
  // Scenario actions
  // ---------------------------------------------------------------------------

  loadScenario: (scenarioId) => {
    const scenario = SCENARIOS[scenarioId];
    if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);

    _unitCounter = 0;

    const hexMap = buildScenarioMap(scenario);

    // Pre-place units that carry a suggestedHex.
    const units: Record<string, Unit> = {};
    const alliedIds: string[] = [];
    const axisIds: string[] = [];

    for (const def of scenario.initialUnits) {
      if (!def.suggestedHex) continue;
      const id = nextUnitId(def.blueprintId);
      units[id] = makeUnit(id, def.blueprintId, def.side, def.suggestedHex.q, def.suggestedHex.r, def.facing ?? 0);
      (def.side === 'allied' ? alliedIds : axisIds).push(id);
    }

    const forces: [Force, Force] = [
      { side: 'allied', grade: scenario.forces[0].grade, unitIds: alliedIds, pointCost: 0 },
      { side: 'axis',   grade: scenario.forces[1].grade, unitIds: axisIds,   pointCost: 0 },
    ];

    set({
      currentScenario: scenario,
      scenarioPhase: 'SETUP',
      deploymentConfirmed: { allied: false, axis: false },
      objectiveState: initObjectiveState(scenario),
      hexMap,
      units,
      forces,
      blueprints: VEHICLE_BLUEPRINTS,
      turn: 0,
      currentPhase: 'SPOTTING',
      firstPlayer: null,
      selectedUnitId: null,
      spottingPairs: [],
      formationFireOrder: [],
      fireDeclarations: [],
      combatPhaseResult: null,
    });
  },

  placeUnitInDeployment: (blueprintId, side, q, r, facing) => {
    const state = get();
    if (state.scenarioPhase !== 'SETUP')
      return { ok: false, error: 'Deployment phase is over' };

    const scenario = state.currentScenario;
    if (!scenario) return { ok: false, error: 'No scenario loaded' };

    // Confirmed side can no longer move units.
    if (state.deploymentConfirmed[side])
      return { ok: false, error: `${side} deployment already confirmed` };

    // Check deployment zone.
    const zone = scenario.deploymentZones.find((z) => z.side === side);
    if (!zone) return { ok: false, error: `No deployment zone for ${side}` };
    const inZone = zone.allowedHexes.some((h) => h.q === q && h.r === r);
    if (!inZone) return { ok: false, error: 'Hex not in deployment zone' };

    // Check terrain passability.
    const hexData = state.hexMap[hexKey(q, r)];
    if (hexData && TERRAIN_DATA[hexData.terrain].moveCost >= 99)
      return { ok: false, error: 'Terrain is impassable' };

    // Check stacking: no two units in same hex.
    const occupied = Object.values(state.units).some((u) => u.q === q && u.r === r);
    if (occupied) return { ok: false, error: 'Hex already occupied' };

    const id = nextUnitId(blueprintId);
    const unit = makeUnit(id, blueprintId, side, q, r, facing);

    set((s) => ({
      units: { ...s.units, [id]: unit },
      forces: s.forces.map((f) =>
        f.side === side ? { ...f, unitIds: [...f.unitIds, id] } : f,
      ) as [Force, Force],
    }));

    return { ok: true };
  },

  removeUnitFromDeployment: (instanceId) => {
    const state = get();
    if (state.scenarioPhase !== 'SETUP') return;
    const unit = state.units[instanceId];
    if (!unit) return;
    if (state.deploymentConfirmed[unit.side]) return;

    set((s) => {
      const { [instanceId]: _removed, ...remaining } = s.units;
      return {
        units: remaining,
        forces: s.forces.map((f) =>
          f.side === unit.side
            ? { ...f, unitIds: f.unitIds.filter((id) => id !== instanceId) }
            : f,
        ) as [Force, Force],
      };
    });
  },

  confirmDeployment: (side) => {
    const state = get();
    if (state.scenarioPhase !== 'SETUP') return;

    const newConfirmed = { ...state.deploymentConfirmed, [side]: true };

    if (newConfirmed.allied && newConfirmed.axis) {
      set({
        deploymentConfirmed: newConfirmed,
        scenarioPhase: 'PLAYING',
        turn: 1,
        currentPhase: 'SPOTTING',
      });
    } else {
      set({ deploymentConfirmed: newConfirmed });
    }
  },

  processReinforcements: () => {
    const state = get();
    const scenario = state.currentScenario;
    if (!scenario || state.scenarioPhase !== 'PLAYING') return;

    const due = scenario.reinforcements.filter((r) => r.turn === state.turn);
    if (due.length === 0) return;

    const newUnits: Record<string, Unit> = { ...state.units };
    const newForces = state.forces.map((f) => ({ ...f, unitIds: [...f.unitIds] })) as [Force, Force];

    for (const reinf of due) {
      const count = reinf.count ?? 1;
      for (let i = 0; i < count; i++) {
        // Determine entry hex: first hex of entryHexes, or edge of map.
        let eq = 0, er = 0;
        if (reinf.entryHexes && reinf.entryHexes.length > 0) {
          ({ q: eq, r: er } = reinf.entryHexes[i % reinf.entryHexes.length]!);
        } else {
          const w = scenario.mapConfig.width;
          const h = scenario.mapConfig.height;
          switch (reinf.entryEdge) {
            case 'north': eq = Math.floor(w / 2) + i; er = 0; break;
            case 'south': eq = Math.floor(w / 2) + i; er = h - 1; break;
            case 'west':  eq = 0; er = Math.floor(h / 2) + i; break;
            case 'east':  eq = w - 1; er = Math.floor(h / 2) + i; break;
            default:      eq = 0; er = 0;
          }
        }
        const id = nextUnitId(reinf.blueprintId);
        newUnits[id] = makeUnit(id, reinf.blueprintId, reinf.side, eq, er, 0);
        const forceIdx = reinf.side === 'allied' ? 0 : 1;
        newForces[forceIdx]!.unitIds.push(id);
      }
    }

    set({ units: newUnits, forces: newForces });
  },

  // ---------------------------------------------------------------------------

  resetGame: () =>
    set({
      turn: 1,
      currentPhase: 'SPOTTING',
      firstPlayer: null,
      forces: makeInitialForces(),
      units: makeInitialUnits(),
      selectedUnitId: null,
      hexMap: generateMap(),
      spottingPairs: [],
      formationFireOrder: [],
      fireDeclarations: [],
      combatPhaseResult: null,
      currentScenario: null,
      scenarioPhase: 'PLAYING',
      deploymentConfirmed: { allied: false, axis: false },
      objectiveState: {},
    }),
}));
