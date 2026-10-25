/** Event type codes, filter groups and row detail builders (ported from frontend/src/ui/events-panel.ts). */
import { shortId } from '@/lib/format'
import type { AppEvent, EventCategory } from '@/lib/types'

/** ok → --signal, alarm → --flame; never a colour string. */
export type Tone = 'fg' | 'fg2' | 'fg3' | 'ok' | 'alarm'

export const TYPE_CODES: Record<string, { code: string; tone: Tone }> = {
  GossipMessage: { code: 'gm', tone: 'fg2' },
  GossipGraft: { code: 'gf', tone: 'ok' },
  GossipPrune: { code: 'gp', tone: 'alarm' },
  GossipIHave: { code: 'ih', tone: 'fg3' },
  GossipIWant: { code: 'iw', tone: 'fg3' },
  PeerConnected: { code: 'cn', tone: 'fg2' },
  PeerDisconnected: { code: 'dc', tone: 'alarm' },
  StreamOpened: { code: 'so', tone: 'fg2' },
  StreamClosed: { code: 'sc', tone: 'fg3' },
  StreamTimeout: { code: 'st', tone: 'alarm' },
  SemaphoreBlocked: { code: 'sb', tone: 'fg3' },
  DHTQueryStarted: { code: 'ds', tone: 'fg3' },
  DHTQueryCompleted: { code: 'dd', tone: 'fg3' },
  DHTQueryFailed: { code: 'df', tone: 'alarm' },
  DHTRoutingTableUpdate: { code: 'dr', tone: 'fg3' },
  FaultInjected: { code: 'fi', tone: 'alarm' },
  FaultCleared: { code: 'fc', tone: 'ok' },
  PeerRecovered: { code: 'pr', tone: 'ok' },
  NodeHealthSnapshot: { code: 'hs', tone: 'fg3' },
  BlockSeen: { code: 'bs', tone: 'ok' },
  ClockTick: { code: 'ck', tone: 'fg3' },
  SimulationStateChanged: { code: 'ss', tone: 'fg3' },
  ScenarioPhaseFired: { code: 'sp', tone: 'fg' },
}
export const DEFAULT_TYPE = { code: '??', tone: 'fg3' } as const

export const FILTER_GROUPS: readonly [label: string, cat: EventCategory][] = [
  ['Gossip', 'gossip'], ['Conn', 'connection'], ['Stream', 'stream'], ['DHT', 'dht'],
  ['Fault', 'fault'], ['Health', 'health'], ['Clock', 'clock'], ['Sim', 'simulation'], ['Live', 'live'],
]
/** Clock fires every 100 ms, so it starts filtered out. */
export const DEFAULT_OFF: ReadonlySet<EventCategory> = new Set<EventCategory>(['clock'])

const NET_TYPES = new Set(['FaultInjected', 'FaultCleared'])
const SIM_TYPES = new Set(['ScenarioPhaseFired', 'SimulationStateChanged', 'ClockTick'])

export function formatNode(evt: AppEvent): string {
  const id = evt.peer_id ?? evt.from_peer
  if (id) return shortId(id)
  if (NET_TYPES.has(evt.event_type)) return 'net'
  if (SIM_TYPES.has(evt.event_type)) return 'sim'
  return '—'
}

export function buildDetail(evt: AppEvent): string {
  const to = evt.to_peer ? shortId(evt.to_peer) : ''
  switch (evt.event_type) {
    case 'GossipMessage': return [to, evt.msg_id].filter(Boolean).join(' · ')
    case 'GossipPrune': return [to, evt.reason].filter(Boolean).join(' · ')
    case 'GossipGraft':
    case 'PeerConnected': return to ? `peer=${to}` : ''
    // ih/iw carry only from_peer (already the node column) + msg_ids
    case 'GossipIHave':
    case 'GossipIWant': return Array.isArray(evt.msg_ids) ? `${evt.msg_ids.length} ids` : ''
    case 'PeerDisconnected': return evt.reason ?? ''
    case 'StreamOpened':
    case 'StreamClosed': return to ? `→${to}` : ''
    case 'StreamTimeout': return to ? `→${to}` : 'timeout'
    case 'FaultInjected':
    case 'FaultCleared': {
      const name = String(evt.fault_type ?? evt.fault_id ?? '')
      return typeof evt.count === 'number' ? `${name} × ${evt.count}` : name
    }
    case 'DHTQueryStarted': return `target=${evt.target ? shortId(evt.target) : '?'}`
    case 'DHTQueryCompleted': return evt.hops ? `${evt.hops} hops` : ''
    case 'DHTQueryFailed': return evt.reason ?? 'failed'
    case 'NodeHealthSnapshot': return `score=${typeof evt.score === 'number' ? evt.score.toFixed(2) : '?'}`
    case 'SimulationStateChanged': return evt.state ?? ''
    case 'ScenarioPhaseFired': return String(evt.label ?? '')
    case 'BlockSeen': return `${evt.seen_ms} ms · ${evt.client || '?'}${evt.first ? ' · first' : ''}`
    default: return evt.msg_id ?? evt.topic ?? evt.fault_type ?? ''
  }
}

/** Inspector event-row detail (peer-inspector.ts rowDetail). */
export function inspectorDetail(evt: AppEvent): string {
  if (evt.event_type === 'GossipPrune') return evt.reason ?? ''
  if (evt.event_type === 'GossipIHave' || evt.event_type === 'GossipIWant') return `${evt.msg_ids?.length ?? 0} ids`
  if (evt.event_type === 'GossipMessage') return evt.msg_id?.startsWith('spam-') ? 'spam' : (evt.msg_id ?? '')
  return ''
}
