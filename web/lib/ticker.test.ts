import { test, expect } from 'vitest'
import { useStore } from '@/lib/store'
import { tickerCells } from '@/lib/ticker'
import { snapWith } from '@/lib/fixtures'
import type { AnalyticsFrame } from '@/lib/types'

const base = () => useStore.getInitialState()
const ga = (over: Partial<AnalyticsFrame> = {}): AnalyticsFrame => ({ type: 'analytics', total_messages: 9, avg_delivery_ratio: 0.91, avg_propagation_ms: 190.4, avg_hops: 4.04, recent_delivery_ratio: 0.97, delivery_ratios: [], latency_cdf: [], mesh_stability: { avg_degree: 5.8, min_degree: 4, max_degree: 6 }, ...over })
test('before the first message: free play and dashes, nothing in danger', () => {
  const cells = tickerCells({ ...base(), gossipAnalytics: { ...ga(), total_messages: 0 } })
  expect(cells.map(c => c.key)).toEqual(['phase', 'delivery', 'mesh d', 'hops', 'e2e', 'attackers', 'invalid', 'T+'])
  expect(cells.map(c => c.value)).toEqual(['free play', '—', '—', '—', '—', '0', '0', '0.0s']); expect(cells.some(c => c.danger)).toBe(false)
})
test('with analytics, attackers and spam: recent delivery preferred, flame on attackers and invalid', () => {
  const nodes = [...snapWith(['peer-0']).nodes, { ...snapWith(['sybil-0']).nodes[0], state: 'attacker' as const, connected_peers: ['peer-0'] }, { ...snapWith(['sybil-1']).nodes[0], state: 'attacker' as const, connected_peers: [] }]
  const cells = tickerCells({ ...base(), nodes, gossipAnalytics: ga(), invalidCount: 12, simTime: 12.34, phaseLabel: 'Sybil attack: 5 attackers graft in' })
  expect(cells.map(c => c.value)).toEqual(['Sybil attack: 5 attackers graft in', '97%', '5.8', '4.0', '190 ms', '2 · 1 pruned', '12', '12.3s'])
  expect(cells.filter(c => c.danger).map(c => c.key)).toEqual(['attackers', 'invalid'])
})
test('scenario name when no phase has fired; geo + mainnet replaces the six simulated-mesh cells with the arrival readout', () => {
  const s = { ...base(), activeScenario: { active: true, scenario: { id: 'x', name: 'Healthy mesh', description: '', icon: '', topology_type: '', phases: [], duration: 60 } } }
  expect(tickerCells(s)[0].value).toBe('Healthy mesh')
  const geo = tickerCells({ ...s, layoutMode: 'geo', mainnet: { enabled: true, observers: 150, with_geo: 138, slot: 15466393, first_ms: 3247, first_client: 'lighthouse', p50_ms: 1850 } })
  expect(geo.slice(1, 5).map(c => [c.key, c.value])).toEqual([['slot', '15466393'], ['first seen', '3247 ms · lighthouse'], ['p50', '1850 ms'], ['observers', '138']]); expect(geo.map(c => c.key)).toEqual(['phase', 'slot', 'first seen', 'p50', 'observers', 'T+'])
  expect(tickerCells({ ...s, layoutMode: 'force', mainnet: { enabled: true, observers: 1 } })[1].key).toBe('delivery')
})
