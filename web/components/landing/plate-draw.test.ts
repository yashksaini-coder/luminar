import { expect, test } from 'vitest'
import plate from '@/lib/plate-frames.json'
import cards from '@/lib/reel-cards.json'
import { drawPlateFrame, frameIndexAt, PLATE_FPS, plateTransform, STILL_T, type PlateFrames } from './plate-draw'

test('frameIndexAt finds the first frame at or after t, else the last', () => {
  const p = plate as PlateFrames
  expect(p.frames[frameIndexAt(p, 8)].t).toBe(p.frames[0].t); expect(p.frames[frameIndexAt(p, STILL_T)].t).toBeGreaterThanOrEqual(11.9)
  expect(frameIndexAt(p, 999)).toBe(p.frames.length - 1); expect(PLATE_FPS).toBe(2)
})
test('plateTransform fits bounds into w×h with 8 % padding and survives degenerate bounds', () => {
  const to = plateTransform({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, 620, 248)
  // 200×100 into 620×248 at 8 % pad: s = min(520.8/200, 208.32/100) = 2.0832; scaled 416.64×208.32, centred
  expect(to(-100, -50)[0]).toBeCloseTo(101.68, 2); expect(to(-100, -50)[1]).toBeCloseTo(19.84, 2); expect(to(0, 0)).toEqual([310, 124])
  const d = plateTransform({ minX: 3, minY: 3, maxX: 3, maxY: 3 }, 100, 100); expect(d(3, 3).every(Number.isFinite)).toBe(true); expect(d(3, 3)).toEqual([50, 50])
})
test('drawPlateFrame draws every layer of a pre-Sybil frame (a: [], m: []) and of a geo card without throwing', () => {
  const calls: string[] = []
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? { width: 620, height: 248 } : () => { calls.push(String(k)); return k === 'measureText' ? { width: 10 } : undefined }), set: () => true }) as unknown as CanvasRenderingContext2D
  const p = plate as PlateFrames; const empty = { ...p, frames: [{ ...p.frames[0], a: [], m: [] }] }
  for (const layer of ['base', 'attackers'] as const) expect(() => drawPlateFrame(ctx, empty, 0, 620, 248, layer)).not.toThrow()
  expect(calls).toContain('arc'); expect(calls.filter(c => c === 'fillText')).toHaveLength(0)        // no text outside the loupe layer (spec §7: never dither text)
  calls.length = 0; drawPlateFrame(ctx, empty, 0, 620, 248, 'loupe'); expect(calls.filter(c => c === 'fillText').length).toBeGreaterThanOrEqual(50)   // one id per node
  const geo = { ...p, geo: true, bounds: { minX: -450, minY: -145, maxX: 450, maxY: 210 } }; expect(() => drawPlateFrame(ctx, geo, 0, 96, 60, 'base')).not.toThrow()
})
test('a geo card (y flipped) lands every node inside the canvas', () => {
  const arcs: [number, number][] = []
  const ctx = new Proxy({}, { get: (_, k) => (k === 'arc' ? (x: number, y: number) => arcs.push([x, y]) : () => ({ width: 10 })), set: () => true }) as unknown as CanvasRenderingContext2D
  const geo = (cards as unknown as Record<string, PlateFrames>)['mainnet-block-wave']; expect(geo.geo).toBe(true)
  for (const [w, h] of [[96, 60], [620, 248]]) {
    arcs.length = 0; drawPlateFrame(ctx, geo, 0, w, h, 'base'); expect(arcs.length).toBeGreaterThan(0)
    for (const [x, y] of arcs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(w); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(h) }
  }
})
