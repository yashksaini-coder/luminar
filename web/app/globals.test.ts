// web/app/globals.test.ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from 'vitest'

const tokens = readFileSync(resolve(__dirname, '../../docs/design/tokens.css'), 'utf8')
const globals = readFileSync(resolve(__dirname, 'globals.css'), 'utf8')

test('globals.css begins with docs/design/tokens.css verbatim', () => {
  expect(globals.startsWith(tokens)).toBe(true)
})

test('base rules keep the focus ring, tabular numerals and square corners', () => {
  expect(globals).toMatch(/:focus-visible\s*\{[^}]*outline:\s*var\(--hair-w2\) solid var\(--focus\)/)
  expect(globals).toMatch(/font-variant-numeric:\s*tabular-nums/)
  expect(globals.slice(tokens.length)).toMatch(/color-scheme:\s*dark/)
  expect(globals.slice(tokens.length)).not.toMatch(/outline:\s*(none|0)\b/)
  expect(globals.slice(tokens.length)).not.toMatch(/border-radius:(?!\s*var\(--r-(0|node)\))/)
})

test('no network stylesheet or shard/slab decoration', () => {
  expect(globals).not.toMatch(/googleapis|fontshare|@import\s+url\(\s*['"]?https?:/)
  expect(globals.slice(tokens.length)).not.toMatch(/shard|slab|--halftone/)
})

test('primary button keeps its fg field on hover', () => {
  expect(globals.slice(tokens.length)).toMatch(/\.btn-primary:hover\s*\{[^}]*background:\s*var\(--fg\)/)
})
