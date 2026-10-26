/** Pure inspector logic: mesh vs topology peers, "pruned by", per-peer events, direction glyph (A.28). */
import { isAttackerId } from '@/lib/format'
import type { AppEvent } from '@/lib/types'

/** null when `id` is not a key (mesh hidden above 100 nodes, or attacker). */
export function meshPeers(mesh: Record<string, string[]>, id: string): string[] | null {
  return Object.hasOwn(mesh, id) ? mesh[id] : null
}

/** Honest peers whose mesh contains `id`: an attacker's mesh view (R8 reverse lookup). */
export function meshHolders(mesh: Record<string, string[]>, id: string): string[] {
  return Object.keys(mesh).filter(p => !isAttackerId(p) && mesh[p].includes(id))
}

/** Unique honest from_peer of GossipPrune with to_peer === id, in first-seen order. */
export function prunedBy(events: AppEvent[], id: string): string[] {
  const out = new Set<string>()
  for (const e of events) {
    if (e.event_type === 'GossipPrune' && e.to_peer === id && e.from_peer && !isAttackerId(e.from_peer)) out.add(e.from_peer)
  }
  return [...out]
}

export function peerEvents(events: AppEvent[], id: string, cap = 200): AppEvent[] {
  return events.filter(e => e.peer_id === id || e.from_peer === id || e.to_peer === id).slice(-cap)
}

export function direction(evt: AppEvent, id: string): '↑' | '↓' | '·' {
  return evt.from_peer === id ? '↑' : evt.to_peer === id ? '↓' : '·'
}
