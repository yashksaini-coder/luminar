import { BAND_DENSITY } from '@/components/map/palette'
import { FLAME, PAPER, PITCH } from '@/components/dither/dither'
import type { RGBA } from '@/lib/types'

/** Fig. 1 plate and reel-card drawing: pure canvas calls over lib/plate-frames.json / lib/reel-cards.json (A.21). */

export interface PlateFrame { t: number; s: string; b: string; a: { id: string; x: number; y: number; p: boolean; v: number[] }[]; m: [number, number][]; r: { peers: number; sybil: number; pruned: number }; stamp: string }
export interface PlateFrames { reel: string; from: number; to: number; step: number; geo?: boolean; nodes: { id: string; x: number; y: number }[]; edges: [number, number][]; bounds: { minX: number; minY: number; maxX: number; maxY: number }; frames: PlateFrame[] }
/** base is dithered (greys are densities); attackers stays flat; loupe adds the ids. */
export type PlateLayer = 'base' | 'attackers'

export const PLATE_FPS = 2
export const STILL_T = 11.9

const css = ([r, g, b]: RGBA, a = 1) => (a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`)
const PAPER_FILL = css(PAPER)
const PITCH_FILL = css(PITCH)
const FLAME_FILL = css(FLAME)
const IDLE_FILL = '#37383b'
const DIM = '#696964'
const PAPER_1 = '#bebeba'   // --paper-1

/** Uniform fit of bounds into w×h with `pad` on each side, centred; degenerate bounds → scale 1. */
export function plateTransform(bounds: PlateFrames['bounds'], w: number, h: number, pad = 0.08): (x: number, y: number) => [number, number] {
  const { minX, minY, maxX, maxY } = bounds
  const sx = (w * (1 - 2 * pad)) / Math.max(1e-9, maxX - minX)
  const sy = (h * (1 - 2 * pad)) / Math.max(1e-9, maxY - minY)
  const s = maxX === minX && maxY === minY ? 1 : Math.min(sx, sy)
  const ox = (w - (maxX - minX) * s) / 2 - minX * s
  const oy = (h - (maxY - minY) * s) / 2 - minY * s
  return (x, y) => [ox + x * s, oy + y * s]
}

/** First frame index with t ≥ `t`, else the last. */
export function frameIndexAt(plate: PlateFrames, t: number): number {
  const i = plate.frames.findIndex(f => f.t >= t)
  return i === -1 ? plate.frames.length - 1 : i
}

export function drawPlateFrame(ctx: CanvasRenderingContext2D, plate: PlateFrames, i: number, w: number, h: number, layer: PlateLayer): void {
  const { bounds } = plate
  const fit = plateTransform(plate.geo ? { ...bounds, minY: -bounds.maxY, maxY: -bounds.minY } : bounds, w, h)   // geo flips y, so fit the flipped box
  const to = (x: number, y: number) => fit(x, plate.geo ? -y : y)
  const r = Math.min(6, Math.max(3, w / 120))
  const f = plate.frames[i]
  const pts = plate.nodes.map(n => to(n.x, n.y))
  const at = (k: number) => (k < 0 ? to(f.a[-1 - k].x, f.a[-1 - k].y) : pts[k])
  const disc = (x: number, y: number, rad: number) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2) }
  const line = (a: [number, number], b: [number, number]) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke() }

  if (layer === 'attackers') {
    ctx.clearRect(0, 0, w, h)
    ctx.lineWidth = 1
    for (const a of f.a) {
      const [x, y] = to(a.x, a.y)
      if (!a.p) {
        ctx.setLineDash([4, 3]); ctx.strokeStyle = css(FLAME, 0.55)
        for (const v of a.v) line([x, y], pts[v])
      }
      const d = 1.15 * r
      ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath()
      if (a.p) { ctx.setLineDash([3, 2]); ctx.strokeStyle = DIM; ctx.stroke() } else { ctx.setLineDash([]); ctx.fillStyle = FLAME_FILL; ctx.fill() }
    }
    ctx.setLineDash([]); ctx.strokeStyle = FLAME_FILL
    pts.forEach(([x, y], k) => { if (f.b[k] === '0') { disc(x, y, 1.7 * r); ctx.stroke() } })
    return
  }

  ctx.setLineDash([])
  ctx.fillStyle = PITCH_FILL; ctx.fillRect(0, 0, w, h)
  ctx.lineWidth = 1; ctx.strokeStyle = css(PAPER, 0.16)
  for (const [a, b] of plate.edges) line(pts[a], pts[b])
  pts.forEach(([x, y], k) => {
    const band = Number(f.b[k])
    if (band > 0) { const v = Math.round(255 * BAND_DENSITY[band]); ctx.fillStyle = `rgb(${v},${v},${v})`; disc(x, y, 1.7 * r); ctx.fill() }
    switch (f.s[k]) {
      case 'i': ctx.fillStyle = IDLE_FILL; disc(x, y, r); ctx.fill(); ctx.strokeStyle = DIM; ctx.stroke(); break
      case 'o': ctx.fillStyle = PAPER_FILL; disc(x, y, r); ctx.fill(); ctx.fillStyle = PITCH_FILL; disc(x, y, 0.35 * r); ctx.fill(); break
      case 'd': ctx.fillStyle = PAPER_FILL; disc(x, y, r); ctx.fill(); ctx.strokeStyle = PAPER_FILL; disc(x, y, 1.6 * r); ctx.stroke(); break
      case 'j': ctx.strokeStyle = PAPER_1; disc(x, y, r - 1); ctx.stroke(); break
      case 'f': case 'e':
        ctx.fillStyle = DIM; disc(x, y, r); ctx.fill(); ctx.strokeStyle = PITCH_FILL
        line([x - 0.6 * r, y - 0.6 * r], [x + 0.6 * r, y + 0.6 * r]); line([x - 0.6 * r, y + 0.6 * r], [x + 0.6 * r, y - 0.6 * r]); break
      default: ctx.fillStyle = PAPER_FILL; disc(x, y, r); ctx.fill()   // 'r' receiving
    }
  })
  ctx.strokeStyle = css(PAPER, 0.45); ctx.fillStyle = PAPER_FILL
  for (const [from, toK] of f.m) {
    const a = at(from); const b = pts[toK]
    line(a, b)
    ctx.fillRect(a[0] + (b[0] - a[0]) * 0.65 - 2, a[1] + (b[1] - a[1]) * 0.65 - 2, 4, 4)
  }

}
