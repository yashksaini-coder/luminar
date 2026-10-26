import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { ECLIPSE_WHY, MECHANISM } from '@/lib/copy'
import Faithfulness, { ROWS } from './Faithfulness'

const doc = () => new DOMParser().parseFromString(r(h(Faithfulness)), 'text/html')

test('section: reveal section titled with the mechanism line, a real table with a caption and three column headers', () => {
  const d = doc(); const s = d.querySelector('section[data-reveal]')!
  expect(s.querySelector('h2')!.textContent).toBe(MECHANISM)
  expect(d.querySelector('[id="faith-cap"]')!.textContent).toMatch(/Lighthouse defaults/)
  expect([...d.querySelectorAll('thead th[scope="col"]')].map(t => t.textContent)).toEqual(['Parameter', 'Luminar', 'Ethereum mainnet Lighthouse defaults'])
  expect(d.querySelector('[role="region"][tabindex="0"]')!.getAttribute('aria-labelledby')).toBe('faith-cap')   // keyboard can scroll the table on phones
})
test('eight rows from the spec, each a row header, with the engine and mainnet numbers', () => {
  const d = doc(); const rows = [...d.querySelectorAll('tbody tr')]
  expect(rows.map(tr => tr.querySelector('th[scope="row"] span')!.textContent)).toEqual(['Mesh degree', 'Heartbeat', 'Score thresholds', 'Score terms', 'Link latency', 'Signatures', 'IWANT timing', 'Eclipse visibility'])
  const cells = (i: number) => [...rows[i].querySelectorAll('td')].map(td => td.textContent)
  expect(cells(0)[0]).toContain('6'); expect(cells(0)[1]).toBe('8')
  expect(cells(1)).toEqual(['1 s', '0.7 s'])
  expect(cells(2)[0]).toBe('−5 · −10'); expect(cells(2)[1]).toContain('−4000 · −8000 · −16000')
  expect(cells(3)[0]).toContain('P1–P4'); expect(cells(3)[1]).toContain('P1–P7')
  expect(cells(4)[0]).toContain('5–50 ms')
  expect(cells(7)[0]).toContain(ECLIPSE_WHY)
  expect(ROWS).toHaveLength(8)
})
test('reading order: kicker, title, lead rise as up; the card rises as card', () => {
  const d = doc()
  expect([...d.querySelectorAll('[data-k]')].map(e => `${e.getAttribute('data-k')}${e.getAttribute('style')}`)).toEqual(['up--i:0', 'up--i:1', 'up--i:2', 'card--i:3', 'up--i:4'])
})
