/** Projector maths: fit honest nodes into the padded box; the focus node is the camera's fixed point. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseReel } from '../reel/parse'
import { lerpCamera, makeProjector } from './view'

const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))

test('scale 1 fits every honest node inside the padded box', () => {
  const box = { x: 0, y: 0, w: 1920, h: 1080 }
  const p = makeProjector(d, box, { scale: 1 })
  for (const n of d.nodes.filter(n => !n.attacker)) {
    const [x, y] = p(n.x, n.y)
    expect(x).toBeGreaterThanOrEqual(40)
    expect(x).toBeLessThanOrEqual(1880)
    expect(y).toBeGreaterThanOrEqual(40)
    expect(y).toBeLessThanOrEqual(1040)
  }
  const sq = makeProjector(d, { x: 40, y: 460, w: 1000, h: 1000 }, { scale: 1 }) // the tall cut's square
  const xs = d.nodes.filter(n => !n.attacker).map(n => sq(n.x, n.y)[0])
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(80)
  expect(Math.max(...xs)).toBeLessThanOrEqual(1000)
})

test('focus node is the fixed point of the camera scale', () => {
  const box = { x: 0, y: 0, w: 1920, h: 1080 }
  const f = d.byId.get('peer-22')!
  const a = makeProjector(d, box, { scale: 1, focus: 'peer-22' })(f.x, f.y)
  const b = makeProjector(d, box, { scale: 1.15, focus: 'peer-22' })(f.x, f.y)
  expect(b[0]).toBeCloseTo(a[0], 6)
  expect(b[1]).toBeCloseTo(a[1], 6)
  expect(lerpCamera({ scale: 1 }, { scale: 1.08, focus: 'peer-22' }, 0.5).scale).toBeCloseTo(1.04)
})

test('a focus change pans continuously: the projected point blends between the two focus nodes', () => {
  const box = { x: 0, y: 0, w: 1920, h: 1080 }
  const a = { scale: 1.15, focus: 'sybil-0' }, b = { scale: 1.15, focus: 'peer-10' }
  const at = (t: number) => makeProjector(d, box, lerpCamera(a, b, t))(0, 0)
  const step = (t0: number, t1: number) => Math.hypot(at(t1)[0] - at(t0)[0], at(t1)[1] - at(t0)[1])
  const total = step(0, 1)
  expect(total).toBeGreaterThan(50)
  for (let t = 0; t < 1; t += 0.1) expect(step(t, t + 0.1)).toBeCloseTo(total / 10, 6)
  expect(at(1)[0]).toBeCloseTo(makeProjector(d, box, b)(0, 0)[0], 6)
})
