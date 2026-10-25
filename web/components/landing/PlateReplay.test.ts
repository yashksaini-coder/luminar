import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import type { DitherCanvasProps } from '@/components/dither/DitherCanvas'
import plate from '@/lib/plate-frames.json'
import { frameIndexAt, STILL_T, type PlateFrames } from './plate-draw'
import PlateReplay from './PlateReplay'

// jsdom has no canvas: the stub keeps the server markup (a data-dither canvas) and hands the test
// DitherCanvas's onFinal so it can "paint" (reveal) on demand.
let fire: ((img: ImageData) => void) | undefined
vi.mock('@/components/dither/DitherCanvas', () => ({ default: (p: DitherCanvasProps) => { fire = p.onFinal; return h('canvas', { 'data-dither': '1' }) } }))
type Cb = (entries: Partial<IntersectionObserverEntry>[]) => void
const ios: { cb: Cb; opts: IntersectionObserverInit; target?: Element }[] = []
class IO {
  constructor(public cb: Cb, public opts: IntersectionObserverInit) { ios.push(this) }
  observe(t: Element) { this.target = t } unobserve() {} disconnect() {} target?: Element
}
afterEach(() => { ios.length = 0; vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = '' })

test('PlateReplay server markup: canvas, halo ring, diamond, readout box and the first beat stamp; no shard, no halftone', () => {
  const p = plate as PlateFrames; const m = r(h(PlateReplay, { plate: p }))
  expect(m).toContain('data-dither="1"'); expect(m).toContain('data-depth="0.6"'); expect(m).toContain('data-depth="0.35"'); expect(m).toContain('data-depth="0.2"'); expect(m).toContain('data-depth="0.8"'); expect(m).toContain('data-depth="1.2"')
  expect(m).toContain('>PEERS<'); expect(m).toContain('>SYBIL<'); expect(m).toContain('>PRUNED<'); expect(m).toContain('>T+<')
  expect(m).toContain(p.frames[frameIndexAt(p, STILL_T)].stamp)     // SSR renders the reduced-motion still frame; the client advances
  expect(m).not.toMatch(/clip-path|halftone|polygon\(/)
  expect(m).toContain('tabindex="0"'); expect(m).toContain('role="group"'); expect(m).toContain('aria-label="Fifty peers')   // aria-label needs a role that allows it (axe aria-prohibited-attr)
})

test('off screen the frame clock stops; back in view it resumes', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers(); vi.stubGlobal('IntersectionObserver', IO); vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const p = plate as PlateFrames
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(PlateReplay, { plate: p })))
  const io = ios.find(i => i.target === host.firstElementChild)!; expect(io.opts.threshold).toBe(0)
  const tPlus = () => host.querySelector('dl')!.querySelectorAll('dd')[3].textContent
  act(() => io.cb([{ isIntersecting: false }]))
  act(() => fire!({} as ImageData))                                    // the plate has painted: the clock may run
  const t0 = tPlus(); expect(t0).toBe(`${p.frames[0].t.toFixed(1)}s`)
  act(() => { vi.advanceTimersByTime(1000) }); act(() => fire!({} as ImageData))
  expect(tPlus()).toBe(t0)                                             // paused off screen: no frame advanced
  act(() => io.cb([{ isIntersecting: true }]))
  act(() => { vi.advanceTimersByTime(1000) }); act(() => fire!({} as ImageData))
  expect(tPlus()).not.toBe(t0)                                         // in view: the clock advanced
  act(() => root.unmount())
})
