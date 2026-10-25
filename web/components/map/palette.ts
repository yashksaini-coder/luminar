import { clampRgb, parse, rgb } from 'culori'
import type { RGBA, ScoreBand } from '@/lib/types'

/** Canvas colours read from tokens.css custom properties on <html>. */
export const PALETTE_TOKENS = {
  bg: '--bg', paper0: '--paper-0', paper1: '--paper-1', paper2: '--paper-2', paper3: '--paper-3', pitch4: '--pitch-4',
  flame: '--flame', flameDim: '--flame-dim', signal: '--signal',
  nodeIdle: '--node-idle', nodeOrigin: '--node-origin', nodeReceiving: '--node-receiving', nodeDecoded: '--node-decoded',
  nodeObserver: '--node-observer', nodeJoining: '--node-joining', nodeFailed: '--node-failed', nodeError: '--node-error',
  nodeAttacker: '--node-attacker', nodePruned: '--node-pruned', nodeSelected: '--node-selected',
  linkTopology: '--link-topology', linkMesh: '--link-mesh', linkAttack: '--link-attack', linkHighlight: '--link-highlight',
  particle: '--particle', particleSpam: '--particle-spam', particleGraft: '--particle-graft', particleDht: '--particle-dht',
  ringTelemetry: '--ring-telemetry', scorePos: '--score-pos', scoreNeg: '--score-neg',
} as const
export type PaletteKey = keyof typeof PALETTE_TOKENS

const GREY: RGBA = [128, 128, 128, 255]
/** Filled by refreshPalette(); grey until then. */
export const PAL = Object.fromEntries(Object.keys(PALETTE_TOKENS).map(k => [k, GREY])) as Record<PaletteKey, RGBA>

const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)

/** Any CSS colour culori parses (hex, rgb(), oklch()) → 0–255 RGBA; `alpha` (0–1) overrides the colour's own. */
export function cssToRgba(css: string, alpha?: number): RGBA {
  const parsed = parse(css)
  if (!parsed) return GREY
  const c = clampRgb(rgb(parsed))
  return [byte(c.r), byte(c.g), byte(c.b), byte(alpha ?? c.alpha ?? 1)]
}

let paletteKey: string | null = null

/** Re-reads the tokens when `${data-theme}|${data-stage}` changed; false when nothing changed
 *  or the tokens are not applied yet (computed --paper-0 empty). */
export function refreshPalette(): boolean {
  const html = document.documentElement
  const style = getComputedStyle(html)
  if (!style.getPropertyValue('--paper-0').trim()) return false
  const key = `${html.dataset.theme}|${html.dataset.stage}`
  if (key === paletteKey) return false
  paletteKey = key
  for (const [k, v] of Object.entries(PALETTE_TOKENS)) PAL[k as PaletteKey] = cssToRgba(style.getPropertyValue(v).trim())
  return true
}

export const BAND_DENSITY = [0.12, 0.35, 0.65, 1.0] as const  // = --band-0..3

/** <0 → 0 · [0,2) → 1 · [2,6) → 2 · ≥6 → 3 */
export function scoreBand(score: number): ScoreBand {
  return score < 0 ? 0 : score < 2 ? 1 : score < 6 ? 2 : 3
}

export type ParticleKind = 'message' | 'spam' | 'graft' | 'prune' | 'dht' | 'fault'
export const PARTICLE_KEY: Record<ParticleKind, PaletteKey> = {
  message: 'particle', spam: 'particleSpam', graft: 'particleGraft', prune: 'flame', dht: 'particleDht', fault: 'flame',
}

export function withAlpha(c: RGBA, a: number): RGBA {
  return [c[0], c[1], c[2], byte(a)]
}
