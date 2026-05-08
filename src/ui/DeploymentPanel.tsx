import { useGameStore } from '@engine/state/store';
import type { Side } from '@engine/state/types';

interface UnitSlot {
  blueprintId: string;
  label: string;
  total: number;
}

function useHumanSlots(humanSide: Side): UnitSlot[] {
  const scenario   = useGameStore((s) => s.currentScenario);
  const blueprints = useGameStore((s) => s.blueprints);
  if (!scenario) return [];

  const counts = new Map<string, number>();
  for (const def of scenario.initialUnits) {
    if (def.side !== humanSide || def.suggestedHex) continue;
    counts.set(def.blueprintId, (counts.get(def.blueprintId) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([bpId, total]) => ({
    blueprintId: bpId,
    label: blueprints[bpId]?.name ?? bpId,
    total,
  }));
}

const SIDE_LABEL: Record<Side, string> = { allied: 'Allied (Soviet)', axis: 'Axis (German)' };
const SIDE_COLOR: Record<Side, string> = { allied: '#4a7fc4', axis: '#c47a3a' };

export function DeploymentPanel() {
  const scenarioPhase = useGameStore((s) => s.scenarioPhase);
  const humanSide     = useGameStore((s) => s.humanSide);
  const pending       = useGameStore((s) => s.pendingDeploymentUnit);
  const setPending    = useGameStore((s) => s.setPendingDeploymentUnit);
  const confirm       = useGameStore((s) => s.confirmDeployment);
  const removeUnit    = useGameStore((s) => s.removeUnitFromDeployment);
  const units         = useGameStore((s) => s.units);
  const scenario      = useGameStore((s) => s.currentScenario);

  const slots = useHumanSlots(humanSide ?? 'allied');

  if (scenarioPhase !== 'SETUP' || humanSide === null || !scenario) return null;

  // Compute per-slot placed count inline (hooks can't be conditional)
  const placedByCounts = Object.values(units)
    .filter((u) => u.side === humanSide)
    .reduce<Record<string, number>>((acc, u) => {
      acc[u.blueprintId] = (acc[u.blueprintId] ?? 0) + 1;
      return acc;
    }, {});

  const allPlaced = slots.every((s) => (placedByCounts[s.blueprintId] ?? 0) >= s.total);
  const color = SIDE_COLOR[humanSide];

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      right: 16,
      width: 260,
      background: 'rgba(15,15,15,0.93)',
      border: '1px solid #555',
      borderRadius: 8,
      fontFamily: 'system-ui, sans-serif',
      fontSize: 13,
      color: '#e0e0e0',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #333' }}>
        <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Setup Phase</div>
        <div style={{ fontWeight: 'bold', color, fontSize: 14 }}>{SIDE_LABEL[humanSide]}</div>
        <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>
          Click a unit, then click a highlighted hex to place it.
        </div>
      </div>

      {/* Unit slots */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #222' }}>
        {slots.map((slot) => {
          const placed = placedByCounts[slot.blueprintId] ?? 0;
          const remaining = slot.total - placed;
          const isSelected = pending?.blueprintId === slot.blueprintId && pending?.side === humanSide;

          return (
            <div
              key={slot.blueprintId}
              onClick={() => {
                if (remaining === 0) return;
                setPending(isSelected ? null : { blueprintId: slot.blueprintId, side: humanSide });
              }}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '5px 8px',
                marginBottom: 4,
                borderRadius: 4,
                cursor: remaining === 0 ? 'default' : 'pointer',
                background: isSelected ? 'rgba(100,180,255,0.18)' : 'rgba(255,255,255,0.04)',
                border: isSelected ? '1px solid #4488ff' : '1px solid transparent',
                opacity: remaining === 0 ? 0.5 : 1,
              }}
            >
              <span>{slot.label}</span>
              <span style={{ fontSize: 11, color: remaining > 0 ? '#f0a040' : '#5c5' }}>
                {placed}/{slot.total}
              </span>
            </div>
          );
        })}
      </div>

      {/* Placed units — click to remove */}
      {Object.values(units).filter((u) => u.side === humanSide).length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #222' }}>
          <div style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>Placed — click to remove</div>
          {Object.values(units)
            .filter((u) => u.side === humanSide)
            .map((u) => (
              <div
                key={u.instanceId}
                onClick={() => removeUnit(u.instanceId)}
                style={{
                  fontSize: 11, color: '#aaa', padding: '2px 4px',
                  cursor: 'pointer', borderRadius: 3,
                  display: 'flex', justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,80,80,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{u.instanceId}</span>
                <span style={{ color: '#666' }}>({u.q},{u.r})</span>
              </div>
            ))}
        </div>
      )}

      {/* Confirm button */}
      <div style={{ padding: '10px 14px' }}>
        <button
          disabled={!allPlaced}
          onClick={() => confirm(humanSide)}
          style={{
            width: '100%',
            padding: '8px 0',
            background: allPlaced ? '#4a5d3f' : '#2a2a2a',
            color: allPlaced ? '#fff' : '#555',
            border: `1px solid ${allPlaced ? '#6a7a5a' : '#444'}`,
            borderRadius: 4,
            cursor: allPlaced ? 'pointer' : 'not-allowed',
            fontSize: 13,
          }}
        >
          {allPlaced ? 'Confirm deployment →' : `Place all units to confirm`}
        </button>
      </div>

      {/* Active pending indicator */}
      {pending && (
        <div style={{
          padding: '6px 14px',
          background: 'rgba(68,136,255,0.1)',
          borderTop: '1px solid #333',
          fontSize: 11,
          color: '#88bbff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>Placing: <strong>{pending.blueprintId}</strong></span>
          <span onClick={() => setPending(null)} style={{ cursor: 'pointer', color: '#f55' }}>✕</span>
        </div>
      )}
    </div>
  );
}
