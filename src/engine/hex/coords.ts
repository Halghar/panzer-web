/**
 * Axial hex coordinate math.
 *
 * Uses cube coordinates internally for distance and line drawing, exposed
 * as axial (q, r) so callers never see the third axis.
 */

export interface Axial {
  q: number;
  r: number;
}

function cubeRound(fq: number, fr: number, fs: number): Axial {
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);

  const qDiff = Math.abs(q - fq);
  const rDiff = Math.abs(r - fr);
  const sDiff = Math.abs(s - fs);

  if (qDiff > rDiff && qDiff > sDiff) q = -r - s;
  else if (rDiff > sDiff) r = -q - s;

  return { q, r };
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * Returns all hexes along the straight line from a to b (inclusive),
 * using a small asymmetric nudge to break ties consistently.
 */
export function hexLine(a: Axial, b: Axial): Axial[] {
  const N = hexDistance(a, b);
  if (N === 0) return [{ q: a.q, r: a.r }];

  const result: Axial[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const fq = a.q + (b.q - a.q) * t + 1e-6;
    const fr = a.r + (b.r - a.r) * t - 5e-7;
    result.push(cubeRound(fq, fr, -fq - fr));
  }
  return result;
}

/**
 * Like hexLine but includes both hexes when the line passes exactly along
 * a hexside (4.1.4.2.6). When the result is longer than hexLine's result,
 * the LOS grazes a hexside and both adjacent hexes must be checked.
 */
export function hexLineWithHexsides(a: Axial, b: Axial): Axial[] {
  const N = hexDistance(a, b);
  if (N === 0) return [{ q: a.q, r: a.r }];

  const seen = new Set<string>();
  const result: Axial[] = [];
  const add = (h: Axial) => {
    const k = `${h.q},${h.r}`;
    if (!seen.has(k)) { seen.add(k); result.push(h); }
  };

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    for (const eps of [1e-6, -1e-6] as const) {
      const fq = a.q + (b.q - a.q) * t + eps;
      const fr = a.r + (b.r - a.r) * t - eps / 2;
      add(cubeRound(fq, fr, -fq - fr));
    }
  }

  return result;
}

/** Returns the 6 axial neighbors of a hex in direction order 0–5. */
export function hexNeighbors(h: Axial): Axial[] {
  const dirs: Axial[] = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];
  return dirs.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}
