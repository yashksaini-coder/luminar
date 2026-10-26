// @vitest-environment node
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { expect, test } from 'vitest'
import { FIG } from '../scenes/copy'
import { LAYOUT } from '../scenes/layout'

/** Advance width in em of each char, read from the Instrument Serif italic WOFF that the video uses (cmap format 4 + hmtx). */
function advances(path: string): (ch: string) => number {
  const woff = readFileSync(path)
  const tables: Record<string, Buffer> = {}
  for (let i = 0, n = woff.readUInt16BE(12); i < n; i++) {
    const e = 44 + i * 20
    const [off, comp, orig] = [woff.readUInt32BE(e + 4), woff.readUInt32BE(e + 8), woff.readUInt32BE(e + 12)]
    const raw = woff.subarray(off, off + comp)
    tables[woff.toString('latin1', e, e + 4)] = comp < orig ? inflateSync(raw) : raw
  }
  const { head, hhea, hmtx, cmap } = tables
  const upm = head.readUInt16BE(18)
  const nMetrics = hhea.readUInt16BE(34)
  let sub = 0
  for (let i = 0; i < cmap.readUInt16BE(2); i++) if (cmap.readUInt16BE(4 + i * 8) === 3) sub = cmap.readUInt32BE(8 + i * 8)
  const segs = cmap.readUInt16BE(sub + 6) / 2
  const at = (arr: number, i: number) => sub + 14 + arr * (segs * 2) + (arr > 0 ? 2 : 0) + i * 2   // endCode | startCode | idDelta | idRangeOffset
  const glyph = (c: number) => {
    for (let i = 0; i < segs; i++) {
      if (c > cmap.readUInt16BE(at(0, i)) || c < cmap.readUInt16BE(at(1, i))) continue
      const delta = cmap.readInt16BE(at(2, i)), ro = cmap.readUInt16BE(at(3, i))
      if (ro === 0) return (c + delta) & 0xffff
      const g = cmap.readUInt16BE(at(3, i) + ro + 2 * (c - cmap.readUInt16BE(at(1, i))))
      return g === 0 ? 0 : (g + delta) & 0xffff
    }
    throw new Error(`no glyph for U+${c.toString(16)}`)
  }
  return (ch) => hmtx.readUInt16BE(Math.min(glyph(ch.codePointAt(0)!), nMetrics - 1) * 4) / upm
}

const em = advances('node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff')

/** Greedy word wrap with forced breaks at '\n', as the browser does for white-space: pre-line. */
function lines(text: string, px: number, width: number): number {
  if (text.includes('\n')) return text.split('\n').reduce((n, part) => n + lines(part, px, width), 0)
  const w = (s: string) => [...s].reduce((sum, ch) => sum + em(ch) * px, 0)
  let n = 1, cur = ''
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word
    if (cur && w(next) > width) { n++; cur = word } else cur = next
  }
  return n
}

test('every tall Fig sentence wraps to ≤ 2 lines at 30 px italic in its caption box', () => {
  for (const [scene, text] of Object.entries(FIG) as [keyof typeof LAYOUT, string][]) {
    const box = LAYOUT[scene].tall.caption
    expect(box, scene).toBeDefined()
    expect(lines(text, 30, box!.w), scene).toBeLessThanOrEqual(2)
    expect(14 * 1.4 + 2 * 30 * 1.2, scene).toBeLessThanOrEqual(box!.h)   // label line + two 1.2-leaded lines fit the box height
  }
})
