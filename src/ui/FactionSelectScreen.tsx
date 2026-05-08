import { useGameStore } from '@engine/state/store';

export function FactionSelectScreen() {
  const scenarioPhase = useGameStore((s) => s.scenarioPhase);
  const humanSide     = useGameStore((s) => s.humanSide);
  const scenario      = useGameStore((s) => s.currentScenario);
  const setHumanSide  = useGameStore((s) => s.setHumanSide);

  if (scenarioPhase !== 'SETUP' || humanSide !== null || !scenario) return null;

  const factions = [
    {
      side: 'allied' as const,
      label: 'Allied',
      sublabel: scenario.forces[0].name ?? 'Soviet',
      color: '#4a7fc4',
      bg: 'rgba(74,127,196,0.12)',
      border: '#4a7fc4',
      flag: '🇷🇺',
    },
    {
      side: 'axis' as const,
      label: 'Axis',
      sublabel: scenario.forces[1].name ?? 'German',
      color: '#c47a3a',
      bg: 'rgba(196,122,58,0.12)',
      border: '#c47a3a',
      flag: '🇩🇪',
    },
  ];

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.72)',
      zIndex: 100,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: 'rgba(18,18,18,0.97)',
        border: '1px solid #444',
        borderRadius: 12,
        padding: '36px 48px',
        maxWidth: 560,
        width: '90%',
        textAlign: 'center',
      }}>
        <div style={{ color: '#888', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
          Scenario 1
        </div>
        <div style={{ color: '#f0e0c0', fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
          {scenario.name}
        </div>
        <div style={{ color: '#999', fontSize: 13, marginBottom: 28, lineHeight: 1.5 }}>
          {scenario.description}
        </div>

        <div style={{ color: '#ccc', fontSize: 13, marginBottom: 20 }}>
          Choose your faction — the opposing side will be controlled by AI.
        </div>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          {factions.map(({ side, label, sublabel, color, bg, border, flag }) => (
            <button
              key={side}
              onClick={() => setHumanSide(side)}
              style={{
                flex: 1,
                padding: '20px 16px',
                background: bg,
                border: `2px solid ${border}`,
                borderRadius: 8,
                cursor: 'pointer',
                color: '#e0e0e0',
                transition: 'filter 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.3)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>{flag}</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.4 }}>{sublabel}</div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 24, color: '#555', fontSize: 11 }}>
          {scenario.turnCount} turns · Basic rules · Seasoned
        </div>
      </div>
    </div>
  );
}
