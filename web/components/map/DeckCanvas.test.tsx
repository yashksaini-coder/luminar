import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import DeckCanvas from '@/components/map/DeckCanvas'

// renderToStaticMarkup only (effects do not run server-side)
test('DeckCanvas renders a canvas and a tooltip host', () => {
  const html = renderToStaticMarkup(<DeckCanvas className="x" />)
  expect(html).toContain('<canvas'); expect(html).toContain('role="tooltip"'); expect(html).toContain('class="x')
})
