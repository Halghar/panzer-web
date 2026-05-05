import { create } from 'zustand';
import type { GameState, Unit, Phase, Command, HexData } from './types';
import { hexKey } from './types';
import { VEHICLE_BLUEPRINTS } from '../units/blueprints';
import type { TerrainType } from '../terrain/types';

export const MAP_WIDTH = 22;
export const MAP_HEIGHT = 34;

interface GameStore extends GameState {
  // Actions
  selectUnit: (instanceId: string | null) => void;
  assignCommand: (instanceId: string, command: Command) => void;
  advancePhase: () => void;
  resetGame: () => void;
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
      damage: 'ok',
      spotStatus: 'unspotted',
      hasActed: false,
    },
    pziv_1: {
      instanceId: 'pziv_1',
      blueprintId: 'pzkpfw_ivh',
      side: 'axis',
      q: 8,
      r: 5,
      facing: 3,
      command: 'NO_COMMAND',
      damage: 'ok',
      spotStatus: 'unspotted',
      hasActed: false,
    },
  };
}

export const useGameStore = create<GameStore>((set) => ({
  turn: 1,
  currentPhase: 'SPOTTING',
  firstPlayer: null,
  units: makeInitialUnits(),
  blueprints: VEHICLE_BLUEPRINTS,
  selectedUnitId: null,
  hexMap: generateMap(),

  selectUnit: (instanceId) => set({ selectedUnitId: instanceId }),

  assignCommand: (instanceId, command) =>
    set((state) => {
      const unit = state.units[instanceId];
      if (!unit) return state;
      return {
        units: {
          ...state.units,
          [instanceId]: { ...unit, command },
        },
      };
    }),

  advancePhase: () =>
    set((state) => ({
      currentPhase: nextPhase(state.currentPhase),
      turn:
        state.currentPhase === 'ADJUSTMENT' ? state.turn + 1 : state.turn,
    })),

  resetGame: () =>
    set({
      turn: 1,
      currentPhase: 'SPOTTING',
      firstPlayer: null,
      units: makeInitialUnits(),
      selectedUnitId: null,
      hexMap: generateMap(),
    }),
}));
