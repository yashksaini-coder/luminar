import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import Faq, { QA } from '@/components/landing/Faq'
import { FORBIDDEN, MECHANISM, RECORDING_NOT_RUN } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import Home from './page'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

const src = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

// Spec §4.8: `/?reel=<n>` redirects, so the phase-4 island must stay the first child of the landing page.
// Until phase 4 merges, a marker comment holds its slot; after the merge `<ReelRedirect />` replaces it.
test('redirect island slot is the first child, before <Nav>', () => {
  const island = src.search(/<ReelRedirect \/>|\{\/\* ReelRedirect slot/)
  expect(island).toBeGreaterThan(-1)
  expect(island).toBeLessThan(src.indexOf('<Nav'))
  expect(src.slice(src.indexOf('<>') + 2, island).trim()).toBe('')
})

test('page order: skip link, GridFrame, Nav, main#main with Hero → Problem → AttackCards → Statement → VideoPlate → FigurePlate → Features → HonestByDesign → Faq, then Footer', () => {
  const order = ['className="skip"', '<GridFrame>', '<Nav', '<main id="main"', '<Hero', '<Problem', '<AttackCards', '<Statement', '<VideoPlate', '<FigurePlate', '<Features', '<HonestByDesign', '<Faq', '</main>', '<Footer', '</GridFrame>']
  const idx = order.map((s) => src.indexOf(s))
  expect(idx.every((i) => i > -1)).toBe(true)
  expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  for (const gone of ['Observability', 'MainnetCard', 'Faithfulness', 'QuickStart']) expect(src).not.toContain(gone)
})

test('rendered page: the skip link is the first focusable element and points at main#main; FAQ has 8 accordion triggers', () => {
  document.body.innerHTML = r(h(Home))
  const first = document.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')!
  expect(first.tagName).toBe('A'); expect(first.getAttribute('href')).toBe('#main'); expect(first.className).toBe('skip'); expect(first.textContent).toBe('Skip to content')
  expect(document.querySelector('main#main')).not.toBeNull()
  expect(document.querySelectorAll('main#main #faq-h ~ * button[aria-controls]').length + document.querySelectorAll('section[aria-labelledby="faq-h"] h3 button').length).toBeGreaterThanOrEqual(8)
  document.body.innerHTML = ''
})

test('rendered page: every id is unique and every aria-labelledby resolves to one', () => {
  document.body.innerHTML = r(h(Home))
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id)
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  for (const e of document.querySelectorAll('[aria-labelledby]'))
    for (const id of e.getAttribute('aria-labelledby')!.split(/\s+/)) expect(document.getElementById(id), id).not.toBeNull()
  document.body.innerHTML = ''
})

test('faq: Radix accordion, eight product questions, first open, every answer in FAQPage JSON-LD, no commands', () => {
  const m = r(h(Faq))
  expect(QA).toHaveLength(8)
  expect(m).toContain('<h2 id="faq-h"')
  const triggers = m.match(/<button[^>]*aria-expanded="(true|false)"/g) ?? []
  expect(triggers).toHaveLength(8)
  expect(triggers.filter(t => t.includes('"true"'))).toHaveLength(1)
  expect((m.match(/<h3/g) ?? []).length).toBe(8)
  const ld = JSON.parse(m.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1])
  expect(ld['@type']).toBe('FAQPage'); expect(ld.mainEntity).toHaveLength(8)
  const all = QA.flat().join(' ')
  expect(all).toContain('D 8, 0.7 s and prune thresholds in the thousands')
  expect(all).toContain(`T+${stats.sybilAt} s`); expect(all).toContain(`T+${stats.firstScorePruneAt} s`)
  expect(all).toContain(RECORDING_NOT_RUN); expect(all).toContain(MECHANISM); expect(all).toContain('MIT')
  expect(all).not.toMatch(/\$ |make |curl|git clone|npm |uv run|localhost|Devcon|Mumbai|OTLP|request/i)
  for (const f of FORBIDDEN) expect(all.replace(RECORDING_NOT_RUN, '')).not.toContain(f)   // the honest negation is allowed
})

test('faq: one answer open at a time; a trigger toggles its own answer', async () => {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const el = document.createElement('div'); document.body.append(el)
  const root = createRoot(el)
  act(() => root.render(h(Faq)))
  const btns = [...el.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
  expect(btns.map(b => b.getAttribute('aria-expanded'))).toEqual(['true', ...Array(7).fill('false')])
  act(() => btns[4].click())
  expect(btns[0].getAttribute('aria-expanded')).toBe('false'); expect(btns[4].getAttribute('aria-expanded')).toBe('true')
  expect(document.getElementById(btns[4].getAttribute('aria-controls')!)!.textContent).toContain('arrival at observer nodes')
  act(() => btns[4].click())
  expect(btns.every(b => b.getAttribute('aria-expanded') === 'false')).toBe(true)
  act(() => root.unmount()); el.remove()
})
