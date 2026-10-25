import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import Figure from '@/components/dither/Figure'
import { attachParallax } from '@/components/dither/parallax'

test('Figure renders the plate, Fig. N label, italic caption, aspect and optional stamp', () => {
  const m = r(h(Figure, { n: 2, caption: 'Same mechanism, toy constants.', aspect: '16 / 9', stamp: 'RELAY GLOBE No. 1' }, h('div', { id: 'kid' })))
  expect(m).toContain('<figure'); expect(m).toContain('class="plate'); expect(m).toContain('--aspect:16 / 9')
  expect(m).toContain('Fig. 2'); expect(m).toContain('<em>Same mechanism, toy constants.</em>'); expect(m).toContain('RELAY GLOBE No. 1'); expect(m).toContain('id="kid"')
  expect(m).toContain('--cursor-reticle:url(')
})
test('Figure defaults: aspect 16 / 6.4, narrowAspect 4 / 3 inline for the container query; no stamp when omitted', () => {
  const m = r(h(Figure, { n: 1, caption: 'c' }, 'x')); expect(m).toContain('--aspect:16 / 6.4'); expect(m).toContain('--narrow-aspect:4 / 3'); expect(m).not.toContain('class="stamp')
  expect(m).not.toContain('data-narrow')
})
test('narrow layout is a container query, not a ResizeObserver', () => {
  const src = readFileSync(join(__dirname, 'Figure.tsx'), 'utf8'); expect(src).not.toContain('ResizeObserver'); expect(src).not.toContain('useState')
  const css = readFileSync(join(__dirname, 'Figure.module.css'), 'utf8'); expect(css).toContain('container-type: inline-size'); expect(css).toContain('@container (max-width: 449px)')
})
test('kind="card" puts data-k="card" on the plate; reveal makes the figure a data-reveal section; captionI marks the caption up', () => {
  const plain = r(h(Figure, { n: 1, caption: 'c' }, 'x')); expect(plain).not.toContain('data-k='); expect(plain).not.toContain('data-reveal')
  const card = r(h(Figure, { n: 2, caption: 'c', kind: 'card', reveal: true }, 'x'))
  expect(card).toMatch(/<figure[^>]*data-reveal=""/); expect(card).toMatch(/class="plate[^"]*" data-k="card"/); expect(card).not.toContain('<figcaption data-k')
  const cap = r(h(Figure, { n: 1, caption: 'c', captionI: 5 }, 'x')); expect(cap).toContain('<figcaption data-k="up" style="--i:5"'); expect(cap).not.toContain('data-k="card"')
})
test('useParallax is inert without a window or under reduced motion', () => {
  // SSR: renderToStaticMarkup of a component calling useParallax must not throw (effects never run)
  expect(() => r(h(Figure, { n: 1, caption: 'c' }, 'x'))).not.toThrow()
  // reduced motion: matchMedia stub → attachParallax returns a no-op and adds no scroll listener
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const add = vi.spyOn(window, 'addEventListener'); const off = attachParallax(document.createElement('div')); off()
  expect(add.mock.calls.some(c => c[0] === 'scroll')).toBe(false); vi.unstubAllGlobals()
})
test('parallax moves a data-depth layer mounted after attach (DitherImage swaps its skeleton for a canvas on decode)', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false })); document.documentElement.style.setProperty('--parallax-travel', '24px')
  const root = document.body.appendChild(document.createElement('div')); const skeleton = document.createElement('div'); skeleton.dataset.depth = '0.6'; root.append(skeleton)
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { cb(0); return 0 })
  const off = attachParallax(root); expect(skeleton.style.transform).not.toBe('')
  const canvas = document.createElement('canvas'); canvas.dataset.depth = '0.6'; skeleton.replaceWith(canvas)
  dispatchEvent(new Event('scroll')); expect(canvas.style.transform).toBe(skeleton.style.transform)
  off(); raf.mockRestore(); root.remove(); document.documentElement.style.removeProperty('--parallax-travel'); vi.unstubAllGlobals()
})
