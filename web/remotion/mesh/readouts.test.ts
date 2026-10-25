/** Ticker and score strip numbers: the real sybil-eclipse recording. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseReel } from '../reel/parse'
import { fmtTicker, healedInS, invalidCountAt, scoreAt, tickerAt } from './readouts'

const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
test('ticker numbers are the reel\'s own', () => {
  expect(tickerAt(d, 7.3)).toBeNull(); expect(tickerAt(d, 7.4)).toEqual({ delivery: 1, hops: 4.2, ms: 100 })
  expect(fmtTicker(tickerAt(d, 7.4))).toEqual(['delivery 100 %', 'hops 4.2', '100 ms']); expect(fmtTicker(null)).toEqual(['delivery —', 'hops —', '— ms'])
  expect(invalidCountAt(d, 10.9)).toBe(0); expect(invalidCountAt(d, 11.1)).toBeGreaterThan(0); expect(invalidCountAt(d, 12.0)).toBe(40)
  expect(healedInS(d)).toBeCloseTo(1.4, 1); expect(fmtTicker(tickerAt(d, 25.5), { healedIn: healedInS(d) })).toContain('healed in 1.4 s')
})
test('score strip steps on snapshots: +0.1 → −9.4 → −15 for sybil-0; eclipse-0 climbs and never goes negative', () => {
  expect(scoreAt(d, 'sybil-0', 10.5)).toBeCloseTo(0.1); expect(scoreAt(d, 'sybil-0', 11.5)).toBeCloseTo(-9.4); expect(scoreAt(d, 'sybil-0', 12.5)).toBe(-15)
  expect(scoreAt(d, 'eclipse-0', 18)).toBeCloseTo(0.85, 2); expect(scoreAt(d, 'eclipse-0', 16.5)).toBeCloseTo(0.1, 2); expect(scoreAt(d, 'eclipse-0', 24)).toBeGreaterThan(0)
  for (let t = 16.4; t <= 24; t += 0.5) expect(scoreAt(d, 'eclipse-0', t)!).toBeGreaterThanOrEqual(0)
  expect(scoreAt(d, 'nobody', 18)).toBeNull()
})
