import { expect, test } from 'vitest'
import { DOT_PRESETS, PRESETS, easeCount, jitter, network, renderField } from './pixel-field'

const lit = (t: Uint8Array) => t.reduce((n, v) => n + (v ? 1 : 0), 0)

test.each(PRESETS)('%s: same t, same frame; a later t differs; something is lit but not everything', preset => {
  const a = renderField(preset, 1.5, 60, 40), b = renderField(preset, 1.5, 60, 40), c = renderField(preset, 3.1, 60, 40)
  expect(a.tone).toEqual(b.tone); expect(a.v).toEqual(b.v)
  expect(a.tone).not.toEqual(c.tone)
  const n = lit(a.tone); expect(n).toBeGreaterThan(60 * 40 * 0.05); expect(n).toBeLessThan(60 * 40)
  expect(Math.max(...a.tone)).toBeLessThanOrEqual(3)
})

test('sphere: corners stay dark, the centre is lit, the network draws accent cells and the publish wave hot ones', () => {
  const f = renderField('sphere', 2.6, 80, 80)
  for (const i of [0, 79, 80 * 79, 80 * 80 - 1]) expect(f.tone[i]).toBe(0)
  expect(f.tone.includes(2)).toBe(true); expect(f.tone.includes(3)).toBe(true)
  const lightSide = f.v[20 * 80 + 28], darkSide = f.v[60 * 80 + 56]   // light comes from the upper left
  expect(lightSide).toBeGreaterThan(darkSide)
})

test('sphere network: Fibonacci points on the unit sphere, connected, node 0 publishes', () => {
  const net = network(50)
  expect(net.pts).toHaveLength(50)
  for (const p of net.pts) expect(Math.hypot(...p)).toBeCloseTo(1, 6)
  expect(net.hop[0]).toBe(0); expect(net.hop.every(h => h >= 0)).toBe(true)   // every peer is reachable
  expect(network(50)).toBe(net)   // memoised
})

test('density scales coverage; zero density lights nothing in the flat fields', () => {
  expect(lit(renderField('rings', 1, 50, 50, { density: 0 }).tone)).toBe(0)
  expect(lit(renderField('halftone', 1, 50, 50, { density: 1.6 }).tone)).toBeGreaterThan(lit(renderField('halftone', 1, 50, 50, { density: 0.6 }).tone))
})

test('split leaves a vertical gap down the middle', () => {
  const f = renderField('split', 0, 60, 30)
  for (let y = 0; y < 30; y++) expect(f.tone[y * 60 + 30]).toBe(0)
})

test('dot presets carry coverage in v; scatter jitter stays inside its cell, tighter where the grid is orderly', () => {
  expect(DOT_PRESETS).toEqual(['halftone', 'scatter'])
  const [lx, ly] = jitter(2, 38, 40, 40), [tx, ty] = jitter(38, 1, 40, 40)
  for (const d of [lx, ly, tx, ty]) expect(Math.abs(d)).toBeLessThanOrEqual(0.8)
  expect(Math.abs(tx) + Math.abs(ty)).toBeLessThanOrEqual(0.2)
})

test('easeCount runs 0 → 1 symmetrically', () => {
  expect(easeCount(0)).toBe(0); expect(easeCount(1)).toBe(1); expect(easeCount(0.5)).toBe(0.5)
})
