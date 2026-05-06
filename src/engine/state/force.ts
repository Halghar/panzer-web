import type { Side } from './types';

/** Force veterancy grade — see 6.3.1 */
export type ForceGrade = 'Elite' | 'Veteran' | 'Seasoned' | 'Regulars' | 'Green';

/** d100 modifier applied to initiative rolls — see 6.3.1 */
export const FORCE_GRADE_MODIFIER: Record<ForceGrade, number> = {
  Elite: 40,
  Veteran: 20,
  Seasoned: 0,
  Regulars: -20,
  Green: -40,
};

/** One of the two opposing forces in a game — see 4.3.1, 6.3.1 */
export interface Force {
  side: Side;
  grade: ForceGrade;
  /** Instance IDs of all units belonging to this force */
  unitIds: string[];
  /** Total point cost of all units in this force */
  pointCost: number;
}

/** Formation fire order entry produced by Staggered Initiative (7.42).
 *  The Movement Phase uses this list in reverse. */
export interface StaggeredFormationOrder {
  alliedFormationId: string;
  axisFormationId: string;
  winner: Side;
}
