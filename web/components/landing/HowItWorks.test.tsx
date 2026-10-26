import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import HowItWorks, { STEPS } from './HowItWorks'

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

test('server markup: reveal section, h2, three steps in order with their chips, the real engine facts', () => {
  const m = r(h(HowItWorks)); const doc = new DOMParser().parseFromString(m, 'text/html')
  expect(m).toMatch(/^<section[^>]*data-reveal=""/)
  expect(doc.querySelector('h2')?.textContent).toBe('Simulate, stream, render.')
  const steps = [...doc.querySelectorAll('ol > li')]
  expect(steps.map((s) => s.querySelector('h3')?.textContent)).toEqual(STEPS.map((s) => s.title))
  expect(steps.map((s) => s.getAttribute('data-k'))).toEqual(['card', 'card', 'card'])
  for (const c of ['trio', 'GossipSub v1.1', 'orjson', 'deck.gl 9', 'Canvas 2D']) expect(m).toContain(`<li>${c}</li>`)
  for (const f of ['D 6 · low 4 · high 8', '20 Hz', '/ws/events', '20 · 50 · 100 · 200']) expect(m).toContain(f)
  expect(doc.querySelectorAll('[aria-hidden="true"] svg line').length).toBe(4)   // two wires, not after the last step
})

test('the pulse clock runs only while the section is on screen', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let cb: IntersectionObserverCallback = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class { constructor(f: IntersectionObserverCallback) { cb = f } observe() {} disconnect = disconnect })
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(HowItWorks)))
  const sec = host.querySelector('section')!
  expect(sec.dataset.play).toBeUndefined()
  cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver); expect(sec.dataset.play).toBe('1')
  cb([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver); expect(sec.dataset.play).toBeUndefined()
  act(() => root.unmount()); expect(disconnect).toHaveBeenCalled()
})
