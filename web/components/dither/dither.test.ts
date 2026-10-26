import { expect, test } from 'vitest'
import {
  BAYER8, DITHER_CONTRAST, PAPER, PITCH, applyContrast, bayer, coverRect, ditherImageData, luma601, revealSteps,
  type RawImage,
} from './dither'

test('BAYER8 is the canonical matrix with (v+.5)/64 thresholds', () => { expect(BAYER8).toHaveLength(64); expect(bayer(0, 0)).toBeCloseTo(0.5 / 64); expect(bayer(1, 0)).toBeCloseTo(32.5 / 64); expect(bayer(0, 1)).toBeCloseTo(48.5 / 64); expect(bayer(7, 7)).toBeCloseTo(21.5 / 64); expect(new Set(BAYER8).size).toBe(64) })
test('luma and contrast', () => { expect(luma601(255, 255, 255)).toBeCloseTo(1); expect(applyContrast(0.5, 1.15, 0)).toBeCloseTo(0.5); expect(applyContrast(0, 1.15, 0)).toBe(0); expect(DITHER_CONTRAST).toBe(1.15) })
test('ditherImageData is 1-bit, pure, and density-exact for flat input', () => {
  const grey = (v: number, w = 16, h = 16): RawImage => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : v)) })
  const out = ditherImageData(grey(128), 1, { paper: PAPER, pitch: PITCH }, { contrast: 1 })
  const lit = Array.from({ length: 256 }, (_, i) => out.data[i * 4] === 242).filter(Boolean).length
  expect(lit).toBeGreaterThanOrEqual(124); expect(lit).toBeLessThanOrEqual(132)                         // ~50 % of cells lit
  expect(ditherImageData(grey(0), 1, { paper: PAPER, pitch: PITCH }).data.every((v, i) => i % 4 === 3 || v === [11, 11, 13][i % 4])).toBe(true)
  expect(ditherImageData(grey(128), 1, { paper: PAPER, pitch: PITCH }, { contrast: 1 })).toEqual(out)   // same input → same output (no shimmer)
})
test('cell > 1 lights whole blocks; density mode ignores luma', () => {
  const grey = (v: number, w: number, h: number): RawImage => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : v)) })
  const out = ditherImageData(grey(255, 8, 8), 4, { paper: PAPER, pitch: PITCH }); expect(out.data[0]).toBe(242); expect(out.data[(3 * 8 + 3) * 4]).toBe(242)
  const d = ditherImageData(grey(0, 8, 8), 1, { paper: PAPER, pitch: PITCH }, { density: 0.35 }); const n = Array.from({ length: 64 }, (_, i) => d.data[i * 4] === 242).filter(Boolean).length; expect(n).toBeGreaterThanOrEqual(21); expect(n).toBeLessThanOrEqual(23)
})
test('revealSteps and coverRect', () => { expect(revealSteps(3)).toEqual([28, 20, 14, 10, 7, 5, 4, 3]); expect(revealSteps(4)).toEqual([28, 20, 14, 10, 7, 5, 4]); expect(coverRect(200, 100, 100, 100, 0.5, 0.5)).toEqual([50, 0, 100, 100]); expect(coverRect(100, 200, 100, 100, 0.5, 0)).toEqual([0, 0, 100, 100]) })
