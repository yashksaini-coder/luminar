import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { ReelMeta } from '@/lib/types'
import { CARDS_MAX_BYTES, computeCard } from './reel-stats.mjs'

const manifest = JSON.parse(readFileSync(join(__dirname, '../public/reels/manifest.json'), 'utf8')) as ReelMeta[]
test('computeCard: one frame per reel, honest nodes sized to the frame, geo flag on real reels, under the byte cap', () => {
  const cards = Object.fromEntries(manifest.map(m => [m.name, computeCard(readFileSync(join(__dirname, '../public', m.file), 'utf8').split('\n').filter(Boolean), m)]))
  for (const m of manifest) { const c = cards[m.name]; expect(c.frames).toHaveLength(1); expect(c.frames[0].s).toHaveLength(c.nodes.length); expect(c.frames[0].b).toHaveLength(c.nodes.length); expect(c.frames[0].stamp).toBe('') }
  expect(cards['sybil-eclipse'].nodes).toHaveLength(50); expect(cards['mainnet-block-wave'].geo).toBe(true); expect(cards['mainnet-block-wave'].nodes.length).toBeGreaterThanOrEqual(100)
  expect(cards['sybil-eclipse'].frames[0].a.length).toBeGreaterThan(0)       // the chosen frame shows the Sybils
  expect(JSON.stringify(cards).length).toBeLessThan(CARDS_MAX_BYTES)
})
test('lib/reel-cards.json is committed and matches the manifest names', () => { expect(Object.keys(JSON.parse(readFileSync(join(__dirname, '../lib/reel-cards.json'), 'utf8'))).sort()).toEqual(manifest.map(m => m.name).sort()) })
