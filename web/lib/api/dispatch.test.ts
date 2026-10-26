import { test, expect, beforeEach } from 'vitest'
import { dispatchFrame, flushEvents, subscribeEvents, pendingEventCount } from '@/lib/api/dispatch'
import { useStore } from '@/lib/store'
import { snapWith } from '@/lib/fixtures'
import type { AppEvent } from '@/lib/types'
beforeEach(() => { useStore.setState(useStore.getInitialState(), true); flushEvents() })

test('typed frames route to appliers; events batch until flush; subscribers see the batch once', () => {
  const seen: AppEvent[][] = []; const off = subscribeEvents(b => seen.push(b))
  dispatchFrame({ type: 'gap', dropped: 2 }); expect(useStore.getState().droppedEvents).toBe(2)
  dispatchFrame({ at: 1, event_type: 'ClockTick', category: 'clock' }); expect(pendingEventCount()).toBe(1); expect(useStore.getState().events).toHaveLength(0)
  flushEvents(); expect(useStore.getState().events).toHaveLength(1); expect(seen).toHaveLength(1); expect(pendingEventCount()).toBe(0)
  flushEvents(); expect(seen).toHaveLength(1)
  off(); dispatchFrame({ at: 2, event_type: 'ClockTick', category: 'clock' }); flushEvents(); expect(seen).toHaveLength(1)
})
test('a typed frame flushes pending events first, so a newer snapshot time wins over an older ClockTick', () => {
  dispatchFrame({ at: 0.5, event_type: 'ClockTick', category: 'clock' })
  dispatchFrame(snapWith(['peer-0'], { time: 1.5 }))
  expect(useStore.getState().events).toHaveLength(1); expect(useStore.getState().simTime).toBe(1.5); expect(pendingEventCount()).toBe(0)
})
test('every typed frame type reaches its applier', () => {
  dispatchFrame({ type: 'edges', edges: [['a', 'b']] }); expect(useStore.getState().edges).toEqual([['a', 'b']])
  dispatchFrame({ type: 'scenario', active: false, scenario: null }); expect(useStore.getState().activeScenario).toBeNull()
  dispatchFrame({ type: 'telemetry_status', active: true, peer_count: 1, peers: [] }); expect(useStore.getState().telemetry.peerCount).toBe(1)
  dispatchFrame({ type: 'metrics', node_count: 1, state_distribution: {}, total_messages_sent: 4, total_messages_received: 0, event_counts: {}, total_events: 0, stream_manager: { open: 0, max: 64, available: 64 }, dht_coordinator: { active: 0, available: 8 } }); expect(useStore.getState().totalMessagesSent).toBe(4)
  dispatchFrame({ type: 'analytics', total_messages: 0, avg_delivery_ratio: 0, avg_propagation_ms: 0, avg_hops: 0, delivery_ratios: [], latency_cdf: [], mesh_stability: {} }); expect(useStore.getState().gossipAnalytics?.total_messages).toBe(0)
})
