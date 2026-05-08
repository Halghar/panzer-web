import { useGameStore } from '@engine/state/store';
import type { KEAmmo, GPAmmo, Ammo } from '@engine/units/types';
import type { Command, Unit } from '@engine/state/types';

function isKEAmmo(a: Ammo): a is KEAmmo {
  return a.type === 'AP' || a.type === 'HVAP' || a.type === 'APCR' || a.type === 'HEAT';
}

function isGPAmmo(a: Ammo): a is GPAmmo {
  return a.type === 'GP' || a.type === 'SMOKE';
}

const RF: Array<'P' | 'S' | 'M' | 'L' | 'E'> = ['P', 'S', 'M', 'L', 'E'];

const cell: React.CSSProperties = {
  textAlign: 'center',
  padding: '1px 5px',
  fontSize: 11,
};

const th: React.CSSProperties = {
  ...cell,
  color: '#aaa',
  fontWeight: 'normal',
};

/** Commands that require at least one spotted opposing target (4.4). */
const REQUIRES_SPOT = new Set<Command>(['FIRE', 'SHORT_HALT']);

const COMMANDS: { cmd: Command; label: string; description: string }[] = [
  { cmd: 'FIRE',       label: 'Fire',       description: 'Direct fire during Fire Step' },
  { cmd: 'MOVE',       label: 'Move',       description: 'Move during Movement Step' },
  { cmd: 'SHORT_HALT', label: 'Short Halt', description: 'Fire then move' },
  { cmd: 'OVERWATCH',  label: 'Overwatch',  description: 'React fire (voluntary)' },
  { cmd: 'NO_COMMAND', label: 'No Command', description: 'Sit tight, no action' },
];

export function DataCardPanel() {
  const selectedUnitId   = useGameStore((s) => s.selectedUnitId);
  const units            = useGameStore((s) => s.units);
  const blueprints       = useGameStore((s) => s.blueprints);
  const currentPhase     = useGameStore((s) => s.currentPhase);
  const spottingPairs    = useGameStore((s) => s.spottingPairs);
  const fireTargetId     = useGameStore((s) => s.fireTargetId);
  const assignCommand    = useGameStore((s) => s.assignCommand);
  const advancePhase     = useGameStore((s) => s.advancePhase);
  const addFireDeclaration = useGameStore((s) => s.addFireDeclaration);
  const setFireTarget    = useGameStore((s) => s.setFireTarget);

  if (!selectedUnitId) return null;
  const unit = units[selectedUnitId];
  if (!unit) return null;
  const bp = blueprints[unit.blueprintId];
  if (!bp) return null;

  const keAmmos = bp.ammo.filter(isKEAmmo);
  const gpAmmos = bp.ammo.filter(isGPAmmo);

  // Spotted opposing targets for this unit, from last Spotting Phase.
  const spottedTargets: Unit[] = spottingPairs
    .filter((p) => p.spotter === selectedUnitId)
    .map((p) => units[p.target])
    .filter((u): u is Unit => u !== undefined);

  const hasTargets = spottedTargets.length > 0;

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, width: 360,
      background: 'rgba(20,20,20,0.93)', color: '#e0e0e0',
      padding: 14, borderRadius: 8, fontFamily: 'system-ui, sans-serif',
      fontSize: 12, border: '1px solid #444',
    }}>

      {/* Header */}
      <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>
        {bp.name}
      </div>
      <div style={{ color: '#999', fontSize: 11, marginBottom: 8 }}>
        {bp.nation.toUpperCase()} · Bu {bp.buValue} · {bp.gun}
        &nbsp;·&nbsp;Tt:{bp.Tt} Sb:{bp.Sb} St:{bp.St} RoF:{bp.RoF} A:{bp.ammoCard}
      </div>
      <div style={{ color: '#999', fontSize: 11, marginBottom: 10 }}>
        Move: {bp.movementSlow}–{bp.movementFast} MP ({bp.movementType})
        &nbsp;·&nbsp;Wt:{bp.weight}
        &nbsp;·&nbsp;Size:{bp.size >= 0 ? `+${bp.size}` : bp.size}
        &nbsp;·&nbsp;FoF:{bp.fieldOfFire}
      </div>

      {/* Offensive Information */}
      <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#ccc' }}>Offensive Information</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Ammo</th>
            <th style={th}>P</th><th style={th}>S</th><th style={th}>M</th>
            <th style={th}>L</th><th style={th}>E</th>
            <th style={th}>ND</th><th style={th}>DM</th>
            <th style={th}>KO</th><th style={th}>BU</th>
          </tr>
        </thead>
        <tbody>
          {keAmmos.map((a) => (
            <>
              <tr key={`${a.type}-R`}>
                <td style={{ ...cell, textAlign: 'left', color: '#ccc' }} rowSpan={2}>
                  {a.type}{a.availability ? `(${a.availability[0]})` : ''}<br/>
                  <span style={{ color: '#666', fontSize: 10 }}>{a.label}</span>
                </td>
                {RF.map((f) => <td key={f} style={cell}>{a.ranges[f]}</td>)}
                <td style={cell} rowSpan={2}>{a.damage.ND}</td>
                <td style={cell} rowSpan={2}>{a.damage.DM[0]}-{a.damage.DM[1]}</td>
                <td style={cell} rowSpan={2}>{a.damage.KO[0]}-{a.damage.KO[1]}</td>
                <td style={cell} rowSpan={2}>{a.damage.BU[0]}-{a.damage.BU[1]}</td>
              </tr>
              <tr key={`${a.type}-P`}>
                {RF.map((f) => <td key={f} style={{ ...cell, color: '#aaa' }}>{a.penetration[f]}</td>)}
              </tr>
            </>
          ))}
          {gpAmmos.map((a) => (
            <>
              <tr key={`${a.type}-R`}>
                <td style={{ ...cell, textAlign: 'left', color: '#ccc' }} rowSpan={2}>
                  {a.type}<br/>
                  <span style={{ color: '#666', fontSize: 10 }}>{a.label}</span>
                </td>
                {RF.map((f) => <td key={f} style={cell}>{a.ranges[f]}</td>)}
                <td colSpan={4} style={{ ...cell, color: '#666', fontSize: 10 }} rowSpan={2}>
                  GP Def: voir défense
                </td>
              </tr>
              <tr key={`${a.type}-F`}>
                {RF.map((f) => <td key={f} style={{ ...cell, color: '#aaa' }}>{a.firepower[f]}</td>)}
              </tr>
            </>
          ))}
        </tbody>
      </table>

      {/* Defensive Information */}
      <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#ccc' }}>Defensive Information</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
        Size:{bp.size >= 0 ? `+${bp.size}` : bp.size} &nbsp;·&nbsp; GPD:{bp.armor.GPD}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={th}></th>
            <th style={th} colSpan={4}>Front or Rear</th>
            <th style={th} colSpan={4}>Front/Side or Rear/Side</th>
          </tr>
          <tr>
            <th style={th}></th>
            <th style={th}>TF</th><th style={th}>TR</th><th style={th}>HF</th><th style={th}>HR</th>
            <th style={th}>TF</th><th style={th}>TS</th><th style={th}>HF</th><th style={th}>HS</th>
          </tr>
        </thead>
        <tbody>
          {(['level', 'rise', 'fall'] as const).map((elev) => {
            const fr = bp.armor.frontOrRear[elev];
            const fs = bp.armor.frontSideOrRearSide[elev];
            return (
              <tr key={elev}>
                <td style={{ ...cell, textAlign: 'left', color: '#aaa', textTransform: 'capitalize' }}>{elev}</td>
                <td style={cell}>{fr.TF}</td>
                <td style={cell}>{fr.TR}</td>
                <td style={cell}>{fr.HF}</td>
                <td style={cell}>{fr.HR}</td>
                <td style={cell}>{fs.TF}</td>
                <td style={cell}>{fs.TS ?? '—'}</td>
                <td style={cell}>{fs.HF}</td>
                <td style={cell}>{fs.HS ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Spotting info — only during SPOTTING phase */}
      {currentPhase === 'SPOTTING' && (
        <div style={{ borderTop: '1px solid #444', paddingTop: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 6, color: '#ccc', fontSize: 11 }}>
            Phase de Spotting
          </div>
          {spottedTargets.length > 0 ? (
            <>
              <div style={{ fontSize: 10, marginBottom: 6 }}>
                <span style={{ color: '#ff9944' }}>
                  {spottedTargets.length} cible{spottedTargets.length > 1 ? 's' : ''} spottée{spottedTargets.length > 1 ? 's' : ''} :
                </span>
                {' '}
                <span style={{ color: '#aaa' }}>
                  {spottedTargets
                    .map((t) => blueprints[t.blueprintId]?.name ?? t.instanceId)
                    .join(', ')}
                </span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10, color: '#666', marginBottom: 6 }}>
              Aucune cible spottée depuis cette unité
            </div>
          )}
          <button
            onClick={() => advancePhase()}
            style={{
              background: '#2a3a2a',
              color: '#88cc88',
              border: '1px solid #4a6a4a',
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Spot terminé →
          </button>
        </div>
      )}

      {/* Fire Declaration — only during COMBAT phase */}
      {currentPhase === 'COMBAT' && (unit.command === 'FIRE' || unit.command === 'SHORT_HALT') && (
        <div style={{ borderTop: '1px solid #444', paddingTop: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 6, color: '#ccc', fontSize: 11 }}>
            Tir direct
          </div>
          {spottedTargets.length === 0 ? (
            <div style={{ fontSize: 10, color: '#666' }}>Aucune cible spottée</div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: '#aaa', marginBottom: 6 }}>
                Cliquez une case rouge pour sélectionner la cible
              </div>
              {/* Target list */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {spottedTargets.map((t) => {
                  const tBp = blueprints[t.blueprintId];
                  const isActive = t.instanceId === fireTargetId;
                  return (
                    <button
                      key={t.instanceId}
                      onClick={() => setFireTarget(isActive ? null : t.instanceId)}
                      style={{
                        background: isActive ? '#5a2020' : '#2a2a2a',
                        color: isActive ? '#ffaaaa' : '#aaa',
                        border: `1px solid ${isActive ? '#aa4444' : '#555'}`,
                        padding: '3px 8px',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: isActive ? 'bold' : 'normal',
                      }}
                    >
                      {tBp?.name ?? t.instanceId}
                    </button>
                  );
                })}
              </div>
              {/* Declare fire button */}
              {fireTargetId && (
                <button
                  onClick={() => {
                    addFireDeclaration({ shooterId: unit.instanceId, targetId: fireTargetId });
                    setFireTarget(null);
                  }}
                  style={{
                    background: '#7a2a2a',
                    color: '#fff',
                    border: '1px solid #aa4444',
                    padding: '5px 12px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 'bold',
                  }}
                >
                  Déclarer le tir →
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Command Assignment — only during COMMAND phase */}
      {currentPhase === 'COMMAND' && (
        <div style={{ borderTop: '1px solid #444', paddingTop: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 6, color: '#ccc', fontSize: 11 }}>
            Assign Command
          </div>

          {/* Spotted targets list (4.1.5 / 4.4) */}
          {unit.canSpot && (
            <div style={{ marginBottom: 8, fontSize: 10 }}>
              {hasTargets ? (
                <>
                  <span style={{ color: '#8ab870' }}>
                    {spottedTargets.length} cible{spottedTargets.length > 1 ? 's' : ''} spottée{spottedTargets.length > 1 ? 's' : ''} :
                  </span>
                  {' '}
                  <span style={{ color: '#aaa' }}>
                    {spottedTargets
                      .map((t) => blueprints[t.blueprintId]?.name ?? t.instanceId)
                      .join(', ')}
                  </span>
                </>
              ) : (
                <span style={{ color: '#666' }}>Aucune cible spottée</span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {COMMANDS.map(({ cmd, label, description }) => {
              const active   = unit.command === cmd;
              const needsSpot = REQUIRES_SPOT.has(cmd);
              const disabled  = needsSpot && !hasTargets;
              return (
                <button
                  key={cmd}
                  title={disabled ? `${description} — aucune cible spottée (4.4)` : description}
                  onClick={() => { if (!disabled) assignCommand(unit.instanceId, cmd); }}
                  style={{
                    background: active ? '#4a5d3f' : '#2a2a2a',
                    color:  active ? '#fff' : disabled ? '#555' : '#aaa',
                    border: `1px solid ${active ? '#6a7a5a' : disabled ? '#3a3a3a' : '#555'}`,
                    padding:      '4px 8px',
                    borderRadius: 4,
                    cursor:     disabled ? 'not-allowed' : 'pointer',
                    fontSize:   11,
                    fontWeight: active ? 'bold' : 'normal',
                    opacity:    disabled ? 0.45 : 1,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Unit Status */}
      <div style={{ borderTop: '1px solid #444', paddingTop: 8, color: '#999', fontSize: 11 }}>
        ({unit.q},{unit.r}) · Face:{unit.facing} · {unit.command} · {unit.damage}
        {unit.spotStatus !== 'unspotted' && (
          <span style={{ color: '#c07040', marginLeft: 6 }}>
            [{unit.spotStatus === 'spottedByFire' ? 'SPOT/FIRE' : 'SPOT/MOVE'}]
          </span>
        )}
      </div>
    </div>
  );
}
