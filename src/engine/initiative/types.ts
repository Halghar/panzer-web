import type { Side, ForceGrade } from '../state/types';

/** Result of a single Basic Initiative resolution — see 4.3.1 */
export interface BasicInitiativeResult {
  firstPlayer: Side;
  /** All rounds rolled in order; last entry is the decisive one */
  rounds: Array<{ alliedRoll: number; axisRoll: number }>;
}

/** Result of a single Advanced Initiative resolution — see 6.3.1 */
export interface AdvancedInitiativeResult {
  firstPlayer: Side;
  alliedGrade: ForceGrade;
  axisGrade: ForceGrade;
  /** All rounds rolled; net values include the Force Grade Modifier */
  rounds: Array<{
    alliedRoll: number;
    axisRoll: number;
    alliedNet: number;
    axisNet: number;
  }>;
}

/** One formation-vs-formation round within Staggered Initiative — see 7.42 */
export interface StaggeredRound {
  alliedFormationId: string;
  axisFormationId: string;
  alliedRoll: number;
  axisRoll: number;
  /** Net = roll + Force Grade Modifier */
  alliedNet: number;
  axisNet: number;
  winner: Side;
}

/** Full Staggered Initiative result — see 7.42 */
export interface StaggeredInitiativeResult {
  /** First-round winner resolves all indirect fire first */
  firstPlayer: Side;
  alliedGrade: ForceGrade;
  axisGrade: ForceGrade;
  /** Direct fire order; Movement Phase uses this list reversed */
  rounds: StaggeredRound[];
}
