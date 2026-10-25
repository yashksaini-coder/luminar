import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import Readouts, { COUNT_MS, easeCount } from './Readouts'

const FINAL = '50 5 2 100%'
const text = (root: ParentNode) => [...root.querySelectorAll('dd')].map(d => d.textContent).join(' ')
const TIMERS: Parameters<typeof vi.useFakeTimers>[0] = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }
function mount(reduce: boolean) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers(TIMERS); vi.stubGlobal('matchMedia', () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} }))
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(Readouts)))
  return { host, root, dl: host.querySelector<HTMLElement>('dl[data-reveal]')! }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = '' })

test('server markup: the final numbers, the strip is a data-reveal section and the cells rise in reading order', () => {
  const m = r(h(Readouts)); const doc = new DOMParser().parseFromString(m, 'text/html')
  expect(text(doc)).toBe(FINAL); expect(m).toMatch(/<dl[^>]*data-reveal=""/)
  expect([...doc.querySelectorAll('[data-k="up"]')].map(c => c.getAttribute('style'))).toEqual(['--i:0', '--i:1', '--i:2', '--i:3'])
})
test('after data-in the numbers count from 0 and land on the final values within 1 s', async () => {
  const { dl, host, root } = mount(false)
  expect(text(host)).toBe(FINAL)                                  // nothing moves before the reveal
  act(() => { vi.advanceTimersByTime(500) }); expect(text(host)).toBe(FINAL)
  await act(async () => { dl.dataset.in = '1' })                 // MutationObserver fires in a microtask
  expect(text(host)).toBe('0 0 0 0%')
  act(() => { vi.advanceTimersByTime(COUNT_MS / 2) }); const mid = text(host); expect(mid).not.toBe(FINAL); expect(mid).not.toBe('0 0 0 0%')
  act(() => { vi.advanceTimersByTime(1000 - COUNT_MS / 2) }); expect(text(host)).toBe(FINAL)
  act(() => root.unmount())
})
test('under prefers-reduced-motion no intermediate value is ever written', async () => {
  const { dl, host, root } = mount(true)
  const writes: string[] = []; const mo = new MutationObserver(ms => ms.forEach(m => writes.push(m.target.textContent ?? '')))
  host.querySelectorAll('dd').forEach(d => mo.observe(d, { childList: true, characterData: true, subtree: true }))
  await act(async () => { dl.dataset.in = '1' })
  for (const step of [50, 450, 500]) { act(() => { vi.advanceTimersByTime(step) }); expect(text(host)).toBe(FINAL) }
  await act(async () => {}); expect(writes).toEqual([]); mo.disconnect()
  act(() => root.unmount())
})
test('easeCount is ease-in-out cubic: 0 → 0, .5 → .5, 1 → 1, symmetric', () => {
  expect(easeCount(0)).toBe(0); expect(easeCount(0.5)).toBe(0.5); expect(easeCount(1)).toBe(1); expect(easeCount(0.25) + easeCount(0.75)).toBeCloseTo(1)
})
