/** Particles: the real sybil-eclipse recording, publish wave, spam and the IWANT pull. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseReel } from '../reel/parse'
import { PARTICLE_MIN_MS, activeParticles } from './particles'

const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
test('publish wave at T+5.8: nothing before it, 52 squares (14 from peer-22) at T+6.0', () => {
  expect(activeParticles(d, 5.79)).toHaveLength(0)
  const ps = activeParticles(d, 6.0); expect(ps).toHaveLength(52); expect(ps.filter(p => p.from === 'peer-22')).toHaveLength(14)
  expect(ps.every(p => p.kind === 'message' && p.progress >= 0 && p.progress <= 1)).toBe(true)
})
test('spam leaves the Sybils at T+11.0; scene 3 can hide it; the IWANT pull reaches peer-10 at T+16.9', () => {
  expect(activeParticles(d, 11.05).some(p => p.kind === 'spam')).toBe(true)
  expect(activeParticles(d, 11.05, { attackers: false }).some(p => p.kind === 'spam')).toBe(false)
  expect(activeParticles(d, 16.95).some(p => p.kind === 'iwant' && p.to === 'peer-10')).toBe(true)
  expect(PARTICLE_MIN_MS).toBe(400)
})
