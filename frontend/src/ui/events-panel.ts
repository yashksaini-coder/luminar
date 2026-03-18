import { store } from '../store'
import type { AppEvent } from '../types'

// ── 2-letter type codes with colors (netviz style) ──
const TYPE_CODES: Record<string, { code: string; color: string }> = {
  // Gossip
  'GossipMessage':        { code: 'gm', color: 'oklch(0.75 0.14 155)' },
  'GossipGraft':          { code: 'gf', color: 'oklch(0.72 0.12 230)' },
  'GossipPrune':          { code: 'gp', color: 'oklch(0.72 0.14 60)' },
  'GossipIHave':          { code: 'ih', color: 'oklch(0.72 0.12 230)' },
  'GossipIWant':          { code: 'iw', color: 'oklch(0.72 0.12 230)' },
  // Connection
  'PeerConnected':        { code: 'cn', color: 'oklch(0.70 0.08 250)' },
  'PeerDisconnected':     { code: 'dc', color: 'oklch(0.65 0.20 25)' },
  // Stream
  'StreamOpened':         { code: 'so', color: 'oklch(0.72 0.12 230)' },
  'StreamClosed':         { code: 'sc', color: 'var(--text3)' },
  'StreamTimeout':        { code: 'st', color: 'oklch(0.65 0.20 25)' },
  'SemaphoreBlocked':     { code: 'sb', color: 'oklch(0.72 0.14 60)' },
  // DHT
  'DHTQueryStarted':      { code: 'ds', color: 'oklch(0.65 0.10 280)' },
  'DHTQueryCompleted':    { code: 'dd', color: 'oklch(0.65 0.10 280)' },
  'DHTQueryFailed':       { code: 'df', color: 'oklch(0.65 0.20 25)' },
  'DHTRoutingTableUpdate': { code: 'dr', color: 'oklch(0.65 0.10 280)' },
  // Fault
  'FaultInjected':        { code: 'fi', color: 'oklch(0.65 0.20 25)' },
  'FaultCleared':         { code: 'fc', color: 'oklch(0.75 0.14 155)' },
  'PeerRecovered':        { code: 'pr', color: 'oklch(0.75 0.14 155)' },
  // Health
  'NodeHealthSnapshot':   { code: 'hs', color: 'oklch(0.72 0.14 60)' },
  // Clock/Sim
  'ClockTick':            { code: 'ck', color: 'var(--text3)' },
  'SimulationStateChanged': { code: 'ss', color: 'var(--text3)' },
}

const DEFAULT_TYPE = { code: '??', color: 'var(--text3)' }

// ── Category filter groups ──
const FILTER_GROUPS: [string, string, string][] = [
  ['Gossip',  'gossip',     'oklch(0.75 0.14 155)'],
  ['Conn',    'connection', 'oklch(0.70 0.08 250)'],
  ['Stream',  'stream',     'oklch(0.72 0.12 230)'],
  ['DHT',     'dht',        'oklch(0.65 0.10 280)'],
  ['Fault',   'fault',      'oklch(0.65 0.20 25)'],
  ['Health',  'health',     'oklch(0.72 0.14 60)'],
  ['Clock',   'clock',      'var(--text3)'],
]

let listEl: HTMLElement
let filterEl: HTMLElement
let allBtn: HTMLElement
let noneBtn: HTMLElement
let activeFilters: Set<string> = new Set()
let scrollLocked = true

const ALL_CATS = FILTER_GROUPS.map(g => g[1])

export function initEventsPanel() {
  listEl = document.getElementById('event-log-list')!
  filterEl = document.getElementById('event-type-filter')!

  // Remove old clear-filter-btn if present (we replace with All/None)
  const oldClear = document.getElementById('clear-filter-btn')
  if (oldClear) oldClear.style.display = 'none'

  // ── All / None buttons ──
  allBtn = document.createElement('button')
  allBtn.className = 'etf-tag etf-meta'
  allBtn.textContent = 'All'
  allBtn.addEventListener('click', () => {
    activeFilters = new Set(ALL_CATS)
    updateFilterTags()
    rebuildEventList()
  })
  filterEl.appendChild(allBtn)

  noneBtn = document.createElement('button')
  noneBtn.className = 'etf-tag etf-meta'
  noneBtn.textContent = 'None'
  noneBtn.addEventListener('click', () => {
    activeFilters.clear()
    updateFilterTags()
    rebuildEventList()
  })
  filterEl.appendChild(noneBtn)

  // ── Category filter tags ──
  // Clock disabled by default — too noisy (fires every 100ms)
  const defaultOff = new Set(['clock'])
  for (const [label, cat, color] of FILTER_GROUPS) {
    const isOn = !defaultOff.has(cat)
    const tag = document.createElement('button')
    tag.className = isOn ? 'etf-tag active' : 'etf-tag'
    tag.textContent = label
    tag.title = cat
    tag.dataset.cat = cat
    tag.style.setProperty('--tag-color', color)
    if (isOn) activeFilters.add(cat)

    tag.addEventListener('click', (e) => {
      if (e.altKey || e.metaKey) {
        // Isolate: only this category
        activeFilters.clear()
        activeFilters.add(cat)
      } else {
        if (activeFilters.has(cat)) activeFilters.delete(cat)
        else activeFilters.add(cat)
      }
      updateFilterTags()
      rebuildEventList()
    })

    filterEl.appendChild(tag)
  }

  // Scroll lock: if user scrolls up, stop auto-scroll
  listEl.addEventListener('scroll', () => {
    const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 30
    scrollLocked = atBottom
  })
}

function updateFilterTags() {
  const tags = filterEl.querySelectorAll('.etf-tag[data-cat]')
  tags.forEach(tag => {
    const cat = (tag as HTMLElement).dataset.cat!
    if (activeFilters.has(cat)) {
      tag.classList.add('active')
    } else {
      tag.classList.remove('active')
    }
  })
}

// ── Time format: always milliseconds (like netviz: 1608.000ms) ──
function formatEventTime(seconds: number): string {
  if (seconds < 0) return '0.000ms'
  const ms = seconds * 1000
  return ms.toFixed(0) + 'ms'
}

// ── Node format: short #N ──
function formatNode(evt: AppEvent): string {
  const id = evt.peer_id ?? evt.from_peer ?? ''
  if (!id) return '\u2014'
  return '#' + id.replace('peer-', '')
}

// ── Detail builder per event type ──
function buildDetail(evt: AppEvent): string {
  switch (evt.event_type) {
    case 'GossipMessage':
      return evt.msg_id ?? ''
    case 'GossipGraft':
    case 'GossipPrune':
      return evt.to_peer ? `peer=${evt.to_peer.replace('peer-', '')}` : ''
    case 'GossipIHave':
    case 'GossipIWant':
      return evt.from_peer ? `peer=${evt.from_peer.replace('peer-', '')}` : ''
    case 'PeerConnected':
      return evt.to_peer ? `peer=${evt.to_peer.replace('peer-', '')}` : ''
    case 'PeerDisconnected':
      return evt.reason ?? ''
    case 'StreamOpened':
      return evt.to_peer ? `\u2192#${evt.to_peer.replace('peer-', '')}` : ''
    case 'StreamClosed':
      return evt.to_peer ? `\u2192#${evt.to_peer.replace('peer-', '')}` : ''
    case 'StreamTimeout':
      return evt.to_peer ? `\u2192#${evt.to_peer.replace('peer-', '')}` : 'timeout'
    case 'FaultInjected':
      return evt.fault_type ?? ''
    case 'FaultCleared':
      return evt.fault_type ?? ''
    case 'DHTQueryStarted':
      return `target=${evt.target ?? '?'}`
    case 'DHTQueryCompleted':
      return evt.hops ? `${evt.hops} hops` : ''
    case 'DHTQueryFailed':
      return evt.reason ?? 'failed'
    case 'NodeHealthSnapshot':
      const score = (evt as any).score
      return `score=${typeof score === 'number' ? score.toFixed(1) : '?'}`
    case 'SimulationStateChanged':
      return evt.state ?? ''
    default:
      return evt.msg_id ?? evt.topic ?? evt.fault_type ?? ''
  }
}

export function appendEvents(events: AppEvent[]) {
  const filtered = events.filter(e => activeFilters.has(e.category))

  for (const evt of filtered) {
    const entry = document.createElement('div')
    entry.className = 'ev-entry'

    // Click event to select node AND highlight connection path
    const peerId = evt.peer_id ?? evt.from_peer ?? ''
    const targetPeerId = evt.to_peer ?? ''
    entry.style.cursor = 'pointer'
    entry.addEventListener('click', () => {
      if (peerId) {
        const idx = store.nodeIndex.get(peerId)
        if (idx !== undefined) {
          store.selectedNode = store.selectedNode === idx ? -1 : idx
        }
      }
      // Highlight connection path: from_peer → to_peer, or from_peer → connected peers
      if (store.selectedNode >= 0) {
        const node = store.nodes[store.selectedNode]
        const targets: string[] = []
        if (targetPeerId) targets.push(targetPeerId)
        // For gossip messages, also show who from_peer is connected to
        if (evt.event_type === 'GossipMessage' && node) {
          targets.push(...node.connected_peers.slice(0, 8))
        }
        store.highlightPeers = [...new Set(targets)]
      } else {
        store.highlightPeers = []
      }
      document.dispatchEvent(new CustomEvent('luminar:render'))
    })

    const ts = document.createElement('span')
    ts.className = 'ev-ts'
    ts.textContent = formatEventTime(evt.at)

    const node = document.createElement('span')
    node.className = 'ev-node'
    node.textContent = formatNode(evt)

    const typeInfo = TYPE_CODES[evt.event_type] ?? DEFAULT_TYPE
    const type = document.createElement('span')
    type.className = 'ev-type'
    type.textContent = typeInfo.code
    type.style.color = typeInfo.color

    const detail = document.createElement('span')
    detail.className = 'ev-detail'
    detail.textContent = buildDetail(evt)

    entry.appendChild(ts)
    entry.appendChild(node)
    entry.appendChild(type)
    entry.appendChild(detail)
    listEl.appendChild(entry)
  }

  // Trim to max 500 visible
  while (listEl.children.length > 500) {
    listEl.removeChild(listEl.firstChild!)
  }

  // Auto-scroll if locked
  if (scrollLocked) {
    requestAnimationFrame(() => { listEl.scrollTop = listEl.scrollHeight })
  }
}

export function rebuildEventList() {
  while (listEl.firstChild) listEl.removeChild(listEl.firstChild)
  const recent = store.events.slice(-500)
  appendEvents(recent)
}
