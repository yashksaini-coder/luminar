import { expect, test } from 'vitest'
import { particlesFor } from '@/components/map/renderer'
import type { AppEvent } from '@/lib/types'

const pick = (ids: string[]) => ids[0]
// R10: the neighbour lookup is a parameter; the renderer passes id => nodeById.get(id)?.connected_peers ?? []
const NB: Record<string, string[]> = { 'peer-1': ['peer-2', 'peer-3'], 'peer-5': ['peer-1', 'peer-2', 'peer-3', 'peer-4', 'peer-6', 'peer-7'] }
const nb = (id: string) => NB[id] ?? []
const E = (p: Partial<AppEvent>): AppEvent => ({ at: 1, event_type: 'GossipMessage', category: 'gossip', ...p })

test('trigger table', () => {
  expect(particlesFor(E({ from_peer: 'peer-1', to_peer: 'peer-2' }), pick, nb)).toEqual([{ from: 'peer-1', to: 'peer-2', kind: 'message', fizzle: false }])
  expect(particlesFor(E({ from_peer: 'sybil-3', to_peer: 'peer-2', msg_id: 'spam-9' }), pick, nb)).toEqual([{ from: 'sybil-3', to: 'peer-2', kind: 'spam', fizzle: false }])
  expect(particlesFor(E({ from_peer: 'eclipse-0', to_peer: 'peer-2' }), pick, nb)[0].kind).toBe('message')   // only sybil-* is spam
  expect(particlesFor(E({ from_peer: 'peer-1', to_peer: 'peer-2', dropped: true }), pick, nb)[0].fizzle).toBe(true)
  expect(particlesFor(E({ from_peer: 'peer-1', to_peer: '' }), pick, nb)).toEqual([])   // origin publish draws nothing
  expect(particlesFor(E({ event_type: 'GossipGraft', from_peer: 'a', to_peer: 'b' }), pick, nb)[0].kind).toBe('graft')
  expect(particlesFor(E({ event_type: 'GossipPrune', from_peer: 'a', to_peer: 'b' }), pick, nb)[0].kind).toBe('prune')
  expect(particlesFor(E({ event_type: 'DHTQueryStarted', category: 'dht', peer_id: 'peer-1' }), ids => ids[0], nb)).toEqual([{ from: 'peer-1', to: 'peer-2', kind: 'dht', fizzle: false }])
  expect(particlesFor(E({ event_type: 'DHTQueryStarted', category: 'dht', initiator: 'peer-1' }), ids => ids[1], nb)).toEqual([{ from: 'peer-1', to: 'peer-3', kind: 'dht', fizzle: false }])   // the backend field
  expect(particlesFor(E({ event_type: 'DHTQueryStarted', category: 'dht', initiator: 'peer-9' }), pick, nb)).toEqual([])   // no neighbours
  const eclipse = particlesFor(E({ event_type: 'FaultInjected', category: 'fault', fault_type: 'eclipse', target: 'peer-5' }), pick, nb)
  expect(eclipse.length).toBeGreaterThan(0); expect(eclipse.every(p => p.kind === 'fault' && p.from === 'peer-5')).toBe(true)
  expect(particlesFor(E({ event_type: 'FaultInjected', category: 'fault', fault_type: 'sybil', count: 5 }), pick, nb)).toEqual([])   // target not a node id → no burst
  expect(particlesFor(E({ event_type: 'ClockTick', category: 'clock' }), pick, nb)).toEqual([])
  expect(particlesFor(E({ event_type: 'FaultInjected', category: 'fault', fault_type: 'drop', target: 'peer-5' }), pick, nb).map(p => p.to)).toEqual(['peer-1', 'peer-2', 'peer-3', 'peer-4'])   // first 4 peers only
})
