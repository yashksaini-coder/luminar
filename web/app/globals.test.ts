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

test('reveal + counter durations collapse to 0ms under reduced motion', () => {
  const reduce = tokens.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)![0]
  for (const d of ['--d-rise', '--d-fade', '--d-wipe', '--d-count', '--stagger-sec']) expect(reduce).toContain(`${d}: 0ms`)
})

test('phone type floor sits under the 1024px touch band', () => {
  expect(tokens).toMatch(/@media \(max-width: 1024px\)\s*\{\s*:root\s*\{[^}]*--t-label: 12px;[^}]*--t-micro: 12px;[^}]*--t-body: 13px;/)
  expect(tokens).not.toMatch(/1023px/)
})

test('motion tokens: easing family and section durations declared once in :root', () => {
  const root = tokens.match(/^:root \{[\s\S]*?\n\}/m)![0]
  for (const t of ['--e:', '--e2:', '--io:', '--d-rise:', '--d-fade:', '--d-wipe:', '--d-count:', '--stagger-sec:']) expect(root.split(t).length).toBe(2)
  expect(root).toMatch(/--t-poster:\s*clamp\(3\.5rem, min\(13\.5vw, 22dvh\), 13rem\)/)
})
