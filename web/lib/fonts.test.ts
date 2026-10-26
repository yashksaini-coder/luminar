import { afterEach, expect, test } from 'vitest'
import { monoFamily } from '@/lib/fonts'

afterEach(() => document.documentElement.style.removeProperty('--font-mono'))

test('monoFamily reads the first family of --font-mono and falls back to IBM Plex Mono', () => {
  expect(monoFamily()).toBe('"IBM Plex Mono"')
  document.documentElement.style.setProperty('--font-mono', 'mono, "Geist Mono", monospace')
  expect(monoFamily()).toBe('mono')
})
