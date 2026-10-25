import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { ARRIVAL, ECLIPSE_WHY, EVENT_LINE, FIG1, FIG3, MECHANISM, PROVENANCE, RECORDING_NOT_RUN, REPO_URL, SAME_NAMES } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import Hero from './Hero'
import Readouts from './Readouts'
import Footer from './Footer'
import { LiveMainnet, SameNames, WhatItDoes } from './Sections'
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
test('What it does: h2, three paragraphs, chevron link; eclipse sentence from copy.ts', () => {
  const m = r(h(WhatItDoes)); expect(m).toContain('<h2'); expect((m.match(/<p/g) ?? []).length).toBe(3); expect(m).toContain(ECLIPSE_WHY); expect(m).toContain('href="/sim/"')
})
test('VideoPlate: native video, metadata preload, playsinline, controls, no autoplay/muted, dithered poster overlay, Fig. 3 caption', () => {
  const m = r(h(VideoPlate)); expect(m).toContain('<video'); expect(m).toContain('src="/video/launch-16x9.mp4"'); expect(m).toContain('preload="metadata"'); expect(m).toMatch(/playsinline/i); expect(m).toContain('controls')
  expect(m).not.toMatch(/autoplay|muted/); expect(m).toContain('/video/poster.png'); expect(m).toContain('aria-label="Play the launch video"'); expect(m).toContain('Fig. 3'); expect(m).toContain(`<em>${FIG3}</em>`); expect(m).not.toContain('youtube')
})
test('Same names: two dithered stills at depths .6/.9, the seven gossipsub_* series, Lighthouse wording', () => {
  const m = r(h(SameNames)); expect(m).toContain('/stills/grafana.png'); expect(m).toContain('/stills/jaeger.png'); expect(m).toContain('data-depth="0.6"'); expect(m).toContain('data-depth="0.9"'); expect(m).toContain(SAME_NAMES); expect(m).not.toContain('every client')
  for (const s of ['gossipsub_mesh_peer_counts', 'gossipsub_mesh_peer_churn_events', 'gossipsub_mesh_peer_inclusion_events', 'gossipsub_score_per_mesh', 'gossipsub_topic_iwant_msgs', 'gossipsub_topic_msg_published', 'gossipsub_topic_msg_recv_counts']) expect(m).toContain(s)
})
test('Live mainnet: arrival sentence, reel link, provenance credit verbatim', () => {
  const m = r(h(LiveMainnet)); expect(m).toContain(ARRIVAL); expect(m).toContain('href="/reels/mainnet-block-wave/"'); expect(m).toContain(PROVENANCE)
})
test('Footer: three columns, event line, routes, source, licence and credit', () => {
  const m = r(h(Footer)); expect(m).toContain('LUMINAR'); expect(m).toContain(`<em>${EVENT_LINE}</em>`); for (const href of ['/', '/sim/', '/reels/sybil-eclipse/', '/figure/', `https://${REPO_URL}`]) expect(m).toContain(`href="${href}"`)
  expect(m).toContain('MIT'); expect(m).toContain('ethPandaOps (CC BY 4.0)')
})
