/** One router for live socket frames and reel frames: typed frames go straight to their store applier, events batch until flushEvents(). */

import { useStore } from '@/lib/store'
import { isTypedFrame } from '@/lib/types'
import type { AppEvent, WsFrame } from '@/lib/types'

let pending: AppEvent[] = []
const subscribers = new Set<(batch: AppEvent[]) => void>()

export function dispatchFrame(frame: WsFrame): void {
  if (!isTypedFrame(frame)) { pending.push(frame); return }
  flushEvents()   // older events land before a newer typed frame
  const s = useStore.getState()
  switch (frame.type) {
    case 'snapshot': s.applySnapshot(frame); break
    case 'metrics': s.applyMetrics(frame); break
    case 'analytics': s.applyAnalytics(frame); break
    case 'telemetry_status': s.applyTelemetryStatus(frame); break
    case 'edges': s.applyEdges(frame); break
    case 'scenario': s.applyScenario(frame); break
    case 'gap': s.applyGap(frame); break
    default: break   // unknown type strings are ignored
  }
}

export function flushEvents(): void {
  if (pending.length === 0) return
  const batch = pending
  pending = []
  useStore.getState().applyEvents(batch)
  for (const cb of subscribers) cb(batch)
}

export function subscribeEvents(cb: (batch: AppEvent[]) => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

export function pendingEventCount(): number {
  return pending.length
}
