import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { EVENT_LINE, FIG1, FIG3, MECHANISM, RECORDING_NOT_RUN, REPO_URL } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import Hero from './Hero'
import Readouts from './Readouts'
import Footer from './Footer'
import VideoPlate from './VideoPlate'

test('hero: two-line poster with italic second line, lead ends with the mechanism sentence, two CTAs, Fig. 1', () => {
  const m = r(h(Hero)); expect(m).toMatch(/<h1[^>]*><span[^>]*>Gossip,<\/span><br\/?><span[^>]*><em>scored\.<\/em><\/span><\/h1>/)
  expect(m).toContain(`${MECHANISM}</p>`); expect(m).toContain('href="/sim/"'); expect(m).toContain('Open the simulator'); expect(m).toContain('href="/reels/sybil-eclipse/"'); expect(m).toContain('Watch a recording')
  expect(m).toContain('Fig. 1'); expect(m).toContain(`<em>${FIG1}</em>`); expect(m).not.toContain('var(--flame)" class="btn')   // flame never a CTA
})
test('readouts come from reel-stats.json and the last sub-caption is the honesty line', () => {
  const m = r(h(Readouts))
  expect(m).toContain(`>${stats.peers}<`); expect(m).toContain(`>${stats.sybils}<`); expect(m).toContain(`>${stats.heartbeatsToPrune}<`); expect(m).toContain(`>${stats.deliveryPct}%<`)
  expect(m).toContain(`T+${stats.sybilAt}s`); expect(m).toContain(RECORDING_NOT_RUN); expect((m.match(/<dd/g) ?? []).length).toBe(4)
})
test('VideoPlate: native video, metadata preload, playsinline, controls, no autoplay/muted, clean poster overlay, Fig. 3 caption', () => {
  const m = r(h(VideoPlate)); expect(m).toContain('<video'); expect(m).toContain('src="/video/launch-16x9.mp4"'); expect(m).toContain('preload="metadata"'); expect(m).toMatch(/playsinline/i); expect(m).toContain('controls')
  expect(m).not.toMatch(/autoplay|muted/); expect(m).toContain('/video/poster.png'); expect(m).toContain('aria-label="Play the launch video"'); expect(m).toContain('Fig. 3'); expect(m).toContain(`<em>${FIG3}</em>`); expect(m).not.toContain('youtube')
})
test('Footer: three columns, event line, routes, source, licence and credit', () => {
  const m = r(h(Footer)); expect(m).toContain('LUMINAR'); expect(m).toContain(`<em>${EVENT_LINE}</em>`); for (const href of ['/', '/sim/', '/reels/sybil-eclipse/', '/figure/', `https://${REPO_URL}`]) expect(m).toContain(`href="${href}"`)
  expect(m).toContain('MIT'); expect(m).toContain('ethPandaOps (CC BY 4.0)')
})
