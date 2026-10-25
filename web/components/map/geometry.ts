import type { LayoutMode, NodeState } from '@/lib/types'

// Pure canvas geometry, ported from frontend/src/map/renderer.ts. No DOM.

export const PARTICLE_TRAVEL_MS = 800, PARTICLE_LIFETIME_MS = 1200, PARTICLE_CAP = 600, PULSE_CAP = 200, PULSE_MS = 800, FIZZLE_AT = 0.6, FIZZLE_ALPHA = 89
export const OBSERVER_STATIC_ALPHA = 0.5   // reduced motion [spec §10]

/** clamp(200/√n, 3, 8) × nodeScale; Radial and Geo draw at half size. */
export function nodeRadiusPx(n: number, mode: LayoutMode, nodeScale: number): number {
  const r = Math.max(3, Math.min(8, 200 / Math.sqrt(n))) * nodeScale
  return mode === 'force' ? r : r * 0.5
}

export function glyphScale(d: { state: NodeState }, selected: boolean): number {
  return (selected ? 1.5 : 1) * (d.state === 'attacker' ? 1.15 : 1)
}

/** Point on a quadratic Bézier bowed to the left of travel, so A→B and B→A don't overlap. */
export function bezierPoint(src: [number, number], tgt: [number, number], t: number): [number, number] {
  const dx = tgt[0] - src[0], dy = tgt[1] - src[1]
  const len = Math.hypot(dx, dy) || 1
  const bow = Math.min(18, len * 0.12)
  const cx = (src[0] + tgt[0]) / 2 - (dy / len) * bow
  const cy = (src[1] + tgt[1]) / 2 + (dx / len) * bow
  const u = 1 - t
  return [u * u * src[0] + 2 * u * t * cx + t * t * tgt[0], u * u * src[1] + 2 * u * t * cy + t * t * tgt[1]]
}

/** Quadratic ease-out travel; dropped hops stall at FIZZLE_AT and fade over the last 400 ms. Alpha 0–255. */
export function particleFrame(age: number, fizzle: boolean): { t: number; alpha: number } | null {
  if (age > PARTICLE_LIFETIME_MS) return null
  const progress = Math.min(1, age / PARTICLE_TRAVEL_MS)
  const ease = 1 - (1 - progress) * (1 - progress)
  if (!fizzle) return { t: ease, alpha: 242 * (1 - progress * 0.5) }
  const fade = (PARTICLE_LIFETIME_MS - age) / (PARTICLE_LIFETIME_MS - PARTICLE_TRAVEL_MS)
  return { t: Math.min(ease, FIZZLE_AT), alpha: FIZZLE_ALPHA * Math.min(1, Math.max(0, fade)) }
}

export function pulseAlpha(age: number): number {
  return age >= PULSE_MS ? 0 : 56 * (1 - age / PULSE_MS)
}

/** Observer ring breathing alpha, .2 → .75 over a 5.6 s period. */
export function breathe(now: number): number {
  return 0.475 + 0.275 * Math.sin((2 * Math.PI * now) / 5600)
}
