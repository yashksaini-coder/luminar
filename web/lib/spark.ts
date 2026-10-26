/** Pure polyline geometry for Sparkline.tsx: domain and the zero line (A.28). */

/** Score domain that always contains [-0.5, 0.5] so a flat line near zero stays readable. */
export function scoreDomain(values: number[]): [number, number] {
  return [Math.min(...values, -0.5), Math.max(...values, 0.5)]
}

/** x evenly spaced 0..w; y inset 1 px top and bottom; zeroY when 0 lies inside the domain. */
export function sparkPoints(
  values: number[], w: number, h: number, domain?: [number, number],
): { pts: [number, number][]; zeroY: number | null } {
  if (values.length === 0) return { pts: [], zeroY: null }
  let [lo, hi] = domain ?? [Math.min(...values), Math.max(...values)]
  if (lo === hi) { lo -= 0.5; hi += 0.5 }
  const y = (v: number) => 1 + (h - 2) * (1 - (v - lo) / (hi - lo))
  const step = values.length > 1 ? w / (values.length - 1) : 0
  return {
    pts: values.map((v, i) => [i * step, y(v)]),
    zeroY: lo <= 0 && hi >= 0 ? y(0) : null,
  }
}
