import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { REPO_URL } from '@/lib/copy'
import Footer from './Footer'

test('Footer: three columns, event line, routes, source, licence and credit', () => {
  const m = r(h(Footer)); expect(m).toContain('LUMINAR'); expect(m).not.toMatch(/Devcon|Mumbai/); for (const href of ['/', '/sim/', '/reels/sybil-eclipse/', '/figure/', `https://${REPO_URL}`]) expect(m).toContain(`href="${href}"`)
  expect(m).toContain('MIT'); expect(m).toContain('ethPandaOps (CC BY 4.0)')
})
