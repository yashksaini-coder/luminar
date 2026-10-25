import { bayer, PITCH } from '@/components/dither/dither'
import type { PeerNode, RGBA } from '@/lib/types'
import { BAND_DENSITY, scoreBand, type PaletteKey } from './palette'

// Procedural icon atlas for the mesh canvas [spec §7 "On the deck.gl canvas"]: every glyph of the
// render table drawn once at device-pixel size. Only the score halos are dithered.

export type GlyphId =
  | 'disc' | 'idle' | 'origin' | 'decoded' | 'observer' | 'joining' | 'failed' | 'error'
  | 'attacker' | 'pruned' | 'reticle' | 'square' | 'squareTrail'
  | 'halo-0' | 'halo-1' | 'halo-2' | 'halo-3'          // paper halos at BAND_DENSITY[1..3]; 'halo-0' is the flame .12 halo
export interface GlyphBox { x: number; y: number; width: number; height: number; mask: boolean }
export interface IconAtlas { image: HTMLCanvasElement; mapping: Record<GlyphId, GlyphBox>; nodePx: number; cellPx: number }

export const HALO_OUTER = 1.7, HALO_INNER = 1.2           // × node radius [spec §6.2 "halo at 1.7 r"]; inner is plan
const GUTTER = 2
/** Whole device px per dither cell, so boxes and halo cells stay on the pixel grid at fractional dpr (1.25, 1.5). */
const deviceCell = (cellPx: number, dpr: number) => Math.max(1, Math.round(cellPx * dpr))

/** Pure; one row, 2 px gutters. nodePx is the node diameter in CSS px. */
export function atlasLayout(nodePx: number, cellPx: number, dpr: number): { width: number; height: number; mapping: Record<GlyphId, GlyphBox> } {
  const css = (px: number) => Math.ceil(px * dpr)
  const disc = css(nodePx + 2), diamond = css(nodePx * 1.15) + 4, halo = css(nodePx * HALO_OUTER) + 4, cell = deviceCell(cellPx, dpr), sq = 2 * cell
  const sizes: [GlyphId, number, number][] = [
    ['disc', disc, disc], ['idle', disc, disc], ['origin', disc, disc],
    ['decoded', css(nodePx * 1.6 + 2), css(nodePx * 1.6 + 2)], ['observer', css(nodePx * 2 + 2), css(nodePx * 2 + 2)],
    ['joining', disc, disc], ['failed', disc, disc], ['error', disc, disc],
    ['attacker', diamond, diamond], ['pruned', diamond, diamond], ['reticle', css(nodePx * 2 + 8), css(nodePx * 2 + 8)],
    ['square', sq, sq], ['squareTrail', 3 * cell, sq],
    ['halo-0', halo, halo], ['halo-1', halo, halo], ['halo-2', halo, halo], ['halo-3', halo, halo],
  ]
  const mapping = {} as Record<GlyphId, GlyphBox>
  let x = 0
  for (const [id, width, height] of sizes) {
    mapping[id] = { x, y: 0, width, height, mask: id === 'square' || id === 'squareTrail' }
    x += width + GUTTER
  }
  return { width: x - GUTTER, height: Math.max(...sizes.map(s => s[2])), mapping }
}

/** Pure; cell origins (box of side 2·outerPx) whose centre lies in the annulus and bayer(cx, cy) < density. */
export function haloCells(outerPx: number, innerPx: number, cellPx: number, density: number): [number, number][] {
  const cells: [number, number][] = []
  const n = Math.ceil((2 * outerPx) / cellPx)
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const x = cx * cellPx, y = cy * cellPx
      const d = Math.hypot(x + cellPx / 2 - outerPx, y + cellPx / 2 - outerPx)
      if (d <= outerPx && d >= innerPx && bayer(cx, cy) < density) cells.push([x, y])
    }
  }
  return cells
}

export function haloFor(score: number): GlyphId {
  return `halo-${scoreBand(score)}`
}

const STATE_GLYPH: Record<Exclude<PeerNode['state'], 'attacker'>, GlyphId> = {
  receiving: 'disc', idle: 'idle', origin: 'origin', decoded: 'decoded', joining: 'joining', failed: 'failed', error: 'error',
}

/** attacker → pruned|attacker · real/telemetry → 'observer' · else the state's glyph ('receiving' → 'disc'). */
export function glyphFor(d: Pick<PeerNode, 'state' | 'connected_peers' | 'is_real' | 'is_telemetry'>): GlyphId {
  if (d.state === 'attacker') return d.connected_peers.length ? 'attacker' : 'pruned'
  if (d.is_real || d.is_telemetry) return 'observer'
  return STATE_GLYPH[d.state] ?? 'disc'
}

export function atlasKey(nodePx: number, cellPx: number, dpr: number, paletteVersion: string): string {
  return `${nodePx}|${cellPx}|${dpr}|${paletteVersion}`
}

const css = (c: RGBA, alpha = 1) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255) * alpha})`

export function buildAtlas(opts: { nodePx: number; cellPx: number; dpr: number; pal: Record<PaletteKey, RGBA> }): IconAtlas {
  const { nodePx, cellPx, dpr, pal } = opts
  const { width, height, mapping } = atlasLayout(nodePx, cellPx, dpr)
  const image = document.createElement('canvas')
  image.width = width
  image.height = height
  const ctx = image.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const r = nodePx / 2

  const circle = (radius: number, fill?: RGBA, stroke?: RGBA, lineWidth = 1) => {
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    if (fill) { ctx.fillStyle = css(fill); ctx.fill() }
    if (stroke) { ctx.strokeStyle = css(stroke); ctx.lineWidth = lineWidth; ctx.stroke() }
  }
  const cross = (c: RGBA) => {
    const k = r * 0.5
    ctx.beginPath()
    ctx.moveTo(-k, -k); ctx.lineTo(k, k); ctx.moveTo(k, -k); ctx.lineTo(-k, k)
    ctx.strokeStyle = css(c); ctx.lineWidth = 1; ctx.stroke()
  }
  const rhombus = (half: number) => {
    ctx.beginPath()
    ctx.moveTo(0, -half); ctx.lineTo(half, 0); ctx.lineTo(0, half); ctx.lineTo(-half, 0); ctx.closePath()
  }
  // Each glyph draws centred at (0, 0) in CSS px; the transform maps it to its box at dpr scale.
  const draw: Partial<Record<GlyphId, () => void>> = {
    disc: () => circle(r, pal.paper0, pal.paper0),
    idle: () => circle(r, pal.pitch4, pal.paper3),
    origin: () => { circle(r, pal.paper0, pal.paper0); circle(r / 3, pal.pitch4) },
    decoded: () => { circle(r, pal.nodeDecoded, pal.nodeDecoded); circle(r * 1.6, undefined, pal.signal) },   // R20
    observer: () => { circle(r * 1.6, undefined, pal.signal); circle(r * 1.9, undefined, pal.signal) },
    joining: () => circle(r, undefined, pal.paper1),
    failed: () => { circle(r, pal.paper3); cross(PITCH) },
    error: () => { circle(r, pal.flameDim); cross(PITCH) },
    attacker: () => {
      const half = (nodePx * 1.15) / 2
      rhombus(half)
      ctx.fillStyle = css(pal.flame); ctx.fill()
      ctx.save(); ctx.clip()
      ctx.strokeStyle = css(PITCH, 0.55); ctx.lineWidth = 1
      ctx.beginPath()
      for (let o = -2 * half; o <= 2 * half; o += 3) { ctx.moveTo(o - half, half); ctx.lineTo(o + half, -half) }
      ctx.stroke(); ctx.restore()
    },
    pruned: () => {
      rhombus((nodePx * 1.15) / 2 - 0.5)
      ctx.setLineDash([3, 2]); ctx.strokeStyle = css(pal.paper3); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([])
    },
    reticle: () => {
      circle(nodePx, undefined, pal.paper0, 2)                // ring at 2 r
      ctx.beginPath()
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { ctx.moveTo(dx * nodePx, dy * nodePx); ctx.lineTo(dx * (nodePx + 4), dy * (nodePx + 4)) }
      ctx.strokeStyle = css(pal.paper0); ctx.lineWidth = 1; ctx.stroke()
    },
  }
  for (const [id, fn] of Object.entries(draw) as [GlyphId, () => void][]) {
    const b = mapping[id]
    ctx.setTransform(dpr, 0, 0, dpr, b.x + b.width / 2, b.y + b.height / 2)
    fn()
  }

  // Squares and halos in whole device px on the deviceCell grid (R21: the renderer passes a diameter, so radii are nodePx·HALO/2).
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const cell = deviceCell(cellPx, dpr), sq = mapping.square, tr = mapping.squareTrail
  ctx.fillStyle = css(pal.paper0)
  ctx.fillRect(sq.x, sq.y, 2 * cell, 2 * cell)
  ctx.fillRect(tr.x + cell, tr.y, 2 * cell, 2 * cell)              // head on the right, trailing cell on the left (−x)
  ctx.fillStyle = css(pal.paper0, 0.5)
  ctx.fillRect(tr.x, tr.y + Math.floor(cell / 2), cell, cell)
  const outer = (nodePx * HALO_OUTER * dpr) / 2, inner = (nodePx * HALO_INNER * dpr) / 2
  for (const band of [0, 1, 2, 3] as const) {
    const b = mapping[`halo-${band}`]
    const ox = b.x + b.width / 2 - outer, oy = b.y + b.height / 2 - outer
    ctx.fillStyle = css(band === 0 ? pal.flame : pal.paper0)
    for (const [x, y] of haloCells(outer, inner, cell, BAND_DENSITY[band])) ctx.fillRect(Math.round(ox + x), Math.round(oy + y), cell, cell)
  }
  return { image, mapping, nodePx, cellPx }
}
