/**
 * Movement Phase tests — Section 4.5 (Basic Game).
 *
 * All tests use deterministic rolls supplied via owRolls.
 * Map keys use the format "${q},${r}".
 */

import { describe, it, expect } from 'vitest';
import { movementPhase } from './phase';
import { baseMoveCost, baseTurnCost, elevationChangeCost } from './terrain';
import type { MovementPhaseInput } from './types';
import type { Unit, HexData } from '../state/types';
import type { VehicleData } from '../units/types';

// ---------------------------------------------------------------------------
// Minimal fixture builders
// ---------------------------------------------------------------------------

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    instanceId: 'u1',
    blueprintId: 'T',
    side: 'allied',
    q: 0, r: 0,
    facing: 0,
    command: 'MOVE',
    lastCommand: 'NO_COMMAND',
    damage: 'ok',
    spotStatus: 'unspotted',
    hasActed: false,
    canSpot: true,
    moved: false,
    fired: false,
    ...overrides,
  };
}

function makeBlueprint(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: 'T',
    name: 'Test Tank',
    nation: 'soviet',
    size: 0,
    gun: '75mm',
    Tt: 0, Sb: 0, St: 'O',
    RoF: 'N',
    ammoCard: 'A1',
    fieldOfFire: 'turret',
    movementType: 'T',
    movementSlow: 6,    // CC allowance
    movementPath: 8,    // Path allowance
    movementFast: 10,   // Road allowance
    weight: 20,
    buValue: 40,
    ammo: [{
      type: 'AP',
      label: '75mm-KE',
      ranges:      { P: 3, S: 8, M: 14, L: 20, E: 27 },
      penetration: { P: 20, S: 17, M: 14, L: 11, E: 8 },
      damage: { ND: 0, DM: [1, 3], KO: [4, 9], BU: [10, 10] },
    }],
    armor: {
      GPD: '3P',
      frontOrRear: {
        level: { TF: 18, TR: 8, HF: 18, HR: 8 },
        rise:  { TF: 18, TR: 8, HF: 22, HR: 8 },
        fall:  { TF: 16, TR: 7, HF: 14, HR: 7 },
      },
      frontSideOrRearSide: {
        level: { TF: 18, TS: 8, TR: 8, HF: 18, HS: 8, HR: 8 },
        rise:  { TF: 18, TS: 8, TR: 8, HF: 22, HS: 8, HR: 8 },
        fall:  { TF: 16, TS: 7, TR: 7, HF: 14, HS: 7, HR: 7, Dk: 4 },
      },
    },
    ...overrides,
  };
}

/** Build a flat all-clear map covering q=0..9, r=0..9 */
function clearMap(extra: Record<string, HexData> = {}): Record<string, HexData> {
  const m: Record<string, HexData> = {};
  for (let q = 0; q <= 9; q++)
    for (let r = 0; r <= 9; r++)
      m[`${q},${r}`] = { terrain: 'clear', elevation: 0 };
  return { ...m, ...extra };
}

function makeInput(
  unitOverrides: Partial<Unit> = {},
  overrides: Partial<MovementPhaseInput> = {},
): MovementPhaseInput {
  const unit = makeUnit(unitOverrides);
  return {
    firstPlayer: 'axis',         // allied = second player → moves first
    units: { u1: unit },
    blueprints: { T: makeBlueprint() },
    hexMap: clearMap(),
    orders: [],
    owDeclarations: [],
    owRolls: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Terrain Effects Chart
// ---------------------------------------------------------------------------

describe('baseMoveCost', () => {
  it('clear terrain: T=1, W=1', () => {
    expect(baseMoveCost('clear', 'T')).toBe(1);
    expect(baseMoveCost('clear', 'W')).toBe(1);
  });

  it('woods: T=3, W=P', () => {
    expect(baseMoveCost('woods', 'T')).toBe(3);
    expect(baseMoveCost('woods', 'W')).toBe('P');
  });

  it('heavyWoods: T=P, W=P', () => {
    expect(baseMoveCost('heavyWoods', 'T')).toBe('P');
    expect(baseMoveCost('heavyWoods', 'W')).toBe('P');
  });

  it('ford: T=3, W=P', () => {
    expect(baseMoveCost('ford', 'T')).toBe(3);
    expect(baseMoveCost('ford', 'W')).toBe('P');
  });

  it('stream: T=P, W=P', () => {
    expect(baseMoveCost('stream', 'T')).toBe('P');
    expect(baseMoveCost('stream', 'W')).toBe('P');
  });

  it('H and L use same column as T', () => {
    expect(baseMoveCost('rough', 'H')).toBe(2);
    expect(baseMoveCost('rough', 'L')).toBe(2);
    expect(baseMoveCost('rough', 'W')).toBe(3);
  });
});

describe('baseTurnCost', () => {
  it('clear: 1', () => expect(baseTurnCost('clear')).toBe(1));
  it('woods: 3', () => expect(baseTurnCost('woods')).toBe(3));
  it('road:  0', () => expect(baseTurnCost('road')).toBe(0));
});

describe('elevationChangeCost', () => {
  it('same elevation: 0', () => expect(elevationChangeCost(0, 0, 'T')).toBe(0));
  it('+1 level: 1',       () => expect(elevationChangeCost(0, 1, 'T')).toBe(1));
  it('+2 levels T: 2',    () => expect(elevationChangeCost(0, 2, 'T')).toBe(2));
  it('+3 levels T: P',    () => expect(elevationChangeCost(0, 3, 'T')).toBe('P'));
  it('W: max 1 level',    () => expect(elevationChangeCost(0, 2, 'W')).toBe('P'));
  it('W: 1 level ok',     () => expect(elevationChangeCost(0, 1, 'W')).toBe(1));
  it('downhill same cost',() => expect(elevationChangeCost(2, 0, 'T')).toBe(2));
});

// ---------------------------------------------------------------------------
// Allowance computation
// ---------------------------------------------------------------------------

describe('allowance (via movementPhase no-move)', () => {
  function getAllowance(unitOverrides: Partial<Unit>, bpOverrides: Partial<VehicleData> = {}): number {
    const unit = makeUnit(unitOverrides);
    const bp   = makeBlueprint(bpOverrides);
    const res  = movementPhase({
      firstPlayer: 'axis',
      units: { u1: unit },
      blueprints: { T: bp },
      hexMap: clearMap(),
      orders: [],
      owDeclarations: [],
      owRolls: [],
    });
    return res.vehicleResults[0]!.allowanceTotal;
  }

  it('MOVE, ok → full CC allowance', () =>
    expect(getAllowance({ command: 'MOVE', damage: 'ok' })).toBe(6));

  it('SHORT_HALT → floor(6/2) = 3', () =>
    expect(getAllowance({ command: 'SHORT_HALT', damage: 'ok' })).toBe(3));

  it('MOVE, damaged → floor(6/2) = 3', () =>
    expect(getAllowance({ command: 'MOVE', damage: 'damaged' })).toBe(3));

  it('SHORT_HALT + damaged → floor(6/4) = 1', () =>
    expect(getAllowance({ command: 'SHORT_HALT', damage: 'damaged' })).toBe(1));

  it('minimum allowance is 1 even with very low base', () =>
    expect(getAllowance({ command: 'SHORT_HALT', damage: 'damaged' }, { movementSlow: 3 })).toBe(1));

  it('road mode uses movementFast', () => {
    // Build a road-only map and order the vehicle to follow it
    const roadMap = clearMap({
      '0,0': { terrain: 'road', elevation: 0 },
      '1,0': { terrain: 'road', elevation: 0 },
    });
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'MOVE', q: 0, r: 0 }) },
      blueprints: { T: makeBlueprint() },
      hexMap: roadMap,
      orders: [{ vehicleId: 'u1', steps: [{ type: 'move', direction: 0 }] }],
      owDeclarations: [],
      owRolls: [],
    });
    expect(res.vehicleResults[0]!.allowanceTotal).toBe(10); // movementFast
  });
});

// ---------------------------------------------------------------------------
// Basic movement
// ---------------------------------------------------------------------------

describe('movementPhase — basic movement', () => {
  it('vehicle moves 2 hexes forward (direction 0)', () => {
    const res = movementPhase(makeInput({ command: 'MOVE' }, {
      orders: [{
        vehicleId: 'u1',
        steps: [
          { type: 'move', direction: 0 },
          { type: 'move', direction: 0 },
        ],
      }],
    }));
    const r = res.vehicleResults[0]!;
    expect(r.fromHex).toEqual({ q: 0, r: 0 });
    expect(r.toHex).toEqual({ q: 2, r: 0 });
    expect(r.allowanceUsed).toBe(2);       // 2 clear hexes × 1
    expect(r.allowanceRemaining).toBe(4);
    expect(r.pathTaken).toHaveLength(2);
    expect(r.movementMode).toBe('cross_country');
    expect(r.offMap).toBe(false);
  });

  it('moves flag: moved=true, fired=false after movement', () => {
    const res = movementPhase(makeInput({ command: 'MOVE', fired: true }, {
      orders: [{ vehicleId: 'u1', steps: [{ type: 'move', direction: 0 }] }],
    }));
    const updated = res.updatedUnits['u1']!;
    expect(updated.moved).toBe(true);
    expect(updated.fired).toBe(false);
  });

  it('all MOVE units get moved=true even with no steps (NO MOVE rule)', () => {
    const res = movementPhase(makeInput({ command: 'MOVE' }, { orders: [] }));
    const updated = res.updatedUnits['u1']!;
    expect(updated.moved).toBe(true);
    expect(res.vehicleResults[0]!.movementMode).toBe('no_move');
  });

  it('FIRE command unit is not included in results', () => {
    const res = movementPhase(makeInput({ command: 'FIRE' }, { orders: [] }));
    expect(res.vehicleResults).toHaveLength(0);
  });

  it('stops moving when allowance exhausted', () => {
    // Woods = 3 MP each; allowance = 6 → can enter 2 woods hexes
    const woodsMap = clearMap({
      '1,0': { terrain: 'woods', elevation: 0 },
      '2,0': { terrain: 'woods', elevation: 0 },
      '3,0': { terrain: 'woods', elevation: 0 },
    });
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'MOVE' }) },
      blueprints: { T: makeBlueprint() },
      hexMap: woodsMap,
      orders: [{
        vehicleId: 'u1',
        steps: [
          { type: 'move', direction: 0 },
          { type: 'move', direction: 0 },
          { type: 'move', direction: 0 },
        ],
      }],
      owDeclarations: [],
      owRolls: [],
    });
    const r = res.vehicleResults[0]!;
    expect(r.toHex).toEqual({ q: 2, r: 0 });         // stopped after 2nd woods hex
    expect(r.abortReason).toBe('allowance_exceeded');
    expect(r.allowanceUsed).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Exception: always move at least 1 hex (4.5.1.1.3)
// ---------------------------------------------------------------------------

describe('minimum 1-hex exception (4.5.1.1.3)', () => {
  it('allows first hex move even when cost exceeds full allowance', () => {
    // Vehicle has 1 allowance (SHORT_HALT + damaged). Woods costs 3 normally.
    const woodsMap = clearMap({ '1,0': { terrain: 'woods', elevation: 0 } });
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'SHORT_HALT', damage: 'damaged' }) },
      blueprints: { T: makeBlueprint() },   // allowance = floor(6/4)=1
      hexMap: woodsMap,
      orders: [{ vehicleId: 'u1', steps: [{ type: 'move', direction: 0 }] }],
      owDeclarations: [],
      owRolls: [],
    });
    const r = res.vehicleResults[0]!;
    expect(r.toHex).toEqual({ q: 1, r: 0 }); // moved into woods despite cost > allowance
    expect(r.allowanceUsed).toBe(1);           // consumed all available
    expect(r.allowanceRemaining).toBe(0);
    expect(r.abortReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Prohibited terrain
// ---------------------------------------------------------------------------

describe('prohibited terrain', () => {
  it('stream is prohibited for tracked vehicles', () => {
    const m = clearMap({ '1,0': { terrain: 'stream', elevation: 0 } });
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'MOVE' }) },
      blueprints: { T: makeBlueprint() },
      hexMap: m,
      orders: [{ vehicleId: 'u1', steps: [{ type: 'move', direction: 0 }] }],
      owDeclarations: [],
      owRolls: [],
    });
    const r = res.vehicleResults[0]!;
    expect(r.toHex).toEqual({ q: 0, r: 0 }); // didn't move
    expect(r.abortReason).toBe('terrain_prohibited');
  });

  it('too steep elevation change is prohibited for wheeled', () => {
    const m = clearMap({
      '0,0': { terrain: 'clear', elevation: 0 },
      '1,0': { terrain: 'clear', elevation: 2 }, // +2 levels — wheeled max is 1
    });
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'MOVE' }) },
      blueprints: { T: makeBlueprint({ movementType: 'W' }) },
      hexMap: m,
      orders: [{ vehicleId: 'u1', steps: [{ type: 'move', direction: 0 }] }],
      owDeclarations: [],
      owRolls: [],
    });
    expect(res.vehicleResults[0]!.abortReason).toBe('terrain_prohibited');
  });
});

// ---------------------------------------------------------------------------
// Rotation (4.5.1.1.4)
// ---------------------------------------------------------------------------

describe('rotation', () => {
  it('free 1-hexside rotation costs 0 MP', () => {
    const res = movementPhase(makeInput({ command: 'MOVE' }, {
      orders: [{
        vehicleId: 'u1',
        steps: [
          { type: 'rotate', newFacing: 1 }, // 1 hexside from facing=0 → free
          { type: 'move',   direction: 1 },
        ],
      }],
    }));
    const r = res.vehicleResults[0]!;
    expect(r.pathTaken[0]!.costPaid).toBe(0);   // rotation was free
    expect(r.facingAfter).toBe(1);
    expect(r.allowanceUsed).toBe(1);             // only the move step cost
  });

  it('2-hexside rotation costs Turn value of terrain (clear=1)', () => {
    const res = movementPhase(makeInput({ command: 'MOVE' }, {
      orders: [{
        vehicleId: 'u1',
        steps: [{ type: 'rotate', newFacing: 2 }], // 2 hexsides from facing=0
      }],
    }));
    const r = res.vehicleResults[0]!;
    expect(r.pathTaken[0]!.costPaid).toBe(1); // Turn cost for clear = 1
    expect(r.allowanceUsed).toBe(1);
  });

  it('free rotation resets on each new hex entered', () => {
    // Move, rotate (free in new hex), move again
    const res = movementPhase(makeInput({ command: 'MOVE' }, {
      orders: [{
        vehicleId: 'u1',
        steps: [
          { type: 'move',   direction: 0 },        // enter hex 1,0
          { type: 'rotate', newFacing: 1 },         // free rotation in hex 1,0
          { type: 'move',   direction: 1 },         // enter hex 2,-1 (direction 1)
        ],
      }],
    }));
    const r = res.vehicleResults[0]!;
    // rotation is free; total cost = 1 (move to 1,0) + 0 (rotate) + 1 (move to 2,-1) = 2
    expect(r.allowanceUsed).toBe(2);
    expect(r.abortReason).toBeUndefined();
  });

  it('rotation cannot exceed allowance', () => {
    // Vehicle has 1 allowance. 3-hexside rotation in clear = 1 MP. After rotation, nothing left.
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'SHORT_HALT', damage: 'damaged' }) },
      blueprints: { T: makeBlueprint() },  // allowance = 1
      hexMap: clearMap(),
      orders: [{
        vehicleId: 'u1',
        steps: [
          { type: 'rotate', newFacing: 3 }, // 3 hexsides, costs 1 MP
          { type: 'rotate', newFacing: 0 }, // would cost another 1 MP — should be skipped
        ],
      }],
      owDeclarations: [],
      owRolls: [],
    });
    const r = res.vehicleResults[0]!;
    expect(r.facingAfter).toBe(3);          // first rotation applied
    expect(r.allowanceUsed).toBe(1);        // second rotation skipped (no allowance left)
  });
});

// ---------------------------------------------------------------------------
// Road and path movement (4.5.1.1.5)
// ---------------------------------------------------------------------------

describe('road movement (4.5.1.1.5)', () => {
  function roadMap(): Record<string, HexData> {
    const m = clearMap();
    for (let q = 0; q <= 5; q++) m[`${q},0`] = { terrain: 'road', elevation: 0 };
    return m;
  }

  it('uses movementFast allowance on road', () => {
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'MOVE', q: 0, r: 0 }) },
      blueprints: { T: makeBlueprint() },
      hexMap: roadMap(),
      orders: [{ vehicleId: 'u1', steps: [{ type: 'move', direction: 0 }] }],
      owDeclarations: [],
      owRolls: [],
    });
    expect(res.vehicleResults[0]!.allowanceTotal).toBe(10);
  });

  it('road movement costs 1 MP per hex', () => {
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'MOVE', q: 0, r: 0 }) },
      blueprints: { T: makeBlueprint() },
      hexMap: roadMap(),
      orders: [{
        vehicleId: 'u1',
        steps: [
          { type: 'move', direction: 0 },
          { type: 'move', direction: 0 },
          { type: 'move', direction: 0 },
        ],
      }],
      owDeclarations: [],
      owRolls: [],
    });
    const r = res.vehicleResults[0]!;
    expect(r.movementMode).toBe('road');
    expect(r.allowanceUsed).toBe(3);
    expect(r.toHex).toEqual({ q: 3, r: 0 });
  });

  it('leaves road → falls back to cross_country allowance', () => {
    // Steps go off road after first hex
    const m = roadMap();
    m['1,1'] = { terrain: 'clear', elevation: 0 }; // not road
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'MOVE', q: 0, r: 0 }) },
      blueprints: { T: makeBlueprint() },
      hexMap: m,
      orders: [{
        vehicleId: 'u1',
        // direction 5 goes to 0,1 (which is clear, not road) — breaks road movement
        steps: [{ type: 'move', direction: 5 }],
      }],
      owDeclarations: [],
      owRolls: [],
    });
    expect(res.vehicleResults[0]!.movementMode).toBe('cross_country');
    expect(res.vehicleResults[0]!.allowanceTotal).toBe(6); // CC allowance
  });

  it('reverse on road costs 2 MP', () => {
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'MOVE', q: 2, r: 0 }) },
      blueprints: { T: makeBlueprint() },
      hexMap: roadMap(),
      orders: [{
        vehicleId: 'u1',
        steps: [{ type: 'move', direction: 3, reverse: true }], // direction 3 = west = backwards if facing=0
      }],
      owDeclarations: [],
      owRolls: [],
    });
    // Road reverse: 2 MP. But since the vehicle ends on road hex, mode remains 'road'.
    const r = res.vehicleResults[0]!;
    expect(r.pathTaken[0]!.costPaid).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Reverse movement (4.5.1.1.7)
// ---------------------------------------------------------------------------

describe('reverse movement', () => {
  it('reverse in clear costs 2× terrain cost', () => {
    const res = movementPhase(makeInput({ command: 'MOVE', q: 3, r: 3 }, {
      orders: [{
        vehicleId: 'u1',
        steps: [{ type: 'move', direction: 3, reverse: true }],
      }],
    }));
    const r = res.vehicleResults[0]!;
    expect(r.pathTaken[0]!.costPaid).toBe(2); // 2 × 1 (clear)
    expect(r.movementMode).toBe('reverse');
  });

  it('reverse facing does not change', () => {
    const res = movementPhase(makeInput({ command: 'MOVE', facing: 0, q: 3, r: 3 }, {
      orders: [{
        vehicleId: 'u1',
        steps: [{ type: 'move', direction: 3, reverse: true }],
      }],
    }));
    expect(res.vehicleResults[0]!.facingAfter).toBe(0); // facing unchanged
  });
});

// ---------------------------------------------------------------------------
// Off-map exit (4.5.1.1.9)
// ---------------------------------------------------------------------------

describe('off-map exit', () => {
  it('unit exiting map is flagged offMap=true', () => {
    // q=0,r=0; direction 3 (west) leads to q=-1,r=0 — off map
    const res = movementPhase(makeInput({ command: 'MOVE', q: 0, r: 0 }, {
      orders: [{
        vehicleId: 'u1',
        steps: [{ type: 'move', direction: 3 }],
      }],
    }));
    const r = res.vehicleResults[0]!;
    expect(r.offMap).toBe(true);
  });

  it('off-map unit position in updatedUnit stays at last in-map hex', () => {
    const res = movementPhase(makeInput({ command: 'MOVE', q: 0, r: 0 }, {
      orders: [{
        vehicleId: 'u1',
        steps: [{ type: 'move', direction: 3 }],
      }],
    }));
    const updated = res.updatedUnits['u1']!;
    expect(updated.q).toBe(0);
    expect(updated.r).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Execution order: second player moves first
// ---------------------------------------------------------------------------

describe('execution order', () => {
  it("second player's unit (allied when axis=first) is processed first", () => {
    const alliedUnit = makeUnit({ instanceId: 'a1', blueprintId: 'T', side: 'allied', command: 'MOVE', q: 0, r: 0 });
    const axisUnit   = makeUnit({ instanceId: 'b1', blueprintId: 'T', side: 'axis',   command: 'MOVE', q: 5, r: 5 });
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { a1: alliedUnit, b1: axisUnit },
      blueprints: { T: makeBlueprint() },
      hexMap: clearMap(),
      orders: [
        { vehicleId: 'a1', steps: [{ type: 'move', direction: 0 }] },
        { vehicleId: 'b1', steps: [{ type: 'move', direction: 0 }] },
      ],
      owDeclarations: [],
      owRolls: [],
    });
    // allied (second player) comes first in vehicleResults
    expect(res.vehicleResults[0]!.vehicleId).toBe('a1');
    expect(res.vehicleResults[1]!.vehicleId).toBe('b1');
  });
});

// ---------------------------------------------------------------------------
// Overwatch fire during movement
// ---------------------------------------------------------------------------

describe('overwatch fire', () => {
  it('OW unit fires when declared target enters its FoF', () => {
    // u1 = allied mover, u2 = axis OW unit
    const mover = makeUnit({ instanceId: 'u1', side: 'allied', command: 'MOVE',      q: 0, r: 0, facing: 0 });
    const owUnit = makeUnit({ instanceId: 'u2', side: 'axis',   command: 'OVERWATCH', q: 5, r: 0, facing: 3, blueprintId: 'T' });
    const res = movementPhase({
      firstPlayer: 'axis',             // allied = second player, moves first
      units: { u1: mover, u2: owUnit },
      blueprints: { T: makeBlueprint() },
      hexMap: clearMap(),
      orders: [{ vehicleId: 'u1', steps: [{ type: 'move', direction: 0 }] }],
      owDeclarations: [{ shooterId: 'u2', targetId: 'u1' }],
      owRolls: [100],                  // guaranteed miss
    });
    const r = res.vehicleResults[0]!;
    expect(r.triggeredOverwatch).toHaveLength(1);
    expect(r.triggeredOverwatch[0]!.shooterId).toBe('u2');
    expect(r.triggeredOverwatch[0]!.trigger).toBe('hex_entry');
    expect(r.triggeredOverwatch[0]!.shot.result).toBe('miss'); // roll 100 = miss
  });

  it('OW unit fires at most once (hasActed after firing)', () => {
    const mover  = makeUnit({ instanceId: 'u1', side: 'allied', command: 'MOVE',      q: 0, r: 0 });
    const owUnit = makeUnit({ instanceId: 'u2', side: 'axis',   command: 'OVERWATCH', q: 5, r: 0, facing: 3, blueprintId: 'T' });
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: mover, u2: owUnit },
      blueprints: { T: makeBlueprint() },
      hexMap: clearMap(),
      orders: [{
        vehicleId: 'u1',
        steps: [
          { type: 'move', direction: 0 }, // triggers OW once
          { type: 'move', direction: 0 }, // OW already fired — no second trigger
        ],
      }],
      owDeclarations: [{ shooterId: 'u2', targetId: 'u1' }],
      owRolls: [100, 100],
    });
    const r = res.vehicleResults[0]!;
    expect(r.triggeredOverwatch).toHaveLength(1); // only once
    expect(res.updatedUnits['u2']!.hasActed).toBe(true);
  });

  it('unit eliminated by OW stops moving', () => {
    // Guarantee a hit + KO: set OW unit very close, roll low (penetration win)
    const mover  = makeUnit({
      instanceId: 'u1', side: 'allied', command: 'MOVE', q: 0, r: 0,
      blueprintId: 'thin',
    });
    const owUnit = makeUnit({
      instanceId: 'u2', side: 'axis', command: 'OVERWATCH', q: 1, r: 0, facing: 3,
      blueprintId: 'T',
    });
    // Thin vehicle: very low armor (HR=0) so any penetrating round will KO it
    const thinBP: VehicleData = makeBlueprint({
      id: 'thin',
      armor: {
        GPD: '1P',
        frontOrRear: {
          level: { TF: 0, TR: 0, HF: 0, HR: 0 },
          rise:  { TF: 0, TR: 0, HF: 0, HR: 0 },
          fall:  { TF: 0, TR: 0, HF: 0, HR: 0 },
        },
        frontSideOrRearSide: {
          level: { TF: 0, TS: 0, TR: 0, HF: 0, HS: 0, HR: 0 },
          rise:  { TF: 0, TS: 0, TR: 0, HF: 0, HS: 0, HR: 0 },
          fall:  { TF: 0, TS: 0, TR: 0, HF: 0, HS: 0, HR: 0 },
        },
      },
    });

    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: mover, u2: owUnit },
      blueprints: { T: makeBlueprint(), thin: thinBP },
      hexMap: clearMap(),
      orders: [{
        vehicleId: 'u1',
        steps: [
          { type: 'move', direction: 0 }, // enters 1,0 — triggers OW → KO'd
          { type: 'move', direction: 0 }, // should NOT execute
        ],
      }],
      owDeclarations: [{ shooterId: 'u2', targetId: 'u1' }],
      owRolls: [1], // guaranteed hit at point-blank with roll=1
    });

    const r = res.vehicleResults[0]!;
    expect(r.updatedUnit.damage).not.toBe('ok');
    // If KO'd, movement stops after the hit
    if (r.updatedUnit.damage === 'ko' || r.updatedUnit.damage === 'bu') {
      expect(r.toHex).toEqual({ q: 1, r: 0 }); // stopped after entering OW hex
      expect(r.abortReason).toBe('eliminated_by_overwatch');
    }
  });

  it('allied OW unit does not fire at allied mover', () => {
    const mover  = makeUnit({ instanceId: 'u1', side: 'allied', command: 'MOVE',      q: 0, r: 0 });
    const owUnit = makeUnit({ instanceId: 'u2', side: 'allied', command: 'OVERWATCH', q: 5, r: 0, facing: 3, blueprintId: 'T' });
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: mover, u2: owUnit },
      blueprints: { T: makeBlueprint() },
      hexMap: clearMap(),
      orders: [{ vehicleId: 'u1', steps: [{ type: 'move', direction: 0 }] }],
      owDeclarations: [{ shooterId: 'u2', targetId: 'u1' }],
      owRolls: [50],
    });
    expect(res.vehicleResults[0]!.triggeredOverwatch).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Elevation change costs integrated in movement
// ---------------------------------------------------------------------------

describe('elevation changes during movement', () => {
  it('going uphill adds +1 to terrain cost', () => {
    const m = clearMap({
      '0,0': { terrain: 'clear', elevation: 0 },
      '1,0': { terrain: 'clear', elevation: 1 }, // +1 elevation
    });
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'MOVE' }) },
      blueprints: { T: makeBlueprint() },
      hexMap: m,
      orders: [{ vehicleId: 'u1', steps: [{ type: 'move', direction: 0 }] }],
      owDeclarations: [],
      owRolls: [],
    });
    const r = res.vehicleResults[0]!;
    expect(r.pathTaken[0]!.costPaid).toBe(2); // clear(1) + elevation change(1)
  });

  it('going 2 levels up costs +2 for tracked', () => {
    const m = clearMap({
      '0,0': { terrain: 'clear', elevation: 0 },
      '1,0': { terrain: 'clear', elevation: 2 },
    });
    const res = movementPhase({
      firstPlayer: 'axis',
      units: { u1: makeUnit({ command: 'MOVE' }) },
      blueprints: { T: makeBlueprint() },
      hexMap: m,
      orders: [{ vehicleId: 'u1', steps: [{ type: 'move', direction: 0 }] }],
      owDeclarations: [],
      owRolls: [],
    });
    expect(res.vehicleResults[0]!.pathTaken[0]!.costPaid).toBe(3); // 1 + 2
  });
});
