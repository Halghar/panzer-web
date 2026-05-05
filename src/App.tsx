import { PixiCanvas } from '@ui/PixiCanvas';
import { DataCardPanel } from '@ui/DataCardPanel';
import { PhaseIndicator } from '@ui/PhaseIndicator';
import { ControlsHint } from '@ui/ControlsHint';

export function App() {
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
      <PhaseIndicator />
      <DataCardPanel />
      <ControlsHint />
    </div>
  );
}
