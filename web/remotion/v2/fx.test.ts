/** LaunchV2 pixel dissolve: coverage peaks on each cut and the Bayer threshold covers the matching share of cells. */
import { expect, test } from 'vitest'
import { bayer } from '../../components/dither/dither'
import { dissolveAt } from './fx'
import { CUTS } from './timeline'

test('dissolve closes into every cut and is gone 12 frames either side', () => {
  for (const c of CUTS) {
    expect(dissolveAt(c)).toBeGreaterThan(0.95); expect(dissolveAt(c - 1)).toBeGreaterThan(0.95)
    expect(dissolveAt(c - 13)).toBe(0); expect(dissolveAt(c + 12)).toBe(0)
  }
  expect(dissolveAt(CUTS[0] - 6)).toBeCloseTo(0.54, 2)
})

test('a coverage of p hides p of the 8×8 Bayer cells', () => {
  const covered = (p: number) => { let n = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (bayer(x, y) < p) n++; return n / 64 }
  expect(covered(0)).toBe(0); expect(covered(0.5)).toBe(0.5); expect(covered(1)).toBe(1)
})
