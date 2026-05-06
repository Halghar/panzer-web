import { describe, it, expect } from 'vitest';
import { runSpottingPhase, targetsVisibleTo } from './phase';
import type { SpottableUnit } from './phase';
import type { HexTile, TerrainMap, TerrainType } from '../terrain/types';

function tile(q: number, r: number, terrain: TerrainType = 'clear'): HexTile {
  return { q, r, terrain, hillLevel: 0, hasRoad: false, hasPath: false };
}

function mapOf(...tiles: HexTile[]): TerrainMap {
  const m: TerrainMap = new Map();
  for (const t of tiles) m.set(`${t.q},${t.r}`, t);
  return m;
}

const baseUnit = (
  id: string,
  side: 'allied' | 'axis',
  q: number,
  r: number,
  overrides: Partial<SpottableUnit> = {},
): SpottableUnit => ({
  instanceId: id,
  side,
  q,
  r,
  canSpot: true,
  moved: false,
  fired: false,
  ...overrides,
});

describe('runSpottingPhase', () => {
  it('two opposing vehicles at range 5 in clear: both spotted', () => {
    const map = mapOf(
      tile(0, 0),
      tile(1, 0),
      tile(2, 0),
      tile(3, 0),
      tile(4, 0),
      tile(5, 0),
    );
    const a = baseUnit('a', 'allied', 0, 0);
    const b = baseUnit('b', 'axis', 5, 0);

    const r = runSpottingPhase([a, b], map);

    // Neither moved nor fired → spottedByMove (our collapse for "spotted via base range").
    expect(r.statusByUnit.get('a')).toBe('spottedByMove');
    expect(r.statusByUnit.get('b')).toBe('spottedByMove');
    expect(r.pairs).toHaveLength(2);
  });

  it('a fired target gets spottedByFire status', () => {
    const map = mapOf(tile(0, 0), tile(1, 0), tile(2, 0));
    const spotter = baseUnit('s', 'allied', 0, 0);
    const target = baseUnit('t', 'axis', 2, 0, { fired: true });

    const r = runSpottingPhase([spotter, target], map);
    expect(r.statusByUnit.get('t')).toBe('spottedByFire');
    // The spotter itself is not spotted (it didn't fire/move and the
    // axis unit, which is the only one that could spot it, fired —
    // but the axis unit can still spot the allied unit since it's
    // a combat vehicle).
    expect(r.statusByUnit.get('s')).toBe('spottedByMove');
  });

  it('woods between blocks LOS — units unspotted', () => {
    const map = mapOf(
      tile(0, 0),
      tile(1, 0),
      tile(2, 0, 'woods'),
      tile(3, 0),
      tile(4, 0),
    );
    const a = baseUnit('a', 'allied', 0, 0);
    const b = baseUnit('b', 'axis', 4, 0);

    const r = runSpottingPhase([a, b], map);
    expect(r.statusByUnit.get('a')).toBe('unspotted');
    expect(r.statusByUnit.get('b')).toBe('unspotted');
    expect(r.pairs).toHaveLength(0);
  });

  it('unarmed vehicle (canSpot=false) is never a spotter, but can be a target', () => {
    const map = mapOf(tile(0, 0), tile(1, 0), tile(2, 0));
    const truck = baseUnit('truck', 'allied', 0, 0, { canSpot: false });
    const tank = baseUnit('tank', 'axis', 2, 0);

    const r = runSpottingPhase([truck, tank], map);
    // The truck cannot spot, but the tank can spot the truck.
    expect(r.statusByUnit.get('truck')).toBe('spottedByMove');
    expect(r.statusByUnit.get('tank')).toBe('unspotted');
  });

  it('same-side units never spot each other (only opposing)', () => {
    const map = mapOf(tile(0, 0), tile(1, 0));
    const a = baseUnit('a', 'allied', 0, 0);
    const b = baseUnit('b', 'allied', 1, 0);

    const r = runSpottingPhase([a, b], map);
    expect(r.statusByUnit.get('a')).toBe('unspotted');
    expect(r.statusByUnit.get('b')).toBe('unspotted');
  });

  it('handoff: target stays spotted as long as ANY opposing unit sees it', () => {
    // a1 is blocked by woods; a2 sits BEHIND the enemy with clear LOS.
    const map = mapOf(
      tile(0, 0),
      tile(1, 0, 'woods'), // blocks a1
      tile(2, 0),
      tile(3, 0), // a2 here — clear path to enemy at (2,0)
    );
    const a1 = baseUnit('a1', 'allied', 0, 0); // blocked by woods
    const a2 = baseUnit('a2', 'allied', 3, 0); // clear LOS to enemy
    const enemy = baseUnit('e', 'axis', 2, 0);

    const r = runSpottingPhase([a1, a2, enemy], map);
    // At least one allied unit (a2) spots the enemy.
    expect(r.statusByUnit.get('e')).not.toBe('unspotted');
  });

  it('targetsVisibleTo returns only what the given spotter sees', () => {
    const map = mapOf(tile(0, 0), tile(1, 0), tile(2, 0));
    const a = baseUnit('a', 'allied', 0, 0);
    const b = baseUnit('b', 'axis', 1, 0);
    const c = baseUnit('c', 'axis', 2, 0);

    const visible = targetsVisibleTo('a', [a, b, c], map);
    expect(visible.sort()).toEqual(['b', 'c']);
  });
});
