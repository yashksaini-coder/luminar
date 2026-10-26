import { afterEach, expect, test, vi } from 'vitest'
import { attachReveal } from './reveal'

type Cb = (entries: Partial<IntersectionObserverEntry>[]) => void
const instances: { cb: Cb; opts: IntersectionObserverInit; observe: ReturnType<typeof vi.fn>; unobserve: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = []
class IO {
  observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn()
  constructor(cb: Cb, opts: IntersectionObserverInit) { instances.push({ cb, opts, observe: this.observe, unobserve: this.unobserve, disconnect: this.disconnect }) }
}
function mount() {
  document.body.innerHTML = '<section data-reveal id="a"><p data-k="up"></p></section><section data-reveal id="b"></section>'
  return [document.getElementById('a')!, document.getElementById('b')!]
}
afterEach(() => { instances.length = 0; vi.unstubAllGlobals(); document.body.innerHTML = '' })

test('one observer at threshold .3; only the section that reached .4 gets data-in', () => {
  vi.stubGlobal('IntersectionObserver', IO)
  const [a, b] = mount(); attachReveal()
  expect(instances).toHaveLength(1); expect(instances[0].opts.threshold).toBe(0.3); expect(instances[0].observe).toHaveBeenCalledTimes(2)
  instances[0].cb([{ target: a, intersectionRatio: 0.4 }, { target: b, intersectionRatio: 0.1 }])
  expect(a.dataset.in).toBe('1'); expect(b.dataset.in).toBeUndefined()
  expect(instances[0].unobserve).toHaveBeenCalledWith(a); expect(instances[0].disconnect).not.toHaveBeenCalled()
})

test('re-intersecting a seen section changes nothing; the last section disconnects the observer', () => {
  vi.stubGlobal('IntersectionObserver', IO)
  const [a, b] = mount(); attachReveal()
  instances[0].cb([{ target: a, intersectionRatio: 0.5 }]); a.dataset.in = 'seen'
  instances[0].cb([{ target: a, intersectionRatio: 0.9 }])
  expect(a.dataset.in).toBe('seen'); expect(instances[0].unobserve).toHaveBeenCalledTimes(1)
  instances[0].cb([{ target: b, intersectionRatio: 0.3 }])
  expect(b.dataset.in).toBe('1'); expect(instances[0].disconnect).toHaveBeenCalledTimes(1)
})

test('the disposer disconnects; a second attach skips sections already in', () => {
  vi.stubGlobal('IntersectionObserver', IO)
  const [a] = mount(); const off = attachReveal(); off()
  expect(instances[0].disconnect).toHaveBeenCalledTimes(1)
  a.dataset.in = '1'; attachReveal()
  expect(instances[1].observe).toHaveBeenCalledTimes(1); expect(instances[1].observe).not.toHaveBeenCalledWith(a)
})

test('without IntersectionObserver every section lands in its final state', () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  const [a, b] = mount(); attachReveal()
  expect(a.dataset.in).toBe('1'); expect(b.dataset.in).toBe('1')
})
