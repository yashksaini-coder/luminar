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
