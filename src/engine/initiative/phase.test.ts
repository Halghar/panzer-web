import { describe, it, expect } from 'vitest';
import {
  resolveBasicInitiative,
  resolveAdvancedInitiative,
  resolveStaggeredInitiative,
} from './phase';

// ---------------------------------------------------------------------------
// Basic Initiative — 4.3.1
// ---------------------------------------------------------------------------

describe('resolveBasicInitiative', () => {
  it('allied wins when allied roll is higher', () => {
    const result = resolveBasicInitiative([[70, 40]]);
    expect(result.firstPlayer).toBe('allied');
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0]).toEqual({ alliedRoll: 70, axisRoll: 40 });
  });

  it('axis wins when axis roll is higher', () => {
    const result = resolveBasicInitiative([[30, 85]]);
    expect(result.firstPlayer).toBe('axis');
  });

  it('axis wins on a max roll vs low allied roll', () => {
    const result = resolveBasicInitiative([[1, 100]]);
    expect(result.firstPlayer).toBe('axis');
  });

  it('allied wins on max roll vs low axis roll', () => {
    const result = resolveBasicInitiative([[100, 1]]);
    expect(result.firstPlayer).toBe('allied');
  });

  it('tie on first pair, allied wins on second pair', () => {
    const result = resolveBasicInitiative([[50, 50], [60, 30]]);
    expect(result.firstPlayer).toBe('allied');
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0]).toEqual({ alliedRoll: 50, axisRoll: 50 });
    expect(result.rounds[1]).toEqual({ alliedRoll: 60, axisRoll: 30 });
  });

  it('tie on first pair, axis wins on second pair', () => {
    const result = resolveBasicInitiative([[50, 50], [20, 80]]);
    expect(result.firstPlayer).toBe('axis');
    expect(result.rounds).toHaveLength(2);
  });

  it('two consecutive ties, axis wins on third pair', () => {
    const result = resolveBasicInitiative([[42, 42], [17, 17], [10, 90]]);
    expect(result.firstPlayer).toBe('axis');
    expect(result.rounds).toHaveLength(3);
  });

  it('does not consume extra roll pairs once a winner is found', () => {
    const result = resolveBasicInitiative([[80, 20], [50, 50]]);
    expect(result.firstPlayer).toBe('allied');
    expect(result.rounds).toHaveLength(1);
  });

  it('throws when all supplied pairs are ties', () => {
    expect(() => resolveBasicInitiative([[50, 50], [50, 50]])).toThrow();
  });

  it('throws when no roll pairs are supplied', () => {
    expect(() => resolveBasicInitiative([])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Advanced Initiative — 6.3.1
// ---------------------------------------------------------------------------

describe('resolveAdvancedInitiative', () => {
  it('Elite (+40) beats Green (-40) even with lower raw roll', () => {
    // Allied Elite roll 30 → net 70.  Axis Green roll 50 → net 10.
    const result = resolveAdvancedInitiative([[30, 50]], 'Elite', 'Green');
    expect(result.firstPlayer).toBe('allied');
    expect(result.rounds[0]).toMatchObject({ alliedNet: 70, axisNet: 10 });
  });

  it('Green (-40) loses to Regulars (-20) on equal raw rolls', () => {
    // Allied Green 60 → net 20.  Axis Regulars 60 → net 40.
    const result = resolveAdvancedInitiative([[60, 60]], 'Green', 'Regulars');
    expect(result.firstPlayer).toBe('axis');
    expect(result.rounds[0]).toMatchObject({ alliedNet: 20, axisNet: 40 });
  });

  it('net result can exceed 100 (Elite roll 80 → net 120)', () => {
    const result = resolveAdvancedInitiative([[80, 50]], 'Elite', 'Seasoned');
    expect(result.rounds[0]!.alliedNet).toBe(120);
  });

  it('net result can go below 0 (Green roll 10 → net -30)', () => {
    const result = resolveAdvancedInitiative([[50, 10]], 'Seasoned', 'Green');
    expect(result.rounds[0]!.axisNet).toBe(-30);
  });

  it('Seasoned vs Seasoned: modifiers cancel, same comparison as basic', () => {
    const result = resolveAdvancedInitiative([[70, 40]], 'Seasoned', 'Seasoned');
    expect(result.firstPlayer).toBe('allied');
    expect(result.rounds[0]).toMatchObject({ alliedNet: 70, axisNet: 40 });
  });

  it('all grade modifiers: Elite vs Veteran → +20 advantage', () => {
    // Allied Elite 50 → 90.  Axis Veteran 70 → 90.  Tie → use second pair.
    const result = resolveAdvancedInitiative([[50, 70], [60, 40]], 'Elite', 'Veteran');
    expect(result.rounds[0]).toMatchObject({ alliedNet: 90, axisNet: 90 });
    expect(result.firstPlayer).toBe('allied'); // 60+40=100 vs 40+20=60
    expect(result.rounds).toHaveLength(2);
  });

  it('records all grades on the result', () => {
    const result = resolveAdvancedInitiative([[55, 30]], 'Veteran', 'Regulars');
    expect(result.alliedGrade).toBe('Veteran');
    expect(result.axisGrade).toBe('Regulars');
  });

  it('Veteran (+20) each side: same modifier, raw roll decides', () => {
    const result = resolveAdvancedInitiative([[45, 90]], 'Veteran', 'Veteran');
    expect(result.firstPlayer).toBe('axis');
  });

  it('throws when all pairs tie after modifiers', () => {
    // Elite 10 → 50.  Green 90 → 50.  Tie.
    expect(() =>
      resolveAdvancedInitiative([[10, 90]], 'Elite', 'Green'),
    ).toThrow();
  });

  it('rerolls on modifier-caused tie, decides on next pair', () => {
    // Elite 10 → 50 vs Green 90 → 50: tie.  Then Elite 60 → 100 vs Green 30 → -10: allied wins.
    const result = resolveAdvancedInitiative([[10, 90], [60, 30]], 'Elite', 'Green');
    expect(result.firstPlayer).toBe('allied');
    expect(result.rounds).toHaveLength(2);
  });

  it('five grade values all produce correct modifiers', () => {
    // Allied Regulars 60 → 40. Axis Green 80 → 40. Tie.  Then axis 81 → 41 wins.
    const result = resolveAdvancedInitiative([[60, 80], [60, 81]], 'Regulars', 'Green');
    expect(result.rounds[0]).toMatchObject({ alliedNet: 40, axisNet: 40 });
    expect(result.rounds[1]).toMatchObject({ alliedNet: 40, axisNet: 41 });
    expect(result.firstPlayer).toBe('axis');
  });
});

// ---------------------------------------------------------------------------
// Staggered Initiative — 7.42
// ---------------------------------------------------------------------------

describe('resolveStaggeredInitiative', () => {
  it('firstPlayer is the winner of the first formation round', () => {
    const result = resolveStaggeredInitiative(
      [
        { alliedFormationId: 'A1', axisFormationId: 'G1', rollPairs: [[80, 20]] },
        { alliedFormationId: 'A2', axisFormationId: 'G2', rollPairs: [[30, 70]] },
      ],
      'Seasoned',
      'Seasoned',
    );
    expect(result.firstPlayer).toBe('allied');
    expect(result.rounds).toHaveLength(2);
  });

  it('second round can have a different winner than the first', () => {
    const result = resolveStaggeredInitiative(
      [
        { alliedFormationId: 'A1', axisFormationId: 'G1', rollPairs: [[80, 20]] },
        { alliedFormationId: 'A2', axisFormationId: 'G2', rollPairs: [[10, 90]] },
      ],
      'Seasoned',
      'Seasoned',
    );
    expect(result.rounds[0]!.winner).toBe('allied');
    expect(result.rounds[1]!.winner).toBe('axis');
  });

  it('grade modifiers are applied in staggered rounds', () => {
    // Allied Elite roll 30 → 70.  Axis Green roll 60 → 20.  Allied wins.
    const result = resolveStaggeredInitiative(
      [{ alliedFormationId: 'A1', axisFormationId: 'G1', rollPairs: [[30, 60]] }],
      'Elite',
      'Green',
    );
    expect(result.rounds[0]).toMatchObject({ alliedNet: 70, axisNet: 20, winner: 'allied' });
  });

  it('single formation round resolved correctly', () => {
    const result = resolveStaggeredInitiative(
      [{ alliedFormationId: 'tank1', axisFormationId: 'panzer1', rollPairs: [[55, 70]] }],
      'Seasoned',
      'Seasoned',
    );
    expect(result.firstPlayer).toBe('axis');
    expect(result.rounds[0]).toMatchObject({
      alliedFormationId: 'tank1',
      axisFormationId: 'panzer1',
      alliedRoll: 55,
      axisRoll: 70,
      winner: 'axis',
    });
  });

  it('tie within a round triggers reroll pairs', () => {
    const result = resolveStaggeredInitiative(
      [
        {
          alliedFormationId: 'A1',
          axisFormationId: 'G1',
          rollPairs: [[50, 50], [60, 40]], // tie then allied wins
        },
      ],
      'Seasoned',
      'Seasoned',
    );
    expect(result.firstPlayer).toBe('allied');
    expect(result.rounds[0]).toMatchObject({ alliedRoll: 60, axisRoll: 40 });
  });

  it('records formation IDs on each round', () => {
    const result = resolveStaggeredInitiative(
      [
        { alliedFormationId: 'A1', axisFormationId: 'G1', rollPairs: [[70, 30]] },
        { alliedFormationId: 'A2', axisFormationId: 'G2', rollPairs: [[20, 80]] },
      ],
      'Seasoned',
      'Seasoned',
    );
    expect(result.rounds[0]!.alliedFormationId).toBe('A1');
    expect(result.rounds[0]!.axisFormationId).toBe('G1');
    expect(result.rounds[1]!.alliedFormationId).toBe('A2');
    expect(result.rounds[1]!.axisFormationId).toBe('G2');
  });

  it('records both grades on the result', () => {
    const result = resolveStaggeredInitiative(
      [{ alliedFormationId: 'A1', axisFormationId: 'G1', rollPairs: [[60, 40]] }],
      'Veteran',
      'Green',
    );
    expect(result.alliedGrade).toBe('Veteran');
    expect(result.axisGrade).toBe('Green');
  });

  it('three formation rounds all resolve in order', () => {
    const result = resolveStaggeredInitiative(
      [
        { alliedFormationId: 'A1', axisFormationId: 'G1', rollPairs: [[80, 20]] },
        { alliedFormationId: 'A2', axisFormationId: 'G2', rollPairs: [[30, 90]] },
        { alliedFormationId: 'A3', axisFormationId: 'G3', rollPairs: [[60, 50]] },
      ],
      'Seasoned',
      'Seasoned',
    );
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds.map((r) => r.winner)).toEqual(['allied', 'axis', 'allied']);
  });

  it('throws when no formation rounds are supplied', () => {
    expect(() =>
      resolveStaggeredInitiative([], 'Seasoned', 'Seasoned'),
    ).toThrow();
  });

  it('throws when a round has all ties and no more reroll pairs', () => {
    expect(() =>
      resolveStaggeredInitiative(
        [{ alliedFormationId: 'A1', axisFormationId: 'G1', rollPairs: [[50, 50]] }],
        'Seasoned',
        'Seasoned',
      ),
    ).toThrow();
  });

  it('axis wins when axis grade advantage overcomes a lower raw roll', () => {
    // Axis Veteran roll 40 → 60.  Allied Green roll 70 → 30.  Axis wins.
    const result = resolveStaggeredInitiative(
      [{ alliedFormationId: 'A1', axisFormationId: 'G1', rollPairs: [[70, 40]] }],
      'Green',
      'Veteran',
    );
    expect(result.firstPlayer).toBe('axis');
    expect(result.rounds[0]).toMatchObject({ alliedNet: 30, axisNet: 60 });
  });
});
