import { expect, test } from 'vitest'
import { project, unproject, zoomAbout } from './canvas2d'

const v = { target: [10, 20] as [number, number], zoom: 1 }

test('project is the y-up orthographic view deck uses (flipY: false), and unproject inverts it', () => {
  expect(project(v, 800, 600, [10, 20])).toEqual([400, 300])        // the target sits at the centre
  expect(project(v, 800, 600, [11, 21])).toEqual([402, 298])        // +x right, +y up, 2^zoom px per unit
  expect(unproject(v, 800, 600, project(v, 800, 600, [-3, 7]))).toEqual([-3, 7])
})

test('zoomAbout keeps the world point under the cursor fixed', () => {
  const at: [number, number] = [123, 456]
  const before = unproject(v, 800, 600, at)
  const next = zoomAbout(v, 800, 600, at, 2.5)
  expect(next.zoom).toBe(2.5)
  const after = unproject(next, 800, 600, at)
  expect(after[0]).toBeCloseTo(before[0]); expect(after[1]).toBeCloseTo(before[1])
})
