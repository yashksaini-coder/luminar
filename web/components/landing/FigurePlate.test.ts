import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { FIG2 } from '@/lib/copy'
import FigureFrame from './FigureFrame'
import FigurePlate from './FigurePlate'

test('FigureFrame: lazy iframe with the spec title; press passthrough only when given; full-bleed variant', () => {
  const a = r(h(FigureFrame, {})); expect(a).toContain('src="/figures/sorter.html"'); expect(a).toContain('loading="lazy"'); expect(a).toContain('title="Sorting office: GossipSub as a pneumatic-tube desk"')
  const b = r(h(FigureFrame, { press: 'Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500', fullBleed: true }))
  expect(b).toContain(`src="/figures/sorter.html?press=${encodeURIComponent('Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500')}"`); expect(b).not.toContain('loading="lazy"'); expect(b).toContain('position:fixed')
})
test('FigurePlate: Fig. 2 with stamp, paper rectangle, one halo ring, caption from copy.ts', () => {
  const m = r(h(FigurePlate)); expect(m).toContain('Fig. 2'); expect(m).toContain(`<em>${FIG2}</em>`); expect(m).toContain('SORTER No. 6'); expect(m).toContain('#f4f1e8'); expect((m.match(/<pattern /g) ?? []).length).toBe(1); expect(m).toContain('<iframe')
})
