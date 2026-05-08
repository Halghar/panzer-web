import { useEffect } from 'react';
import { PixiCanvas } from '@ui/PixiCanvas';
import { DataCardPanel } from '@ui/DataCardPanel';
import { PhaseIndicator } from '@ui/PhaseIndicator';
import { ControlsHint } from '@ui/ControlsHint';
import { DeploymentPanel } from '@ui/DeploymentPanel';
import { FactionSelectScreen } from '@ui/FactionSelectScreen';
import { CombatLog } from '@ui/CombatLog';
import { useGameStore } from './engine/state/store';

export function App() {
  const loadScenario = useGameStore((s) => s.loadScenario);

  useEffect(() => {
    loadScenario('the-crossings');
  }, [loadScenario]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#1a1a1a',
        overflow: 'hidden',
      }}
    >
      <PixiCanvas />
      <FactionSelectScreen />
      <DeploymentPanel />
      <PhaseIndicator />
      <DataCardPanel />
      <CombatLog />
      <ControlsHint />
    </div>
  );
}
