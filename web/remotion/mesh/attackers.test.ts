/** Attackers and attack edges: the real sybil-eclipse recording. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseReel } from '../reel/parse'
import { attackEdgesAt, attackersAt } from './attackers'

const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
test('attackers: five grafted at T+10.2, all pruned at T+11.9, fading after T+24.1, gone after T+24.5', () => {
  expect(attackersAt(d, 10.0)).toHaveLength(0); expect(attackersAt(d, 10.25)).toHaveLength(5)
  const a = attackersAt(d, 11.0); expect(a).toHaveLength(5); expect(a.every(x => !x.pruned && x.fading === 1)).toBe(true); expect(a.find(x => x.id === 'sybil-0')!.victims.length).toBeGreaterThanOrEqual(3)
  expect(attackersAt(d, 11.85).every(x => !x.pruned)).toBe(true); expect(attackersAt(d, 11.95).every(x => x.pruned)).toBe(true)
  expect(attackersAt(d, 16.3)).toHaveLength(9); expect(attackersAt(d, 16.3).filter(x => x.id.startsWith('eclipse-')).every(x => !x.pruned)).toBe(true)
  const fading = attackersAt(d, 24.2); expect(fading).toHaveLength(9); expect(fading[0].fading).toBeGreaterThan(0); expect(fading[0].fading).toBeLessThan(1)
  expect(attackersAt(d, 24.6)).toHaveLength(0)
})
test('attack edges live from GRAFT to PRUNE and linger 0.2 s for the wipe', () => {
  expect(attackEdgesAt(d, 10.3).filter(e => e.to.startsWith('sybil-')).length).toBeGreaterThanOrEqual(5)
  const e = attackEdgesAt(d, 12.0).find(e => e.from === 'peer-42' && e.to === 'sybil-3')!; expect(e.prunedAt).toBeCloseTo(11.9, 1)
  expect(attackEdgesAt(d, 12.2).find(e => e.from === 'peer-42' && e.to === 'sybil-3')).toBeUndefined()
  expect(attackEdgesAt(d, 16.3).filter(e => e.from === 'peer-10' && e.to.startsWith('eclipse-'))).toHaveLength(4)
})
