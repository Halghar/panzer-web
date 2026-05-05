import { useEffect, useRef } from 'react';
import { HexMapRenderer } from '@render/HexMapRenderer';

export function PixiCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<HexMapRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new HexMapRenderer();
    rendererRef.current = renderer;
    renderer.init(containerRef.current);

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
}
