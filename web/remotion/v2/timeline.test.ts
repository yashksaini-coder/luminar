/** LaunchV2 timeline and cue sheet, against the real sybil-eclipse recording. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseReel } from '../reel/parse'
import { CUTS, DURATION, FPS, SPANS, clusters, cueSheet, frameAt } from './timeline'

const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
const span = (id: string) => SPANS.find(s => s.id === id)!

test('spans are contiguous and run about 45 s', () => {
  SPANS.slice(1).forEach((s, i) => expect(s.from).toBe(SPANS[i].from + SPANS[i].durationInFrames))
  expect(DURATION / FPS).toBeGreaterThan(40); expect(DURATION / FPS).toBeLessThan(50)
  expect(CUTS).toHaveLength(SPANS.length - 1)
})

test('the mesh acts cover the beats they name', () => {
  expect(frameAt(span('publish'), 5.8)).not.toBeNull()                          // first publish
  expect(frameAt(span('sybil'), 10.2)).not.toBeNull()                           // Sybils graft
  expect(frameAt(span('sybil'), 11.9)).not.toBeNull()                           // first score prune
  expect(frameAt(span('eclipse'), 16.2)).not.toBeNull()                         // eclipse
  expect(frameAt(span('heal'), 24.1 + 1.4)).not.toBeNull()                      // cleared + healed
  expect(frameAt(span('title'), 5)).toBeNull()
})

test('clusters split on the gap', () => {
  expect(clusters([1, 1.1, 1.2, 2, 2.05, 5], 0.3)).toEqual([{ at: 1, n: 3 }, { at: 2, n: 2 }, { at: 5, n: 1 }])
})

test('cue sheet: one sweep on the prune round, heartbeat ticks a second apart, a swell into every cut', () => {
  const cues = cueSheet(d)
  const sweeps = cues.filter(c => c.sfx === 'sweep')
  expect(sweeps).toEqual([{ frame: frameAt(span('sybil'), 11.9), sfx: 'sweep' }])
  // two heartbeats after the 10.2 graft: 10.9 and 11.9, the second one is the prune
  expect(cues).toContainEqual({ frame: frameAt(span('sybil'), 10.9), sfx: 'tick' })
  expect(cues).toContainEqual({ frame: frameAt(span('sybil'), 11.9), sfx: 'tick' })
  const ticks = cues.filter(c => c.sfx === 'tick' && c.frame >= span('eclipse').from && c.frame < span('heal').from)
  ticks.slice(1).forEach((c, i) => expect(c.frame - ticks[i].frame).toBe(FPS))
  expect(cues.filter(c => c.sfx === 'swell')).toHaveLength(CUTS.length)
  expect(cues.filter(c => c.sfx === 'blip').length).toBeGreaterThan(3)
  expect(cues.every(c => c.frame >= 0 && c.frame < DURATION)).toBe(true)
})
