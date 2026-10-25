import { test, expect } from 'vitest'
import { formatTime, formatNumber, fmtCount, fmtLatency, signed, shortName, shortId, isAttackerId, isPruned, isSimPeer, cdfStats } from '@/lib/format'
test('formatTime rounds before splitting', () => {
  expect(formatTime(119.96)).toBe('2:00'); expect(formatTime(12.34)).toBe('12.3s'); expect(formatTime(-1)).toBe('0.0s'); expect(formatTime(NaN)).toBe('0.0s')
})
test('shortName / shortId / isAttackerId / isPruned / isSimPeer', () => {
  expect(shortName({ peer_id: 'peer-12', index: 12 })).toBe('n12')
  expect(shortName({ peer_id: 'sybil-0', index: 50 })).toBe('sybil-0')
  expect(shortId('peer-7')).toBe('n7'); expect(shortId('eclipse-1')).toBe('eclipse-1')
  expect(isAttackerId('eclipse-3')).toBe(true); expect(isAttackerId('sybil-0')).toBe(true); expect(isAttackerId('peer-3')).toBe(false)
  expect(isPruned({ state: 'attacker', connected_peers: [] })).toBe(true)
  expect(isPruned({ state: 'attacker', connected_peers: ['peer-1'] })).toBe(false)
  expect(isPruned({ state: 'idle', connected_peers: [] })).toBe(false)
  expect(isSimPeer({})).toBe(true); expect(isSimPeer({ is_real: true })).toBe(false); expect(isSimPeer({ is_telemetry: true })).toBe(false)
})
test('fmtCount / formatNumber / fmtLatency / signed / cdfStats', () => {
  expect(fmtCount(1284)).toBe('1,284'); expect(fmtCount(61900)).toBe('61.9K'); expect(formatNumber(1_200_000)).toBe('1.2M')
  expect(fmtLatency(1200)).toBe('1.2s'); expect(fmtLatency(190.4)).toBe('190ms')
  expect(signed(-0.25)).toBe('-0.25'); expect(signed(1)).toBe('+1.00')
  expect(cdfStats([{ percentile: 0, latency_ms: 10 }, { percentile: 50, latency_ms: 40 }, { percentile: 100, latency_ms: 90 }])).toEqual({ min: 10, max: 90, p50: 40 })
})
