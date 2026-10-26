// web/lib/log-filter.test.ts
import { expect, test } from 'vitest'
import { initialFilters, toggleFilter, visibleRows, rowClick } from '@/lib/log-filter'
const e = (over: object) => ({ at: 1, event_type: 'GossipMessage', category: 'gossip' as const, ...over })
const node = (id: string, over = {}) => ({ peer_id: id, index: 0, state: 'idle' as const, connected_peers: ['peer-1', 'peer-2', 'peer-3', 'peer-4', 'peer-5', 'peer-6', 'peer-7', 'peer-8', 'peer-9'], x: 0, y: 0, messages_sent: 0, messages_received: 0, gossip_score: 0, ...over })
test('initial filters are every group except clock; toggle flips; alt-click isolates', () => {
  const f = initialFilters(); expect(f.has('clock')).toBe(false); expect(f.size).toBe(8)
  expect(toggleFilter(f, 'clock', false).has('clock')).toBe(true); expect(toggleFilter(f, 'gossip', false).has('gossip')).toBe(false)
  expect([...toggleFilter(f, 'fault', true)]).toEqual(['fault'])
})
test('visibleRows keeps the last 500 matching rows, oldest first', () => {
  const rows = Array.from({ length: 1200 }, (_, i) => e({ at: i, category: i % 2 ? 'gossip' : 'clock' }))
  const v = visibleRows(rows, new Set(['gossip']))
  expect(v).toHaveLength(500); expect(v[0].at).toBe(201); expect(v.at(-1)!.at).toBe(1199)
})
test('rowClick returns null for a hidden or unknown peer', () => {
  const obs = node('obs-1', { is_real: true })
  expect(rowClick(e({ peer_id: 'obs-1' }), { nodeById: new Map([['obs-1', obs]]), layoutMode: 'force', selectedPeer: null })).toBeNull()
  expect(rowClick(e({ peer_id: 'peer-9' }), { nodeById: new Map(), layoutMode: 'force', selectedPeer: null })).toBeNull()
})
test('rowClick selects with to_peer + first 8 connected for gm, and toggles off', () => {
  const s = { nodeById: new Map([['peer-0', node('peer-0')]]), layoutMode: 'force' as const, selectedPeer: null }
  expect(rowClick(e({ from_peer: 'peer-0', to_peer: 'peer-3' }), s)).toEqual({ select: 'peer-0', highlight: ['peer-3', 'peer-1', 'peer-2', 'peer-4', 'peer-5', 'peer-6', 'peer-7', 'peer-8'] })
  expect(rowClick(e({ event_type: 'GossipPrune', from_peer: 'peer-0', to_peer: 'sybil-1' }), s)).toEqual({ select: 'peer-0', highlight: ['sybil-1'] })
  expect(rowClick(e({ peer_id: 'peer-0' }), { ...s, selectedPeer: 'peer-0' })).toEqual({ select: null, highlight: [] })
})
