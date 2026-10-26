// web/app/fonts.test.ts
import { existsSync, statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from 'vitest'

const FILES = [
  'instrument-serif-latin-400-normal.woff2', 'instrument-serif-latin-400-italic.woff2',
  'ibm-plex-mono-latin-400-normal.woff2', 'ibm-plex-mono-latin-500-normal.woff2', 'ibm-plex-mono-latin-600-normal.woff2',
  'manrope-latin-wght-normal.woff2',
]
const layout = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8')

test('the six woff2 files are in public/fonts and non-empty', () => {
  for (const f of FILES) {
    const p = resolve(__dirname, '../public/fonts', f)
    expect(existsSync(p), f).toBe(true)
    expect(statSync(p).size).toBeGreaterThan(1000)
  }
})

test('layout loads fonts locally and writes the three variables as an inline style', () => {
  expect(layout).toMatch(/from 'next\/font\/local'/)
  expect(layout).not.toMatch(/next\/font\/google|googleapis|fontshare/)
  for (const v of ['--font-display', '--font-mono', '--font-ui']) expect(layout).toContain(`'${v}'`)
  expect(layout).toMatch(/<html[^>]*style=\{/)
})
