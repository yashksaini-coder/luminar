import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import Diamond from './Diamond'
import HaloRing from './HaloRing'

test('HaloRing lights exactly the Bayer cells under the band density', () => {
  for (const [band, n] of [[0, 8], [1, 22], [2, 42], [3, 64]] as const) {
    const m = r(h(HaloRing, { size: 64, band }))
    expect((m.match(/<rect /g) ?? []).length).toBe(n)
  }
  expect(r(h(HaloRing, { size: 64 }))).toContain('var(--paper-0)')
  expect(r(h(HaloRing, { size: 64, band: 0, flame: true }))).toContain('var(--flame)')
  expect(r(h(HaloRing, { size: 64, depth: 0.35 }))).toContain('data-depth="0.35"')
  expect(r(h(HaloRing, { size: 64, cell: 2 }))).toContain('width="16"')
  expect(r(h(HaloRing, { size: 64 }))).not.toContain('<canvas')
})

test('Diamond: grafted is a flame rhombus with a 45° hatch; pruned is hollow and dashed; never a canvas', () => {
  const g = r(h(Diamond, { size: 28, label: 'attacker' }))
  expect(g).toContain('points="50,0 100,50 50,100 0,50"')
  expect(g).toContain('fill="var(--flame)"')
  expect(g).toContain('patternTransform="rotate(45)"')
  expect(g).toContain('<title>attacker</title>')
  const p = r(h(Diamond, { size: 28, pruned: true }))
  expect(p).toContain('fill="none"')
  expect(p).toContain('stroke="var(--paper-3)"')
  expect(p).toContain('stroke-dasharray="3 2"')
  expect(g + p).not.toContain('<canvas')
})
