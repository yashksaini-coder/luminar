import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { FIG3, REPO_URL } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import { reelHref } from '@/lib/reels'
import Footer, { STEPS } from './Footer'
import VideoPlate from './VideoPlate'

test('VideoPlate: native video, metadata preload, playsinline, controls, no autoplay/muted, clean poster overlay, Fig. 3 caption', () => {
  const m = r(h(VideoPlate)); expect(m).toContain('<video'); expect(m).toContain('src="/video/launch-16x9.mp4"'); expect(m).toContain('preload="metadata"'); expect(m).toMatch(/playsinline/i); expect(m).toContain('controls')
  expect(m).not.toMatch(/autoplay|muted/); expect(m).toContain('/video/poster.png'); expect(m).toContain('aria-label="Play the launch video"'); expect(m).toContain('Fig. 3'); expect(m).toContain(`<em>${FIG3}</em>`); expect(m).not.toContain('youtube')
})
test('Footer: closing headline + CTAs, the tree, how it works, stay connected, credit row; no event or date', () => {
  const m = r(h(Footer))
  expect(m).toMatch(/<h2 id="close-h"[^>]*>.*Watch a network.*defend itself/)
  expect(m).toMatch(/href="\/sim\/">.*Open the simulator/); expect(m).toContain(`href="${reelHref('sybil-eclipse')}"`)
  expect(m).toContain('data-preset="tree"'); expect(m).toContain(`${stats.avgHops} hops avg`)
  for (const s of ['How it works', 'Stay connected', ...STEPS.map(([s]) => s)]) expect(m).toContain(s)
  for (const href of ['/sim/', '/reels/sybil-eclipse/', '/figure/', `https://${REPO_URL}`, `https://${REPO_URL}/blob/master/LICENSE`]) expect(m).toContain(`href="${href}"`)
  expect(m).toContain('© 2026 Luminar'); expect(m).toContain('MIT licence'); expect(m).toContain('Data: ethPandaOps (CC BY 4.0)')
  expect(m).not.toMatch(/Devcon|Mumbai|Nov|Read the source|\$ |make |curl|clone/)
  expect(m).toContain('rel="noreferrer"')
})

test('404: grid frame, nav, a split field labelled as a partition, both routes and the v2 footer', async () => {
  const { default: NotFound } = await import('@/app/not-found')
  const m = r(h(NotFound))
  expect(m).toContain('Not found'); expect(m).toContain('data-preset="split"'); expect(m).toContain('role="img"')
  expect(m).toContain('href="/"'); expect(m).toContain('href="/sim/"'); expect(m).toContain('id="close-h"')
  expect(m.indexOf('class="skip"')).toBeLessThan(m.indexOf('<nav'))
})
