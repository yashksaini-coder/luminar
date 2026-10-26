import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import stats from '@/lib/reel-stats.json'
import Problem, { BENEFITS } from './Problem'

const doc = () => new DOMParser().parseFromString(r(h(Problem)), 'text/html')

test('statement: two lines, one highlighted word, inside a grid row', () => {
  const d = doc()
  expect(d.querySelector('section')!.hasAttribute('data-grid')).toBe(true)
  expect([...d.querySelectorAll('h2 > span')].map(s => s.textContent)).toEqual(['Gossip attacks are invisible', 'until the mesh breaks'])
  expect(d.querySelector('h2 em')!.textContent).toBe('breaks')
})

test('three benefit columns, each with a labelled PixelField and a number from the recording', () => {
  const d = doc()
  expect([...d.querySelectorAll('h3')].map(e => e.textContent)).toEqual(['See every hop', 'Break it on purpose', 'Replay any moment'])
  const fields = [...d.querySelectorAll('li canvas')]
  expect(fields.map(c => c.getAttribute('data-preset'))).toEqual(['sphere', 'swirl', 'scatter'])
  for (const c of fields) { expect(c.getAttribute('role')).toBe('img'); expect(c.getAttribute('aria-label')).toBeTruthy() }
  expect(BENEFITS.map(b => b.value)).toEqual([String(stats.avgHops), String(stats.heartbeatsToPrune), String(stats.simDurationS)])
  expect(d.body.textContent).toContain(`T+${stats.firstScorePruneAt} s`)
})

test('reveal: header and columns are data-reveal sections, columns rise as cards in order', () => {
  const d = doc()
  expect(d.querySelectorAll('[data-reveal]')).toHaveLength(2)
  expect([...d.querySelectorAll('li[data-k="card"]')].map(e => (e as HTMLElement).style.getPropertyValue('--i'))).toEqual(['0', '1', '2'])
})
