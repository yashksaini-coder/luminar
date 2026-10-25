import { expect, test } from 'vitest'
import { SAFE_TALL, SIZE, type SceneId } from '../timeline'
import { LAYOUT, boxes, stampBox } from './layout'

test('every tall layout box stays outside the Reels/Shorts safe zones', () => {
  for (const id of Object.keys(LAYOUT) as SceneId[]) for (const b of boxes(LAYOUT[id].tall)) {
    expect(b.y, `${id} top`).toBeGreaterThanOrEqual(SAFE_TALL.top); expect(b.y + b.h, `${id} bottom`).toBeLessThanOrEqual(SIZE.tall.height - SAFE_TALL.bottom)
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(SIZE.tall.width)
  }
  expect(LAYOUT.title.tall.headlinePx).toBe(72); expect(LAYOUT.title.wide.headlinePx).toBe(96); expect(LAYOUT.pruned.tall.strip!.h).toBe(140); expect(LAYOUT.honesty.tall.monoPx).toBe(44)
})

test('the stamp never overlaps the caption, readout or strip', () => {
  const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  for (const id of Object.keys(LAYOUT) as SceneId[]) for (const o of ['wide', 'tall'] as const) {
    const l = LAYOUT[id][o]; const s = stampBox(l, SIZE[o])
    for (const b of [l.caption, l.readout, l.strip]) if (b) expect(hit(s, b), `${id} ${o}`).toBe(false)
  }
})
