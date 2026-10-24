/**
 * Map palette — every colour deck.gl draws is resolved from the `--lm-node-*` / `--lm-map-*`
 * tokens in style.css, so the stylesheet stays the single source of truth (stage theme included).
 * Call `refreshPalette()` before reading `STATE_COLORS` / `MAP`; it re-reads when `data-theme` flips.
 */
import { parse, rgb } from 'culori'

// The checked-in culori shim only declares oklch/formatRgb; add what the parser path needs.
declare module 'culori' {
  export function parse(css: string): object | undefined
  export function rgb(color: object | string | undefined): { r: number; g: number; b: number; alpha?: number } | undefined
}

export type RGBA = [number, number, number, number]

/** CSS colour string (hex, rgb(), oklch(), …) → 0-255 rgba tuple; `alpha` overrides the colour's own. */
export function cssToRgba(css: string, alpha?: number): RGBA {
  const c = rgb(parse(css))
  if (!c) return [128, 128, 128, alpha ?? 255]
  const b = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  return [b(c.r), b(c.g), b(c.b), alpha ?? b(c.alpha ?? 1)]
}

/** Legacy helper kept for callers that still pass `P.*`; accepts an oklch object or any CSS colour. */
export function oklchToRgba(color: string | { l: number; c: number; h: number }, alpha = 255): RGBA {
  return cssToRgba(typeof color === 'string' ? color : `oklch(${color.l} ${color.c} ${color.h})`, alpha)
}

const NODE_STATES = ['idle', 'origin', 'receiving', 'decoded', 'joining', 'failed', 'error', 'attacker'] as const

const MAP_TOKENS = {
  bg: '--lm-bg',
  fg: '--lm-fg',
  pruned: '--lm-node-pruned',
  danger: '--lm-danger',
  dangerText: '--lm-danger-text',
  ok: '--lm-ok',
  topology: '--lm-map-topology',
  mesh: '--lm-map-mesh',              // alpha baked in (.42, stage .6)
  attackLink: '--lm-map-attack-link', // alpha baked in (.35)
  particle: '--lm-map-particle',
  particleSybil: '--lm-map-particle-sybil',
  particleGraft: '--lm-map-particle-graft',
  particlePrune: '--lm-map-particle-prune',
  particleDht: '--lm-map-particle-dht',
  ringSelect: '--lm-map-ring-select',
  ringHover: '--lm-map-ring-hover',   // alpha baked in (.45)
  ringTelemetry: '--lm-map-ring-telemetry',
  ringHighlight: '--lm-map-ring-highlight',
} as const

const GREY: RGBA = [128, 128, 128, 255]

/** Node state → fill rgba. Filled by `refreshPalette()`. */
export const STATE_COLORS: Record<string, RGBA> = Object.fromEntries(NODE_STATES.map(s => [s, GREY]))

/** Map-layer colours. Filled by `refreshPalette()`. */
export const MAP = Object.fromEntries(Object.keys(MAP_TOKENS).map(k => [k, GREY])) as Record<keyof typeof MAP_TOKENS, RGBA>

let resolvedTheme: string | null | undefined  // undefined = never resolved

/** Re-read tokens from the stylesheet when the theme changed (or never resolved). Returns true if it did. */
export function refreshPalette(): boolean {
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme === resolvedTheme) return false
  const cs = getComputedStyle(document.documentElement)
  if (!cs.getPropertyValue('--lm-bg').trim()) return false  // stylesheet not applied yet; retry next render
  resolvedTheme = theme
  for (const s of NODE_STATES) STATE_COLORS[s] = cssToRgba(cs.getPropertyValue(`--lm-node-${s}`).trim())
  for (const [k, t] of Object.entries(MAP_TOKENS)) MAP[k as keyof typeof MAP_TOKENS] = cssToRgba(cs.getPropertyValue(t).trim())
  return true
}

export function isAttackerId(peerId: string): boolean {
  return peerId.startsWith('sybil-') || peerId.startsWith('eclipse-')
}

/** Fill colour for a node; an attacker pruned from every honest mesh goes hollow (fill = map ground). */
export function nodeFillColor(node: { state: string; connected_peers: string[] }): RGBA {
  if (node.state === 'attacker' && node.connected_peers.length === 0) return MAP.bg
  return STATE_COLORS[node.state] ?? STATE_COLORS.idle
}

/** Stroke colour: failed → danger, pruned attacker → pruned grey, else transparent. */
export function nodeLineColor(node: { state: string; connected_peers: string[] }): RGBA {
  if (node.state === 'failed') return MAP.danger
  if (node.state === 'attacker' && node.connected_peers.length === 0) return MAP.pruned
  return [0, 0, 0, 0]
}

/** Stroke width in pixels, paired with `nodeLineColor`. */
export function nodeLineWidth(node: { state: string; connected_peers: string[] }): number {
  if (node.state === 'failed') return 1.25
  if (node.state === 'attacker' && node.connected_peers.length === 0) return 1.5
  return 0
}

// Node state → CSS colour (var() keeps the DOM theme-aware for free)
export const STATE_CSS: Record<string, string> = Object.fromEntries(NODE_STATES.map(s => [s, `var(--lm-node-${s})`]))

/** Particle kinds → `MAP` key; `spawnParticle` accepts a kind in place of an rgba tuple. */
export type ParticleKind = 'message' | 'sybil' | 'graft' | 'prune' | 'dht' | 'fault'
export const PARTICLE_KIND_KEY: Record<ParticleKind, keyof typeof MAP_TOKENS> = {
  message: 'particle', sybil: 'particleSybil', graft: 'particleGraft', prune: 'particlePrune', dht: 'particleDht', fault: 'danger',
}

// ── Legacy exports (app.ts / stats-panel.ts still import these) ──
/** Old semantic palette, remapped onto the token values so `oklchToRgba(P.x)` call sites keep the new look. */
export const P = {
  idle: '#3b3b3e',
  accent: 'oklch(72% 0.166 60)',
  receiving: 'oklch(95% 0.045 60)',   // honest message particle
  decoded: '#34d399',                 // graft
  error: 'oklch(64% 0.245 25)',       // prune / fault burst (= --lm-danger)
  origin: '#a78bfa',
  hover: 'rgb(242 242 239 / 0.45)',
  routing: '#a78bfa',                 // dht
  joining: 'oklch(72% 0.08 235)',
  attacker: 'oklch(64% 0.245 25)',
}

export const chrome = {
  bg: { css: 'var(--lm-bg)' },
  panel: { css: 'var(--lm-panel)' },
  border: { css: 'var(--lm-border)' },
  text: { css: 'var(--lm-fg)' },
  text2: { css: 'var(--lm-fg2)' },
  text3: { css: 'var(--lm-fg3)' },
  idle: { css: 'var(--lm-node-idle)' },
}

export const PULSE_RING_DURATION_MS = 800
