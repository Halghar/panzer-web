import { useGameStore } from '@engine/state/store';

export function PhaseIndicator() {
  const turn = useGameStore((s) => s.turn);
  const phase = useGameStore((s) => s.currentPhase);
  const advance = useGameStore((s) => s.advancePhase);

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        background: 'rgba(20, 20, 20, 0.92)',
        color: '#e0e0e0',
        padding: '12px 16px',
        borderRadius: 8,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        border: '1px solid #444',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div>
        <div style={{ color: '#999', fontSize: 11 }}>Turn {turn}</div>
        <div style={{ fontSize: 16, fontWeight: 'bold' }}>{phase}</div>
      </div>
      <button
        onClick={advance}
        style={{
          background: '#4a5d3f',
          color: '#fff',
          border: '1px solid #6a7a5a',
          padding: '6px 12px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Next phase →
      </button>
    </div>
  );
}
