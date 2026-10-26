import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { ARRIVAL } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import Features, { ARR, BEATS, CARDS, FIRST_MS, LAST_MS, MAP_LOOP, OBSERVERS, SLOT, TICKER, landPath, litCount, msAt, track } from './Features'

vi.mock('@/lib/api/client', () => ({ getStatic: vi.fn(async () => JSON.parse(readFileSync(resolve(__dirname, '../../public/geo/land-110m.json'), 'utf8'))) }))

const doc = () => new DOMParser().parseFromString(r(h(Features)), 'text/html')
const TIMERS: Parameters<typeof vi.useFakeTimers>[0] = { toFake: ['setTimeout', 'clearTimeout', 'performance'] }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = '' })

test('server markup: a labelled section in two grid rows, five cells each its own reveal, rising as `card` staggered by column, each with numbered kicker, h3, visual and caption', () => {
  const d = doc(), sec = d.querySelector('section#features')!
  expect(sec.getAttribute('aria-labelledby')).toBe('features-h'); expect(sec.querySelectorAll(':scope > [data-grid]')).toHaveLength(2)
  expect(d.querySelector('h2#features-h')!.textContent).toBe('A GossipSub v1.1 network you can run on a laptop')
  const cards = [...d.querySelectorAll('li[data-reveal] > article[data-k="card"]')]   // each card its own reveal: the grid is too tall for one
  expect(cards).toHaveLength(5); expect(cards.map(c => c.getAttribute('style'))).toEqual(['--i:0', '--i:1', '--i:2', '--i:0', '--i:1'])
  expect(cards.map(c => c.querySelector('h3')!.textContent)).toEqual(['Peer scoring that bites', 'Attacks you inject live', 'Reproducible recordings', 'Real block arrivals, on a map', 'Built for the stage'])
  expect(cards.map(c => c.querySelector('p')!.textContent!.slice(0, 2))).toEqual(['01', '02', '03', '04', '05'])
  for (const c of cards) { expect(c.querySelector('figure.plate [aria-hidden="true"]')).not.toBeNull(); expect(c.querySelector('figcaption.sr-only')!.textContent!.length).toBeGreaterThan(20) }
  expect(d.querySelectorAll('li[class]')).toHaveLength(1)   // only the map cell is wide
})

test('links: cells 1–2 open the simulator, 3 the Sybil reel, 4 the mainnet reel, 5 the stage view', () => {
  const hrefs = [...doc().querySelectorAll('article[data-k="card"]')].map(c => c.querySelector('a')?.getAttribute('href') ?? null)
  expect(hrefs).toEqual(['/sim/', '/sim/', '/reels/sybil-eclipse/', '/reels/mainnet-block-wave/', '/reels/sybil-eclipse/?theme=stage&hero=1'])
})

test('no commands or code anywhere: no terminal, curl, metrics endpoint, query strings or file names in the text', () => {
  const t = doc().body.textContent!
  expect(t).not.toMatch(/\$ |curl|localhost|\/metrics|gossipsub_|\?theme|JSONL|make |git /)
})

test('numbers come from reel-stats and the manifest; honesty lines are the copy constants', () => {
  const m = r(h(Features))
  for (const [t] of BEATS) expect(m).toContain(`>${t}<`)
  expect(BEATS.map(([t]) => t)).toEqual([10.2, 11.9, 16.2, 24.1])
  expect(m).toContain(`/ ${stats.simDurationS} s`); expect(m).toContain(`${stats.healedInS} s in the recording`); expect(m).toContain(`${stats.heartbeatsToPrune} heartbeats after the graft`)
  expect(TICKER.map(([v]) => v)).toEqual([stats.deliveryPct, stats.avgHops, stats.avgPropagationMs]); expect(m).toContain('>4.2<')
  expect(m).toContain(ARRIVAL); expect(m).toContain(`slot ${SLOT}`); expect(OBSERVERS).toBe(138); expect(m).toContain('138</b> / 138 observers')
  expect(m).toContain('PRUNE −10'); expect(m).toContain('GRAFT −5')
  expect(m).not.toMatch(/\bLIVE\b/)
  expect(CARDS.map(c => c.body).join(' ')).not.toMatch(/\w-\w/)   // no hyphens in body copy
})

test('ARR is real: every site groups BlockSeen observers of slot 15466393 in the mainnet reel, 138 in all, sorted, first to last arrival', () => {
  const seen = readFileSync(resolve(__dirname, '../../public/reels/mainnet-block-wave.jsonl'), 'utf8').split('\n').filter(Boolean)
    .map(l => JSON.parse(l).frame).filter(f => f.event_type === 'BlockSeen' && f.slot === SLOT).map(f => +f.seen_ms)
  expect(ARR.reduce((n, a) => n + a[3], 0)).toBe(138)
  const ms = ARR.map(a => a[2]); expect([...ms].sort((a, b) => a - b)).toEqual(ms)
  for (const v of ms) expect(seen).toContain(v)
  expect(FIRST_MS).toBe(Math.min(...seen)); expect(LAST_MS).toBe(Math.max(...seen))
})

test('map clock: empty lead in, first site at FIRST_MS, all lit before the reset, empty again; landPath crops Antarctica', () => {
  expect(msAt(0)).toBe(-1); expect(litCount(-1)).toBe(0)
  expect(msAt(0.7)).toBe(FIRST_MS); expect(litCount(FIRST_MS)).toBe(2)
  expect(msAt(MAP_LOOP - 0.7)).toBe(LAST_MS); expect(litCount(LAST_MS)).toBe(ARR.length)
  expect(msAt(MAP_LOOP - 0.1)).toBe(-1)
  const fc = { features: [{ geometry: { coordinates: [[[-60, -80], [-61, -81], [-62, -80]]] } }, { geometry: { coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }] }
  expect(landPath(fc)).toBe('M0.0,0.0L10.0,0.0L10.0,-10.0L0.0,0.0Z')
})

function mount(reduce: boolean) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers(TIMERS); vi.stubGlobal('matchMedia', () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} }))
  const ios: { cb: IntersectionObserverCallback; el?: Element }[] = []
  vi.stubGlobal('IntersectionObserver', class { o: { cb: IntersectionObserverCallback; el?: Element }; constructor(cb: IntersectionObserverCallback) { this.o = { cb }; ios.push(this.o) } observe(el: Element) { this.o.el = el } disconnect() {} unobserve() {} })
  // frames are stepped by hand, 100 ms each (the stories cap a frame at 100 ms): a few dozen draws per
  // test instead of the 16 ms fake-rAF cadence, whose hundreds of draws timed out on a loaded machine
  let now = 0, id = 0; const q = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { q.set(++id, cb); return id })
  vi.stubGlobal('cancelAnimationFrame', (i: number) => { q.delete(i) })
  const frames = (n: number) => act(() => { for (let k = 0; k < n; k++) { now += 100; const cbs = [...q.values()]; q.clear(); cbs.forEach(cb => cb(now)) } })
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(Features)))
  const see = (on: boolean) => act(() => { for (const o of ios) o.cb([{ isIntersecting: on, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver) })
  const time = () => host.querySelector('[data-a="time"]')!.textContent
  return { host, root, see, time, frames }
}

const lit = (root: ParentNode) => root.querySelectorAll('[data-dot][data-lit]').length

test('at rest every visual shows its finished frame; the story runs only while on screen', () => {
  const { root, see, time, host, frames } = mount(false)
  const done = String(stats.simDurationS)
  expect(time()).toBe(done); expect(lit(host)).toBe(ARR.length)             // rest: the finished frame on mount
  frames(40); expect(time()).toBe(done)                                     // not visible: no clock
  see(true); frames(30)
  expect(+time()!).toBeLessThan(stats.simDurationS)                         // playing: mid story
  expect(lit(host)).toBeLessThan(ARR.length)                                // the map replays its arrivals
  see(false); frames(30); expect(time()).toBe(done); expect(lit(host)).toBe(ARR.length)   // off screen: finished again
  act(() => root.unmount())
})

test('reduced motion: every visual draws its still frame (pruned, all beats passed, every site lit, final ticker) and never moves', () => {
  const { root, see, time, host, frames } = mount(true)
  see(true); frames(20)
  expect(time()).toBe(String(stats.simDurationS))
  expect(host.querySelector<HTMLElement>('[data-a="stamp"]')!.style.opacity).toBe('1')
  expect(lit(host)).toBe(ARR.length); expect(host.querySelector('[data-a="ms"]')!.textContent).toBe(String(LAST_MS))
  expect([...host.querySelectorAll('[data-a="val"]')].map(e => e.textContent)).toEqual(['100', '4.2', '100'])
  act(() => root.unmount())
})

test('track holds its ends and passes through its keys', () => {
  const k: [number, number][] = [[1, 0], [2, 10], [3, 4]]
  expect(track(k, 0)).toBe(0); expect(track(k, 2)).toBe(10); expect(track(k, 9)).toBe(4); expect(track(k, 1.5)).toBe(5)
})
