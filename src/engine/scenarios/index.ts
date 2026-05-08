import { THE_CROSSINGS } from './the-crossings';
import type { Scenario } from './types';

export const SCENARIOS: Record<string, Scenario> = {
  [THE_CROSSINGS.id]: THE_CROSSINGS,
};

export { THE_CROSSINGS };
export type { Scenario, ScenarioPhase, DeploymentZone, ScenarioObjective, Reinforcement, ScenarioInitialUnit } from './types';
