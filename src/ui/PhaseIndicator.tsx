import { useGameStore } from '@engine/state/store';

const SIDE_LABEL: Record<string, string> = {
  allied: 'Alliés',
  axis: 'Axe',
};

const SIDE_COLOR: Record<string, string> = {
  allied: '#6a9a4a',
  axis: '#c06040',
};

export function PhaseIndicator() {
  const turn               = useGameStore((s) => s.turn);
  const phase              = useGameStore((s) => s.currentPhase);
  const firstPlayer        = useGameStore((s) => s.firstPlayer);
  const advance            = useGameStore((s) => s.advancePhase);
  const executeCombat      = useGameStore((s) => s.executeCombatPhase);
  const fireDeclarations   = useGameStore((s) => s.fireDeclarations);

  const handleAdvance = () => {
    if (phase === 'COMBAT' && firstPlayer && fireDeclarations.length > 0) {
      executeCombat();
    }
    advance();
  };

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
        <div style={{ color: '#999', fontSize: 11 }}>Tour {turn}</div>
        <div style={{ fontSize: 16, fontWeight: 'bold' }}>{phase}</div>
        {firstPlayer && (
          <div style={{ fontSize: 11, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#888' }}>Initiative :</span>
            <span
              style={{
                fontWeight: 'bold',
                color: SIDE_COLOR[firstPlayer] ?? '#ccc',
                background: 'rgba(255,255,255,0.07)',
                padding: '1px 6px',
                borderRadius: 3,
                border: `1px solid ${SIDE_COLOR[firstPlayer] ?? '#555'}`,
              }}
            >
              {SIDE_LABEL[firstPlayer] ?? firstPlayer}
            </span>
          </div>
        )}
      </div>
      <button
        onClick={handleAdvance}
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
        Phase suiv. →
      </button>
    </div>
  );
}
