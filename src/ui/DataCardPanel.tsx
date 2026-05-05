import { useGameStore } from '@engine/state/store';

export function DataCardPanel() {
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const units = useGameStore((s) => s.units);
  const blueprints = useGameStore((s) => s.blueprints);

  if (!selectedUnitId) return null;
  const unit = units[selectedUnitId];
  if (!unit) return null;
  const bp = blueprints[unit.blueprintId];
  if (!bp) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 320,
        background: 'rgba(20, 20, 20, 0.92)',
        color: '#e0e0e0',
        padding: 16,
        borderRadius: 8,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        border: '1px solid #444',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
        {bp.name}
      </div>
      <div style={{ color: '#999', marginBottom: 12 }}>
        {bp.nation.toUpperCase()} · Size {bp.size >= 0 ? `+${bp.size}` : bp.size}
      </div>

      <div style={{ marginBottom: 8 }}>
        <strong>Armor</strong> — Front {bp.armor.front} · Rear {bp.armor.rear}
      </div>
      <div style={{ marginBottom: 8 }}>
        <strong>Speed</strong> — {bp.movementSpeed}
      </div>

      <div style={{ marginTop: 12, marginBottom: 4, fontWeight: 'bold' }}>
        Weapons
      </div>
      {bp.weapons.map((w) => (
        <div key={w.name} style={{ marginBottom: 8, paddingLeft: 8 }}>
          <div>{w.name}</div>
          <div style={{ color: '#999', fontSize: 12 }}>
            FoF: {w.fieldOfFire} · SB: {w.stabilization}
          </div>
          {w.ammo.map((a) => (
            <div key={a.type} style={{ fontSize: 12, color: '#ccc' }}>
              {a.type}: P{a.ranges.P}/S{a.ranges.S}/M{a.ranges.M}/L{a.ranges.L}/E
              {a.ranges.E}
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #444' }}>
        <div>
          <strong>Status</strong>
        </div>
        <div style={{ fontSize: 12, color: '#999' }}>
          Position: ({unit.q}, {unit.r}) · Facing: {unit.facing}
        </div>
        <div style={{ fontSize: 12, color: '#999' }}>
          Command: {unit.command} · Damage: {unit.damage}
        </div>
      </div>
    </div>
  );
}
