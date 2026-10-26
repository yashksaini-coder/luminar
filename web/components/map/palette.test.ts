import { expect, test } from 'vitest'
import { BAND_DENSITY, cssToRgba, PAL, PALETTE_TOKENS, refreshPalette, scoreBand, withAlpha } from './palette'

test('cssToRgba', () => {
  expect(cssToRgba('#ff5a2c')).toEqual([255, 90, 44, 255])
  expect(cssToRgba('rgb(242 242 239 / 0.14)')).toEqual([242, 242, 239, 36])
  expect(cssToRgba('oklch(68.3% 0.209 36)')[0]).toBeGreaterThan(240)
  expect(cssToRgba('#ff5a2c', 0.5)[3]).toBe(128)
})

test('scoreBand and densities', () => {
  expect([-0.1, 0, 1.9, 2, 5.9, 6, 12].map(scoreBand)).toEqual([0, 1, 1, 2, 2, 3, 3])
  expect(BAND_DENSITY).toEqual([0.12, 0.35, 0.65, 1])
  expect(withAlpha([1, 2, 3, 255], 0.5)).toEqual([1, 2, 3, 128])
})

test('refreshPalette reads tokens and re-reads on data-stage', () => {
  for (const [k, v] of Object.entries(PALETTE_TOKENS)) document.documentElement.style.setProperty(v, k === 'flame' ? '#ff5a2c' : '#f2f2ef')
  expect(refreshPalette()).toBe(true)
  expect(PAL.flame).toEqual([255, 90, 44, 255])
  expect(refreshPalette()).toBe(false)
  document.documentElement.dataset.stage = '1'
  expect(refreshPalette()).toBe(true)
  delete document.documentElement.dataset.stage
})
