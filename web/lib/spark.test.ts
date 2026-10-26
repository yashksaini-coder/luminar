import { expect, test } from 'vitest'
import { scoreDomain, sparkPoints } from '@/lib/spark'

test('scoreDomain always contains [-0.5, 0.5]', () => {
  expect(scoreDomain([0.1, 0.2])).toEqual([-0.5, 0.5])
  expect(scoreDomain([-20, 1])).toEqual([-20, 1])
})

test('sparkPoints spaces x evenly, insets y by 1 px and reports the zero line', () => {
  const { pts, zeroY } = sparkPoints([-1, 0, 1], 100, 22, [-1, 1])
  expect(pts.map(p => p[0])).toEqual([0, 50, 100])
  expect(pts[0][1]).toBe(21)
  expect(pts[2][1]).toBe(1)
  expect(zeroY).toBe(11)
  expect(sparkPoints([3, 3], 10, 10).zeroY).toBeNull()        // domain [2.5, 3.5] excludes 0
  expect(sparkPoints([], 10, 10)).toEqual({ pts: [], zeroY: null })
})
