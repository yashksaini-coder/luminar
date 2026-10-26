import { afterEach, expect, test, vi } from 'vitest'
import type { PeerNode, RGBA } from '@/lib/types'
import { atlasKey, atlasLayout, buildAtlas, glyphFor, HALO_INNER, HALO_OUTER, haloCells, haloFor, type GlyphId } from './atlas'
import { BAND_DENSITY, type PaletteKey } from './palette'

test('atlasLayout places every GlyphId once, in one row, at dpr-scaled sizes with 2 px gutters', () => {
  const L = atlasLayout(10, 2, 2)
  const ids: GlyphId[] = ['disc', 'idle', 'origin', 'decoded', 'observer', 'joining', 'failed', 'error', 'attacker', 'pruned', 'reticle', 'square', 'squareTrail', 'halo-0', 'halo-1', 'halo-2', 'halo-3']
  expect(Object.keys(L.mapping).sort()).toEqual([...ids].sort())
  expect(L.mapping.disc.width).toBe(Math.ceil((10 + 2) * 2)); expect(L.mapping.disc.mask).toBe(false)
  expect(L.mapping.attacker.width).toBe(Math.ceil(10 * 1.15 * 2) + 4); expect(L.mapping.reticle.width).toBeGreaterThanOrEqual(Math.ceil(10 * 2 * 2))
  expect(L.mapping['halo-3'].width).toBe(Math.ceil(10 * 1.7 * 2) + 4); expect(L.mapping.square.width).toBe(2 * 2 * 2)
  const boxes = Object.values(L.mapping).sort((a, b) => a.x - b.x)
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width + 2)
  expect(L.width).toBe(boxes.at(-1)!.x + boxes.at(-1)!.width); expect(L.height).toBe(Math.max(...boxes.map(b => b.height)))
})
test('haloCells fills the annulus at the band density with Bayer, never inside the inner radius', () => {
  const all = haloCells(34, 24, 2, 1)                     // r_out 34, r_in 24 (nodePx 20 × 1.7 / 1.2), 2 px cells
  for (const [x, y] of all) { const d = Math.hypot(x + 1 - 34, y + 1 - 34); expect(d).toBeLessThanOrEqual(34 + 1.5); expect(d).toBeGreaterThanOrEqual(24 - 1.5) }
  const ratio = (dens: number) => haloCells(34, 24, 2, dens).length / all.length
  expect(ratio(0.12)).toBeGreaterThan(0.08); expect(ratio(0.12)).toBeLessThan(0.16)
  expect(ratio(0.35)).toBeGreaterThan(0.30); expect(ratio(0.35)).toBeLessThan(0.40)
  expect(ratio(0.65)).toBeGreaterThan(0.60); expect(ratio(0.65)).toBeLessThan(0.70)
  expect(haloCells(34, 24, 2, 0.35)).toEqual(haloCells(34, 24, 2, 0.35))        // pure: no shimmer between frames
})
test('haloFor and glyphFor follow the render table', () => {
  expect([-1, 0, 2, 6].map(haloFor)).toEqual(['halo-0', 'halo-1', 'halo-2', 'halo-3'])
  const g = (p: Partial<PeerNode>) => glyphFor({ state: 'receiving', connected_peers: [], ...p })
  expect(g({})).toBe('disc'); expect(g({ state: 'idle' })).toBe('idle'); expect(g({ state: 'origin' })).toBe('origin'); expect(g({ state: 'decoded' })).toBe('decoded')
  expect(g({ state: 'joining' })).toBe('joining'); expect(g({ state: 'failed' })).toBe('failed'); expect(g({ state: 'error' })).toBe('error')
  expect(g({ state: 'attacker', connected_peers: ['peer-1'] })).toBe('attacker'); expect(g({ state: 'attacker', connected_peers: [] })).toBe('pruned')
  expect(g({ is_real: true })).toBe('observer'); expect(g({ is_telemetry: true, state: 'decoded' })).toBe('observer')
})
test('atlasKey changes with any input', () => { expect(atlasKey(10, 2, 2, 'dark|')).not.toBe(atlasKey(10, 3, 2, 'dark|1')); expect(atlasKey(10, 2, 2, 'a')).toBe(atlasKey(10, 2, 2, 'a')) })
test('atlasLayout keeps every box on whole device pixels at a fractional dpr', () => {
  const L = atlasLayout(10, 2, 1.25)                      // cellPx 2 × 1.25 = 2.5 rounds to a 3 px device cell
  for (const b of Object.values(L.mapping)) for (const v of [b.x, b.width, b.height]) expect(Number.isInteger(v)).toBe(true)
  expect(L.mapping.square.width).toBe(6); expect(L.mapping.squareTrail.width).toBe(9); expect(Number.isInteger(L.width)).toBe(true)
})

afterEach(() => { vi.restoreAllMocks() })
/** jsdom has no 2D context: record the calls buildAtlas makes; real pixels are checked in Chrome (task-2.3 report). */
function recordingCanvas() {
  const fills: { rect: number[]; style: string; transform: number[] }[] = [], strokes: { lineWidth: number; transform: number[] }[] = []
  let transform = [1, 0, 0, 1, 0, 0]
  const ctx: Record<string, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, imageSmoothingEnabled: true,
    setTransform: (...m: number[]) => { transform = m },
    fillRect: (...rect: number[]) => fills.push({ rect, style: ctx.fillStyle as string, transform }),
    stroke: () => strokes.push({ lineWidth: ctx.lineWidth as number, transform }),
  }
  const noop = () => {}
  for (const m of ['beginPath', 'arc', 'fill', 'moveTo', 'lineTo', 'closePath', 'save', 'restore', 'clip', 'setLineDash']) ctx[m] = noop
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  return { fills, strokes }
}
const PAL_FIXTURE = new Proxy({ paper0: [240, 236, 228, 255], flame: [255, 90, 44, 255] } as Record<PaletteKey, RGBA>, { get: (t, k: string) => t[k as PaletteKey] ?? [128, 128, 128, 255] })
test('buildAtlas fills squares and halos on whole device px inside their boxes, one fillRect per haloCells cell', () => {
  for (const dpr of [1, 1.25, 2]) {
    const rec = recordingCanvas()
    const a = buildAtlas({ nodePx: 10, cellPx: 2, dpr, pal: PAL_FIXTURE })
    const L = atlasLayout(10, 2, dpr), cell = Math.max(1, Math.round(2 * dpr))
    expect([a.image.width, a.image.height]).toEqual([L.width, L.height])
    for (const band of [0, 1, 2, 3] as const) {
      const b = L.mapping[`halo-${band}`]
      const mine = rec.fills.filter(f => f.rect[0] >= b.x && f.rect[0] < b.x + b.width)
      expect(mine.length).toBe(haloCells((10 * HALO_OUTER * dpr) / 2, (10 * HALO_INNER * dpr) / 2, cell, BAND_DENSITY[band]).length)
      for (const { rect: [x, y, w, h], style, transform } of mine) {
        expect(transform).toEqual([1, 0, 0, 1, 0, 0]); expect([x, y].every(Number.isInteger)).toBe(true); expect([w, h]).toEqual([cell, cell])
        expect(x + w).toBeLessThanOrEqual(b.x + b.width); expect(y + h).toBeLessThanOrEqual(b.y + b.height)
        expect(style).toBe(band === 0 ? 'rgba(255,90,44,1)' : 'rgba(240,236,228,1)')
      }
    }
  }
})
test('buildAtlas strokes the reticle ring and ticks at 2 px [spec §6.2 "ring at 2 r + four ticks, 2 px"]', () => {
  const rec = recordingCanvas()
  buildAtlas({ nodePx: 10, cellPx: 2, dpr: 1, pal: PAL_FIXTURE })
  const b = atlasLayout(10, 2, 1).mapping.reticle
  const reticle = rec.strokes.filter(s => s.transform[4] === b.x + b.width / 2)
  expect(reticle.length).toBe(2); for (const s of reticle) expect(s.lineWidth).toBe(2)
})
