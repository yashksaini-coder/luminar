import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { FORBIDDEN, MECHANISM } from '@/lib/copy'
import HonestByDesign, { ROWS } from './HonestByDesign'

const doc = () => new DOMParser().parseFromString(r(h(HonestByDesign)), 'text/html')

test('two columns (Luminar, Ethereum mainnet) over five rows; the lead opens on the honesty line', () => {
  const d = doc()
  expect(d.querySelector('section#honest')!.getAttribute('aria-labelledby')).toBe('honest-h'); expect(d.querySelector('h2#honest-h')!.textContent).toBe('Honest by design'); expect(d.querySelector('header p:last-child')!.textContent!.startsWith(MECHANISM)).toBe(true)
  expect([...d.querySelectorAll('thead th')].map(t => t.textContent)).toEqual(['Parameter', 'Luminar', 'Ethereum mainnetLighthouse defaults'])
  expect(ROWS).toHaveLength(5); expect(d.querySelectorAll('tbody tr')).toHaveLength(5)
  for (const tr of d.querySelectorAll('tbody tr')) { expect(tr.querySelector('th[scope="row"]')).not.toBeNull(); expect(tr.querySelectorAll('td')).toHaveLength(2) }
  expect(ROWS.map(r => r.name)).toEqual(['Mesh degree', 'Heartbeat', 'Thresholds', 'Score terms', 'Eclipse'])
})

test('engine constants: D 6 vs 8, heartbeat 1 s vs 0.7 s, thresholds −5/−10, P1–P4 vs P1–P7', () => {
  const v = Object.fromEntries(ROWS.map(r => [r.name, [r.ours, r.main]]))
  expect(v['Mesh degree']).toEqual(['6', '8']); expect(v.Heartbeat).toEqual(['1 s', '0.7 s'])
  expect(v.Thresholds[0]).toBe('−5 · −10'); expect(v['Score terms']).toEqual(['P1–P4', 'P1–P7'])
})

test('no source paths, commands or forbidden claims; no hyphens in prose', () => {
  const t = doc().body.textContent!
  expect(t).not.toMatch(/\.py|\.md|backend\/|docs\/|Sources?:/)
  for (const f of FORBIDDEN) expect(t).not.toContain(f)
  expect(ROWS.flatMap(r => [r.oursNote ?? '', r.mainNote ?? '']).join(' ')).not.toMatch(/\w-\w/)
})
