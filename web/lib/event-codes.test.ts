import { test, expect } from 'vitest'
import { TYPE_CODES, DEFAULT_TYPE, FILTER_GROUPS, DEFAULT_OFF, formatNode, buildDetail, inspectorDetail } from '@/lib/event-codes'
test('type codes and filter groups', () => {
  expect(TYPE_CODES.GossipPrune).toEqual({ code: 'gp', tone: 'alarm' }); expect(TYPE_CODES.GossipGraft.tone).toBe('ok'); expect(Object.keys(TYPE_CODES)).toHaveLength(23); expect(DEFAULT_TYPE.code).toBe('??')
  expect(FILTER_GROUPS.map(g => g[0])).toEqual(['Gossip', 'Conn', 'Stream', 'DHT', 'Fault', 'Health', 'Clock', 'Sim', 'Live']); expect([...DEFAULT_OFF]).toEqual(['clock'])
  for (const { tone } of Object.values(TYPE_CODES)) expect(['fg', 'fg2', 'fg3', 'ok', 'alarm']).toContain(tone)   // never a colour string
})
test('details', () => {
  expect(buildDetail({ at: 0, event_type: 'GossipPrune', category: 'gossip', to_peer: 'sybil-3', reason: 'score' })).toBe('sybil-3 · score')
  expect(buildDetail({ at: 0, event_type: 'FaultInjected', category: 'fault', fault_type: 'sybil', count: 5 })).toBe('sybil × 5')
  expect(buildDetail({ at: 0, event_type: 'BlockSeen', category: 'live', seen_ms: 3247, client: 'lighthouse', first: true })).toBe('3247 ms · lighthouse · first')
  expect(buildDetail({ at: 0, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-4', to_peer: 'peer-9', msg_id: 'msg-1', hops: 2 })).toContain('n9')
  expect(formatNode({ at: 0, event_type: 'FaultCleared', category: 'fault' })).toBe('net')
  expect(formatNode({ at: 0, event_type: 'ScenarioPhaseFired', category: 'simulation' })).toBe('sim')
  expect(formatNode({ at: 0, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-4' })).toBe('n4')
  expect(inspectorDetail({ at: 0, event_type: 'GossipMessage', category: 'gossip', msg_id: 'spam-1' })).toBe('spam')
  expect(inspectorDetail({ at: 0, event_type: 'GossipIHave', category: 'gossip', msg_ids: ['a', 'b', 'c'] })).toBe('3 ids')
})
