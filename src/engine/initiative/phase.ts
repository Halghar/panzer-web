import type { Side, ForceGrade } from '../state/types';
import { FORCE_GRADE_MODIFIER } from '../state/types';
import type {
  BasicInitiativeResult,
  AdvancedInitiativeResult,
  StaggeredRound,
  StaggeredInitiativeResult,
} from './types';

function winner(alliedNet: number, axisNet: number): Side | null {
  if (alliedNet > axisNet) return 'allied';
  if (axisNet > alliedNet) return 'axis';
  return null;
}

/**
 * Resolves Basic Initiative (4.3.1).
 *
 * `rollPairs` is consumed in order until a non-tie round is found.
 * Callers inject all roll values (including rerolls) so the function stays pure.
 * Throws when every supplied pair is a tie.
 */
export function resolveBasicInitiative(
  rollPairs: [number, number][],
): BasicInitiativeResult {
  const rounds: BasicInitiativeResult['rounds'] = [];

  for (const [alliedRoll, axisRoll] of rollPairs) {
    rounds.push({ alliedRoll, axisRoll });
    const side = winner(alliedRoll, axisRoll);
    if (side !== null) return { firstPlayer: side, rounds };
  }

  throw new Error(
    `All ${rollPairs.length} initiative roll(s) tied — supply additional reroll pairs.`,
  );
}

/**
 * Resolves Advanced Initiative (6.3.1).
 *
 * Each roll is adjusted by the Force Grade Modifier before comparison.
 * Net results may exceed 100 or fall below 0 — this is by design.
 */
export function resolveAdvancedInitiative(
  rollPairs: [number, number][],
  alliedGrade: ForceGrade,
  axisGrade: ForceGrade,
): AdvancedInitiativeResult {
  const rounds: AdvancedInitiativeResult['rounds'] = [];

  for (const [alliedRoll, axisRoll] of rollPairs) {
    const alliedNet = alliedRoll + FORCE_GRADE_MODIFIER[alliedGrade];
    const axisNet = axisRoll + FORCE_GRADE_MODIFIER[axisGrade];
    rounds.push({ alliedRoll, axisRoll, alliedNet, axisNet });
    const side = winner(alliedNet, axisNet);
    if (side !== null) return { firstPlayer: side, alliedGrade, axisGrade, rounds };
  }

  throw new Error(
    `All ${rollPairs.length} advanced initiative roll(s) tied — supply additional reroll pairs.`,
  );
}

/** Input for a single staggered round (one formation pair). */
export interface StaggeredRoundInput {
  alliedFormationId: string;
  axisFormationId: string;
  /** Roll pairs to consume until a winner is found within this round. */
  rollPairs: [number, number][];
}

/**
 * Resolves Staggered Initiative (7.42).
 *
 * Each entry in `rounds` represents one formation-vs-formation contest.
 * The overall firstPlayer is the winner of the first round and determines
 * indirect fire order.  The full rounds array establishes direct fire order;
 * the Movement Phase reverses it.
 */
export function resolveStaggeredInitiative(
  rounds: StaggeredRoundInput[],
  alliedGrade: ForceGrade,
  axisGrade: ForceGrade,
): StaggeredInitiativeResult {
  if (rounds.length === 0) {
    throw new Error('Staggered initiative requires at least one formation round.');
  }

  const resolvedRounds: StaggeredRound[] = [];

  for (const round of rounds) {
    let roundWinner: Side | null = null;
    let lastAlliedRoll = 0;
    let lastAxisRoll = 0;
    let lastAlliedNet = 0;
    let lastAxisNet = 0;

    for (const [alliedRoll, axisRoll] of round.rollPairs) {
      const alliedNet = alliedRoll + FORCE_GRADE_MODIFIER[alliedGrade];
      const axisNet = axisRoll + FORCE_GRADE_MODIFIER[axisGrade];
      lastAlliedRoll = alliedRoll;
      lastAxisRoll = axisRoll;
      lastAlliedNet = alliedNet;
      lastAxisNet = axisNet;
      roundWinner = winner(alliedNet, axisNet);
      if (roundWinner !== null) break;
    }

    if (roundWinner === null) {
      throw new Error(
        `Staggered round "${round.alliedFormationId}/${round.axisFormationId}" ` +
        `tied on all ${round.rollPairs.length} roll(s) — supply additional reroll pairs.`,
      );
    }

    resolvedRounds.push({
      alliedFormationId: round.alliedFormationId,
      axisFormationId: round.axisFormationId,
      alliedRoll: lastAlliedRoll,
      axisRoll: lastAxisRoll,
      alliedNet: lastAlliedNet,
      axisNet: lastAxisNet,
      winner: roundWinner,
    });
  }

  return {
    firstPlayer: resolvedRounds[0]!.winner,
    alliedGrade,
    axisGrade,
    rounds: resolvedRounds,
  };
}
