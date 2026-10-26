import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import Faq, { QA } from '@/components/landing/Faq'
import FinalCta from '@/components/landing/FinalCta'
import Tagline from '@/components/landing/Tagline'
import { MECHANISM, RECORDING_NOT_RUN } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import Home from './page'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

const src = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')
const text = (m: string) => m.replace(/<[^>]+>/g, '')

// Spec §4.8: `/?reel=<n>` redirects, so the phase-4 island must stay the first child of the landing page.
// Until phase 4 merges, a marker comment holds its slot; after the merge `<ReelRedirect />` replaces it.
test('redirect island slot is the first child, before <Nav>', () => {
  const island = src.search(/<ReelRedirect \/>|\{\/\* ReelRedirect slot/)
  expect(island).toBeGreaterThan(-1)
  expect(island).toBeLessThan(src.indexOf('<Nav'))
  expect(src.slice(src.indexOf('<>') + 2, island).trim()).toBe('')
})

test('page order: skip link, Nav, main#main with Hero → Readouts → Tagline → WhatItDoes → HowItWorks → AttackExplorer → Fig. 2 → Fig. 3 → SameNames → LiveMainnet → Faq → FinalCta, then Footer', () => {
  const order = ['className="skip"', '<Nav', '<main id="main"', '<Hero', '<Readouts', '<Tagline', '<WhatItDoes', '<HowItWorks', '<AttackExplorer', '<FigurePlate', '<VideoPlate', '<SameNames', '<LiveMainnet', '<Faq', '<FinalCta', '</main>', '<Footer']
  const idx = order.map((s) => src.indexOf(s))
  expect(idx.every((i) => i > -1)).toBe(true)
  expect([...idx].sort((a, b) => a - b)).toEqual(idx)
})

test('rendered page: the skip link is the first focusable element and points at main#main; FAQ has 8 dt', () => {
  document.body.innerHTML = r(h(Home))
  const first = document.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')!
  expect(first.tagName).toBe('A'); expect(first.getAttribute('href')).toBe('#main'); expect(first.className).toBe('skip'); expect(first.textContent).toBe('Skip to content')
  expect(document.querySelector('main#main')).not.toBeNull()
  expect(document.querySelectorAll('main#main dl dt').length).toBeGreaterThanOrEqual(8)
  document.body.innerHTML = ''
})

test('tagline: data-reveal section, words carry data-w with a continuous --i, raw text is the two honesty lines', () => {
  const m = r(h(Tagline))
  expect(m).toMatch(/<section data-reveal/)
  expect(text(m)).toBe(MECHANISM + RECORDING_NOT_RUN)   // the capital R is CSS (::first-letter), so the grep still finds the constant
  const n = (MECHANISM + ' ' + RECORDING_NOT_RUN).split(' ').length
  expect((m.match(/data-w/g) ?? []).length).toBe(n)
  for (let i = 0; i < n; i++) expect(m).toContain(`--i:${i}`)
  expect(m).toContain('<br/>')
})

test('faq: h2 Questions, eight pairs with `up` reveal, mainnet comparison and recording timestamps', () => {
  const m = r(h(Faq))
  expect(QA).toHaveLength(8)
  expect(m).toContain('<h2 id="faq-h"'); expect(m).toContain('Questions')
  expect((m.match(/<dt>/g) ?? []).length).toBe(8); expect((m.match(/<dd>/g) ?? []).length).toBe(8)
  expect((m.match(/data-k="up"/g) ?? []).length).toBe(9)
  expect(m).toContain('D 8, 0.7 s and prune thresholds in the thousands')
  expect(m).toContain(`T+${stats.sybilAt} s`); expect(m).toContain(`T+${stats.firstScorePruneAt} s`)
  expect(m).toContain(RECORDING_NOT_RUN)
})

test('final cta: one line, primary button to /sim/ (pop) and the recording chevron (up), data-k on wrappers only', () => {
  const m = r(h(FinalCta))
  expect(m).toContain('Fifty peers, five Sybils, two heartbeats.')
  expect(m).toMatch(/<div data-k="pop"[^>]*><a class="btn btn-primary[^"]*" href="\/sim\/">Open the simulator<\/a>/)
  expect(m).toMatch(/<div data-k="up"[^>]*><a class="chev" href="\/reels\/sybil-eclipse\/">Watch a recording/)
  expect(m).not.toMatch(/class="(btn|chev)[^"]*"[^>]*data-k/)
})
