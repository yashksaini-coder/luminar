import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Cursor from './Cursor'
import GridFrame from './GridFrame'
import PixelField, { VISIBLE_RATIO } from './PixelField'

let io: ((e: { intersectionRatio: number }[]) => void) | undefined
const raf = vi.fn<(cb: FrameRequestCallback) => number>(() => 1), caf = vi.fn()
let ctx: { [k: string]: unknown; fill: ReturnType<typeof vi.fn> }

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  io = undefined; raf.mockClear(); caf.mockClear()
  vi.stubGlobal('IntersectionObserver', class { constructor(cb: typeof io) { io = cb } observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', raf); vi.stubGlobal('cancelAnimationFrame', caf)
  ctx = { clearRect: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), fill: vi.fn(), fillStyle: '', globalAlpha: 1 }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => 120 })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, get: () => 90 })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = '' })

const motion = (reduce: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
function mount(props = {}) {
  const host = document.body.appendChild(document.createElement('div')), root = createRoot(host)
  act(() => root.render(h(PixelField, { preset: 'sphere', ...props })))
  return { root, canvas: host.querySelector('canvas')! }
}

test('server markup reserves the box: a pixelated canvas, role=img with a label, aria-hidden without', () => {
  const m = r(h(PixelField, { preset: 'rays', 'aria-label': 'eight rays converge' }))
  expect(m).toContain('<canvas'); expect(m).toContain('role="img"'); expect(m).toContain('aria-label="eight rays converge"'); expect(m).toContain('data-preset="rays"')
  expect(r(h(PixelField, { preset: 'rays' }))).toContain('aria-hidden="true"')
})

test('draws the first frame on mount at DPR-capped size, then animates only while ≥10% visible', () => {
  motion(false); vi.stubGlobal('devicePixelRatio', 3)
  const { root, canvas } = mount()
  expect(canvas.width).toBe(240); expect(canvas.height).toBe(180)   // DPR 3 capped at 2
  expect(ctx.fill).toHaveBeenCalled(); expect(raf).not.toHaveBeenCalled()
  act(() => io!([{ intersectionRatio: VISIBLE_RATIO }])); expect(raf).toHaveBeenCalledTimes(1)
  act(() => io!([{ intersectionRatio: 0.02 }])); expect(caf).toHaveBeenCalled()
  raf.mockClear(); act(() => io!([{ intersectionRatio: 0.5 }])); expect(raf).toHaveBeenCalledTimes(1)
  act(() => root.unmount())
})

test('reduced motion draws one still frame and never schedules animation, even when visible', () => {
  motion(true)
  const { root } = mount({ preset: 'swirl' })
  const fills = ctx.fill.mock.calls.length
  expect(fills).toBeGreaterThan(0)
  act(() => io!([{ intersectionRatio: 1 }])); expect(raf).not.toHaveBeenCalled(); expect(ctx.fill.mock.calls.length).toBe(fills)
  act(() => root.unmount())
})

test('dot presets draw circles, square presets draw rects', () => {
  motion(true)
  mount({ preset: 'halftone' }); expect(ctx.arc).toHaveBeenCalled(); expect(ctx.rect).not.toHaveBeenCalled()
})

test('GridFrame wraps the page with one aria-hidden rails layer; Cursor is decorative', () => {
  const m = r(h(GridFrame, null, h('main', null, 'x')))
  expect(m).toMatch(/^<div class="[^"]+"><span class="[^"]+" aria-hidden="true"><\/span><main>x<\/main><\/div>$/)
  expect(r(h(Cursor))).toMatch(/^<span class="[^"]+" aria-hidden="true"><\/span>$/)
})
