import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { REPO_URL } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import { reelHref } from '@/lib/reels'
import Footer, { STEPS } from './Footer'

test('Footer: closing headline + CTAs, the tree, how it works, stay connected, credit row; no event or date', () => {
  const m = r(h(Footer))
  expect(m).toMatch(/<h2 id="close-h"[^>]*>.*Watch a network.*defend itself/)
  expect(m).toMatch(/href="\/sim\/">.*Open the simulator/); expect(m).toContain(`href="${reelHref('sybil-eclipse')}"`)
  expect(m).toContain('data-preset="tree"'); expect(m).toContain(`${stats.avgHops} hops avg`)
  for (const s of ['How it works', 'Stay connected', ...STEPS.map(([s]) => s)]) expect(m).toContain(s)
  for (const href of ['/sim/', '/reels/sybil-eclipse/', '/figure/', `https://${REPO_URL}`, `https://${REPO_URL}/blob/master/LICENSE`, 'https://www.linkedin.com/in/yashksaini', 'https://x.com/0xcrackedDev', 'https://yashksaini.vercel.app/']) expect(m).toContain(`href="${href}"`)
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
