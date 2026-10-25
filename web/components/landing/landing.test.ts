import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { ECLIPSE_WHY, FIG1, MECHANISM, RECORDING_NOT_RUN } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import Hero from './Hero'
import Readouts from './Readouts'
import { WhatItDoes } from './Sections'

test('hero: two-line poster with italic second line, lead ends with the mechanism sentence, two CTAs, Fig. 1', () => {
  const m = r(h(Hero)); expect(m).toMatch(/<h1[^>]*>Gossip,<br\/?><em>scored\.<\/em><\/h1>/)
  expect(m).toContain(`${MECHANISM}</p>`); expect(m).toContain('href="/sim/"'); expect(m).toContain('Open the simulator'); expect(m).toContain('href="/reels/sybil-eclipse/"'); expect(m).toContain('Watch a recording')
  expect(m).toContain('Fig. 1'); expect(m).toContain(`<em>${FIG1}</em>`); expect(m).not.toContain('var(--flame)" class="btn')   // flame never a CTA
})
test('readouts come from reel-stats.json and the last sub-caption is the honesty line', () => {
  const m = r(h(Readouts))
  expect(m).toContain(`>${stats.peers}<`); expect(m).toContain(`>${stats.sybils}<`); expect(m).toContain(`>${stats.heartbeatsToPrune}<`); expect(m).toContain(`>${stats.deliveryPct}%<`)
  expect(m).toContain(`T+${stats.sybilAt}s`); expect(m).toContain(RECORDING_NOT_RUN); expect((m.match(/<dd/g) ?? []).length).toBe(4)
})
test('What it does: h2, three paragraphs, chevron link; eclipse sentence from copy.ts', () => {
  const m = r(h(WhatItDoes)); expect(m).toContain('<h2'); expect((m.match(/<p/g) ?? []).length).toBe(3); expect(m).toContain(ECLIPSE_WHY); expect(m).toContain('href="/sim/"')
})
