import { test, expect } from 'vitest'
import { existsSync } from 'node:fs'; import { join } from 'node:path'
import { REEL_MANIFEST, carryParams, reelHref, liveHref, redirectTarget, loadLabel } from '@/lib/reels'
test('manifest has the four reels and every file is in public/', () => {
  expect(REEL_MANIFEST.map(r => r.name)).toEqual(['sybil-eclipse', 'partition-heal', 'healthy-publish', 'mainnet-block-wave'])
  expect(REEL_MANIFEST[3].real).toBe(true); expect(REEL_MANIFEST[0].title).toBe('Sybil → Eclipse')
  for (const r of REEL_MANIFEST) expect(existsSync(join(__dirname, '../public', r.file))).toBe(true)
  expect(existsSync(join(__dirname, '../public/geo/land-110m.json'))).toBe(true)
})
test('hrefs and carried params keep the spec order theme, hero, t, peer', () => {
  expect(reelHref('mainnet-block-wave')).toBe('/reels/mainnet-block-wave/')
  expect(carryParams('?peer=sybil-0&foo=1&theme=stage&t=12.4').toString()).toBe('theme=stage&t=12.4&peer=sybil-0')
  expect(reelHref('sybil-eclipse', carryParams('?theme=stage&hero=1'))).toBe('/reels/sybil-eclipse/?theme=stage&hero=1')
  expect(liveHref(carryParams('?hero=1&t=3', ['theme', 'hero']))).toBe('/sim/?hero=1')
})
test('redirectTarget', () => {
  expect(redirectTarget('?reel=sybil-eclipse&theme=stage&hero=1')).toBe('/reels/sybil-eclipse/?theme=stage&hero=1')
  expect(redirectTarget('?reel=sybil-eclipse&t=12.4&peer=sybil-0&foo=1')).toBe('/reels/sybil-eclipse/?t=12.4&peer=sybil-0')
  expect(redirectTarget('?theme=stage')).toBeNull(); expect(redirectTarget('?reel=nope')).toBeNull(); expect(redirectTarget('')).toBeNull()
})
test('loadLabel', () => {
  expect(loadLabel({ loaded: 2_100_000, total: 3_500_000 })).toBe('2.1 / 3.5 MB · 60%')
  expect(loadLabel({ loaded: 2_100_000, total: 0 })).toBe('2.1 MB'); expect(loadLabel(null)).toBe('')
  expect(loadLabel({ loaded: 5_000_000, total: 3_500_000 })).toBe('5.0 / 3.5 MB · 100%')   // gzip: content-length is the compressed size
  expect(loadLabel({ loaded: NaN, total: 1 })).toMatch(/· 0%$/); expect(loadLabel({ loaded: -1, total: 1 })).toMatch(/· 0%$/)
})
