import { store } from '../store'
import type { AppEvent } from '../types'

// ── 2-letter type codes; colour = consequence (System §3d): red only for failures,
//    green only for graft / recovery, everything else fg/fg2/fg3 ──
const FG = 'var(--lm-fg)', FG2 = 'var(--lm-fg2)', FG3 = 'var(--lm-fg3)'
const OK = 'var(--lm-ok)', DANGER = 'var(--lm-danger)'
export const TYPE_CODES: Record<string, { code: string; color: string }> = {
  GossipMessage:          { code: 'gm', color: FG2 },
  GossipGraft:            { code: 'gf', color: OK },
  GossipPrune:            { code: 'gp', color: DANGER },
  GossipIHave:            { code: 'ih', color: FG3 },
  GossipIWant:            { code: 'iw', color: FG3 },
  PeerConnected:          { code: 'cn', color: FG2 },
  PeerDisconnected:       { code: 'dc', color: DANGER },
  StreamOpened:           { code: 'so', color: FG2 },
  StreamClosed:           { code: 'sc', color: FG3 },
  StreamTimeout:          { code: 'st', color: DANGER },
  SemaphoreBlocked:       { code: 'sb', color: FG3 },
  DHTQueryStarted:        { code: 'ds', color: FG3 },
  DHTQueryCompleted:      { code: 'dd', color: FG3 },
  DHTQueryFailed:         { code: 'df', color: DANGER },
  DHTRoutingTableUpdate:  { code: 'dr', color: FG3 },
  FaultInjected:          { code: 'fi', color: DANGER },
  FaultCleared:           { code: 'fc', color: OK },
  PeerRecovered:          { code: 'pr', color: OK },
  NodeHealthSnapshot:     { code: 'hs', color: FG3 },
  BlockSeen:              { code: 'bs', color: OK },
  ClockTick:              { code: 'ck', color: FG3 },
  SimulationStateChanged: { code: 'ss', color: FG3 },
  ScenarioPhaseFired:     { code: 'sp', color: FG },
}
export const DEFAULT_TYPE = { code: '??', color: FG3 }

/** peer-7 → n7; attackers (sybil-N / eclipse-N) and telemetry peers keep their raw id. */
export const shortId = (id: string) => (id.startsWith('peer-') ? 'n' + id.slice(5) : id)
export const isAttackerId = (id: string) => id.startsWith('sybil-') || id.startsWith('eclipse-')

const FILTER_GROUPS: [string, string][] = [
  ['Gossip', 'gossip'], ['Conn', 'connection'], ['Stream', 'stream'], ['DHT', 'dht'],
  ['Fault', 'fault'], ['Health', 'health'], ['Clock', 'clock'], ['Sim', 'simulation'], ['Live', 'live'],
]
const ALL_CATS = FILTER_GROUPS.map(g => g[1])
const NET_TYPES = new Set(['FaultInjected', 'FaultCleared'])
const SIM_TYPES = new Set(['ScenarioPhaseFired', 'SimulationStateChanged', 'ClockTick'])

let listEl: HTMLElement
let filterEl: HTMLElement
let metaEl: HTMLElement | null
let activeFilters: Set<string> = new Set()
let scrollLocked = true   // auto-scroll on unless the user scrolled up
let selectedEntry: HTMLElement | null = null

export function initEventsPanel() {
  listEl = document.getElementById('event-log-list')!
  filterEl = document.getElementById('event-type-filter')!
  metaEl = document.getElementById('lm-ev-meta')

  // Replaced by All/None; stays in the DOM for the contract
  const oldClear = document.getElementById('clear-filter-btn')
  if (oldClear) oldClear.style.display = 'none'

  const metaBtn = (label: string, onClick: () => void) => {
    const btn = document.createElement('button')
    btn.className = 'etf-tag etf-meta'
    btn.textContent = label
    btn.addEventListener('click', () => { onClick(); updateFilterTags(); rebuildEventList() })
    filterEl.appendChild(btn)
  }
  metaBtn('All', () => { activeFilters = new Set(ALL_CATS) })
  metaBtn('None', () => activeFilters.clear())

  // Clock off by default — fires every 100ms
  const defaultOff = new Set(['clock'])
  for (const [label, cat] of FILTER_GROUPS) {
    const isOn = !defaultOff.has(cat)
    const tag = document.createElement('button')
    tag.className = isOn ? 'etf-tag active' : 'etf-tag'
    tag.textContent = label
    tag.title = cat
    tag.dataset.cat = cat
    if (isOn) activeFilters.add(cat)
    tag.addEventListener('click', (e) => {
      if (e.altKey || e.metaKey) {
        activeFilters.clear()
        activeFilters.add(cat)
      } else if (activeFilters.has(cat)) activeFilters.delete(cat)
      else activeFilters.add(cat)
      updateFilterTags()
      rebuildEventList()
    })
    filterEl.appendChild(tag)
  }
  const hint = document.createElement('span')
  hint.className = 'lm-etf-hint'
  hint.textContent = '⌥-click isolates'
  filterEl.appendChild(hint)

  listEl.addEventListener('scroll', () => {
    scrollLocked = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 30
    updateMeta()
  })
  // Every deselect path ends in luminar:render
  document.addEventListener('luminar:render', () => { if (store.selectedNode < 0) select(null) })
  updateMeta()
}

function updateMeta() {
  if (metaEl) metaEl.textContent = `${store.eventCount.toLocaleString('en-US')} · ${scrollLocked ? 'following' : 'paused'}`
}

function select(entry: HTMLElement | null) {
  selectedEntry?.classList.remove('selected')
  selectedEntry = entry
  entry?.classList.add('selected')
}

function updateFilterTags() {
  filterEl.querySelectorAll<HTMLElement>('.etf-tag[data-cat]').forEach(tag => {
    tag.classList.toggle('active', activeFilters.has(tag.dataset.cat!))
  })
}

function formatNode(evt: AppEvent): string {
  const id = evt.peer_id ?? evt.from_peer
  if (id) return shortId(id)
  if (NET_TYPES.has(evt.event_type)) return 'net'
  if (SIM_TYPES.has(evt.event_type)) return 'sim'
  return '—'
}

function buildDetail(evt: AppEvent): string {
  const to = evt.to_peer ? shortId(evt.to_peer) : ''
  switch (evt.event_type) {
    case 'GossipMessage': return evt.msg_id ?? ''
    case 'GossipPrune': return [to, evt.reason].filter(Boolean).join(' · ')
    case 'GossipGraft':
    case 'PeerConnected': return to ? `peer=${to}` : ''
    // ih/iw carry only from_peer (already the node column) + msg_ids; the mock's peer=nN needs a to_peer the backend lacks
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

export function appendEvents(events: AppEvent[]) {
  for (const evt of events) {
    if (!activeFilters.has(evt.category)) continue
    const entry = document.createElement('div')
    entry.className = 'ev-entry'

    // Click: select the node and highlight the path from_peer → to_peer (or its mesh for gm)
    const peerId = evt.peer_id ?? evt.from_peer ?? ''
    const targetPeerId = evt.to_peer ?? ''
    entry.addEventListener('click', () => {
      const idx = peerId ? store.nodeIndex.get(peerId) : undefined
      if (idx !== undefined) {
        store.selectedNode = store.selectedNode === idx ? -1 : idx
        select(store.selectedNode >= 0 ? entry : null)
      }
      if (store.selectedNode >= 0) {
        const node = store.nodes[store.selectedNode]
        const targets: string[] = []
        if (targetPeerId) targets.push(targetPeerId)
        if (evt.event_type === 'GossipMessage' && node) targets.push(...node.connected_peers.slice(0, 8))
        store.highlightPeers = [...new Set(targets)]
      } else {
        store.highlightPeers = []
      }
      document.dispatchEvent(new CustomEvent('luminar:render'))
    })

    const ts = document.createElement('span')
    ts.className = 'ev-ts'
    ts.textContent = evt.at.toFixed(2)

    const node = document.createElement('span')
    node.className = 'ev-node'
    node.textContent = formatNode(evt)
    if (peerId && isAttackerId(peerId)) node.dataset.attacker = ''

    const typeInfo = TYPE_CODES[evt.event_type] ?? DEFAULT_TYPE
    const type = document.createElement('span')
    type.className = 'ev-type'
    type.textContent = typeInfo.code
    type.style.color = typeInfo.color

    const detail = document.createElement('span')
    detail.className = 'ev-detail'
    detail.textContent = buildDetail(evt)

    entry.append(ts, node, type, detail)
    listEl.appendChild(entry)
  }

  while (listEl.children.length > 500) listEl.removeChild(listEl.firstChild!)
  if (scrollLocked) requestAnimationFrame(() => { listEl.scrollTop = listEl.scrollHeight })
  updateMeta()
}

export function rebuildEventList() {
  while (listEl.firstChild) listEl.removeChild(listEl.firstChild)
  selectedEntry = null
  appendEvents(store.events.slice(-500))
}
