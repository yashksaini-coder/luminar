import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { REPO_URL } from '@/lib/copy'
import type { ReelManifest } from '@/lib/types'
import Nav from './Nav'

const route = vi.hoisted(() => ({ path: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.path }))

const reels: ReelManifest = JSON.parse(readFileSync(join(__dirname, '../../public/reels/manifest.json'), 'utf8'))
const cards = JSON.parse(readFileSync(join(__dirname, '../../lib/reel-cards.json'), 'utf8'))
test('nav markup: wordmark, four mono slash links (Simulator, Attacks, Recordings, GitHub), one boxed CTA, Menu button closed', () => {
  const m = r(h(Nav, { reels, cards })); const d = new DOMParser().parseFromString(m, 'text/html')
  expect(d.querySelector('header a[href="/"]')!.textContent).toBe('Luminar')
  const links = [...d.querySelectorAll('nav[aria-label="Primary"] a')]
  expect(links.map(a => [a.textContent, a.getAttribute('href')])).toEqual([['/Simulator', '/sim/'], ['/Attacks', '/#attacks'], ['/Recordings', '/reels/sybil-eclipse/'], ['/GitHub', `https://${REPO_URL}`]])
  for (const a of links) expect(a.firstElementChild!.getAttribute('aria-hidden')).toBe('true')   // the slash is decoration
  const cta = d.querySelector('header nav ~ div a[href="/sim/"]')!; expect(cta.textContent).toBe('Open the simulator')
  expect(m).toContain('aria-expanded="false"'); expect(m).toContain('aria-controls="site-menu"'); expect(m).not.toContain('role="dialog"')
  expect(m).not.toMatch(/Source|Devcon|Mumbai/)
})
test('menu opens with four reel rows (kbd, blurb, REAL tag, card) and three routes; locks scroll; Escape closes and restores focus', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(Nav, { reels, cards })))
  const btn = host.querySelector<HTMLButtonElement>('button[aria-controls="site-menu"]')!; btn.focus(); act(() => btn.click())
  const dlg = host.querySelector('[role="dialog"]')!; expect(dlg.getAttribute('aria-modal')).toBe('true'); expect(document.body.style.overflow).toBe('hidden')
  expect(dlg.querySelectorAll('a[href^="/reels/"]')).toHaveLength(4); expect(dlg.querySelectorAll('kbd')).toHaveLength(4); expect(dlg.textContent).toContain('REAL'); expect(dlg.textContent).toContain(reels[0].blurb)
  expect(dlg.querySelectorAll('canvas[data-dither]')).toHaveLength(4)
  expect(dlg.querySelector('a[href="/sim/"]')).toBeTruthy(); expect(dlg.querySelector('a[href="/figure/"]')).toBeTruthy(); expect(dlg.querySelector(`a[href="https://${REPO_URL}"]`)!.textContent).toContain('GitHub')
  expect(document.activeElement).toBe(dlg.querySelector('a'))                           // first link focused on open
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.style.overflow).toBe(''); expect(document.activeElement).toBe(btn)
  act(() => btn.click()); act(() => root.unmount()); expect(document.body.style.overflow).toBe('')   // unmount while open restores scroll
})
test.each([['/', 'Luminar'], ['/sim/', '>Simulator<'], ['/reels/sybil-eclipse/', '>Recordings<']])('aria-current="page" on exactly one element for %s', (path, text) => {
  route.path = path
  const m = r(h(Nav, { reels, cards }))
  expect(m.match(/aria-current="page"/g)).toHaveLength(1)
  const i = m.indexOf('aria-current="page"'); expect(m.slice(i, i + 160)).toContain(text)   // and it is the element carrying this text
  route.path = '/'
})
