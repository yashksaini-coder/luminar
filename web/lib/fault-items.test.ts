import { expect, test } from 'vitest'
import { faultItems } from '@/lib/fault-items'
const node = (id: string, extra = {}) => ({ peer_id: id, index: 0, state: 'idle' as const, connected_peers: [], x: 0, y: 0, messages_sent: 0, messages_received: 0, gossip_score: 0, ...extra })
test('eclipse and drop are disabled with a reason when no sim peer is selected', () => {
  const items = faultItems({ selectedPeer: null, nodeById: new Map(), activeFaults: 0 }, 5)
  expect(items.map(i => i.kind)).toEqual(['partition', 'sybil', 'eclipse', 'drop', 'clear-all'])
  expect(items[2]).toMatchObject({ disabled: true, reason: 'select a peer first' }); expect(items[3]).toMatchObject({ disabled: true, reason: 'select a peer first' })
  expect(items[1].aside).toBe('5 peers'); expect(items[0].aside).toBe('split by layout side')
})
test('a selected sim peer enables eclipse/drop with its short name; an observer does not', () => {
  const ok = faultItems({ selectedPeer: 'peer-7', nodeById: new Map([['peer-7', node('peer-7', { index: 7 })]]), activeFaults: 0 }, 3)
  expect(ok[2]).toMatchObject({ disabled: false, aside: 'n7' }); expect(ok[1].aside).toBe('3 peers')
  const obs = faultItems({ selectedPeer: 'obs-1', nodeById: new Map([['obs-1', node('obs-1', { is_real: true })]]), activeFaults: 0 }, 5)
  expect(obs[3].disabled).toBe(true)
})
test('clear all shows the active count and is disabled at zero', () => {
  expect(faultItems({ selectedPeer: null, nodeById: new Map(), activeFaults: 1 }, 5)[4]).toMatchObject({ aside: '1 active', disabled: false })
  expect(faultItems({ selectedPeer: null, nodeById: new Map(), activeFaults: 0 }, 5)[4]).toMatchObject({ aside: '0 active', disabled: true })
})
