import { expect, test } from 'vitest'
import type { PeerNode } from '@/lib/types'
import { atlasKey, atlasLayout, glyphFor, haloCells, haloFor, type GlyphId } from './atlas'

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
