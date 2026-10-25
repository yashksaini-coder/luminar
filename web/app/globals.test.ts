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

test('primary button lifts to paper-1 on hover (land-10)', () => {
  expect(globals.slice(tokens.length)).toMatch(/\.btn-primary:hover\s*\{[^}]*background:\s*var\(--paper-1\)/)
})

test('reveal + counter durations collapse to 0ms under reduced motion', () => {
  const reduce = tokens.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)![0]
  for (const d of ['--d-rise', '--d-fade', '--d-wipe', '--d-count', '--stagger-sec']) expect(reduce).toContain(`${d}: 0ms`)
})

test('reveal CSS lives only inside a no-preference block, behind :root[data-js]', () => {
  const tail = globals.slice(tokens.length)
  const blocks = [...tail.matchAll(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\n\}/g)].map(m => m[0])
  expect(blocks.length).toBeGreaterThan(0)
  const outside = blocks.reduce((s, b) => s.replace(b, ''), tail).replace(/\/\*[\s\S]*?\*\//g, '')
  expect(outside).not.toMatch(/data-reveal|data-k=|--d-rise|--stagger-sec/)
  for (const b of blocks) for (const line of b.split('\n').filter(l => /data-reveal/.test(l))) expect(line).toMatch(/^\s*:root\[data-js\]/)
  expect(blocks.join('')).toMatch(/\[data-k=up\]\s*\{[^}]*translateY\(10px\)[^}]*blur\(4px\)/)
  expect(blocks.join('')).toMatch(/\[data-k=card\]\s*\{(?![^}]*filter:\s*blur)/)
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
