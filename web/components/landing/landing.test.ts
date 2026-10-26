import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { FIG3, REPO_URL } from '@/lib/copy'
import Footer from './Footer'
import VideoPlate from './VideoPlate'

test('VideoPlate: native video, metadata preload, playsinline, controls, no autoplay/muted, clean poster overlay, Fig. 3 caption', () => {
  const m = r(h(VideoPlate)); expect(m).toContain('<video'); expect(m).toContain('src="/video/launch-16x9.mp4"'); expect(m).toContain('preload="metadata"'); expect(m).toMatch(/playsinline/i); expect(m).toContain('controls')
  expect(m).not.toMatch(/autoplay|muted/); expect(m).toContain('/video/poster.png'); expect(m).toContain('aria-label="Play the launch video"'); expect(m).toContain('Fig. 3'); expect(m).toContain(`<em>${FIG3}</em>`); expect(m).not.toContain('youtube')
})
test('Footer: three columns, event line, routes, source, licence and credit', () => {
  const m = r(h(Footer)); expect(m).toContain('LUMINAR'); expect(m).not.toMatch(/Devcon|Mumbai/); for (const href of ['/', '/sim/', '/reels/sybil-eclipse/', '/figure/', `https://${REPO_URL}`]) expect(m).toContain(`href="${href}"`)
  expect(m).toContain('MIT'); expect(m).toContain('ethPandaOps (CC BY 4.0)')
})
