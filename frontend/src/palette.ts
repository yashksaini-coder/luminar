// OKLCH helper
function c(l: number, ch: number, h: number) {
  return { l, c: ch, h, mode: 'oklch' as const }
}

// Hex helper
function h(hex: string): { css: string; rgba: [number, number, number, number] } {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { css: hex, rgba: [r, g, b, 255] }
}

// Chrome (blue-slate palette)
export const chrome = {
  bg: h('#0a0e14'),
  panel: h('#0f1319'),
  border: h('#1e2a3a'),
  borderSubtle: h('#151c27'),
  text: h('#d4dce8'),
  text2: h('#7b8da6'),
  text3: h('#4a5a72'),
  idle: h('#3a4860'),
}

// Semantic colors (OKLCH)
export const P = {
  idle:      h('#3a4860'),
  slate:     c(0.50, 0.04, 230),
  accent:    c(0.72, 0.14, 210),      // Cyan-blue (distinct from netviz)
  receiving: c(0.70, 0.14, 220),      // Sky blue
  decoded:   c(0.78, 0.16, 155),      // Bright green
  error:     c(0.65, 0.22, 25),       // Warm red
  origin:    c(0.72, 0.16, 290),      // Purple
  hover:     c(0.75, 0.14, 190),      // Teal
  routing:   c(0.60, 0.12, 270),      // Indigo
  joining:   c(0.75, 0.14, 85),       // Amber
}

// Convert OKLCH to CSS string
export function oklchCss(color: { l: number; c: number; h: number }, alpha?: number): string {
  if (alpha !== undefined && alpha < 1) return `oklch(${color.l} ${color.c} ${color.h} / ${alpha})`
  return `oklch(${color.l} ${color.c} ${color.h})`
}

// Convert OKLCH to RGBA via culori
import { oklch as toOklch, formatRgb } from 'culori'

export function oklchToRgba(color: { l: number; c: number; h: number }, alpha = 255): [number, number, number, number] {
  const rgb = formatRgb(toOklch({ mode: 'oklch', l: color.l, c: color.c, h: color.h })!)
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!m) return [128, 128, 128, alpha]
  return [+m[1], +m[2], +m[3], alpha]
}

// Node state to RGBA
export const STATE_COLORS: Record<string, [number, number, number, number]> = {
  idle: chrome.idle.rgba,
  origin: oklchToRgba(P.origin),
  receiving: oklchToRgba(P.receiving),
  decoded: oklchToRgba(P.decoded),
  error: oklchToRgba(P.error),
  failed: oklchToRgba(P.error),
  joining: oklchToRgba(P.joining),
}

// Node state to CSS
export const STATE_CSS: Record<string, string> = {
  idle: chrome.idle.css,
  origin: oklchCss(P.origin),
  receiving: oklchCss(P.receiving),
  decoded: oklchCss(P.decoded),
  error: oklchCss(P.error),
  failed: oklchCss(P.error),
  joining: oklchCss(P.joining),
}

export const PULSE_RING_DURATION_MS = 800
