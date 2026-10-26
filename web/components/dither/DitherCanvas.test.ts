import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import DitherCanvas from '@/components/dither/DitherCanvas'
import DitherImage from '@/components/dither/DitherImage'
import Loupe from '@/components/dither/Loupe'
import { REVEAL_STEP_MS } from '@/components/dither/dither'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = '' })

test('DitherCanvas markup: pixelated canvas with label, depth and the dither marker', () => {
  const m = r(h(DitherCanvas, { source: () => {}, 'aria-label': 'fifty peers', depth: 0.6 }))
  expect(m).toContain('<canvas'); expect(m).toContain('data-dither="1"'); expect(m).toContain('aria-label="fifty peers"'); expect(m).toContain('role="img"'); expect(m).toContain('data-depth="0.6"')
})
test('mounting without IntersectionObserver or canvas 2D does not throw and schedules nothing', () => {
  // jsdom: no IntersectionObserver, getContext() → null, clientWidth 0 → drawDither returns null
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  expect(() => act(() => root.render(h(DitherCanvas, { source: () => {}, reveal: true })))).not.toThrow()
  expect(host.querySelector('canvas[data-dither]')).toBeTruthy(); expect(() => act(() => root.unmount())).not.toThrow()
})
test('Loupe renders nothing on the server and on coarse pointers', () => {
  expect(r(h(Loupe, { plateRef: { current: null }, final: null, source: null, cover: [0, 0, 1, 1] }))).toBe('')
})
test('DitherImage shows the --dither-25 skeleton until the image decodes', () => {
  const m = r(h(DitherImage, { src: '/stills/grafana.png', alt: 'g' })); expect(m).toContain('skeleton'); expect(m).not.toContain('<canvas')
})
test('DitherImage skeleton carries data-depth and data-src before decode (R11)', () => {
  const m = r(h(DitherImage, { src: '/stills/grafana.png', alt: 'g', depth: 0.6 })); expect(m).toContain('data-depth="0.6"'); expect(m).toContain('data-src="/stills/grafana.png"')
})
test('delay shifts the whole reveal: with delay=90 the first step fires at 90 ms, not 0', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  let fire: ((entries: { intersectionRatio: number }[]) => void) | undefined
  vi.stubGlobal('IntersectionObserver', class { constructor(cb: typeof fire) { fire = cb } observe() {} disconnect() {} })
  const canvasProto = HTMLCanvasElement.prototype
  Object.defineProperty(canvasProto, 'clientWidth', { configurable: true, get: () => 100 }); Object.defineProperty(canvasProto, 'clientHeight', { configurable: true, get: () => 50 })
  const ctx = vi.spyOn(canvasProto, 'getContext').mockReturnValue(null)
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(DitherCanvas, { source: () => {}, reveal: true, cell: 4, delay: 90 })))
  act(() => fire!([{ intersectionRatio: 1 }]))
  act(() => { vi.advanceTimersByTime(89) }); expect(ctx).not.toHaveBeenCalled()      // nothing at 0 ms
  act(() => { vi.advanceTimersByTime(1) }); expect(ctx).toHaveBeenCalled()           // first step at 90 ms
  const n = ctx.mock.calls.length
  act(() => { vi.advanceTimersByTime(REVEAL_STEP_MS) }); expect(ctx.mock.calls.length).toBeGreaterThan(n)   // second step at 90 + step
  act(() => root.unmount()); ctx.mockRestore()
  delete (canvasProto as unknown as Record<string, unknown>).clientWidth; delete (canvasProto as unknown as Record<string, unknown>).clientHeight
})
