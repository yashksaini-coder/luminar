import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { MECHANISM } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import Hero, { LEAD, MODELLED_ON } from './Hero'

const doc = () => new DOMParser().parseFromString(r(h(Hero)), 'text/html')

test('hero copy: chip with cursor, two-phrase serif headline, lead ending on the honesty line, two CTAs', () => {
  const d = doc()
  expect(d.querySelector('p')!.textContent).toBe('GossipSub v1.1 simulator')
  expect(d.querySelector('p [aria-hidden="true"]')).not.toBeNull()   // the cursor
  expect([...d.querySelectorAll('h1 > span')].map(s => s.textContent)).toEqual(['Watch a peer-to-peer', 'network defend itself'])
  expect(LEAD.endsWith(MECHANISM)).toBe(true); expect(d.body.textContent).toContain(LEAD)
  const ctas = [...d.querySelectorAll('section a')].map(a => [a.textContent, a.getAttribute('href')])
  expect(ctas).toEqual([['Open the simulator', '/sim/'], ['Watch a recording', '/reels/sybil-eclipse/']])
})

test('no developer furniture in the hero: no terminal, command, copy button or clone line', () => {
  const m = r(h(Hero))
  expect(m).not.toMatch(/make dev|git clone|\$ |<code|<button|curl/)
})

test('right cell: a labelled sphere PixelField, the status chip and a decorative level meter', () => {
  const d = doc()
  const c = d.querySelector('canvas[data-preset="sphere"]')!
  expect(c.getAttribute('role')).toBe('img'); expect(c.getAttribute('aria-label')).toContain(`${stats.peers} peers`)
  expect(d.body.textContent).toContain('All peers gossiping')
})

test('modelled-on strip is plain text wordmarks, labelled "modelled on", never "trusted by"', () => {
  const d = doc(), items = [...d.querySelectorAll('ul[aria-labelledby="modelled-on"] li')]
  expect(items.map(l => l.textContent)).toEqual([...MODELLED_ON]); expect(d.querySelectorAll('ul img, ul svg')).toHaveLength(0)
  expect(d.body.textContent).toContain('Modelled on'); expect(d.body.textContent).not.toMatch(/trusted/i)
})

test('grid rows, reveal order, no recording numbers in the hero, and no <script> inside the component (the layout reveals the hero)', () => {
  const m = r(h(Hero)), d = doc()
  expect(d.querySelectorAll('section [data-grid]')).toHaveLength(3)
  expect([...d.querySelectorAll('section [data-k]')].map(e => e.getAttribute('style'))).toEqual(['--i:0', '--i:1', '--i:2', '--i:3', '--i:4', '--i:5'])
  expect(m).not.toContain('<script'); expect(d.querySelector('dl')).toBeNull()   // no partial-fact stats bar expect(m).toContain('data-hero-reveal=""')
})
