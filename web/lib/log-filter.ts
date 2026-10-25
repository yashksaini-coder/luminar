/** Event log rail logic: chip toggling, visible rows and row-click selection. */
import { isNodeVisible } from '@/components/map/layout'
import { DEFAULT_OFF, FILTER_GROUPS } from '@/lib/event-codes'
import type { AppState } from '@/lib/store'
import type { AppEvent, EventCategory } from '@/lib/types'

export function initialFilters(): Set<EventCategory> {
  return new Set(FILTER_GROUPS.map(([, cat]) => cat).filter(cat => !DEFAULT_OFF.has(cat)))
}

/** Alt/Meta-click isolates the chip; a plain click flips it. */
export function toggleFilter(active: ReadonlySet<EventCategory>, cat: EventCategory, isolate: boolean): Set<EventCategory> {
  if (isolate) return new Set([cat])
  const next = new Set(active)
  if (!next.delete(cat)) next.add(cat)
  return next
}

/** The last `cap` matching rows, oldest first. */
export function visibleRows(events: AppEvent[], active: ReadonlySet<EventCategory>, cap = 500): AppEvent[] {
  const out: AppEvent[] = []
  for (let i = events.length - 1; i >= 0 && out.length < cap; i--) {
    if (active.has(events[i].category)) out.push(events[i])
  }
  return out.reverse()
}

export function rowClick(
  evt: AppEvent,
  s: Pick<AppState, 'nodeById' | 'layoutMode' | 'selectedPeer'>,
): { select: string | null; highlight: string[] } | null {
  const id = evt.peer_id ?? evt.from_peer
  const nd = id ? s.nodeById.get(id) : undefined
  if (!id || !isNodeVisible(s.layoutMode, nd)) return null
  if (s.selectedPeer === id) return { select: null, highlight: [] }
  const highlight = evt.to_peer ? [evt.to_peer] : []
  if (evt.event_type === 'GossipMessage') highlight.push(...nd!.connected_peers.slice(0, 8))
  return { select: id, highlight: [...new Set(highlight)] }
}
