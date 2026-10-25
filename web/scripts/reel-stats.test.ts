import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { computeStats, PLATE_MAX_BYTES, STAMP_MAX } from './reel-stats.mjs'

const lines = readFileSync(join(__dirname, '../public/reels/sybil-eclipse.jsonl'), 'utf8').split('\n').filter(Boolean)
const { stats, plate } = computeStats(lines)
test('stats come from the reel, not typed in', () => {
  expect(stats.peers).toBe(50); expect(stats.sybils).toBe(5); expect(stats.sybilAt).toBeCloseTo(10.2, 1); expect(stats.firstScorePruneAt).toBeCloseTo(11.9, 1)
  expect(stats.heartbeatsToPrune).toBe(2); expect(stats.eclipseTarget).toBe('peer-10'); expect(stats.clearedAt).toBeCloseTo(24.1, 1); expect(stats.healedInS).toBeGreaterThan(0); expect(stats.healedInS).toBeLessThan(5)
  expect(stats.deliveryPct).toBeGreaterThanOrEqual(90); expect(stats.avgHops).toBeGreaterThan(0); expect(stats.firstPublishAt).toBeCloseTo(5.8, 1)
})
test('plate frames: T+8..T+24 at 0.5 s, compact, stamps ≤ 24 chars and derived', () => {
  expect(plate.from).toBe(8); expect(plate.to).toBe(24); expect(plate.frames.length).toBeGreaterThanOrEqual(31); expect(plate.frames.length).toBeLessThanOrEqual(34)
  expect(plate.nodes).toHaveLength(50); for (const f of plate.frames) { expect(f.s).toHaveLength(50); expect(f.b).toHaveLength(50); expect(f.m.length).toBeLessThanOrEqual(40); expect(f.stamp.length).toBeLessThanOrEqual(STAMP_MAX) }
  expect(plate.frames.find(f => f.t >= 10.5)!.stamp).toBe('SYBIL FLOOD · T+10S'); expect(plate.frames.at(-1)!.stamp).toBe('CLEARED · T+24S'); expect(plate.frames.some(f => f.stamp.startsWith('ECLIPSE · N10 ·'))).toBe(true)
  expect(plate.frames.find(f => f.t >= 8)!.a).toEqual([]); expect(plate.frames.find(f => f.t >= 10.5)!.a).toHaveLength(5)
  expect(JSON.stringify(plate).length).toBeLessThan(PLATE_MAX_BYTES)
})
test('the committed JSON files match a fresh run', () => {
  expect(JSON.parse(readFileSync(join(__dirname, '../lib/reel-stats.json'), 'utf8'))).toMatchObject({ reel: 'sybil-eclipse', peers: 50, sybils: 5 })
  expect(JSON.parse(readFileSync(join(__dirname, '../lib/plate-frames.json'), 'utf8')).frames.length).toBe(plate.frames.length)
})
