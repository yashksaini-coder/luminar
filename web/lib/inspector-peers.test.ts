// web/lib/inspector-peers.test.ts
import { expect, test } from 'vitest'
import { meshPeers, prunedBy, peerEvents, direction } from '@/lib/inspector-peers'
const e = (over: object) => ({ at: 1, event_type: 'GossipMessage', category: 'gossip' as const, ...over })
test('meshPeers is null when the key is absent', () => {
  expect(meshPeers({}, 'peer-10')).toBeNull()
  expect(meshPeers({ 'peer-10': ['eclipse-0', 'eclipse-1', 'eclipse-2', 'eclipse-3'] }, 'peer-10')).toEqual(['eclipse-0', 'eclipse-1', 'eclipse-2', 'eclipse-3'])
})
test('prunedBy lists unique honest pruners of an attacker', () => {
  const ev = [e({ event_type: 'GossipPrune', from_peer: 'peer-1', to_peer: 'sybil-0', reason: 'score' }), e({ event_type: 'GossipPrune', from_peer: 'peer-1', to_peer: 'sybil-0' }), e({ event_type: 'GossipPrune', from_peer: 'peer-4', to_peer: 'sybil-0' }), e({ event_type: 'GossipPrune', from_peer: 'peer-9', to_peer: 'sybil-1' })]
  expect(prunedBy(ev, 'sybil-0')).toEqual(['peer-1', 'peer-4'])
})
test('peerEvents keeps the last 200 touching the peer; direction reads from/to', () => {
  const ev = Array.from({ length: 300 }, (_, i) => e({ at: i, from_peer: i % 3 ? 'peer-2' : 'peer-0', to_peer: 'peer-1' }))
  const mine = peerEvents(ev, 'peer-0'); expect(mine).toHaveLength(100); expect(peerEvents(ev, 'peer-1')).toHaveLength(200)
  expect(direction(e({ from_peer: 'peer-0', to_peer: 'peer-1' }), 'peer-0')).toBe('↑'); expect(direction(e({ from_peer: 'peer-0', to_peer: 'peer-1' }), 'peer-1')).toBe('↓'); expect(direction(e({ peer_id: 'peer-1' }), 'peer-1')).toBe('·')
})
