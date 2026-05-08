import { create } from 'zustand';
import type { GameState, Unit, Phase, Command, HexData, Force, StaggeredFormationOrder } from './types';
import { hexKey, FORCE_GRADE_MODIFIER } from './types';
import { VEHICLE_BLUEPRINTS } from '../units/blueprints';
import type { TerrainType, TerrainMap, HexTile } from '../terrain/types';
import { runSpottingPhase } from '../spotting/phase';
import type { BasicInitiativeResult, AdvancedInitiativeResult, StaggeredInitiativeResult } from '../initiative/types';
import { resolveBasicInitiative, resolveAdvancedInitiative, resolveStaggeredInitiative } from '../initiative/phase';
import type { StaggeredRoundInput } from '../initiative/phase';
import { combatPhase } from '../combat/phase';
import type { FireDeclaration, CombatPhaseResult } from '../combat/phase';

export const MAP_WIDTH = 22;
export const MAP_HEIGHT = 34;

interface RollInitiativeOptions {
  mode: 'basic' | 'advanced';
}

interface RollStaggeredInitiativeOptions {
  rounds: Array<{ alliedFormationId: string; axisFormationId: string }>;
}

interface GameStore extends GameState {
  // --- Combat phase state (not in pure GameState to avoid circular imports) ---
  /** Declared shots for the current Combat Phase Direct Fire Step. */
  fireDeclarations: FireDeclaration[];
  /** Result of the last executeCombatPhase() call, for UI display. */
  combatPhaseResult: CombatPhaseResult | null;

  // Actions
  selectUnit: (instanceId: string | null) => void;
  assignCommand: (instanceId: string, command: Command) => void;
  advancePhase: () => void;
  resetGame: () => void;
  /** Roll initiative for Basic (4.3.1) or Advanced (6.3.1) mode. */
  rollInitiative: (options: RollInitiativeOptions) => BasicInitiativeResult | AdvancedInitiativeResult;
  /** Roll Staggered Initiative (7.42) given the ordered formation pairings. */
  rollStaggeredInitiative: (options: RollStaggeredInitiativeOptions) => StaggeredInitiativeResult;
  /** Add a fire declaration for the Direct Fire Step. */
  addFireDeclaration: (decl: FireDeclaration) => void;
  /** Remove all fire declarations (called automatically when entering COMBAT). */
  clearFireDeclarations: () => void;
  /**
   * Execute the Direct Fire Step (4.4.1) using all declared shots.
   * Applies damage to unit states and stores the result for UI display.
   * Throws if initiative has not been resolved (firstPlayer is null).
   */
  executeCombatPhase: () => CombatPhaseResult;
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

      return {
        currentPhase: next,
        turn: isTurnEnd ? state.turn + 1 : state.turn,
        units: updatedUnits,
        spottingPairs: result.pairs.map((p) => ({ spotter: p.spotter, target: p.target })),
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
    }),
}));
