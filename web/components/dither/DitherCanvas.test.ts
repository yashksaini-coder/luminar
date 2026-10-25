import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import DitherCanvas from '@/components/dither/DitherCanvas'
import DitherImage from '@/components/dither/DitherImage'
import Loupe from '@/components/dither/Loupe'

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
