/** Reel parser: the real sybil-eclipse recording, cross-checked against lib/reel-stats.json. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { analyticsAt, parseReel, snapshotAt } from './parse'

const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
const stats = JSON.parse(readFileSync(join(__dirname, '../../lib/reel-stats.json'), 'utf8'))
test('nodes, edges and attackers come from the snapshots', () => {
  expect(d.nodes.filter(n => !n.attacker)).toHaveLength(50); expect(d.nodes.filter(n => n.attacker).map(n => n.id).sort()).toEqual(['eclipse-0','eclipse-1','eclipse-2','eclipse-3','sybil-0','sybil-1','sybil-2','sybil-3','sybil-4'])
  expect(d.byId.get('sybil-0')!.firstSeenT).toBeCloseTo(10.2, 1); expect(d.byId.get('sybil-0')!.lastSeenT).toBeCloseTo(23.9, 1)
  expect(d.edges.length).toBeGreaterThan(50); expect(d.durationSim).toBeCloseTo(39.5, 1)
  const n0 = d.byId.get('peer-0')!; expect(n0.x).toBeCloseTo(-62.1, 1); expect(n0.y).toBeCloseTo(294.7, 1)
})
test('events agree with reel-stats.json (two derivations, same numbers)', () => {
  expect(d.prunes.filter(p => p.reason === 'score' && p.to.startsWith('sybil-'))).toHaveLength(20)
  expect(d.prunes.find(p => p.reason === 'score')!.at).toBeCloseTo(stats.firstScorePruneAt, 1)
  expect(d.faults.find(f => f.type === 'sybil')!.at).toBeCloseTo(stats.sybilAt, 1); expect(d.faults.find(f => f.type === 'sybil')!.n).toBe(5)
  expect(d.faults.find(f => f.type === 'eclipse')!.target).toBe('peer-10'); expect(d.cleared[0].at).toBeCloseTo(stats.clearedAt, 1)
  expect(d.phases.map(p => p.label)).toEqual(['Sybil attack: 5 attackers graft in', 'Eclipse on peer-10'])
  expect(d.messages.filter(m => m.spam)).toHaveLength(40); expect(d.messages.filter(m => m.via === 'iwant')).toHaveLength(158); expect(d.messages.every(m => m.to !== '')).toBe(true)
})
test('analytics carry snapshot sim time, not wall time', () => {
  const first = d.analytics.find(a => a.total > 0)!
  expect(first.time).toBeCloseTo(7.4, 1); expect(first.delivery).toBe(1); expect(first.hops).toBeCloseTo(4.2, 1); expect(first.propagationMs).toBe(100)
  expect(Math.round(first.delivery * 100)).toBe(stats.deliveryPct); expect(first.hops).toBeCloseTo(stats.avgHops, 1); expect(first.propagationMs).toBe(stats.avgPropagationMs)
  expect(analyticsAt(d, 7.3)).toBeNull(); expect(analyticsAt(d, 7.4)!.time).toBeCloseTo(7.4, 1)
  expect(snapshotAt(d, 12.5).scores['sybil-0']).toBe(-15); expect(snapshotAt(d, 11.5).scores['sybil-0']).toBeCloseTo(-9.4, 2)
  expect(snapshotAt(d, 16.9).mesh['peer-10']).toEqual(['eclipse-0','eclipse-1','eclipse-2','eclipse-3'])
  expect(snapshotAt(d, 18).scores['eclipse-0']).toBeCloseTo(0.85, 2)   // P1 creeps up; the eclipse score is never negative in this recording
})
