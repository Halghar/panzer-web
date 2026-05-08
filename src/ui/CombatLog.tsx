import { useEffect, useState } from 'react';
import { useGameStore } from '@engine/state/store';
import type { CombatPhaseResult, ShotResult } from '@engine/combat/phase';

const RESULT_LABEL: Record<ShotResult['result'], string> = {
  miss:            'Raté',
  out_of_range:    'Hors portée',
  no_penetration:  'Pas de pénétration',
  no_effect:       'Sans effet',
  damaged:         'Endommagé',
  ko:              'K.O.',
  bu:              'Détruit',
};

const RESULT_COLOR: Record<ShotResult['result'], string> = {
  miss:            '#777',
  out_of_range:    '#777',
  no_penetration:  '#999',
  no_effect:       '#bbb',
  damaged:         '#e08020',
  ko:              '#e03030',
  bu:              '#cc1111',
};

interface Toast {
  id: string;
  shot: ShotResult;
  shooterName: string;
  targetName: string;
  visible: boolean;
}

let uid = 0;

function buildToasts(
  result: CombatPhaseResult,
  blueprints: ReturnType<typeof useGameStore.getState>['blueprints'],
  units: ReturnType<typeof useGameStore.getState>['units'],
): Toast[] {
  return result.shots.map((shot) => {
    const shooterBp = blueprints[units[shot.shooterId]?.blueprintId ?? ''];
    const targetBp  = blueprints[units[shot.targetId]?.blueprintId ?? ''];
    return {
      id:           `cbt-${uid++}`,
      shot,
      shooterName:  shooterBp?.name ?? shot.shooterId,
      targetName:   targetBp?.name  ?? shot.targetId,
      visible:      true,
    };
  });
}

export function CombatLog() {
  const combatPhaseResult = useGameStore((s) => s.combatPhaseResult);
  const blueprints        = useGameStore((s) => s.blueprints);
  const units             = useGameStore((s) => s.units);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!combatPhaseResult || combatPhaseResult.shots.length === 0) return;

    const next = buildToasts(combatPhaseResult, blueprints, units);
    const ids  = next.map((t) => t.id);

    setToasts((prev) => [...prev, ...next]);

    // Start fade after 3 s, remove from DOM after 5 s
    const fadeTimer   = setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => ids.includes(t.id) ? { ...t, visible: false } : t),
      );
    }, 3000);

    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => !ids.includes(t.id)));
    }, 5200);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatPhaseResult]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 70,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      {toasts.map((toast) => {
        const { shot, shooterName, targetName, visible } = toast;
        const color = RESULT_COLOR[shot.result];
        return (
          <div
            key={toast.id}
            style={{
              background: 'rgba(8,8,8,0.90)',
              border:     `1px solid ${color}44`,
              borderLeft: `3px solid ${color}`,
              borderRadius: 6,
              padding:    '7px 14px',
              color:      '#e0e0e0',
              fontFamily: 'system-ui, sans-serif',
              fontSize:   13,
              whiteSpace: 'nowrap',
              opacity:    visible ? 1 : 0,
              transition: 'opacity 2.2s ease',
              display:    'flex',
              alignItems: 'center',
              gap:        8,
            }}
          >
            {/* Shooter → Target */}
            <span style={{ color: '#bbb', fontSize: 12 }}>{shooterName}</span>
            <span style={{ color: '#555' }}>→</span>
            <span style={{ color: '#ddd', fontSize: 12 }}>{targetName}</span>
            <span style={{ color: '#444', margin: '0 2px' }}>|</span>

            {/* Result */}
            <span style={{ color, fontWeight: 'bold', fontSize: 13 }}>
              {RESULT_LABEL[shot.result]}
            </span>

            {/* Roll details */}
            <span style={{ color: '#555', fontSize: 11 }}>
              d100:
            </span>
            <span
              style={{
                color:      shot.hit ? '#88cc66' : '#cc8866',
                fontWeight: 'bold',
                fontSize:   12,
              }}
            >
              {shot.diceRoll}
            </span>
            <span style={{ color: '#555', fontSize: 11 }}>
              / seuil {shot.hitNumber}
            </span>

            {/* Pen vs armor if relevant */}
            {shot.penetrationFactor !== null && shot.armorFactor !== null && (
              <>
                <span style={{ color: '#444', margin: '0 2px' }}>|</span>
                <span style={{ color: '#999', fontSize: 11 }}>
                  Pén. {shot.penetrationFactor} vs {shot.armorFactor}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
