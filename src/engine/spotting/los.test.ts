import { describe, it, expect } from 'vitest';
import { checkLOS } from './los';
import type { HexTile, TerrainMap, TerrainType } from '../terrain/types';

function tile(
  q: number,
  r: number,
  terrain: TerrainType = 'clear',
  opts: { hill?: number; road?: boolean; path?: boolean; stories?: number } = {},
): HexTile {
  return {
    q,
    r,
    terrain,
    hillLevel: opts.hill ?? 0,
    hasRoad: opts.road ?? false,
    hasPath: opts.path ?? false,
    buildingStories: opts.stories,
  };
}

function mapOf(...tiles: HexTile[]): TerrainMap {
  const m: TerrainMap = new Map();
  for (const t of tiles) m.set(`${t.q},${t.r}`, t);
  return m;
}

/** Build a horizontal strip of clear hexes from q=0 to q=N. */
function strip(n: number, ...overrides: HexTile[]): TerrainMap {
  const m = mapOf();
  for (let q = 0; q <= n; q++) m.set(`${q},0`, tile(q, 0));
  for (const t of overrides) m.set(`${t.q},${t.r}`, t);
  return m;
}

describe('checkLOS — basic cases (4.1.4)', () => {
  it('clear strip: LOS unblocked', () => {
    const map = strip(10);
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 5, r: 0 }, map });
    expect(r.hasLOS).toBe(true);
  });

  it('same hex: trivially has LOS', () => {
    const map = strip(2);
    const r = checkLOS({ spotter: { q: 1, r: 0 }, target: { q: 1, r: 0 }, map });
    expect(r.hasLOS).toBe(true);
  });

  it('woods between two clear hexes: LOS blocked', () => {
    const map = strip(10, tile(3, 0, 'woods'));
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 5, r: 0 }, map });
    expect(r.hasLOS).toBe(false);
  });

  it('road through woods on a straight line: LOS unblocked', () => {
    const map = strip(10, tile(3, 0, 'woods', { road: true }));
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 5, r: 0 }, map });
    expect(r.hasLOS).toBe(true);
  });
});

describe('checkLOS — 4.1.4.2.1 obstacle higher than both', () => {
  it('woods (H=3) between two ground vehicles (H=0) blocks at any range', () => {
    const map = strip(20, tile(5, 0, 'woods'));
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 10, r: 0 }, map });
    expect(r.hasLOS).toBe(false);
    expect(!r.hasLOS && r.reason).toBe('blocking terrain');
  });
});

describe('checkLOS — 4.1.4.2.3 obstacle equal or lower', () => {
  it('clear hex (H=0) does not block ground-to-ground LOS', () => {
    const map = strip(10);
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 5, r: 0 }, map });
    expect(r.hasLOS).toBe(true);
  });

  it('ground unit on hill (H=1) → woods (H=3) → ground unit on bigger hill', () => {
    // Spotter at H=4, target at H=4, woods H=3 → equal-or-lower than both.
    const map = mapOf(
      tile(0, 0, 'clear', { hill: 4 }),
      tile(1, 0, 'clear'),
      tile(2, 0, 'woods'),
      tile(3, 0, 'clear'),
      tile(4, 0, 'clear', { hill: 4 }),
    );
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 4, r: 0 }, map });
    expect(r.hasLOS).toBe(true);
  });
});

describe('checkLOS — 4.1.4.2.4 obstacle higher than one, lower than the other (blind zone)', () => {
  it('exactly reproduces the rulebook example: H=2 spotter, H=0 target, H=1 obstacle, blind zone of 7 behind', () => {
    // Higher vehicle at range 21 from itself; obstacle at range 14;
    // blind zone = 14/2 = 7. Targets at range 15-21 are blind.
    const map = mapOf();
    map.set('0,0', tile(0, 0, 'clear', { hill: 2 })); // spotter
    for (let q = 1; q <= 22; q++) map.set(`${q},0`, tile(q, 0, 'clear'));
    map.set('14,0', tile(14, 0, 'clear', { hill: 1 })); // obstacle

    // Target at range 15: in blind zone.
    const r15 = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 15, r: 0 }, map });
    expect(r15.hasLOS).toBe(false);
    expect(!r15.hasLOS && r15.reason).toBe('blind zone');

    // Target at range 21: edge of blind zone (14+7) — still blind.
    const r21 = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 21, r: 0 }, map });
    expect(r21.hasLOS).toBe(false);

    // Target at range 22: just beyond blind zone — visible again.
    const r22 = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 22, r: 0 }, map });
    expect(r22.hasLOS).toBe(true);
  });

  it('obstacle 2 lower → blind zone is range/4', () => {
    // Higher H=3, target H=0, obstacle H=1 (lower by 2 from higher).
    // Obstacle at range 16 → blind zone of 4 behind.
    const map = mapOf();
    map.set('0,0', tile(0, 0, 'clear', { hill: 3 }));
    for (let q = 1; q <= 22; q++) map.set(`${q},0`, tile(q, 0, 'clear'));
    map.set('16,0', tile(16, 0, 'clear', { hill: 1 }));

    const r17 = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 17, r: 0 }, map });
    expect(r17.hasLOS).toBe(false); // blind

    const r20 = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 20, r: 0 }, map });
    expect(r20.hasLOS).toBe(false); // edge of blind

    const r21 = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 21, r: 0 }, map });
    expect(r21.hasLOS).toBe(true); // beyond
  });
});

describe('checkLOS — 4.1.4.2.5 spotting into/from blocking terrain', () => {
  it('vehicle in woods can be spotted from adjacent clear hex (1 hex perimeter)', () => {
    const map = mapOf(
      tile(0, 0, 'clear'),
      tile(1, 0, 'woods'),
      tile(2, 0, 'woods'),
    );
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 1, r: 0 }, map });
    expect(r.hasLOS).toBe(true);
  });

  it('vehicle deep in woods (range 2) cannot be spotted from clear', () => {
    const map = mapOf(
      tile(0, 0, 'clear'),
      tile(1, 0, 'woods'),
      tile(2, 0, 'woods'),
    );
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 2, r: 0 }, map });
    expect(r.hasLOS).toBe(false);
  });

  it('two vehicles both in woods at range 1 spot each other', () => {
    const map = mapOf(tile(0, 0, 'woods'), tile(1, 0, 'woods'));
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 1, r: 0 }, map });
    expect(r.hasLOS).toBe(true);
  });
});

describe('checkLOS — 4.1.4.1.6 stream/gully/ford', () => {
  it('vehicle in stream cannot spot a vehicle on a hill at range 2', () => {
    // Stream H=-1, hill at H=1 → diff is 2 levels above the stream's
    // height. Per rule, only adjacent hexes may be spotted.
    const map = mapOf(
      tile(0, 0, 'stream'),
      tile(1, 0, 'clear'),
      tile(2, 0, 'clear', { hill: 1 }),
    );
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 2, r: 0 }, map });
    expect(r.hasLOS).toBe(false);
  });

  it('vehicle in stream CAN spot adjacent hill hex', () => {
    const map = mapOf(
      tile(0, 0, 'stream'),
      tile(1, 0, 'clear', { hill: 1 }),
    );
    const r = checkLOS({ spotter: { q: 0, r: 0 }, target: { q: 1, r: 0 }, map });
    expect(r.hasLOS).toBe(true);
  });
});
