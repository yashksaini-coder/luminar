import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import plate from '@/lib/plate-frames.json'
import { frameIndexAt, STILL_T, type PlateFrames } from './plate-draw'
import PlateReplay from './PlateReplay'

test('PlateReplay server markup: canvas, halo ring, diamond, readout box and the first beat stamp; no shard, no halftone', () => {
  const p = plate as PlateFrames; const m = r(h(PlateReplay, { plate: p }))
  expect(m).toContain('data-dither="1"'); expect(m).toContain('data-depth="0.6"'); expect(m).toContain('data-depth="0.35"'); expect(m).toContain('data-depth="0.2"'); expect(m).toContain('data-depth="0.8"'); expect(m).toContain('data-depth="1.2"')
  expect(m).toContain('>PEERS<'); expect(m).toContain('>SYBIL<'); expect(m).toContain('>PRUNED<'); expect(m).toContain('>T+<')
  expect(m).toContain(p.frames[frameIndexAt(p, STILL_T)].stamp)     // SSR renders the reduced-motion still frame; the client advances
  expect(m).not.toMatch(/clip-path|halftone|polygon\(/)
  expect(m).toContain('tabindex="0"'); expect(m).toContain('role="group"'); expect(m).toContain('aria-label="Fifty peers')   // aria-label needs a role that allows it (axe aria-prohibited-attr)
})
