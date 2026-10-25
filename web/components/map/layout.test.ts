import { beforeEach, expect, test } from 'vitest'
import { peers, ring } from '@/lib/fixtures'
import { attackerLayoutEdges, computeLayout, edgesKey, isNodeVisible, resetLayoutMemory, topologyKey } from './layout'

beforeEach(resetLayoutMemory)

test('snapshot before edges: finite positions on the rim, then one cold relayout when edges land', () => {
  const a = computeLayout('force', peers(10), [], edgesKey([]))
  expect(a.positions.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  const b = computeLayout('force', peers(10), ring(10), edgesKey(ring(10)))
  expect(b.positions).not.toEqual(a.positions)
})

test('warm relayout pins known nodes and places a new attacker beside its victim', () => {
  const base = computeLayout('force', peers(20), ring(20), 'k')
  const nodes = [...peers(20), { ...peers(1)[0], peer_id: 'sybil-0', index: 20, state: 'attacker' as const, connected_peers: ['peer-3'] }]
  const next = computeLayout('force', nodes, [...ring(20), ...attackerLayoutEdges(nodes)], 'k')
  for (let i = 0; i < 20; i++) expect(next.positions[i]).toEqual(base.positions[i])
  const d = Math.hypot(next.positions[20][0] - base.positions[3][0], next.positions[20][1] - base.positions[3][1])
  expect(d).toBeLessThan(Math.max(40, 400 / Math.sqrt(21)) * 2.5)
})

test('attackerLayoutEdges: pruned attacker tethers weakly to ≤2 last_targets', () => {
  expect(attackerLayoutEdges([{ ...peers(1)[0], peer_id: 'sybil-1', state: 'attacker', connected_peers: [], last_targets: ['peer-1', 'peer-2', 'peer-3'] }]))
    .toEqual([['sybil-1', 'peer-1', true], ['sybil-1', 'peer-2', true]])
})

test('geo flips y and hides sim peers; radial centres the highest degree; visibility rule', () => {
  const real = { ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 10, y: -25 }
  expect(computeLayout('geo', [real], []).positions[0]).toEqual([10, 25])
  expect(isNodeVisible('geo', peers(1)[0])).toBe(false)
  expect(isNodeVisible('force', real)).toBe(false)
  expect(isNodeVisible('force', undefined)).toBe(false)
  const r = computeLayout('radial', peers(7), [['peer-3', 'peer-0'], ['peer-3', 'peer-1'], ['peer-3', 'peer-2']])
  expect(r.positions[3]).toEqual([0, 0])
})

test('topologyKey ignores state changes and hidden nodes', () => {
  const a = topologyKey('force', peers(5), ring(5))
  const b = topologyKey('force', peers(5).map(p => ({ ...p, state: 'decoded' as const })), ring(5))
  expect(a).toBe(b)
  const withObs = [...peers(5), { ...peers(1)[0], peer_id: 'obs-1', index: 5, is_real: true }]
  expect(topologyKey('force', withObs, ring(5))).toBe(a)
  expect(topologyKey('geo', withObs, ring(5))).not.toBe(a)
})
