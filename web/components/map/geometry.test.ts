import { expect, test } from 'vitest'
import { bezierPoint, breathe, glyphScale, nodeRadiusPx, particleFrame, pulseAlpha } from './geometry'

test('nodeRadiusPx follows clamp(200/√n, 3, 8) × scale, halved off Force', () => {
  // brief's values (5.657 at n=50, 3 at n=200) fit 40/√n; the formula and frontend/src/map/renderer.ts:153 say 200/√n
  expect(nodeRadiusPx(20, 'force', 1)).toBe(8); expect(nodeRadiusPx(200, 'force', 1)).toBe(8)
  expect(nodeRadiusPx(1000, 'force', 1)).toBeCloseTo(6.325, 2); expect(nodeRadiusPx(5000, 'force', 1)).toBe(3)
  expect(nodeRadiusPx(1000, 'force', 1.4)).toBeCloseTo(8.854, 2); expect(nodeRadiusPx(1000, 'radial', 1)).toBeCloseTo(3.162, 2)
})
test('glyphScale: selected ×1.5, attacker ×1.15, both multiply', () => {
  expect(glyphScale({ state: 'idle' }, false)).toBe(1); expect(glyphScale({ state: 'idle' }, true)).toBe(1.5)
  expect(glyphScale({ state: 'attacker' }, false)).toBe(1.15); expect(glyphScale({ state: 'attacker' }, true)).toBeCloseTo(1.725)
})
test('bezierPoint hits the endpoints and bows left of travel', () => {
  expect(bezierPoint([0, 0], [100, 0], 0)).toEqual([0, 0]); expect(bezierPoint([0, 0], [100, 0], 1)).toEqual([100, 0])
  expect(bezierPoint([0, 0], [100, 0], 0.5)[1]).toBeCloseTo(6)                   // bow = min(18, 100 × .12) = 12; midpoint offset = bow/2
  expect(bezierPoint([100, 0], [0, 0], 0.5)[1]).toBeCloseTo(-6)                  // A→B and B→A separate
})
test('particleFrame: ease-out travel over 800 ms, fizzle stalls at .6, null after lifetime', () => {
  expect(particleFrame(0, false)).toEqual({ t: 0, alpha: 242 })
  expect(particleFrame(800, false)!.t).toBe(1); expect(particleFrame(800, false)!.alpha).toBeCloseTo(121)
  expect(particleFrame(400, false)!.t).toBeCloseTo(0.75)
  expect(particleFrame(800, true)!.t).toBe(0.6); expect(particleFrame(800, true)!.alpha).toBeCloseTo(89); expect(particleFrame(1000, true)!.alpha).toBeCloseTo(44.5)
  expect(particleFrame(1201, false)).toBeNull()
})
test('pulseAlpha and breathe', () => {
  expect(pulseAlpha(0)).toBe(56); expect(pulseAlpha(400)).toBe(28); expect(pulseAlpha(900)).toBe(0)
  expect(breathe(0)).toBeCloseTo(0.475); expect(breathe(1400)).toBeCloseTo(0.75); expect(breathe(4200)).toBeCloseTo(0.2)
})
