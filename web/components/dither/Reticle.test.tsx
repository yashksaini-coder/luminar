import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { Reticle, RETICLE_CURSOR, RETICLE_SVG } from '@/components/dither/Reticle'
test('reticle is a 14 px ring with four 4 px ticks, paper on a 1 px pitch outline', () => {
  const html = renderToStaticMarkup(<Reticle title="selected" />)
  expect(html).toContain('width="14"'); expect(html).toContain('height="14"')
  expect(html.match(/<line /g)).toHaveLength(4); expect(html.match(/<circle /g)).toHaveLength(2)   // ring + outline ring
  expect(html).toContain('<title>selected</title>')
  expect(html).not.toMatch(/#ff5a2c|flame/i)                                                      // never flame [spec §7.4.3]
  expect(html).toContain('var(--paper-0)'); expect(html).toContain('var(--pitch-0)')                 // the component follows the theme
})
test('RETICLE_CURSOR is a data-URI SVG cursor with hotspot 7 7 and a crosshair fallback', () => {
  expect(RETICLE_CURSOR.startsWith('url("data:image/svg+xml,')).toBe(true)
  expect(RETICLE_CURSOR.endsWith('") 7 7, crosshair')).toBe(true)
  expect(RETICLE_CURSOR).not.toContain('#')                                                       // colours percent-encoded
  expect(decodeURIComponent(RETICLE_CURSOR)).toContain(RETICLE_SVG.slice(0, 40)); expect(decodeURIComponent(RETICLE_CURSOR)).toContain("width='14'")
})
