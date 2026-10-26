import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { ARRIVAL, PROVENANCE } from '@/lib/copy'
import MainnetCard, { ARR, FIRST_MS, LAST_MS, LOOP_MS, OBSERVERS, landPath, litCount, msAt } from './MainnetCard'

vi.mock('@/lib/api/client', () => ({ getStatic: vi.fn(async () => JSON.parse(readFileSync(join(__dirname, '../../public/geo/land-110m.json'), 'utf8'))) }))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = '' })
const lit = (root: ParentNode) => root.querySelectorAll('[data-dot][data-lit]').length

test('honest copy, the recorded slot range, 138 observers and the reel link; no LIVE claim', () => {
  const m = r(h(MainnetCard)); const d = new DOMParser().parseFromString(m, 'text/html')
  expect(m).toMatch(/^<section[^>]*data-reveal=""/)
  expect(d.querySelector('h2#mainnet-h')).not.toBeNull()
  const t = d.body.textContent!
  for (const s of [ARRIVAL, PROVENANCE, '15466393–15466400', `${FIRST_MS} ms`]) expect(t).toContain(s)
  expect(OBSERVERS).toBe(138)
  expect(d.querySelector('a.chev')?.getAttribute('href')).toBe('/reels/mainnet-block-wave/')
  expect(t).not.toMatch(/\bLIVE\b/)
})

test('the data: 138 observers at sorted sites; the server frame shows every site lit', () => {
  expect(ARR.reduce((s, a) => s + a[3], 0)).toBe(138)
  expect(ARR.map(a => a[2])).toEqual([...ARR.map(a => a[2])].sort((a, b) => a - b))
  const d = new DOMParser().parseFromString(r(h(MainnetCard)), 'text/html')
  expect(lit(d)).toBe(ARR.length)
  expect(d.querySelector('[aria-hidden="true"] b')?.textContent).toBe(String(LAST_MS))
})

test('story clock: empty lead in, first site at FIRST_MS, all lit before the reset, empty again', () => {
  expect(msAt(0)).toBe(-1); expect(litCount(-1)).toBe(0)
  expect(msAt(700)).toBe(FIRST_MS); expect(litCount(FIRST_MS)).toBe(2)
  expect(msAt(LOOP_MS - 700)).toBe(LAST_MS); expect(litCount(LAST_MS)).toBe(ARR.length)
  expect(msAt(LOOP_MS - 100)).toBe(-1); expect(msAt(LOOP_MS + 1)).toBe(-1)
})

test('landPath crops Antarctica and draws closed rings', () => {
  const fc = { features: [{ geometry: { coordinates: [[[-60, -80], [-61, -81], [-62, -80]]] } }, { geometry: { coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }] }
  expect(landPath(fc)).toBe('M0.0,0.0L10.0,0.0L10.0,-10.0L0.0,0.0Z')
})

type IOCb = (e: { isIntersecting: boolean }[]) => void
function mount(reduce: boolean) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] })
  vi.stubGlobal('matchMedia', () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} }))
  const cbs: IOCb[] = []
  vi.stubGlobal('IntersectionObserver', class { constructor(cb: IOCb) { cbs.push(cb) } observe() {} disconnect() {} unobserve() {} })
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(MainnetCard)))
  return { host, root, show: (on: boolean) => act(() => cbs.forEach(cb => cb([{ isIntersecting: on }]))) }
}

test('in view the sites light in arrival order; off screen the story pauses', () => {
  const { host, root, show } = mount(false)
  expect(lit(host)).toBe(0)                       // starts empty
  show(true)
  act(() => { vi.advanceTimersByTime(1000) }); const a = lit(host); expect(a).toBeGreaterThan(0); expect(a).toBeLessThan(ARR.length)
  show(false)
  act(() => { vi.advanceTimersByTime(3000) }); expect(lit(host)).toBe(a)
  show(true)
  act(() => { vi.advanceTimersByTime(3000) }); expect(lit(host)).toBeGreaterThan(a)
  act(() => root.unmount())
})

test('reduced motion: the final frame stays, nothing is rewritten', () => {
  const { host, root, show } = mount(true)
  show(true); act(() => { vi.advanceTimersByTime(4000) })
  expect(lit(host)).toBe(ARR.length)
  act(() => root.unmount())
})
