import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import Diamond from '@/components/dither/Diamond'
import HaloRing from '@/components/dither/HaloRing'
import LegendTwins from '@/components/glyphs/LegendTwins'

test('legend rows use the shared glyph components: banded halo, grafted and pruned diamonds, reticle', () => {
  const m = r(h('dl', null, h(LegendTwins)))
  expect((m.match(/<pattern id="halo-/g) ?? []).length).toBeGreaterThanOrEqual(1)          // HaloRing
  expect(m).toContain('points="50,0 100,50 50,100 0,50"'); expect(m).toContain('stroke-dasharray="3 2"')   // Diamond grafted + pruned
  expect(m).toContain('viewBox="0 0 14 14"')                                                 // Reticle (selected)
  expect(m).toContain('<dd>selected peer</dd>')
})

test('the legend halo and diamonds are the exact plate constructions, not hand-drawn copies', () => {
  const m = r(h('dl', null, h(LegendTwins)))
  expect(m).toContain(r(h(HaloRing, { size: 16, band: 2, cell: 2 })))
  expect(m).toContain(r(h(HaloRing, { size: 16, band: 0, flame: true, cell: 2 })))
  expect(m).toContain(r(h(Diamond, { size: 12, pruned: true, label: 'pruned attacker' })))
  expect(m).toContain('<title>attacker</title>')
})
