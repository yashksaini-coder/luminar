import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import Figure from '@/components/dither/Figure'
import { attachParallax } from '@/components/dither/parallax'

test('Figure renders the plate, Fig. N label, italic caption, aspect and optional stamp', () => {
  const m = r(h(Figure, { n: 2, caption: 'Same mechanism, toy constants.', aspect: '16 / 9', stamp: 'RELAY GLOBE No. 1' }, h('div', { id: 'kid' })))
  expect(m).toContain('<figure'); expect(m).toContain('class="plate'); expect(m).toContain('aspect-ratio:16 / 9')
  expect(m).toContain('Fig. 2'); expect(m).toContain('<em>Same mechanism, toy constants.</em>'); expect(m).toContain('RELAY GLOBE No. 1'); expect(m).toContain('id="kid"')
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
