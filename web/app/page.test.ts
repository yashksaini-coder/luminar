import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

// Spec §4.8: `/?reel=<n>` redirects, so the phase-4 island must stay the first child of the landing page.
// Until phase 4 merges, a marker comment holds its slot; after the merge `<ReelRedirect />` replaces it.
test('redirect island slot is the first child, before <Nav>', () => {
  const src = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')
  const island = src.search(/<ReelRedirect \/>|\{\/\* ReelRedirect slot/)
  expect(island).toBeGreaterThan(-1)
  expect(island).toBeLessThan(src.indexOf('<Nav'))
  expect(src.slice(src.indexOf('<>') + 2, island).trim()).toBe('')
})
