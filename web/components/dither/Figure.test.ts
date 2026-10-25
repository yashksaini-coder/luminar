import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import Figure from '@/components/dither/Figure'
import { attachParallax } from '@/components/dither/parallax'

test('Figure renders the plate, Fig. N label, italic caption, aspect and optional stamp', () => {
  const m = r(h(Figure, { n: 2, caption: 'Same mechanism, toy constants.', aspect: '16 / 9', stamp: 'SORTER No. 6' }, h('div', { id: 'kid' })))
  expect(m).toContain('<figure'); expect(m).toContain('class="plate'); expect(m).toContain('aspect-ratio:16 / 9')
  expect(m).toContain('Fig. 2'); expect(m).toContain('<em>Same mechanism, toy constants.</em>'); expect(m).toContain('SORTER No. 6'); expect(m).toContain('id="kid"')
  expect(m).toContain('--cursor-reticle:url(')
})
test('Figure defaults: aspect 16 / 6.4, narrowAspect 4 / 3, narrowAt 450; no stamp when omitted', () => {
  const m = r(h(Figure, { n: 1, caption: 'c' }, 'x')); expect(m).toContain('aspect-ratio:16 / 6.4'); expect(m).toContain('data-narrow-at="450"'); expect(m).not.toContain('class="stamp')
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
