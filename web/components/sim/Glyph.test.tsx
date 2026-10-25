import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import Glyph from '@/components/sim/Glyph'

// spec §6.2 render table: decoded = signal disc + ring at 1.6 r; failed / error = disc with X in paper-3 / flame-dim
const fills = (html: string) => [...html.matchAll(/<circle[^>]*fill="([^"]+)"/g)].map(m => m[1])
test('decoded, failed and error glyphs follow the render table', () => {
  expect(fills(renderToStaticMarkup(<Glyph role="decoded" />))).toEqual(['var(--signal)', 'none'])
  for (const [role, fill] of [['failed', 'var(--paper-3)'], ['error', 'var(--flame-dim)']] as const) {
    const html = renderToStaticMarkup(<Glyph role={role} />)
    expect(fills(html)).toEqual([fill]); expect(html).toContain('stroke="var(--pitch-0)"')
  }
})
