import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { ARRIVAL, SAME_NAMES } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import Features, { ARRIVALS, BEATS, CARDS, NAMES, SLOT, TICKER, track } from './Features'

const doc = () => new DOMParser().parseFromString(r(h(Features)), 'text/html')
const TIMERS: Parameters<typeof vi.useFakeTimers>[0] = { toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = '' })

test('server markup: a labelled reveal section, h2, six cards each its own reveal, rising as `card` staggered by column, each with kicker, h3, visual and caption', () => {
  const d = doc(), sec = d.querySelector('section')!
  expect(sec.getAttribute('aria-labelledby')).toBe('features-h'); expect(d.querySelector('header')!.hasAttribute('data-reveal')).toBe(true)
  expect(d.querySelector('h2#features-h')!.textContent).toBe('A GossipSub v1.1 network you can run on a laptop')
  const cards = [...d.querySelectorAll('li[data-reveal] > article[data-k="card"]')]   // each card its own reveal: the grid is too tall for one
  expect(cards).toHaveLength(6); expect(cards.map(c => c.getAttribute('style'))).toEqual(['--i:0', '--i:1', '--i:2', '--i:0', '--i:1', '--i:2'])
  expect(cards.map(c => c.querySelector('h3')!.textContent)).toEqual(['Peer scoring that bites', 'Attacks you inject live', 'Reproducible recordings', 'Real block arrivals', 'Same metric names', 'Built for the stage'])
  for (const c of cards) { expect(c.querySelector('figure.plate [aria-hidden="true"]')).not.toBeNull(); expect(c.querySelector('figcaption.sr-only')!.textContent!.length).toBeGreaterThan(20) }
})

test('links: cards 1–2 open the simulator, 3 the Sybil reel, 4 the mainnet reel, 6 the stage view; each a 44 px .chev; card 5 has none', () => {
  const hrefs = [...doc().querySelectorAll('article[data-k="card"]')].map(c => c.querySelector('a.chev')?.getAttribute('href') ?? null)
  expect(hrefs).toEqual(['/sim/', '/sim/', '/reels/sybil-eclipse/', '/reels/mainnet-block-wave/', null, '/reels/sybil-eclipse/?theme=stage&hero=1'])
})

test('numbers come from reel-stats and the manifest; honesty lines are the copy constants', () => {
  const m = r(h(Features))
  for (const [t] of BEATS) expect(m).toContain(`>${t}<`)
  expect(BEATS.map(([t]) => t)).toEqual([10.2, 11.9, 16.2, 24.1])
  expect(m).toContain(`/ ${stats.simDurationS} s`); expect(m).toContain(`${stats.healedInS} s in the recording`); expect(m).toContain(`${stats.heartbeatsToPrune} heartbeats after the graft`)
  expect(TICKER.map(([v]) => v)).toEqual([stats.deliveryPct, stats.avgHops, stats.avgPropagationMs]); expect(m).toContain('>4.2<')
  expect(m).toContain(ARRIVAL); expect(m).toContain(SAME_NAMES); expect(m).toContain(`recorded slot ${SLOT}`); expect(m).toContain('138 observers')
  for (const n of NAMES) expect(m).toContain(n)
  expect(m).toContain('PRUNE −10'); expect(m).toContain('GRAFT −5')
  expect(CARDS.map(c => c.body).join(' ')).not.toMatch(/\w-\w/)   // no hyphens in new body copy
})

test('ARRIVALS are real: each (country, seen_ms) is a BlockSeen of slot 15466393 in the mainnet reel, in arrival order, first to last', () => {
  const seen = readFileSync(resolve(__dirname, '../../public/reels/mainnet-block-wave.jsonl'), 'utf8').split('\n').filter(Boolean)
    .map(l => JSON.parse(l).frame).filter(f => f.event_type === 'BlockSeen' && f.slot === SLOT).map(f => `${f.country} ${f.seen_ms}`)
  for (const [cc, ms] of ARRIVALS) expect(seen).toContain(`${cc} ${ms}`)
  const ms = ARRIVALS.map(([, v]) => v), all = seen.map(s => +s.split(' ')[1])
  expect([...ms].sort((a, b) => a - b)).toEqual(ms); expect(ms[0]).toBe(Math.min(...all)); expect(ms.at(-1)).toBe(Math.max(...all))
})

function mount(reduce: boolean) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers(TIMERS); vi.stubGlobal('matchMedia', () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} }))
  const ios: { cb: IntersectionObserverCallback; el?: Element }[] = []
  vi.stubGlobal('IntersectionObserver', class { o: { cb: IntersectionObserverCallback; el?: Element }; constructor(cb: IntersectionObserverCallback) { this.o = { cb }; ios.push(this.o) } observe(el: Element) { this.o.el = el } disconnect() {} unobserve() {} })
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(Features)))
  const see = (on: boolean) => act(() => { for (const o of ios) o.cb([{ isIntersecting: on, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver) })
  const time = () => host.querySelector('[data-a="time"]')!.textContent
  return { host, root, see, time }
}

test('at rest every visual shows its finished frame; the story runs only while on screen', () => {
  const { root, see, time, host } = mount(false)
  const done = String(stats.simDurationS)
  expect(time()).toBe(done)                                        // rest: the finished frame on mount
  act(() => { vi.advanceTimersByTime(4000) }); expect(time()).toBe(done)    // not visible: no clock
  see(true); for (let k = 0; k < 240; k++) act(() => { vi.advanceTimersByTime(16) })
  const mid = time(); expect(+mid!).toBeLessThan(stats.simDurationS)        // playing: mid story
  expect(host.querySelector<HTMLElement>('[data-a="cmd"]')!.textContent!.length).toBeLessThan(28)
  see(false); act(() => { vi.advanceTimersByTime(3000) }); expect(time()).toBe(done)   // off screen: back to finished
  act(() => root.unmount())
})

test('reduced motion: every visual draws its still frame (pruned, all beats passed, all observers lit, final ticker) and never moves', () => {
  const { root, see, time, host } = mount(true)
  see(true); act(() => { vi.advanceTimersByTime(2000) })
  expect(time()).toBe(String(stats.simDurationS))
  expect(host.querySelector<HTMLElement>('[data-a="stamp"]')!.style.opacity).toBe('1')
  expect([...host.querySelectorAll<HTMLElement>('[data-a="lit"]')].every(e => e.style.opacity === '1')).toBe(true)
  expect([...host.querySelectorAll('[data-a="val"]')].map(e => e.textContent)).toEqual(['100', '4.2', '100'])
  act(() => root.unmount())
})

test('track holds its ends and passes through its keys', () => {
  const k: [number, number][] = [[1, 0], [2, 10], [3, 4]]
  expect(track(k, 0)).toBe(0); expect(track(k, 2)).toBe(10); expect(track(k, 9)).toBe(4); expect(track(k, 1.5)).toBe(5)
})
