export function ControlsHint() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        background: 'rgba(20, 20, 20, 0.85)',
        color: '#bbb',
        padding: '8px 12px',
        borderRadius: 6,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        border: '1px solid #333',
      }}
    >
      <div>Click hex/unit to select · Right-drag to pan · Wheel to zoom · R to rotate</div>
    </div>
  );
}
