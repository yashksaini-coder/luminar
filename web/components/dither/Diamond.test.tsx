import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { Diamond } from '@/components/dither/Diamond'

// The canvas atlas hatches at a 3 CSS px pitch with 1 px lines; the SVG twin must match at any size,
// not scale its pitch with the viewBox (at 12 px a 3-unit pitch is 0.36 px and reads as a flat fill).
test.each([12, 24, 48])('hatch pitch is 3 CSS px with 1 px lines at size %i', size => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<Diamond size={size} />)
  const pattern = host.querySelector('pattern')!, line = pattern.querySelector('rect')!
  const px = (units: string | null) => Number(units) * size / 100
  expect(px(pattern.getAttribute('width'))).toBeCloseTo(3)
  expect(px(line.getAttribute('width'))).toBeCloseTo(1)
})
