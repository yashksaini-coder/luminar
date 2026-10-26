import { test, expect, beforeEach } from 'vitest'
import { useStore, MAX_EVENTS, selectPill, selectTimelineTotal, selectStateCounts, selectKpis, selectPrunedCount, selectAttackers } from '@/lib/store'
import { snapWith, peerNode } from '@/lib/fixtures'
import type { AppEvent } from '@/lib/types'
beforeEach(() => useStore.setState(useStore.getInitialState(), true))
const S = () => useStore.getState()

test('defaults', () => {
  expect(S().maxDuration).toBe(300); expect(S().durationStep).toBe(300)
  expect(S().dhtCoordinator).toEqual({ active: 0, available: 8 }); expect(S().streamManager).toEqual({ open: 0, max: 64, available: 64 })
  expect(S().selectedPeer).toBeNull(); expect(S().scale).toEqual({ node: 1, particle: 1, edgeAlpha: 1 })
  expect(S().layoutMode).toBe('force'); expect(S().telemetry).toEqual({ active: false, peerCount: 0 }); expect(S().toasts).toEqual([])
})
test('applyEvents touches only the fields that changed', () => {
  const before = S() as unknown as Record<string, unknown>
  S().applyEvents([{ at: 5.8, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-22', to_peer: 'peer-3', msg_id: 'msg-1' }])
  const after = S() as unknown as Record<string, unknown>
  const changed = Object.keys(after).filter(k => after[k] !== before[k] && typeof after[k] !== 'function')
  expect(changed.sort()).toEqual(['eventCount', 'events'])
})
test('ClockTick moves simTime; SimulationStateChanged applies live and is ignored in reel mode', () => {
  S().applyEvents([{ at: 3.2, event_type: 'ClockTick', category: 'clock' }]); expect(S().simTime).toBe(3.2)
  S().applyEvents([{ at: 3.3, event_type: 'SimulationStateChanged', category: 'simulation', state: 'running', speed: 2 }])
  expect(S().playing).toBe(true); expect(S().simState).toBe('running'); expect(S().simSpeed).toBe(2)
  useStore.setState(useStore.getInitialState(), true)
  useStore.setState({ reel: { name: 'x', title: 'x', durationMs: 1, durationSim: 1 } })
  S().applyEvents([{ at: 4, event_type: 'SimulationStateChanged', category: 'simulation', state: 'running', speed: 2 }])
  expect(S().playing).toBe(false); expect(S().simSpeed).toBe(1)
})
test('a batch that changes a field and reverts it ends on the last value', () => {
  S().applyEvents([{ at: 1, event_type: 'SimulationStateChanged', category: 'simulation', state: 'running', speed: 1 }])
  S().applyEvents([
    { at: 2, event_type: 'SimulationStateChanged', category: 'simulation', state: 'paused', speed: 2 },
    { at: 2.1, event_type: 'SimulationStateChanged', category: 'simulation', state: 'running', speed: 1 },
    { at: 2.2, event_type: 'ClockTick', category: 'clock' },
    { at: 0, event_type: 'ClockTick', category: 'clock' },
  ])
  expect(S().simState).toBe('running'); expect(S().playing).toBe(true); expect(S().simSpeed).toBe(1); expect(S().simTime).toBe(0)
})
test('applySnapshot rebuilds nodeById, drops a vanished selection, samples score history, honours reel guard', () => {
  S().selectPeer('peer-1')
  S().applySnapshot(snapWith(['peer-0', 'peer-1'])); expect(S().scoreHistory).toEqual([{ t: 0, v: 1 }]); expect(S().nodeById.get('peer-1')?.index).toBe(1)
  expect(S().playing).toBe(true); expect(S().simState).toBe('running')
  S().applySnapshot(snapWith(['peer-0'])); expect(S().selectedPeer).toBeNull(); expect(S().highlightPeers).toEqual([]); expect(S().nodeById.has('peer-1')).toBe(false)
  useStore.setState({ reel: { name: 'x', title: 'x', durationMs: 1, durationSim: 1 }, playing: false })
  S().applySnapshot(snapWith(['peer-0'], { state: 'running', speed: 3, time: 7 }))
  expect(S().playing).toBe(false); expect(S().simSpeed).toBe(1); expect(S().simTime).toBe(7)
})
test('geoAvailable follows real nodes; setLayoutMode guards geo and drops an invisible selection', () => {
  S().applySnapshot(snapWith(['peer-0'])); expect(S().geoAvailable).toBe(false)
  S().setLayoutMode('geo'); expect(S().layoutMode).toBe('force')
  S().applySnapshot({ ...snapWith(['peer-0']), nodes: [peerNode('peer-0', 0), peerNode('obs-1', 1, { is_real: true, x: 10, y: 20 })] }); expect(S().geoAvailable).toBe(true)
  S().selectPeer('peer-0'); S().setLayoutMode('geo', { remember: true })
  expect(S().layoutMode).toBe('geo'); expect(S().layoutBeforeGeo).toBe('force'); expect(S().selectedPeer).toBeNull()
})
test('events ring caps at MAX_EVENTS; gap counts dropped', () => {
  S().applyEvents(Array.from({ length: 2500 }, (_, i): AppEvent => ({ at: i, event_type: 'ClockTick', category: 'clock' })))
  expect(S().events).toHaveLength(MAX_EVENTS); expect(S().events[0].at).toBe(500); expect(S().eventCount).toBe(2500)
  S().applyGap({ type: 'gap', dropped: 7 }); S().applyGap({ type: 'gap', dropped: 2 }); expect(S().droppedEvents).toBe(9)
})
test('narrator beats: phase, first score prune to a sybil, fault cleared, healed', () => {
  S().applyEvents([{ at: 10.2, event_type: 'ScenarioPhaseFired', category: 'simulation', label: 'Sybil attack: 5 attackers graft in' }])
  expect(S().caption).toMatchObject({ text: 'Sybil attack: 5 attackers graft in', kind: 'phase', at: 10.2 })
  S().applyEvents([
    { at: 11.9, event_type: 'GossipPrune', category: 'gossip', from_peer: 'peer-42', to_peer: 'sybil-3', reason: 'score' },
    { at: 12.0, event_type: 'GossipPrune', category: 'gossip', from_peer: 'peer-1', to_peer: 'sybil-0', reason: 'score' },
    { at: 12.1, event_type: 'GossipMessage', category: 'gossip', from_peer: 'sybil-0', to_peer: 'peer-1', msg_id: 'spam-7' },
  ])
  expect(S().caption?.text).toBe('First Sybil pruned by score'); expect(S().invalidCount).toBe(1); expect(S().narrator.firstSybilPrunedAt).toBe(11.9)
  S().applyEvents([{ at: 24.1, event_type: 'FaultCleared', category: 'fault', fault_type: 'sybil' }])
  useStore.setState({ simTime: 25.5 })
  S().applyAnalytics({ type: 'analytics', total_messages: 9, avg_delivery_ratio: 1, avg_propagation_ms: 190, avg_hops: 4, recent_delivery_ratio: 0.97, delivery_ratios: [], latency_cdf: [], mesh_stability: {} })
  expect(S().beats.map(b => [b.kind, b.time])).toEqual([['phase', 10.2], ['prune', 11.9], ['fault', 24.1], ['healed', 25.5]])
  expect(S().caption?.text).toBe('Mesh healed in 1.4s'); expect(S().phaseLabel).toBe('Sybil attack: 5 attackers graft in')
  S().applyAnalytics({ type: 'analytics', total_messages: 10, avg_delivery_ratio: 1, avg_propagation_ms: 190, avg_hops: 4, recent_delivery_ratio: 0.99, delivery_ratios: [], latency_cdf: [], mesh_stability: {} })
  expect(S().beats).toHaveLength(4)   // healed announced once
  expect(S().analyticsHistory).toHaveLength(2); expect(S().analyticsHistory[0]).toEqual({ t: 25.5, delivery: 0.97, propagationMs: 190, hops: 4, degree: 0 })
})
test('activeFaults counts injections since the last clear, past the events ring', () => {
  const fi = { at: 1, event_type: 'FaultInjected', category: 'fault' as const, fault_type: 'sybil' }
  S().applyEvents([fi, fi])
  S().applyEvents(Array.from({ length: MAX_EVENTS }, (_, i) => ({ at: 2 + i, event_type: 'GossipMessage', category: 'gossip' as const })))
  expect(S().events.some(e => e.event_type === 'FaultInjected')).toBe(false); expect(S().activeFaults).toBe(2)
  S().applyEvents([{ at: 9000, event_type: 'FaultCleared', category: 'fault' }, fi])
  expect(S().activeFaults).toBe(1)
})
test('BlockSeen lights observers between snapshots', () => {
  S().applySnapshot({ ...snapWith([]), nodes: [peerNode('obs-1', 0, { is_real: true }), peerNode('obs-2', 1, { is_real: true, state: 'decoded' })] })
  S().applyEvents([{ at: 1, event_type: 'BlockSeen', category: 'live', peer_id: 'obs-1', seen_ms: 320, first: true, slot: 1 }])
  expect(S().nodeById.get('obs-1')).toMatchObject({ state: 'origin', seen_ms: 320 }); expect(S().nodeById.get('obs-2')?.state).toBe('idle')
})
test('applyScenario, applyMetrics, applyTelemetryStatus, applyEdges', () => {
  const fi = { at: 1, event_type: 'FaultInjected', category: 'fault' as const, fault_type: 'sybil' }; S().applyEvents([fi, fi]); expect(S().activeFaults).toBe(2)
  S().applyScenario({ type: 'scenario', active: true, scenario: { id: 'a', name: 'A', description: '', icon: '', topology_type: 'random', phases: [], duration: 90 } })
  expect(S().maxDuration).toBe(90); expect(S().activeScenario?.scenario?.id).toBe('a'); expect(S().beats).toEqual([]); expect(S().activeFaults).toBe(0)   // a fresh run: the backend's FaultCleared never reaches the socket
  S().applyScenario({ type: 'scenario', active: false, scenario: null }); expect(S().activeScenario).toBeNull(); expect(S().maxDuration).toBe(90)
  S().applyMetrics({ type: 'metrics', node_count: 50, state_distribution: { idle: 50 }, total_messages_sent: 3, total_messages_received: 9, event_counts: { gossip: 12 }, total_events: 12, stream_manager: { open: 5, max: 64, available: 59 }, dht_coordinator: { active: 1, available: 8 } })
  expect(S().stateDistribution).toEqual({ idle: 50 }); expect(S().streamManager.open).toBe(5)
  S().applyTelemetryStatus({ type: 'telemetry_status', active: true, peer_count: 2, peers: [], mainnet: { enabled: true, observers: 150 } })
  expect(S().telemetry).toEqual({ active: true, peerCount: 2 }); expect(S().mainnet?.enabled).toBe(true)
  S().applyEdges({ type: 'edges', edges: [['peer-0', 'peer-1']] }); expect(S().edges).toEqual([['peer-0', 'peer-1']])
})
test('setPref flips scale; toasts queue; resetRun clears the run; selectors', () => {
  S().setPref('stageTheme'); expect(S().stageTheme).toBe(true); expect(S().scale).toEqual({ node: 1.4, particle: 1.8, edgeAlpha: 1.6 })
  S().setPref('stageTheme', false); expect(S().scale).toEqual({ node: 1, particle: 1, edgeAlpha: 1 })
  const id = S().pushToast('Sybil ×5 injected', 'ok'); S().pushToast('Link copied'); expect(S().toasts.map(t => t.text)).toEqual(['Sybil ×5 injected', 'Link copied']); expect(S().toasts[1].kind).toBe('info')
  S().dismissToast(id); expect(S().toasts).toHaveLength(1)
  S().applyEvents([{ at: 9, event_type: 'ClockTick', category: 'clock' }]); S().selectPeer('peer-0', ['peer-1']); S().resetRun()
  expect(S().events).toEqual([]); expect(S().eventCount).toBe(0); expect(S().simTime).toBe(0); expect(S().selectedPeer).toBeNull(); expect(S().highlightPeers).toEqual([]); expect(S().caption).toBeNull()
  expect(S().connecting).toBe(true); expect(selectPill(S())).toBe('connecting'); S().setConnected(true); expect(selectPill(S())).toBe('live')
  useStore.setState(useStore.getInitialState(), true); S().setConnected(false); expect(selectPill(S())).toBe('offline')   // close without open
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1000, durationSim: 40.5 } }); expect(selectPill(S())).toBe('reel'); expect(selectTimelineTotal(S())).toBe(40.5)
  S().applySnapshot({ ...snapWith([]), nodes: [peerNode('peer-0', 0), peerNode('sybil-0', 1, { state: 'attacker' }), peerNode('sybil-1', 2, { state: 'attacker', connected_peers: ['peer-0'] })] })
  S().applyMetrics({ type: 'metrics', node_count: 1, state_distribution: { idle: 1, attacker: 2 }, total_messages_sent: 0, total_messages_received: 0, event_counts: {}, total_events: 0, stream_manager: { open: 0, max: 64, available: 64 }, dht_coordinator: { active: 0, available: 8 } })
  expect(selectPrunedCount(S())).toBe(1); expect(selectStateCounts(S())).toEqual({ idle: 1, attacker: 1, pruned: 1 })
  // backend state_distribution never counts synthetic attackers: the snapshot nodes are the source for both
  S().applyMetrics({ type: 'metrics', node_count: 1, state_distribution: { idle: 1 }, total_messages_sent: 0, total_messages_received: 0, event_counts: {}, total_events: 0, stream_manager: { open: 0, max: 64, available: 64 }, dht_coordinator: { active: 0, available: 8 } })
  expect(selectStateCounts(S())).toEqual({ idle: 1, attacker: 1, pruned: 1 })
  expect(selectAttackers(S()).length).toBe((selectStateCounts(S()).attacker ?? 0) + (selectStateCounts(S()).pruned ?? 0))
  // a recording's first snapshot arrives before any metrics frame: the breakdown still matches the 50 nodes on the map
  useStore.setState({ stateDistribution: {} }); S().applySnapshot({ ...snapWith([]), nodes: [peerNode('peer-0', 0), peerNode('peer-1', 1, { state: 'receiving' }), peerNode('obs-1', 2, { is_real: true })] })
  expect(selectStateCounts(S())).toEqual({ idle: 1, receiving: 1 })   // the real observer is not a simulated peer
  // R2: flat primitives so useShallow can compare them
  expect(selectKpis(S())).toEqual({ delivery: null, propagationMs: null, hops: null, degAvg: null, degMin: null, degMax: null })
})
test('setLayoutMode without remember forgets the remembered layout (R9)', () => {
  useStore.setState({ geoAvailable: true, layoutMode: 'geo', layoutBeforeGeo: 'radial' }); S().setLayoutMode('force')
  expect(S().layoutMode).toBe('force'); expect(S().layoutBeforeGeo).toBeNull()
})
